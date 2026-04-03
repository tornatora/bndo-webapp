import { NextResponse } from 'next/server';
import { runIngestionOrchestrator } from '@/lib/matching/ingestionOrchestrator';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const rate = checkRateLimit(req, { keyPrefix: 'refresh-bandi-incremental', windowMs: 60_000, max: 6 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Troppi tentativi di refresh ravvicinati.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  const secret = process.env.CRON_SECRET?.trim() || null;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !secret) {
    return NextResponse.json({ error: 'CRON_SECRET mancante in produzione.' }, { status: 500 });
  }
  if (secret) {
    const provided = req.headers.get('x-cron-secret') || '';
    if (!provided || provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  try {
    const execution = await runIngestionOrchestrator('incremental');
    return NextResponse.json(
      {
        ok: execution.ok,
        mode: execution.mode,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
        sourcesTotal: execution.sourcesTotal,
        sourcesOk: execution.sourcesOk,
        sourcesFailed: execution.sourcesFailed,
        newCount: execution.metrics.newCount,
        updatedCount: execution.metrics.updatedCount,
        closedCount: execution.metrics.closedCount,
        unchangedCount: execution.metrics.unchangedCount,
        totalRecords: execution.metrics.totalRecords,
        datasetVersion: execution.datasetVersion,
        snapshotId: execution.snapshotId,
        coverageStatus: execution.coverageStatus,
        alerts: execution.alerts,
        runLogId: execution.runLogId,
        sourceRuns: execution.sourceRuns,
        error: execution.error ?? null,
      },
      { status: execution.ok ? 200 : 503 }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Refresh incrementale fallito.' }, { status: 500 });
  }
}

