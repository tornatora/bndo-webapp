import { NextResponse } from 'next/server';
import { writeBandiCache } from '@/lib/bandiCache';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';

type IncentiviDoc = Record<string, unknown>;

const INCENTIVI_SOLR_ENDPOINT = 'https://www.incentivi.gov.it/solr/coredrupal/select';

async function fetchAllIncentiviDocs(timeoutMs: number): Promise<IncentiviDoc[]> {
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
        'updatedAt:ds_last_update'
      ].join(',')
    );

    const url = `${INCENTIVI_SOLR_ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'BNDO-Bandi-Assistant/0.1' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Incentivi.gov non disponibile (HTTP ${res.status}).`);

    const json = (await res.json().catch(() => null)) as null | { response?: { docs?: IncentiviDoc[] } };
    const docs = json?.response?.docs ?? [];
    return Array.isArray(docs) ? docs : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

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
    const saved = await writeBandiCache(docs);

    return NextResponse.json({
      ok: true,
      source: 'incentivi.gov.it',
      fetched: docs.length,
      cachePath: saved.path,
      fetchedAt: saved.fetchedAt
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Refresh fallito.' }, { status: 500 });
  }
}
