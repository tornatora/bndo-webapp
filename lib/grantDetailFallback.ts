import { readBandiCache, readBundledBandiSeed } from '@/lib/bandiCache';
import { STRATEGIC_SCANNER_DOCS } from '@/lib/strategicScannerDocs';

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
  grantMin?: string | number;
  grantMax?: string | number;
  coverageMinPercent?: string | number;
  coverageMaxPercent?: string | number;
  displayAmountLabel?: string;
  displayProjectAmountLabel?: string;
  displayCoverageLabel?: string;
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
  description: string | null;
  cpvCode?: string | null;
  requisitiHard: Record<string, unknown>;
  requisitiSoft: Record<string, unknown>;
  requisitiStrutturati: Record<string, unknown>;
  requiredDocuments?: string[];
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

const GRANT_NOT_FOUND_CODE = 'GRANT_NOT_FOUND';

let localDocsPromise: Promise<IncentiviDoc[]> | null = null;

function createGrantNotFoundError(message = 'Bando non trovato.') {
  const error = new Error(message) as Error & { code?: string };
  error.code = GRANT_NOT_FOUND_CODE;
  return error;
}

export function isGrantNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === GRANT_NOT_FOUND_CODE);
}

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

function parsePercentValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  if (typeof value !== 'string') return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
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

function formatCoverage(min: number | null, max: number | null): string | null {
  const low = min !== null && Number.isFinite(min) ? Math.max(0, Math.min(100, min)) : null;
  const high = max !== null && Number.isFinite(max) ? Math.max(0, Math.min(100, max)) : null;
  if (low === null && high === null) return null;
  if (low !== null && high !== null) {
    if (Math.abs(low - high) < 0.001) return `${Math.round(high)}%`;
    return `${Math.round(Math.min(low, high))}% - ${Math.round(Math.max(low, high))}%`;
  }
  const single = high ?? low;
  return single !== null ? `${Math.round(single)}%` : null;
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

function resolveGrantParts(grantId: string) {
  const trimmed = String(grantId || '').trim();
  const raw = trimmed.replace(/^incentivi-/i, '').trim();
  return {
    originalId: trimmed,
    rawId: raw,
    numericId: /^\d+$/.test(raw) ? raw : null,
    strategicId: raw.startsWith('strategic-') ? raw : null,
  };
}

function normalizeLookupValue(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function extractPathTail(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const asUrl = new URL(trimmed);
    const parts = asUrl.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  } catch {
    const parts = trimmed.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }
}

function buildDocLookupKeys(doc: IncentiviDoc): Set<string> {
  const keys = new Set<string>();
  const push = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return;
    const normalized = normalizeLookupValue(String(value));
    if (normalized) keys.add(normalized);
  };

  push(doc.id);
  push(doc.title);
  push(doc.url);
  push(extractPathTail(String(doc.url ?? '')));
  push(doc.institutionalLink);
  push(extractPathTail(String(doc.institutionalLink ?? '')));
  return keys;
}

function buildGrantLookupCandidates(grantId: string): Set<string> {
  const { originalId, rawId } = resolveGrantParts(grantId);
  const candidates = new Set<string>();
  const push = (value: string) => {
    const normalized = normalizeLookupValue(value);
    if (normalized) candidates.add(normalized);
  };

  push(originalId);
  push(rawId);
  push(extractPathTail(originalId));
  push(extractPathTail(rawId));
  push(rawId.replace(/^grant-?/i, ''));
  push(rawId.replace(/^bando-?/i, ''));
  return candidates;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeLookupValue(value)
      .split('-')
      .filter((token) => token.length >= 3)
  );
}

function overlapScore(target: Set<string>, source: Set<string>): number {
  if (target.size === 0 || source.size === 0) return 0;
  let overlap = 0;
  target.forEach((token) => {
    if (source.has(token)) overlap += 1;
  });
  return overlap / target.size;
}

function strategicDocToIncentiviDoc(rawDoc: unknown): IncentiviDoc {
  const doc = (rawDoc ?? {}) as Record<string, unknown>;
  return {
    id: (typeof doc.id === 'string' || typeof doc.id === 'number') ? doc.id : undefined,
    title: typeof doc.title === 'string' ? doc.title : undefined,
    description: typeof doc.description === 'string' ? doc.description : undefined,
    authorityName: typeof doc.authorityName === 'string' ? doc.authorityName : undefined,
    openDate: typeof doc.openDate === 'string' ? doc.openDate : undefined,
    closeDate: typeof doc.closeDate === 'string' ? doc.closeDate : undefined,
    sectors:
      Array.isArray(doc.sectors) ? doc.sectors.map((entry) => String(entry)) : typeof doc.sectors === 'string' ? doc.sectors : undefined,
    beneficiaries:
      Array.isArray(doc.beneficiaries)
        ? doc.beneficiaries.map((entry) => String(entry))
        : typeof doc.beneficiaries === 'string'
          ? doc.beneficiaries
          : undefined,
    supportForm:
      Array.isArray(doc.supportForm)
        ? doc.supportForm.map((entry) => String(entry))
        : typeof doc.supportForm === 'string'
          ? doc.supportForm
          : undefined,
    costMin: doc.costMin as string | number | undefined,
    costMax: doc.costMax as string | number | undefined,
    grantMin: doc.grantMin as string | number | undefined,
    grantMax: doc.grantMax as string | number | undefined,
    coverageMinPercent: doc.coverageMinPercent as string | number | undefined,
    coverageMaxPercent: doc.coverageMaxPercent as string | number | undefined,
    displayAmountLabel: typeof doc.displayAmountLabel === 'string' ? doc.displayAmountLabel : undefined,
    displayProjectAmountLabel: typeof doc.displayProjectAmountLabel === 'string' ? doc.displayProjectAmountLabel : undefined,
    displayCoverageLabel: typeof doc.displayCoverageLabel === 'string' ? doc.displayCoverageLabel : undefined,
    institutionalLink: typeof doc.institutionalLink === 'string' ? doc.institutionalLink : undefined,
    url: typeof doc.url === 'string' ? doc.url : undefined,
  };
}

async function loadLocalDocs(): Promise<IncentiviDoc[]> {
  if (!localDocsPromise) {
    localDocsPromise = (async () => {
      const cache = await readBandiCache<IncentiviDoc>();
      const seed = await readBundledBandiSeed<IncentiviDoc>();
      const merged = [...(cache?.docs ?? []), ...(seed?.docs ?? []), ...STRATEGIC_SCANNER_DOCS.map(strategicDocToIncentiviDoc)];
      const dedupe = new Map<string, IncentiviDoc>();
      for (const doc of merged) {
        const idKey = String(doc.id ?? '').trim();
        const titleKey = String(doc.title ?? '').trim().toLowerCase();
        const key = idKey || titleKey;
        if (!key) continue;
        if (!dedupe.has(key)) dedupe.set(key, doc);
      }
      return Array.from(dedupe.values());
    })();
  }
  return localDocsPromise;
}

async function findLocalDocByGrantId(grantId: string): Promise<IncentiviDoc | null> {
  const docs = await loadLocalDocs();
  const { rawId, numericId, strategicId } = resolveGrantParts(grantId);
  const byId = docs.find((doc) => String(doc.id ?? '').trim() === rawId);
  if (byId) return byId;
  if (numericId) {
    const byNumeric = docs.find((doc) => String(doc.id ?? '').trim() === numericId);
    if (byNumeric) return byNumeric;
  }
  if (strategicId) {
    const byStrategic = docs.find((doc) => String(doc.id ?? '').trim() === strategicId);
    if (byStrategic) return byStrategic;
  }

  const lookupCandidates = buildGrantLookupCandidates(grantId);
  if (lookupCandidates.size === 0) return null;

  for (const doc of docs) {
    const docKeys = buildDocLookupKeys(doc);
    for (const lookup of lookupCandidates) {
      if (docKeys.has(lookup)) {
        return doc;
      }
    }
  }

  const lookupTokenUnion = new Set<string>();
  for (const value of lookupCandidates) {
    tokenSet(value).forEach((token) => lookupTokenUnion.add(token));
  }
  if (lookupTokenUnion.size === 0) return null;

  let best: IncentiviDoc | null = null;
  let bestScore = 0;
  for (const doc of docs) {
    const docTokens = new Set<string>();
    tokenSet(String(doc.title ?? '')).forEach((token) => docTokens.add(token));
    tokenSet(String(doc.url ?? '')).forEach((token) => docTokens.add(token));
    tokenSet(String(doc.institutionalLink ?? '')).forEach((token) => docTokens.add(token));

    const score = overlapScore(lookupTokenUnion, docTokens);
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  }

  if (best && bestScore >= 0.6) {
    return best;
  }

  return null;
}

async function fetchIncentiviDocByGrantId(grantId: string): Promise<IncentiviDoc> {
  const localDoc = await findLocalDocByGrantId(grantId);
  if (localDoc) return localDoc;

  const { numericId } = resolveGrantParts(grantId);
  if (!numericId) {
    throw createGrantNotFoundError('Bando non trovato.');
  }

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
      'url:zs_url',
    ].join(',')
  );
  params.set('q', `zs_nid:${numericId}`);

  const response = await fetch(`${INCENTIVI_SOLR_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    headers: { 'User-Agent': 'BNDO-Bandi-Assistant/0.1' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Incentivi.gov non disponibile (HTTP ${response.status}).`);
  }

  const json = (await response.json().catch(() => null)) as null | { response?: { docs?: IncentiviDoc[] } };
  const doc = json?.response?.docs?.[0];
  if (!doc) {
    throw createGrantNotFoundError('Bando non trovato su Incentivi.gov.');
  }
  return doc;
}

function resolveAvailabilityStatus(openDate: string | null): 'open' | 'incoming' {
  if (!openDate) return 'open';
  const parsed = new Date(openDate);
  if (Number.isNaN(parsed.getTime())) return 'open';
  return parsed.getTime() > Date.now() ? 'incoming' : 'open';
}

function buildEconomicPayload(doc: IncentiviDoc) {
  const costMin = parseMoneyValue(doc.costMin);
  const costMax = parseMoneyValue(doc.costMax);
  const grantMin = parseMoneyValue(doc.grantMin);
  const grantMax = parseMoneyValue(doc.grantMax);
  const coverageMin = parsePercentValue(doc.coverageMinPercent);
  const coverageMax = parsePercentValue(doc.coverageMaxPercent);
  const displayAmountLabel =
    (typeof doc.displayAmountLabel === 'string' && doc.displayAmountLabel.trim()) || formatRange(grantMin, grantMax);
  const displayProjectAmountLabel =
    (typeof doc.displayProjectAmountLabel === 'string' && doc.displayProjectAmountLabel.trim()) || formatRange(costMin, costMax);
  const displayCoverageLabel =
    (typeof doc.displayCoverageLabel === 'string' && doc.displayCoverageLabel.trim()) || formatCoverage(coverageMin, coverageMax);

  return {
    costMin,
    costMax,
    grantMin,
    grantMax,
    coverageMin,
    coverageMax,
    displayAmountLabel,
    displayProjectAmountLabel,
    displayCoverageLabel,
  };
}

export async function buildFallbackGrantDetail(grantId: string): Promise<FallbackGrantDetail> {
  const doc = await fetchIncentiviDocByGrantId(grantId);
  const beneficiaries = asStringArray(doc.beneficiaries);
  const sectors = asStringArray(doc.sectors);
  const supportForm = asStringArray(doc.supportForm);
  const economic = buildEconomicPayload(doc);
  const budgetTotal =
    Math.max(economic.costMax ?? 0, economic.grantMax ?? 0, economic.costMin ?? 0, economic.grantMin ?? 0) || null;

  return {
    id: String(grantId),
    title: doc.title?.trim() || 'Incentivo',
    authority: doc.authorityName?.trim() || 'Incentivi.gov',
    openingDate: doc.openDate ?? null,
    deadlineDate: doc.closeDate ?? null,
    availabilityStatus: resolveAvailabilityStatus(doc.openDate ?? null),
    budgetTotal,
    aidForm: supportForm[0] ?? 'Agevolazione',
    aidIntensity: economic.displayCoverageLabel || 'Da verificare',
    beneficiaries: beneficiaries.length ? beneficiaries : ['Imprese'],
    sectors,
    officialUrl: buildSourceUrl(doc),
    officialAttachments: [],
    description: doc.description ?? null,
    cpvCode: (doc as any).cpvCode ?? null,
    requisitiHard: {
      settori_scope: sectors.length ? 'settori_specifici' : 'tutti_tranne_esclusi',
    },
    requisitiSoft: {},
    requisitiStrutturati: {
      economic: {
        displayAmountLabel: economic.displayAmountLabel || 'Da verificare',
        displayProjectAmountLabel: economic.displayProjectAmountLabel || 'Da verificare',
        displayCoverageLabel: economic.displayCoverageLabel || 'Da verificare',
        grantMin: economic.grantMin,
        grantMax: economic.grantMax,
        costMin: economic.costMin,
        costMax: economic.costMax,
        estimatedCoverageMinPercent: economic.coverageMin,
        estimatedCoverageMaxPercent: economic.coverageMax,
      },
    },
    requiredDocuments: (doc as any).requiredDocuments || [],
  };
}


export async function buildFallbackGrantExplainability(grantId: string): Promise<FallbackGrantExplainability> {
  const detail = await buildFallbackGrantDetail(grantId);
  const whyFit = [
    detail.beneficiaries.length ? `Beneficiari potenziali: ${detail.beneficiaries.slice(0, 3).join(', ')}` : null,
    detail.sectors.length ? `Settori coinvolti: ${detail.sectors.slice(0, 3).join(', ')}` : null,
    detail.aidForm ? `Forma agevolazione: ${detail.aidForm}` : null,
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
      'Confermare documentazione richiesta e finestra temporale di candidatura.',
    ],
    applySteps: [
      'Leggi la scheda ufficiale del bando e verifica la finestra di apertura.',
      'Controlla requisiti soggettivi, settoriali e documentazione richiesta.',
      'Prenota una consulenza BNDO per validare l’ammissibilità prima della candidatura.',
    ],
    message: 'Analisi generale disponibile. Per una compatibilità personalizzata completa usa lo scanner bandi.',
  };
}
