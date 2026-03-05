import type { IncentiviDoc } from '@/lib/matching/types';

const INCENTIVI_SOLR_ENDPOINT = 'https://www.incentivi.gov.it/solr/coredrupal/select';

export async function fetchAllIncentiviDocs(timeoutMs: number): Promise<IncentiviDoc[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams();
    params.set('wt', 'json');
    params.set('rows', '8000');
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
    if (!res.ok) throw new Error(`Incentivi.gov non disponibile (HTTP ${res.status}).`);

    const json = (await res.json().catch(() => null)) as null | { response?: { docs?: IncentiviDoc[] } };
    const docs = json?.response?.docs ?? [];
    return Array.isArray(docs) ? docs : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

