import { IncentiviDoc } from '@/lib/matching/types';

export const INCENTIVI_SOLR_ENDPOINT = 'https://www.incentivi.gov.it/solr/coredrupal/select';

export async function fetchIncentiviDocs(keyword: string | null, rows: number, timeoutMs: number): Promise<IncentiviDoc[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams();
    params.set('wt', 'json');
    params.set('rows', String(rows));
    params.set('fq', 'index_id:incentivi');
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
        'score'
      ].join(',')
    );

    if (keyword && keyword.trim()) {
      params.set('defType', 'edismax');
      params.set('q', keyword.trim());
      params.set('mm', '2<-25% 3<75%');
      params.set('tie', '0.1');
      params.set(
        'qf',
        [
          'tum_X3b_it_title_ft^4',
          'twm_X3b_it_field_search_meta^3',
          'tum_X3b_it_field_subtitle_ft^2',
          'tum_X3b_it_body_ft^1',
          'tum_X3b_it_output^0.5'
        ].join(' ')
      );
    } else {
      params.set('q', '*:*');
      params.set('sort', 'ds_last_update desc');
    }

    const url = `${INCENTIVI_SOLR_ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'BNDO-Bandi-Assistant/0.1'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Incentivi.gov non disponibile (HTTP ${res.status}).`);
    }

    const json = (await res.json().catch(() => null)) as null | { response?: { docs?: IncentiviDoc[] } };
    const docs = json?.response?.docs ?? [];
    return Array.isArray(docs) ? docs : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export function mergeIncentiviDocs(...lists: IncentiviDoc[][]) {
  const preferString = (left: unknown, right: unknown) => {
    const a = typeof left === 'string' && left.trim() ? left.trim() : null;
    const b = typeof right === 'string' && right.trim() ? right.trim() : null;
    if (!a) return b;
    if (!b) return a;
    return b.length >= a.length ? b : a;
  };

  const asStringArray = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') return [val];
    return [];
  };

  const normalizeForMatch = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

  const mergeList = (left: unknown, right: unknown) => Array.from(new Set([...asStringArray(left), ...asStringArray(right)]));
  
  const mergeDocs = (left: IncentiviDoc, right: IncentiviDoc): IncentiviDoc => ({
    ...left,
    ...right,
    title: preferString(left.title, right.title) ?? undefined,
    description: preferString(left.description, right.description) ?? undefined,
    authorityName: preferString(left.authorityName, right.authorityName) ?? undefined,
    openDate: preferString(left.openDate, right.openDate) ?? undefined,
    closeDate: preferString(left.closeDate, right.closeDate) ?? undefined,
    regions: mergeList(left.regions, right.regions),
    sectors: mergeList(left.sectors, right.sectors),
    beneficiaries: mergeList(left.beneficiaries, right.beneficiaries),
    dimensions: mergeList(left.dimensions, right.dimensions),
    purposes: mergeList(left.purposes, right.purposes),
    supportForm: mergeList(left.supportForm, right.supportForm),
    ateco: mergeList(left.ateco, right.ateco),
    costMin: right.costMin ?? left.costMin,
    costMax: right.costMax ?? left.costMax,
    institutionalLink: preferString(left.institutionalLink, right.institutionalLink) ?? undefined,
    url: preferString(left.url, right.url) ?? undefined,
    score: Math.max(typeof left.score === 'number' ? left.score : 0, typeof right.score === 'number' ? right.score : 0) || undefined,
  });

  const byKey = new Map<string, IncentiviDoc>();
  const extras: IncentiviDoc[] = [];

  for (const list of lists) {
    for (const doc of list) {
      const key =
        typeof doc.institutionalLink === 'string' && doc.institutionalLink.trim()
          ? `official:${doc.institutionalLink.trim()}`
          : typeof doc.url === 'string' && doc.url.trim()
            ? `url:${doc.url.trim()}`
            : doc.id !== undefined && doc.id !== null
              ? `id:${String(doc.id)}`
              : typeof doc.title === 'string' && doc.title.trim()
                ? `title:${normalizeForMatch(doc.title)}`
            : null;
      if (!key) {
        extras.push(doc);
        continue;
      }
      if (!byKey.has(key)) byKey.set(key, doc);
      else byKey.set(key, mergeDocs(byKey.get(key)!, doc));
    }
  }

  return [...byKey.values(), ...extras];
}
