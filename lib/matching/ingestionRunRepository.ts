import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';

export type IngestionSourceRun = {
  sourceId: string;
  sourceName: string;
  scope: string;
  tier: string;
  status: 'ok' | 'degraded' | 'failed';
  records: number;
  error: string | null;
  fetchedAt: string;
};

export type IngestionRunMetrics = {
  newCount: number;
  updatedCount: number;
  closedCount: number;
  unchangedCount: number;
  totalRecords: number;
  datasetVersion: string | null;
};

export type IngestionRunRecord = {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: 'ok' | 'degraded' | 'failed';
  sourceRuns: IngestionSourceRun[];
  metrics: IngestionRunMetrics;
  alerts: string[];
};

function isMissingTableError(error: unknown) {
  const message = (error as { message?: string } | null)?.message ?? '';
  return message.includes("Could not find the table 'public.scanner_ingestion_runs'");
}

function isInvalidApiKeyError(error: unknown) {
  const message = (error as { message?: string } | null)?.message ?? '';
  return message.includes('Invalid API key');
}

export async function saveIngestionRun(record: Omit<IngestionRunRecord, 'id'>): Promise<string | null> {
  if (!hasRealServiceRoleKey()) return null;

  try {
    const admin = getSupabaseAdmin() as any;
    const insert = await admin
      .from('scanner_ingestion_runs')
      .insert({
        started_at: record.startedAt,
        finished_at: record.finishedAt,
        status: record.status,
        source_runs_json: record.sourceRuns,
        metrics_json: record.metrics,
        alerts_json: record.alerts,
        dataset_version: record.metrics.datasetVersion,
        sources_total: record.sourceRuns.length,
        sources_ok: record.sourceRuns.filter((source) => source.status === 'ok').length,
        sources_failed: record.sourceRuns.filter((source) => source.status === 'failed').length,
      })
      .select('id')
      .single();

    if (insert.error || !insert.data?.id) {
      if (!isMissingTableError(insert.error) && !isInvalidApiKeyError(insert.error)) {
        console.warn('[ingestionRunRepository] save failed', insert.error?.message ?? 'insert failed');
      }
      return null;
    }

    return String(insert.data.id);
  } catch (error) {
    if (!isMissingTableError(error) && !isInvalidApiKeyError(error)) {
      console.warn('[ingestionRunRepository] save failed', (error as Error).message);
    }
    return null;
  }
}

export async function loadLatestIngestionRun(): Promise<IngestionRunRecord | null> {
  if (!hasRealServiceRoleKey()) return null;

  try {
    const admin = getSupabaseAdmin() as any;
    const { data, error } = await admin
      .from('scanner_ingestion_runs')
      .select(
        'id, started_at, finished_at, status, source_runs_json, metrics_json, alerts_json'
      )
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (!isMissingTableError(error) && !isInvalidApiKeyError(error)) {
        console.warn('[ingestionRunRepository] load failed', error?.message ?? 'unknown');
      }
      return null;
    }

    const sourceRuns = Array.isArray(data.source_runs_json) ? (data.source_runs_json as IngestionSourceRun[]) : [];
    const metrics = (data.metrics_json ?? null) as IngestionRunMetrics | null;
    const alerts = Array.isArray(data.alerts_json) ? (data.alerts_json as string[]) : [];

    if (!metrics) return null;

    return {
      id: String(data.id),
      startedAt: String(data.started_at),
      finishedAt: String(data.finished_at),
      status: (data.status as IngestionRunRecord['status']) ?? 'failed',
      sourceRuns,
      metrics,
      alerts,
    };
  } catch (error) {
    if (!isMissingTableError(error) && !isInvalidApiKeyError(error)) {
      console.warn('[ingestionRunRepository] load failed', (error as Error).message);
    }
    return null;
  }
}
