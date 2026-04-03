import type { IncentiviDoc } from '@/lib/matching/types';

const INCENTIVI_SOLR_ENDPOINT = 'https://www.incentivi.gov.it/solr/coredrupal/select';

let cachedDocs: IncentiviDoc[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const DEFAULT_PAGE_ROWS = 1200;
const DEFAULT_MAX_ROWS = 12000;
const MAX_PAGE_FETCH_ATTEMPTS = 2;

async function fetchIncentiviPage(args: {
  start: number;
  rows: number;
  timeoutMs: number;
}): Promise<{ docs: IncentiviDoc[]; numFound: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const params = new URLSearchParams();
    params.set('wt', 'json');
    params.set('rows', String(args.rows));
    params.set('start', String(args.start));
    params.set('q', '*:*');
    params.set('fq', 'index_id:incentivi');
    params.set('sort', 'ds_last_update desc');
    params.set(
      'fl',
      [
        'id:zs_nid',
        'title:zs_title',
        'description:zs_body',
        'authorityName:zs_field_subject_grant',
        'openDate:zs_field_open_date',
        'closeDate:zs_field_close_date',
        'regions:zm_field_regions_value',
        'sectors:zm_field_activity_sector_value',
        'beneficiaries:zm_field_subject_type_value',
        'dimensions:zm_field_dimensions_value',
        'purposes:zm_field_scopes_value',
        'supportForm:zm_field_support_form_value',
        'ateco:zs_field_ateco',
        'costMin:zs_field_cost_min',
        'costMax:zs_field_cost_max',
        'institutionalLink:zs_field_link',
        'url:zs_url',
        'updatedAt:ds_last_update',
      ].join(','),
    );

    const url = `${INCENTIVI_SOLR_ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'BNDO-Bandi-Assistant/0.1' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Incentivi.gov non disponibile (HTTP ${res.status}).`);
    }

    const jsonText = await res.text();
    const json = JSON.parse(jsonText);
    const response = json?.response ?? {};
    const docs = Array.isArray(response.docs) ? response.docs : [];
    const numFoundRaw = Number(response.numFound);
    const numFound = Number.isFinite(numFoundRaw) ? Math.max(0, Math.floor(numFoundRaw)) : docs.length;

    return { docs, numFound };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAllIncentiviDocs(timeoutMs: number): Promise<IncentiviDoc[]> {
  const now = Date.now();
  if (cachedDocs && (now - lastFetchTime < CACHE_DURATION)) {
    return cachedDocs;
  }

  try {
    const allDocs: IncentiviDoc[] = [];
    const maxRows = DEFAULT_MAX_ROWS;
    let start = 0;
    let numFound = Number.POSITIVE_INFINITY;

    while (allDocs.length < maxRows && start < maxRows && allDocs.length < numFound) {
      const rows = Math.min(DEFAULT_PAGE_ROWS, maxRows - start);
      let page: { docs: IncentiviDoc[]; numFound: number } | null = null;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_PAGE_FETCH_ATTEMPTS; attempt += 1) {
        try {
          page = await fetchIncentiviPage({ start, rows, timeoutMs });
          break;
        } catch (error) {
          lastError = error as Error;
          if (attempt < MAX_PAGE_FETCH_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
        }
      }

      if (!page) {
        throw lastError ?? new Error('Incentivi.gov non disponibile.');
      }

      if (Number.isFinite(page.numFound)) {
        numFound = page.numFound;
      }

      if (page.docs.length === 0) {
        break;
      }

      allDocs.push(...page.docs);
      start += rows;

      if (page.docs.length < rows) {
        break;
      }
    }

    const docs = allDocs.slice(0, maxRows);
    console.log(
      `[datasetIncentivi] Loaded ${docs.length} docs from ${INCENTIVI_SOLR_ENDPOINT} (numFound=${Number.isFinite(numFound) ? numFound : 'n/a'})`
    );
    
    // Update cache
    if (Array.isArray(docs) && docs.length > 0) {
      cachedDocs = docs;
      lastFetchTime = now;
    }

    return Array.isArray(docs) ? docs : [];
  } catch (error) {
    if (cachedDocs && cachedDocs.length > 0) {
      console.warn('[datasetIncentivi] Falling back to in-memory cached docs after fetch error:', (error as Error).message);
      return cachedDocs;
    }
    throw error;
  }
}
