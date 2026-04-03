import { fetchAllIncentiviDocs } from '@/lib/matching/datasetIncentivi';
import { fetchIncentiviDocs, mergeIncentiviDocs } from '@/lib/matching/fetchIncentiviShared';
import { getRegionalGrantsDocs } from '@/lib/matching/regionalGrants';
import { getStrategicDatasetDocs } from '@/lib/matching/datasetStrategic';
import {
  loadActiveDatasetSnapshotFromSupabase,
  loadScrapedRegionalDocs,
  refreshRuntimeCacheFile,
  saveActiveDatasetSnapshotToSupabase,
} from '@/lib/matching/datasetRepository';
import { SOURCE_REGISTRY, getEnabledSources, sourceCadenceBreachHours } from '@/lib/matching/sourceRegistry';
import {
  type IngestionRunMetrics,
  type IngestionSourceRun,
  saveIngestionRun,
} from '@/lib/matching/ingestionRunRepository';
import type { IncentiviDoc } from '@/lib/matching/types';

type IngestionMode = 'full' | 'incremental';

export type IngestionExecution = {
  ok: boolean;
  mode: IngestionMode;
  startedAt: string;
  finishedAt: string;
  datasetVersion: string | null;
  snapshotId: string | null;
  sourceRuns: IngestionSourceRun[];
  sourcesTotal: number;
  sourcesOk: number;
  sourcesFailed: number;
  metrics: IngestionRunMetrics;
  coverageStatus: 'ok' | 'degraded' | 'failed';
  alerts: string[];
  runLogId: string | null;
  error?: string;
};

const INCREMENTAL_REFRESH_QUERIES = [
  'bandi',
  'incentivi',
  'fondo perduto',
  'voucher imprese',
  'camera di commercio',
  'gal',
  'resto al sud',
  'nuova sabatini',
  'startup innovativa',
  'digitale',
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.trim() || null;
  }
}

function canonicalDocKey(doc: IncentiviDoc) {
  const official = normalizeUrl(typeof doc.institutionalLink === 'string' ? doc.institutionalLink : null);
  if (official) return `official:${official}`;

  const url = normalizeUrl(typeof doc.url === 'string' ? doc.url : null);
  if (url) return `url:${url}`;

  if (doc.id !== undefined && doc.id !== null) return `id:${String(doc.id).trim()}`;

  const title = normalizeText(typeof doc.title === 'string' ? doc.title : null);
  const authority = normalizeText(typeof doc.authorityName === 'string' ? doc.authorityName : null);
  return `title:${title}|authority:${authority}`;
}

function docFingerprint(doc: IncentiviDoc) {
  return [
    normalizeText(typeof doc.title === 'string' ? doc.title : null),
    normalizeText(typeof doc.authorityName === 'string' ? doc.authorityName : null),
    normalizeText(typeof doc.closeDate === 'string' ? doc.closeDate : null),
    normalizeText(typeof doc.openDate === 'string' ? doc.openDate : null),
    normalizeText(typeof doc.displayCoverageLabel === 'string' ? doc.displayCoverageLabel : null),
    normalizeText(typeof doc.displayAmountLabel === 'string' ? doc.displayAmountLabel : null),
    normalizeText(typeof doc.description === 'string' ? doc.description : null).slice(0, 180),
  ].join('|');
}

function computeDelta(previousDocs: IncentiviDoc[], currentDocs: IncentiviDoc[]): IngestionRunMetrics {
  const previousMap = new Map<string, string>();
  for (const doc of previousDocs) previousMap.set(canonicalDocKey(doc), docFingerprint(doc));

  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  const seen = new Set<string>();
  for (const doc of currentDocs) {
    const key = canonicalDocKey(doc);
    const nextFingerprint = docFingerprint(doc);
    seen.add(key);
    const prevFingerprint = previousMap.get(key);
    if (!prevFingerprint) {
      newCount += 1;
      continue;
    }
    if (prevFingerprint === nextFingerprint) unchangedCount += 1;
    else updatedCount += 1;
  }

  let closedCount = 0;
  for (const key of previousMap.keys()) {
    if (!seen.has(key)) closedCount += 1;
  }

  return {
    newCount,
    updatedCount,
    closedCount,
    unchangedCount,
    totalRecords: currentDocs.length,
    datasetVersion: null,
  };
}

async function fetchIncentiviBatch(queries: string[], mode: IngestionMode): Promise<{
  docs: IncentiviDoc[];
  error: string | null;
}> {
  const batches: IncentiviDoc[][] = [];
  let errors = 0;
  const batchSize = mode === 'incremental' ? 2 : 4;
  const rows = mode === 'incremental' ? 90 : 140;
  const timeoutMs = mode === 'incremental' ? 3500 : 6000;

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((query) => fetchIncentiviDocs(query, rows, timeoutMs)));
    for (const result of settled) {
      if (result.status === 'fulfilled') batches.push(result.value);
      else errors += 1;
    }
    if (mode !== 'incremental' && i + batchSize < queries.length) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const merged = mergeIncentiviDocs(...batches);
  if (merged.length > 0) return { docs: merged, error: errors > 0 ? `${errors} query fallite` : null };

  // fallback hard fetch
  try {
    const fallback = await fetchAllIncentiviDocs(mode === 'incremental' ? 5000 : 12000);
    return { docs: fallback, error: errors > 0 ? `${errors} query fallite, fallback attivo` : null };
  } catch (error) {
    return {
      docs: [],
      error: errors > 0 ? `${errors} query fallite + fallback failed` : (error as Error).message,
    };
  }
}

function classifyCoverageStatus(sourceRuns: IngestionSourceRun[]) {
  const failed = sourceRuns.filter((source) => source.status === 'failed').length;
  const degraded = sourceRuns.filter((source) => source.status === 'degraded').length;
  if (failed >= sourceRuns.length) return 'failed' as const;
  if (failed > 0 || degraded > 0) return 'degraded' as const;
  return 'ok' as const;
}

function inferCatalogSourcesFromDocs(docs: IncentiviDoc[], pattern: RegExp) {
  let count = 0;
  for (const doc of docs) {
    const authority = normalizeText(typeof doc.authorityName === 'string' ? doc.authorityName : null);
    const title = normalizeText(typeof doc.title === 'string' ? doc.title : null);
    if (pattern.test(`${authority} ${title}`)) count += 1;
  }
  return count;
}

function runCoverageCanaryChecks(docs: IncentiviDoc[]) {
  const checks: string[] = [];

  const hasNational = docs.some((doc) => {
    const authority = normalizeText(typeof doc.authorityName === 'string' ? doc.authorityName : null);
    const regions = Array.isArray(doc.regions) ? doc.regions.map((entry) => normalizeText(String(entry))) : [];
    return (
      authority.includes('invitalia') ||
      authority.includes('ministero') ||
      authority.includes('incentivi') ||
      regions.some((region) => region.includes('italia') || region.includes('nazionale') || region.includes('tutte'))
    );
  });
  if (!hasNational) checks.push('Canary fail: nessun bando nazionale rilevato');

  const hasRegional = docs.some((doc) => normalizeText(typeof doc.authorityName === 'string' ? doc.authorityName : null).includes('regione'));
  if (!hasRegional) checks.push('Canary fail: nessun bando regionale rilevato');

  const hasCCIAA = docs.some((doc) =>
    /(camera di commercio|cciaa|unioncamere|camcom)/i.test(
      `${doc.authorityName ?? ''} ${doc.title ?? ''} ${doc.description ?? ''}`
    )
  );
  if (!hasCCIAA) checks.push('Canary fail: nessun bando CCIAA rilevato');

  const hasGAL = docs.some((doc) => /(\bgal\b|gruppo azione locale)/i.test(`${doc.authorityName ?? ''} ${doc.title ?? ''} ${doc.description ?? ''}`));
  if (!hasGAL) checks.push('Canary fail: nessun bando GAL rilevato');

  const hasStartup = docs.some((doc) => /(startup|nuova impresa|autoimpiego|resto al sud)/i.test(`${doc.title ?? ''} ${doc.description ?? ''}`));
  if (!hasStartup) checks.push('Canary fail: assente copertura startup/nuove imprese');

  return checks;
}

function isSevereDatasetDrop(previousCount: number, nextCount: number) {
  if (previousCount <= 0) return false;
  const threshold = Math.max(200, Math.floor(previousCount * 0.45));
  return nextCount < threshold;
}

export async function runIngestionOrchestrator(mode: IngestionMode): Promise<IngestionExecution> {
  const startedAt = new Date().toISOString();
  const sourceRuns: IngestionSourceRun[] = [];
  const alerts: string[] = [];
  const activeSources = getEnabledSources();

  const previousSnapshot = await loadActiveDatasetSnapshotFromSupabase().catch(() => null);
  const previousDocs = previousSnapshot?.docs ?? [];

  const incentiviStart = Date.now();
  const incentivi =
    mode === 'full'
      ? await (async () => {
          try {
            const docs = await fetchAllIncentiviDocs(12000);
            return { docs, error: null as string | null };
          } catch (error) {
            return { docs: [] as IncentiviDoc[], error: (error as Error).message };
          }
        })()
      : await fetchIncentiviBatch(INCREMENTAL_REFRESH_QUERIES, mode);
  const incentiviDurationHours = (Date.now() - incentiviStart) / (1000 * 60 * 60);

  sourceRuns.push({
    sourceId: 'incentivi-gov-solr',
    sourceName: 'Incentivi.gov.it (SOLR)',
    scope: 'national',
    tier: 'official',
    status: incentivi.docs.length > 0 ? (incentivi.error ? 'degraded' : 'ok') : 'failed',
    records: incentivi.docs.length,
    error: incentivi.error,
    fetchedAt: new Date().toISOString(),
  });
  if (sourceCadenceBreachHours(SOURCE_REGISTRY[0], incentiviDurationHours)) {
    alerts.push('Latenza anomala acquisizione incentivi.gov.it');
  }
  if (incentivi.docs.length === 0) alerts.push('Nessun record acquisito da incentivi.gov.it');

  const scrapedStart = new Date().toISOString();
  const scrapedDocs = await loadScrapedRegionalDocs().catch(() => []);
  sourceRuns.push({
    sourceId: 'regional-scraped-grants',
    sourceName: 'Regional Scraped Grants',
    scope: 'regional',
    tier: 'authoritative',
    status: scrapedDocs.length > 0 ? 'ok' : 'degraded',
    records: scrapedDocs.length,
    error: scrapedDocs.length > 0 ? null : 'Nessun record scraped attivo disponibile',
    fetchedAt: scrapedStart,
  });

  const strategicDocs = getStrategicDatasetDocs();
  sourceRuns.push({
    sourceId: 'strategic-curated',
    sourceName: 'Strategic Curated Dataset',
    scope: 'national',
    tier: 'authoritative',
    status: strategicDocs.length > 0 ? 'ok' : 'failed',
    records: strategicDocs.length,
    error: strategicDocs.length > 0 ? null : 'Dataset strategico vuoto',
    fetchedAt: new Date().toISOString(),
  });

  const regionalCuratedDocs = getRegionalGrantsDocs();
  sourceRuns.push({
    sourceId: 'regional-curated',
    sourceName: 'Regional Curated Dataset',
    scope: 'regional',
    tier: 'authoritative',
    status: regionalCuratedDocs.length > 0 ? 'ok' : 'failed',
    records: regionalCuratedDocs.length,
    error: regionalCuratedDocs.length > 0 ? null : 'Dataset regionale curato vuoto',
    fetchedAt: new Date().toISOString(),
  });

  const combined = mergeIncentiviDocs(incentivi.docs, scrapedDocs, strategicDocs, regionalCuratedDocs);
  const cciaaMatches = inferCatalogSourcesFromDocs(combined, /(camera di commercio|cciaa|unioncamere|camcom)/i);
  const galMatches = inferCatalogSourcesFromDocs(combined, /(\bgal\b|gruppo azione locale)/i);

  sourceRuns.push({
    sourceId: 'camera-commercio-catalog',
    sourceName: 'Camera di Commercio Catalog',
    scope: 'camera_commercio',
    tier: 'authoritative',
    status: cciaaMatches > 0 ? 'ok' : 'degraded',
    records: cciaaMatches,
    error: cciaaMatches > 0 ? null : 'Nessuna evidenza CCIAA nel dataset aggregato',
    fetchedAt: new Date().toISOString(),
  });

  sourceRuns.push({
    sourceId: 'gal-catalog',
    sourceName: 'GAL Catalog',
    scope: 'gal',
    tier: 'authoritative',
    status: galMatches > 0 ? 'ok' : 'degraded',
    records: galMatches,
    error: galMatches > 0 ? null : 'Nessuna evidenza GAL nel dataset aggregato',
    fetchedAt: new Date().toISOString(),
  });

  if (cciaaMatches === 0) alerts.push('Copertura CCIAA assente o insufficiente nel dataset corrente');
  if (galMatches === 0) alerts.push('Copertura GAL assente o insufficiente nel dataset corrente');

  let finalDocs = combined;
  let snapshotId: string | null = null;
  let datasetVersion: string | null = null;
  let skipSnapshotSave = false;

  if (mode === 'incremental' && previousDocs.length > 0) {
    finalDocs = mergeIncentiviDocs(previousDocs, combined);
    alerts.push('Refresh incrementale eseguito in modalità enrich (merge con snapshot precedente).');
  }

  if (finalDocs.length === 0 && previousDocs.length > 0) {
    finalDocs = previousDocs;
    alerts.push('Fallback snapshot precedente applicato: dataset corrente vuoto');
    datasetVersion = previousSnapshot?.versionHash ?? null;
    snapshotId = previousSnapshot?.id ?? null;
    skipSnapshotSave = true;
  }

  if (mode === 'full' && previousDocs.length > 0 && isSevereDatasetDrop(previousDocs.length, finalDocs.length)) {
    finalDocs = previousDocs;
    alerts.push(
      `Guardrail anti-degrade: rilevato crollo anomalo dataset (${combined.length} -> ${previousDocs.length} precedente). Mantengo snapshot valido.`
    );
    datasetVersion = previousSnapshot?.versionHash ?? null;
    snapshotId = previousSnapshot?.id ?? null;
    skipSnapshotSave = true;
  }

  if (mode === 'full' && incentivi.docs.length === 0 && previousDocs.length > 0) {
    finalDocs = previousDocs;
    alerts.push('Guardrail anti-degrade: fonte ufficiale vuota, mantenuto snapshot precedente.');
    datasetVersion = previousSnapshot?.versionHash ?? null;
    snapshotId = previousSnapshot?.id ?? null;
    skipSnapshotSave = true;
  }

  const delta = computeDelta(previousDocs, finalDocs);

  const saved = skipSnapshotSave
    ? null
    : await saveActiveDatasetSnapshotToSupabase({
        source: mode === 'full' ? 'multi-source-daily' : 'multi-source-incremental',
        docs: finalDocs,
        fetchedAt: new Date().toISOString(),
      }).catch(() => null);

  if (saved) {
    snapshotId = saved.id;
    datasetVersion = saved.versionHash;
  }

  await refreshRuntimeCacheFile(finalDocs).catch(() => null);

  const canaryFailures = runCoverageCanaryChecks(finalDocs);
  alerts.push(...canaryFailures);

  let coverageStatus = classifyCoverageStatus(sourceRuns);
  if (canaryFailures.length >= 3) coverageStatus = 'failed';
  else if (canaryFailures.length > 0 && coverageStatus === 'ok') coverageStatus = 'degraded';

  const finishedAt = new Date().toISOString();
  const metrics: IngestionRunMetrics = {
    ...delta,
    totalRecords: finalDocs.length,
    datasetVersion,
  };

  const runStatus: IngestionExecution['coverageStatus'] = coverageStatus;
  const persistedRunId = await saveIngestionRun({
    startedAt,
    finishedAt,
    status: runStatus,
    sourceRuns,
    metrics,
    alerts,
  });

  const ok = runStatus !== 'failed' && finalDocs.length > 0;
  const error = ok ? undefined : 'Ingestion incompleta: nessun dataset utilizzabile';
  const sourcesFailed = sourceRuns.filter((source) => source.status === 'failed').length;
  const sourcesOk = sourceRuns.filter((source) => source.status === 'ok').length;

  return {
    ok,
    mode,
    startedAt,
    finishedAt,
    datasetVersion,
    snapshotId,
    sourceRuns,
    sourcesTotal: activeSources.length,
    sourcesOk,
    sourcesFailed,
    metrics,
    coverageStatus,
    alerts,
    runLogId: persistedRunId,
    error,
  };
}
