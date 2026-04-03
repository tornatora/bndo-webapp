import { readBandiCache, readBundledBandiSeed, writeBandiCache } from '@/lib/bandiCache';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { getStrategicDatasetDocs } from '@/lib/matching/datasetStrategic';
import { getRegionalGrantsDocs } from '@/lib/matching/regionalGrants';
import { mergeIncentiviDocs } from '@/lib/matching/fetchIncentiviShared';
import { loadLatestIngestionRun } from '@/lib/matching/ingestionRunRepository';
import type { DatasetSnapshot, IncentiviDoc } from '@/lib/matching/types';

const SNAPSHOT_SOURCE_INCENTIVI = 'incentivi.gov.it';
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MIN_ACCEPTABLE_ACTIVE_SNAPSHOT_DOCS = 300;

type SnapshotRow = {
  id: string;
  source: string;
  version_hash: string;
  fetched_at: string;
  is_active: boolean;
  doc_count: number;
  docs_json: unknown;
};

type MemoryCacheState = {
  expiresAt: number;
  activeSnapshot: DatasetSnapshot | null;
};

let memoryCache: MemoryCacheState | null = null;
let hybridMemoryCache: {
  docs: IncentiviDoc[];
  source: 'supabase' | 'tmp-cache' | 'bundled-seed';
  fetchedAt: string | null;
  expiresAt: number;
} | null = null;

const HYBRID_TTL_MS = 5 * 60 * 1000; // 5 minutes for the full merged set

function cloneDocs(docs: IncentiviDoc[]) {
  return docs.map((doc) => ({ ...doc }));
}

function normalizeDocsJson(value: unknown): IncentiviDoc[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => Boolean(entry) && typeof entry === 'object') as IncentiviDoc[];
}

function rowToSnapshot(row: SnapshotRow): DatasetSnapshot {
  return {
    id: row.id,
    source: row.source,
    versionHash: row.version_hash,
    fetchedAt: row.fetched_at,
    isActive: row.is_active,
    docCount: row.doc_count,
    docs: normalizeDocsJson(row.docs_json),
  };
}

async function computeVersionHash(docs: IncentiviDoc[]) {
  const payload = JSON.stringify(
    docs
      .map((doc) => ({
        id: doc.id ?? null,
        title: doc.title ?? null,
        authorityName: doc.authorityName ?? null,
        closeDate: doc.closeDate ?? null,
        costMin: doc.costMin ?? null,
        costMax: doc.costMax ?? null,
        grantMin: doc.grantMin ?? null,
        grantMax: doc.grantMax ?? null,
        coverageMinPercent: doc.coverageMinPercent ?? null,
        coverageMaxPercent: doc.coverageMaxPercent ?? null,
      }))
      .sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''))),
  );

  const msgUint8 = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function setMemorySnapshot(snapshot: DatasetSnapshot | null) {
  memoryCache = {
    expiresAt: Date.now() + MEMORY_TTL_MS,
    activeSnapshot: snapshot
      ? {
          ...snapshot,
          docs: cloneDocs(snapshot.docs),
        }
      : null,
  };
}

export async function loadActiveDatasetSnapshotFromSupabase(): Promise<DatasetSnapshot | null> {
  const cached = memoryCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.activeSnapshot
      ? {
          ...cached.activeSnapshot,
          docs: cloneDocs(cached.activeSnapshot.docs),
        }
      : null;
  }

  if (!hasRealServiceRoleKey()) {
    setMemorySnapshot(null);
    return null;
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('scanner_dataset_snapshots')
      .select('id, source, version_hash, fetched_at, is_active, doc_count, docs_json')
      .eq('is_active', true)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle<SnapshotRow>();

    if (error || !data) {
      setMemorySnapshot(null);
      return null;
    }

    const snapshot = rowToSnapshot(data);
    setMemorySnapshot(snapshot);
    return {
      ...snapshot,
      docs: cloneDocs(snapshot.docs),
    };
  } catch {
    setMemorySnapshot(null);
    return null;
  }
}

export async function saveActiveDatasetSnapshotToSupabase(args: {
  source?: string;
  docs: IncentiviDoc[];
  fetchedAt?: string;
}): Promise<DatasetSnapshot | null> {
  if (!hasRealServiceRoleKey()) return null;

  const docs = cloneDocs(args.docs);
  const source = args.source ?? SNAPSHOT_SOURCE_INCENTIVI;
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const versionHash = await computeVersionHash(docs);

  const admin = getSupabaseAdmin();

  const deactivate = await admin.from('scanner_dataset_snapshots').update({ is_active: false }).eq('is_active', true);
  if (deactivate.error) {
    throw new Error(`Impossibile disattivare snapshot precedente: ${deactivate.error.message}`);
  }

  const insert = await admin
    .from('scanner_dataset_snapshots')
    .insert({
      source,
      version_hash: versionHash,
      fetched_at: fetchedAt,
      is_active: true,
      doc_count: docs.length,
      docs_json: docs,
    })
    .select('id, source, version_hash, fetched_at, is_active, doc_count, docs_json')
    .single<SnapshotRow>();

  if (insert.error || !insert.data) {
    throw new Error(`Impossibile salvare snapshot dataset: ${insert.error?.message ?? 'insert failed'}`);
  }

  const snapshot = rowToSnapshot(insert.data);
  setMemorySnapshot(snapshot);
  return snapshot;
}

export async function loadScrapedRegionalDocs(): Promise<IncentiviDoc[]> {
  if (!hasRealServiceRoleKey()) return [];
  try {
    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase
      .from('regional_scraped_grants')
      .select('doc_json')
      .eq('status', 'active');
      
    if (error) {
      if (!error.message.includes('Invalid API key')) {
        console.warn('[datasetRepository] Non-fatal error loading scraped docs:', error.message);
      }
      return [];
    }
    
    return (data || []).map(row => row.doc_json as IncentiviDoc);
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (!message.includes('Invalid API key')) {
      console.error('[datasetRepository] Failed to load scraped docs:', err);
    }
    return [];
  }
}

export async function loadHybridDatasetDocs(): Promise<{
  docs: IncentiviDoc[];
  source: 'supabase' | 'tmp-cache' | 'bundled-seed';
  fetchedAt: string | null;
}> {
  // Ultra-Fast Singleton Check
  if (hybridMemoryCache && hybridMemoryCache.expiresAt > Date.now()) {
    return {
      docs: hybridMemoryCache.docs, // Note: returning reference for speed, matching engine should not mutate
      source: hybridMemoryCache.source,
      fetchedAt: hybridMemoryCache.fetchedAt,
    };
  }

  const strategic = getStrategicDatasetDocs();
  const regional = getRegionalGrantsDocs();
  const scraped = await loadScrapedRegionalDocs();
  const curated = mergeIncentiviDocs(strategic, regional, scraped);
  const activeSnapshot = await loadActiveDatasetSnapshotFromSupabase();

  let result: {
    docs: IncentiviDoc[];
    source: 'supabase' | 'tmp-cache' | 'bundled-seed';
    fetchedAt: string | null;
  };

  if (activeSnapshot && activeSnapshot.docs.length > 0) {
    const snapshotLooksDegraded = activeSnapshot.docs.length < MIN_ACCEPTABLE_ACTIVE_SNAPSHOT_DOCS;
    if (!snapshotLooksDegraded) {
      result = {
        docs: mergeIncentiviDocs(activeSnapshot.docs, curated),
        source: 'supabase',
        fetchedAt: activeSnapshot.fetchedAt,
      };
    } else {
      // Never do heavy live fetches during user requests: it can cause timeout/Failed to fetch.
      // If active snapshot is degraded, serve immediately from bundled seed as safe high-coverage fallback.
      const bundled = await readBundledBandiSeed<IncentiviDoc>();
      if ((bundled?.docs?.length ?? 0) > activeSnapshot.docs.length) {
        result = {
          docs: mergeIncentiviDocs(bundled?.docs ?? [], curated),
          source: 'bundled-seed',
          fetchedAt: bundled?.fetchedAt ?? activeSnapshot.fetchedAt,
        };
      } else {
        result = {
          docs: mergeIncentiviDocs(activeSnapshot.docs, curated),
          source: 'supabase',
          fetchedAt: activeSnapshot.fetchedAt,
        };
      }
    }
  } else {
    const cached = await readBandiCache<IncentiviDoc>();
    if ((cached?.docs?.length ?? 0) > 0) {
      result = {
        docs: mergeIncentiviDocs(cached?.docs ?? [], curated),
        source: 'tmp-cache',
        fetchedAt: cached?.fetchedAt ?? null,
      };
    } else {
      const bundled = await readBundledBandiSeed<IncentiviDoc>();
      result = {
        docs: mergeIncentiviDocs(bundled?.docs ?? [], curated),
        source: 'bundled-seed',
        fetchedAt: bundled?.fetchedAt ?? null,
      };
    }
  }

  // Update Singleton
  hybridMemoryCache = {
    ...result,
    expiresAt: Date.now() + HYBRID_TTL_MS,
  };

  return result;
}

export async function refreshRuntimeCacheFile(docs: IncentiviDoc[]) {
  return writeBandiCache(docs);
}

export async function loadDatasetHealthStatus(): Promise<{
  datasetVersion: string | null;
  datasetFreshnessHours: number | null;
  coverageStatus: 'ok' | 'degraded' | 'failed';
  lastRunAt: string | null;
  alerts: string[];
}> {
  const snapshot = await loadActiveDatasetSnapshotFromSupabase();
  const lastRun = await loadLatestIngestionRun();
  const now = Date.now();
  const fetchedAt = snapshot?.fetchedAt ? new Date(snapshot.fetchedAt).getTime() : null;
  const freshnessHours = fetchedAt ? Math.max(0, (now - fetchedAt) / (1000 * 60 * 60)) : null;

  const snapshotFreshEnough = freshnessHours !== null ? freshnessHours <= 28 : false;
  const runStatus = lastRun?.status ?? null;
  const hasRecentRun = lastRun?.finishedAt
    ? now - new Date(lastRun.finishedAt).getTime() <= 28 * 60 * 60 * 1000
    : false;

  let coverageStatus: 'ok' | 'degraded' | 'failed' = 'degraded';
  if (snapshotFreshEnough && runStatus === 'ok' && hasRecentRun) coverageStatus = 'ok';
  else if (!snapshot || !hasRecentRun || runStatus === 'failed') coverageStatus = 'failed';

  return {
    datasetVersion: snapshot?.versionHash ?? lastRun?.metrics.datasetVersion ?? null,
    datasetFreshnessHours: freshnessHours !== null ? Number(freshnessHours.toFixed(2)) : null,
    coverageStatus,
    lastRunAt: lastRun?.finishedAt ?? snapshot?.fetchedAt ?? null,
    alerts: lastRun?.alerts ?? [],
  };
}
