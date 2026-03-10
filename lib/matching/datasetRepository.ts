import { createHash } from 'node:crypto';
import { readBandiCache, readBundledBandiSeed, writeBandiCache } from '@/lib/bandiCache';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { getStrategicDatasetDocs } from '@/lib/matching/datasetStrategic';
import { getRegionalGrantsDocs } from '@/lib/matching/regionalGrants';
import type { DatasetSnapshot, IncentiviDoc } from '@/lib/matching/types';

const SNAPSHOT_SOURCE_INCENTIVI = 'incentivi.gov.it';
const MEMORY_TTL_MS = 10 * 60 * 1000;

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

function computeVersionHash(docs: IncentiviDoc[]) {
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
  return createHash('sha256').update(payload).digest('hex');
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
  const versionHash = computeVersionHash(docs);

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

export async function loadHybridDatasetDocs(): Promise<{
  docs: IncentiviDoc[];
  source: 'supabase' | 'tmp-cache' | 'bundled-seed';
  fetchedAt: string | null;
}> {
  const strategic = getStrategicDatasetDocs();
  const regional = getRegionalGrantsDocs();
  const curated = [...strategic, ...regional];
  const activeSnapshot = await loadActiveDatasetSnapshotFromSupabase();
  if (activeSnapshot && activeSnapshot.docs.length > 0) {
    return {
      docs: [...activeSnapshot.docs, ...curated],
      source: 'supabase',
      fetchedAt: activeSnapshot.fetchedAt,
    };
  }

  const cached = await readBandiCache<IncentiviDoc>();
  if ((cached?.docs?.length ?? 0) > 0) {
    return {
      docs: [...(cached?.docs ?? []), ...curated],
      source: 'tmp-cache',
      fetchedAt: cached?.fetchedAt ?? null,
    };
  }

  const bundled = await readBundledBandiSeed<IncentiviDoc>();
  return {
    docs: [...(bundled?.docs ?? []), ...curated],
    source: 'bundled-seed',
    fetchedAt: bundled?.fetchedAt ?? null,
  };
}

export async function refreshRuntimeCacheFile(docs: IncentiviDoc[]) {
  return writeBandiCache(docs);
}
