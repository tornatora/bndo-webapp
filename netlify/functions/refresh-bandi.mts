import type { Config } from '@netlify/functions';
import { fetchIncentiviDocs, mergeIncentiviDocs } from '../../lib/matching/fetchIncentiviShared';
import { saveActiveDatasetSnapshotToSupabase } from '../../lib/matching/datasetRepository';

export default async (req: Request) => {
  console.log('[refresh-bandi] Starting daily sync...');

  try {
    // We fetch a larger batch for the daily snapshot
    // Multiple queries to cover different angles
    const queries = ['fondi', 'bandi', 'incentivi', 'agevolazioni', 'contributi'];
    const results = await Promise.all(
      queries.map((q) => fetchIncentiviDocs(q, 100, 20000))
    );

    const merged = mergeIncentiviDocs(...results);
    const count = merged.length;
    
    console.log(`[refresh-bandi] Fetched and merged ${count} docs.`);

    if (count > 0) {
      const snapshot = await saveActiveDatasetSnapshotToSupabase({
        source: 'incentivi.gov.it (cron)',
        docs: merged
      });
      console.log(`[refresh-bandi] Saved new snapshot: ${snapshot?.id} with ${count} docs.`);
    } else {
      console.warn('[refresh-bandi] No docs found to save.');
    }

    return new Response(JSON.stringify({ ok: true, count }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[refresh-bandi] Critical failure:', error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config: Config = {
  schedule: '0 3 * * *' // 03:00 UTC daily
};
