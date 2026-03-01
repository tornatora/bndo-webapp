const INCENTIVI_SOLR_ENDPOINT = 'https://www.incentivi.gov.it/solr/coredrupal/select';
const INCENTIVI_BASE_URL = 'https://www.incentivi.gov.it';

type IncentiviDoc = {
  id?: string | number;
  title?: string;
  description?: string;
  authorityName?: string;
  openDate?: string;
  closeDate?: string;
  sectors?: string[] | string;
  beneficiaries?: string[] | string;
  supportForm?: string[] | string;
  costMin?: string | number;
  costMax?: string | number;
  institutionalLink?: string;
  url?: string;
};

export type FallbackGrantDetail = {
  id: string;
  title: string;
  authority: string | null;
  openingDate: string | null;
  deadlineDate: string | null;
  availabilityStatus: 'open' | 'incoming';
  budgetTotal: number | null;
  aidForm: string | null;
  aidIntensity: string | null;
  beneficiaries: string[];
  sectors: string[];
  officialUrl: string;
  officialAttachments: string[];
  requisitiHard: Record<string, unknown>;
  requisitiSoft: Record<string, unknown>;
  requisitiStrutturati: Record<string, unknown>;
};

export type FallbackGrantExplainability = {
  hardStatus: 'eligible' | 'not_eligible' | 'unknown';
  eligibilityScore: number;
  completenessScore: number;
  fitScore: number;
  probabilityScore: number;
  whyFit: string[];
  satisfiedRequirements: string[];
  missingRequirements: string[];
  applySteps: string[];
  message?: string;
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[;,|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function parseMoneyValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== 'string') return null;

  const raw = value.toLowerCase().trim();
  if (!raw) return null;

  let multiplier = 1;
  if (/(miliard|mld)/.test(raw)) multiplier = 1_000_000_000;
  else if (/(milion|mln)/.test(raw)) multiplier = 1_000_000;
  else if (/\bmila\b|\bk\b/.test(raw)) multiplier = 1_000;

  const compact = raw
    .replace(/€|eur|euro/g, '')
    .replace(/miliardi?|mld|milioni?|mln|mila|\bk\b/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,.\-]/g, '');

  if (!compact) return null;

  let normalized = compact;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized =
      normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');
    normalized =
      parts.length === 2 && parts[1].length <= 2 ? `${parts[0].replace(/\./g, '')}.${parts[1]}` : parts.join('');
  } else if (normalized.includes('.')) {
    const parts = normalized.split('.');
    normalized = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join('');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed * multiplier;
}

function formatCurrency(value: number): string {
  return `€ ${Math.round(value).toLocaleString('it-IT')}`;
}

function formatRange(min: number | null, max: number | null): string | null {
  const low = min !== null && Number.isFinite(min) && min > 0 ? min : null;
  const high = max !== null && Number.isFinite(max) && max > 0 ? max : null;

  if (low !== null && high !== null) {
    const a = Math.min(low, high);
    const b = Math.max(low, high);
    return `Da ${formatCurrency(a)} a ${formatCurrency(b)}`;
  }
  if (high !== null) return `Fino a ${formatCurrency(high)}`;
  if (low !== null) return `Da ${formatCurrency(low)}`;
  return null;
}

function buildSourceUrl(doc: IncentiviDoc): string {
  if (typeof doc.institutionalLink === 'string' && /^https?:\/\//i.test(doc.institutionalLink.trim())) {
    return doc.institutionalLink.trim();
  }
  if (typeof doc.url === 'string' && doc.url.trim().startsWith('/')) {
    return `${INCENTIVI_BASE_URL}${doc.url.trim()}`;
  }
  return `${INCENTIVI_BASE_URL}/it`;
}

function resolveGrantNumericId(grantId: string): string {
  const trimmed = String(grantId || '').trim();
  const match = trimmed.match(/^incentivi-(.+)$/i);
  const raw = match ? match[1] : trimmed;
  if (!/^\d+$/.test(raw)) {
    throw new Error('ID incentivo non valido.');
  }
  return raw;
}

async function fetchIncentiviDocByGrantId(grantId: string): Promise<IncentiviDoc> {
  const docId = resolveGrantNumericId(grantId);
  const params = new URLSearchParams();
  params.set('wt', 'json');
  params.set('rows', '1');
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
      'sectors:zm_field_activity_sector_value',
      'beneficiaries:zm_field_subject_type_value',
      'supportForm:zm_field_support_form_value',
      'costMin:zs_field_cost_min',
      'costMax:zs_field_cost_max',
      'institutionalLink:zs_field_link',
      'url:zs_url'
    ].join(',')
  );
  params.set('q', `zs_nid:${docId}`);

  const response = await fetch(`${INCENTIVI_SOLR_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    headers: { 'User-Agent': 'BNDO-Bandi-Assistant/0.1' },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Incentivi.gov non disponibile (HTTP ${response.status}).`);
  }

  const json = (await response.json().catch(() => null)) as null | { response?: { docs?: IncentiviDoc[] } };
  const doc = json?.response?.docs?.[0];
  if (!doc) {
    throw new Error('Bando non trovato su Incentivi.gov.');
  }
  return doc;
}

function resolveAvailabilityStatus(openDate: string | null): 'open' | 'incoming' {
  if (!openDate) return 'open';
  const parsed = new Date(openDate);
  if (Number.isNaN(parsed.getTime())) return 'open';
  return parsed.getTime() > Date.now() ? 'incoming' : 'open';
}

export async function buildFallbackGrantDetail(grantId: string): Promise<FallbackGrantDetail> {
  const doc = await fetchIncentiviDocByGrantId(grantId);
  const beneficiaries = asStringArray(doc.beneficiaries);
  const sectors = asStringArray(doc.sectors);
  const supportForm = asStringArray(doc.supportForm);
  const costMin = parseMoneyValue(doc.costMin);
  const costMax = parseMoneyValue(doc.costMax);
  const budgetTotal = Math.max(costMin ?? 0, costMax ?? 0) || null;
  const displayAmount = formatRange(costMin, costMax) || (budgetTotal ? `Fino a ${formatCurrency(budgetTotal)}` : null);

  return {
    id: String(grantId),
    title: doc.title?.trim() || 'Incentivo',
    authority: doc.authorityName?.trim() || 'Incentivi.gov',
    openingDate: doc.openDate ?? null,
    deadlineDate: doc.closeDate ?? null,
    availabilityStatus: resolveAvailabilityStatus(doc.openDate ?? null),
    budgetTotal,
    aidForm: supportForm[0] ?? 'Agevolazione',
    aidIntensity: 'Da verificare nel bando',
    beneficiaries: beneficiaries.length ? beneficiaries : ['Imprese'],
    sectors,
    officialUrl: buildSourceUrl(doc),
    officialAttachments: [],
    requisitiHard: {
      settori_scope: sectors.length ? 'settori_specifici' : 'tutti_tranne_esclusi'
    },
    requisitiSoft: {},
    requisitiStrutturati: {
      economic: {
        displayAmountLabel: displayAmount || 'Dati economici in aggiornamento',
        displayProjectAmountLabel: displayAmount || 'Dati economici in aggiornamento',
        displayCoverageLabel: 'Da verificare nel bando',
        grantMin: costMin,
        grantMax: costMax,
        costMin,
        costMax
      }
    }
  };
}

export async function buildFallbackGrantExplainability(grantId: string): Promise<FallbackGrantExplainability> {
  const detail = await buildFallbackGrantDetail(grantId);
  const whyFit = [
    detail.beneficiaries.length ? `Beneficiari potenziali: ${detail.beneficiaries.slice(0, 3).join(', ')}` : null,
    detail.sectors.length ? `Settori coinvolti: ${detail.sectors.slice(0, 3).join(', ')}` : null,
    detail.aidForm ? `Forma agevolazione: ${detail.aidForm}` : null
  ].filter((value): value is string => Boolean(value));

  return {
    hardStatus: 'unknown',
    eligibilityScore: 68,
    completenessScore: 60,
    fitScore: 66,
    probabilityScore: 67,
    whyFit,
    satisfiedRequirements: whyFit,
    missingRequirements: [
      'Verificare requisiti specifici, ATECO ammessi e spese finanziabili sul testo ufficiale.',
      'Confermare documentazione richiesta e finestra temporale di candidatura.'
    ],
    applySteps: [
      'Leggi la scheda ufficiale del bando e verifica la finestra di apertura.',
      'Controlla requisiti soggettivi, settoriali e documentazione richiesta.',
      'Prenota una consulenza BNDO per validare l’ammissibilità prima della candidatura.'
    ],
    message: 'Analisi generale disponibile. Per una compatibilità personalizzata completa usa lo scanner bandi.'
  };
}
