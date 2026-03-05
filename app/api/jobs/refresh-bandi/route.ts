import { NextResponse } from 'next/server';
import { fetchAllIncentiviDocs } from '@/lib/matching/datasetIncentivi';
import { refreshRuntimeCacheFile, saveActiveDatasetSnapshotToSupabase } from '@/lib/matching/datasetRepository';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const rate = checkRateLimit(req, { keyPrefix: 'refresh-bandi', windowMs: 60_000, max: 6 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Troppi tentativi di refresh ravvicinati.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  const secret = process.env.CRON_SECRET?.trim() || null;
  if (secret) {
    const provided = req.headers.get('x-cron-secret');
    if (!provided || provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  try {
    const docs = await fetchAllIncentiviDocs(20000);
    const fetchedAt = new Date().toISOString();
    const saved = await refreshRuntimeCacheFile(docs);
    const snapshot = await saveActiveDatasetSnapshotToSupabase({
      docs,
      source: 'incentivi.gov.it',
      fetchedAt,
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      source: 'incentivi.gov.it',
      fetched: docs.length,
      snapshotId: snapshot?.id ?? null,
      snapshotVersion: snapshot?.versionHash ?? null,
      cachePath: saved.path,
      fetchedAt: saved.fetchedAt,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Refresh fallito.' }, { status: 500 });
  }
}
