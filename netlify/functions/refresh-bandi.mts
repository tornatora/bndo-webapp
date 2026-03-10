import type { Config } from '@netlify/functions';
import { fetchIncentiviDocs, mergeIncentiviDocs } from '../../lib/matching/fetchIncentiviShared';
import { saveActiveDatasetSnapshotToSupabase } from '../../lib/matching/datasetRepository';

/**
 * Expanded query set for daily refresh.
 * Covers: generic terms, sector-specific, region-specific, and ATECO-aligned queries.
 */
const REFRESH_QUERIES = [
  // ── Generic ──
  'fondi', 'bandi', 'incentivi', 'agevolazioni', 'contributi',
  'finanziamenti imprese', 'finanziamento agevolato', 'credito imposta',
  'fondo perduto', 'voucher imprese',

  // ── Per settore ──
  'turismo', 'digitalizzazione imprese', 'macchinari beni strumentali',
  'efficientamento energetico', 'startup innovativa', 'commercio',
  'artigianato', 'agricoltura', 'manifattura', 'internazionalizzazione',
  'ricerca sviluppo', 'formazione', 'innovazione tecnologica',
  'transizione ecologica', 'economia circolare', 'ristorazione',

  // ── Per regione (macro) ──
  'sicilia', 'calabria', 'campania', 'puglia', 'sardegna',
  'lombardia', 'lazio', 'veneto', 'emilia romagna', 'toscana',
  'piemonte', 'liguria', 'marche', 'abruzzo', 'basilicata',
  'friuli venezia giulia', 'trentino alto adige', 'umbria', 'molise',

  // ── Tematici ──
  'autoimpiego', 'resto al sud', 'sabatini', 'smart start',
  'imprenditoria giovanile', 'imprenditoria femminile',
  'pmi investimenti', 'zona economica speciale', 'industria 4.0',
];

export default async (req: Request) => {
  console.log('[refresh-bandi] Starting enhanced daily sync...');

  try {
    // Parallel batches of 5 for efficiency
    const batchSize = 5;
    const allDocs: Awaited<ReturnType<typeof fetchIncentiviDocs>>[] = [];

    for (let i = 0; i < REFRESH_QUERIES.length; i += batchSize) {
      const batch = REFRESH_QUERIES.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((q) => fetchIncentiviDocs(q, 150, 12000))
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value.length > 0) {
          allDocs.push(res.value);
        }
      }

      // Small delay between batches to be polite to the API
      if (i + batchSize < REFRESH_QUERIES.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const merged = mergeIncentiviDocs(...allDocs);
    const count = merged.length;

    console.log(`[refresh-bandi] Fetched and merged ${count} docs from ${REFRESH_QUERIES.length} queries.`);

    if (count > 0) {
      const snapshot = await saveActiveDatasetSnapshotToSupabase({
        source: 'incentivi.gov.it (cron-v2)',
        docs: merged
      });
      console.log(`[refresh-bandi] Saved new snapshot: ${snapshot?.id} with ${count} docs.`);
    } else {
      console.warn('[refresh-bandi] No docs found to save.');
    }

    return new Response(JSON.stringify({ ok: true, count, queries: REFRESH_QUERIES.length }), {
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
