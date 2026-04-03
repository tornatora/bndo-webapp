import { NextResponse } from 'next/server';
import { loadDatasetHealthStatus } from '@/lib/matching/datasetRepository';
import { loadLatestIngestionRun } from '@/lib/matching/ingestionRunRepository';
import { SOURCE_REGISTRY } from '@/lib/matching/sourceRegistry';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim() || '';
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && !secret) return true;
  const provided = req.headers.get('x-ops-secret')?.trim() || '';
  return Boolean(secret) && provided === secret;
}

export async function GET(req: Request) {
  const rate = checkRateLimit(req, { keyPrefix: 'ops-ingestion-health', windowMs: 60_000, max: 45 });
  if (!rate.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } });
  }

  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const [datasetHealth, latestRun] = await Promise.all([
    loadDatasetHealthStatus(),
    loadLatestIngestionRun(),
  ]);

  const now = Date.now();
  const runAgeHours = latestRun?.finishedAt ? (now - new Date(latestRun.finishedAt).getTime()) / (1000 * 60 * 60) : null;

  const sourceStatus = SOURCE_REGISTRY.map((source) => {
    const sourceRun = latestRun?.sourceRuns.find((entry) => entry.sourceId === source.id) ?? null;
    const fetchedAt = sourceRun?.fetchedAt ?? latestRun?.finishedAt ?? null;
    const ageHours = fetchedAt ? (now - new Date(fetchedAt).getTime()) / (1000 * 60 * 60) : null;
    const breached = ageHours !== null ? ageHours > source.cadenceHours : true;
    return {
      id: source.id,
      name: source.name,
      scope: source.scope,
      tier: source.tier,
      cadenceHours: source.cadenceHours,
      status: sourceRun?.status ?? 'failed',
      records: sourceRun?.records ?? 0,
      lastFetchedAt: fetchedAt,
      ageHours: ageHours !== null ? Number(ageHours.toFixed(2)) : null,
      slaBreached: breached,
      error: sourceRun?.error ?? (breached ? 'Fonte non aggiornata entro SLA' : null),
    };
  });

  const sourcesFailed = sourceStatus.filter((entry) => entry.status === 'failed').length;
  const sourcesBreached = sourceStatus.filter((entry) => entry.slaBreached).length;
  const sourcesOk = sourceStatus.filter((entry) => entry.status === 'ok').length;

  return NextResponse.json({
    ok: datasetHealth.coverageStatus !== 'failed',
    datasetVersion: datasetHealth.datasetVersion,
    datasetFreshnessHours: datasetHealth.datasetFreshnessHours,
    coverageStatus: datasetHealth.coverageStatus,
    lastRunAt: datasetHealth.lastRunAt,
    runAgeHours: runAgeHours !== null ? Number(runAgeHours.toFixed(2)) : null,
    sourcesTotal: sourceStatus.length,
    sourcesOk,
    sourcesFailed,
    sourcesBreached,
    alerts: [...(datasetHealth.alerts ?? []), ...(sourcesBreached > 0 ? ['Una o più fonti fuori SLA'] : [])],
    metrics: latestRun?.metrics ?? null,
    sourceStatus,
  });
}
