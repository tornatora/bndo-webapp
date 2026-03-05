const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_SCANNER_API_BASE_URL || '').replace(
  /\/+$/,
  ''
);

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';

type LocalScannerProfile = {
  location?: { region?: string | null } | null;
  region?: string | null;
  activityType?: string | null;
  sector?: string | null;
  ateco?: string | null;
  fundingGoal?: string | null;
  contributionPreference?: string | null;
  employees?: number | null;
  founderAge?: number | null;
  employmentStatus?: string | null;
  revenueOrBudgetEUR?: number | null;
  requestedContributionEUR?: number | null;
  legalForm?: string | null;
  businessExists?: boolean | null;
};

type ScanRouteItem = {
  id?: string;
  title?: string;
  authorityName?: string;
  deadlineAt?: string | null;
  sourceUrl?: string;
  requirements?: string[];
  score?: number;
  matchScore?: number;
  matchReasons?: string[];
  mismatchFlags?: string[];
  grantId?: string;
  grantTitle?: string;
  authority?: string | null;
  officialUrl?: string | null;
  beneficiaries?: string[] | null;
  openingDate?: string | null;
  deadlineDate?: string | null;
  availabilityStatus?: 'open' | 'incoming';
  aidForm?: string | null;
  aidIntensity?: string | null;
  budgetTotal?: number | null;
  economicOffer?: Record<string, unknown> | null;
  probabilityScore?: number;
  hardStatus?: 'eligible' | 'not_eligible' | 'unknown';
  whyFit?: string[] | null;
  satisfiedRequirements?: string[] | null;
  missingRequirements?: string[] | null;
};

type LocalMatchItem = {
  grantId: string;
  grantTitle: string;
  authority: string | null;
  officialUrl: string | null;
  beneficiaries: string[];
  openingDate: string | null;
  deadlineDate: string | null;
  availabilityStatus: 'open' | 'incoming';
  aidForm: string | null;
  aidIntensity: string | null;
  budgetTotal: number | null;
  economicOffer: Record<string, unknown> | null;
  probabilityScore: number;
  hardStatus: 'eligible' | 'not_eligible' | 'unknown';
  whyFit: string[];
  satisfiedRequirements: string[];
  missingRequirements: string[];
};

type LocalMatchLatestResponse = {
  run: { id: string } | null;
  items: LocalMatchItem[];
  nearMisses?: LocalMatchItem[];
};

type LocalGrantDetail = {
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

type LocalExplainability = {
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

const LOCAL_PROFILE_KEY = 'bndo_scanner_local_profile';
const LOCAL_MATCHES_KEY = 'bndo_scanner_local_matches';
const LOCAL_MATCHES_EVENT = 'bndo:scanner-matches-updated';

export class ApiError extends Error {
  statusCode: number;
  payload?: unknown;

  constructor(statusCode: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function readStorage<T>(key: string): T | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function emitLocalMatchesUpdated(detail: { phase: 'fast' | 'full' }) {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(LOCAL_MATCHES_EVENT, { detail }));
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new ApiError(response.status, payload?.error || payload?.message || `Errore API ${response.status}`, payload);
  }

  return response.json() as Promise<T>;
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRequirementValue(requirements: string[] | undefined, prefixes: string[]): string | null {
  if (!requirements?.length) return null;
  const normalizedPrefixes = prefixes.map((prefix) => normalizeText(prefix));

  for (const row of requirements) {
    const normalizedRow = normalizeText(row);
    const idx = normalizedPrefixes.findIndex((prefix) => normalizedRow.startsWith(prefix));
    if (idx === -1) continue;

    const split = row.split(':');
    if (split.length > 1) {
      return split.slice(1).join(':').trim() || null;
    }

    const prefixText = prefixes[idx] ?? '';
    return row.replace(new RegExp(`^${prefixText}`, 'i'), '').trim() || null;
  }

  return null;
}

function splitRequirementList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;·]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readNumeric(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(/[^0-9,.-]/g, '');

  if (!cleaned) return null;

  const normalized =
    cleaned.includes(',') && cleaned.includes('.')
      ? cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '')
      : cleaned.includes(',')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/\./g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoneyFromText(value: string | null): number | null {
  if (!value) return null;

  const matches = Array.from(value.matchAll(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)/g));
  const numbers = matches
    .map((match) => readNumeric(match[1]))
    .filter((entry): entry is number => entry !== null && entry > 0);

  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

function inferProbabilityScore(item: ScanRouteItem): number {
  if (typeof item.probabilityScore === 'number' && Number.isFinite(item.probabilityScore)) {
    return Math.max(0, Math.min(100, item.probabilityScore));
  }

  const score = typeof item.matchScore === 'number' ? item.matchScore : typeof item.score === 'number' ? item.score : 0;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function inferHardStatus(item: ScanRouteItem): 'eligible' | 'not_eligible' | 'unknown' {
  if (item.hardStatus === 'eligible' || item.hardStatus === 'not_eligible' || item.hardStatus === 'unknown') {
    return item.hardStatus;
  }

  if ((item.mismatchFlags?.length ?? 0) > 0) return 'unknown';
  return 'eligible';
}

function normalizeScanItem(item: ScanRouteItem): LocalMatchItem {
  const requirements = sanitizeList(item.requirements);
  const beneficiaries = item.beneficiaries?.length
    ? sanitizeList(item.beneficiaries)
    : splitRequirementList(getRequirementValue(requirements, ['Beneficiari']));
  const aidForm = item.aidForm ?? getRequirementValue(requirements, ['Forma agevolazione', 'Forma aiuto']);
  const budgetFromRequirements =
    parseMoneyFromText(getRequirementValue(requirements, ['Importo agevolazione', 'Importo', 'Contributo'])) ?? null;
  const projectBudgetFromRequirements =
    parseMoneyFromText(getRequirementValue(requirements, ['Spesa progetto ammissibile', 'Spesa ammissibile', 'Spesa ammessa'])) ?? null;
  const resolvedBudget = item.budgetTotal ?? budgetFromRequirements ?? null;
  const economicOffer =
    item.economicOffer ??
    ((resolvedBudget && resolvedBudget > 0) || (projectBudgetFromRequirements && projectBudgetFromRequirements > 0)
      ? {
          displayAmountLabel:
            resolvedBudget && resolvedBudget > 0 ? `Fino a € ${Math.round(resolvedBudget).toLocaleString('it-IT')}` : null,
          displayProjectAmountLabel:
            projectBudgetFromRequirements && projectBudgetFromRequirements > 0
              ? `Fino a € ${Math.round(projectBudgetFromRequirements).toLocaleString('it-IT')}`
              : resolvedBudget && resolvedBudget > 0
                ? `Fino a € ${Math.round(resolvedBudget).toLocaleString('it-IT')}`
                : null,
          displayCoverageLabel: item.aidIntensity || null
        }
      : null);

  return {
    grantId: item.grantId ?? item.id ?? `grant-${Date.now()}`,
    grantTitle: item.grantTitle ?? item.title ?? 'Bando',
    authority: item.authority ?? item.authorityName ?? null,
    officialUrl: item.officialUrl ?? item.sourceUrl ?? null,
    beneficiaries,
    openingDate: item.openingDate ?? null,
    deadlineDate: item.deadlineDate ?? item.deadlineAt ?? null,
    availabilityStatus: item.availabilityStatus ?? 'open',
    aidForm: aidForm ?? null,
    aidIntensity: item.aidIntensity ?? null,
    budgetTotal: resolvedBudget,
    economicOffer,
    probabilityScore: inferProbabilityScore(item),
    hardStatus: inferHardStatus(item),
    whyFit: sanitizeList(item.whyFit ?? item.matchReasons),
    satisfiedRequirements: sanitizeList(item.satisfiedRequirements ?? item.matchReasons),
    missingRequirements: sanitizeList(item.missingRequirements ?? item.mismatchFlags),
  };
}

function toLegacyProfile(body: unknown): LocalScannerProfile {
  const raw = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const constraints =
    raw.constraints && typeof raw.constraints === 'object' && !Array.isArray(raw.constraints)
      ? (raw.constraints as Record<string, unknown>)
      : {};

  const atecoCodes = Array.isArray(raw.atecoCodes) ? raw.atecoCodes.map((entry) => String(entry).trim()).filter(Boolean) : [];

  return {
    location: { region: (typeof raw.region === 'string' ? raw.region : null) ?? null },
    region: typeof raw.region === 'string' ? raw.region : null,
    activityType: typeof constraints.activityType === 'string' ? constraints.activityType : null,
    sector: typeof raw.sector === 'string' ? raw.sector : null,
    ateco: atecoCodes.join(', ') || null,
    fundingGoal: typeof constraints.fundingGoal === 'string' ? constraints.fundingGoal : null,
    contributionPreference: typeof raw.aidPreference === 'string' ? raw.aidPreference : null,
    employees: typeof raw.employees === 'number' ? raw.employees : null,
    founderAge: typeof raw.age === 'number' ? raw.age : null,
    employmentStatus: typeof raw.employmentStatus === 'string' ? raw.employmentStatus : null,
    revenueOrBudgetEUR: typeof raw.plannedInvestment === 'number' ? raw.plannedInvestment : null,
    requestedContributionEUR: typeof raw.targetAmount === 'number' ? raw.targetAmount : null,
    legalForm: typeof raw.legalForm === 'string' ? raw.legalForm : null,
    businessExists: typeof raw.businessExists === 'boolean' ? raw.businessExists : null
  };
}

async function runLocalMatching(mode: 'fast' | 'full' = 'fast'): Promise<LocalMatchLatestResponse> {
  const profile = readStorage<LocalScannerProfile>(LOCAL_PROFILE_KEY);
  if (!profile) {
    throw new ApiError(400, 'Profilo scanner mancante. Compila il form prima di avviare la ricerca.');
  }

  const baseUrl = isBrowser() ? window.location.origin : '';
  const scan = await fetchJson<{
    results?: ScanRouteItem[];
    nearMisses?: ScanRouteItem[];
    phase?: 'fast' | 'full';
  }>(`${baseUrl}/api/scan-bandi`, {
    method: 'POST',
    body: JSON.stringify({ userProfile: profile, mode })
  });

  const latest: LocalMatchLatestResponse = {
    run: { id: `local-${Date.now()}` },
    items: (scan.results ?? []).map((item) => normalizeScanItem(item)),
    nearMisses: (scan.nearMisses ?? []).map((item) => normalizeScanItem(item))
  };

  writeStorage(LOCAL_MATCHES_KEY, latest);
  emitLocalMatchesUpdated({ phase: scan.phase === 'fast' ? 'fast' : 'full' });
  return latest;
}

async function ensureLocalMatches(): Promise<LocalMatchLatestResponse> {
  const stored = readStorage<LocalMatchLatestResponse>(LOCAL_MATCHES_KEY);
  if (stored) return stored;
  return runLocalMatching();
}

async function findGrantItem(grantId: string): Promise<LocalMatchItem> {
  const latest = await ensureLocalMatches();
  const item = [...latest.items, ...(latest.nearMisses ?? [])].find((entry) => entry.grantId === grantId);
  if (!item) {
    throw new ApiError(404, 'Bando non trovato.');
  }
  return item;
}

async function buildGrantDetail(grantId: string): Promise<LocalGrantDetail> {
  const item = await findGrantItem(grantId);
  const sectors = item.whyFit.filter((entry) => normalizeText(entry).includes('settore')).slice(0, 2);

  const economic =
    item.economicOffer && typeof item.economicOffer === 'object'
      ? item.economicOffer
      : {
          displayAmountLabel:
            item.budgetTotal && item.budgetTotal > 0
              ? `Fino a € ${Math.round(item.budgetTotal).toLocaleString('it-IT')}`
              : 'Dati economici in aggiornamento',
          displayCoverageLabel: item.aidIntensity || 'Copertura in aggiornamento'
        };

  return {
    id: item.grantId,
    title: item.grantTitle,
    authority: item.authority,
    openingDate: item.openingDate,
    deadlineDate: item.deadlineDate,
    availabilityStatus: item.availabilityStatus,
    budgetTotal: item.budgetTotal,
    aidForm: item.aidForm,
    aidIntensity: item.aidIntensity,
    beneficiaries: item.beneficiaries.length > 0 ? item.beneficiaries : ['Imprese'],
    sectors,
    officialUrl: item.officialUrl || '#',
    officialAttachments: [],
    requisitiHard: {},
    requisitiSoft: {},
    requisitiStrutturati: {
      economic
    }
  };
}

async function buildExplainability(grantId: string): Promise<LocalExplainability> {
  const item = await findGrantItem(grantId);
  const probabilityScore = Math.max(0, Math.min(100, Math.round(item.probabilityScore || 0)));

  return {
    hardStatus: item.hardStatus,
    eligibilityScore: probabilityScore,
    completenessScore: probabilityScore,
    fitScore: probabilityScore,
    probabilityScore,
    whyFit: item.whyFit,
    satisfiedRequirements: item.satisfiedRequirements,
    missingRequirements: item.missingRequirements,
    applySteps: [
      'Verifica il testo ufficiale del bando e le scadenze operative.',
      'Prepara i documenti richiesti e la descrizione del progetto.',
      'Prenota una consulenza BNDO per validare requisiti e strategia di candidatura.'
    ]
  };
}

async function fetchExternal<T>(path: string, method: Method, token?: string | null, body?: unknown): Promise<T> {
  const requestUrl = API_BASE ? `${API_BASE}${path}` : path;
  const response = await fetch(requestUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { message?: string | string[] };
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : Array.isArray(payload?.message)
            ? payload.message.join(' · ')
            : `Errore API ${response.status}`;
      throw new ApiError(response.status, message, payload);
    }

    const text = await response.text();
    throw new ApiError(response.status, text || `Errore API ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiRequest<T>(
  path: string,
  method: Method = 'GET',
  token?: string | null,
  body?: unknown
): Promise<T> {
  if (path === '/api/v1/public/coverage' && method === 'GET') {
    return { inProgressSources: 0, missingItemsOpen: 0 } as T;
  }

  if (path === '/api/v1/profile/me' && method === 'PUT') {
    const legacyProfile = toLegacyProfile(body);
    writeStorage(LOCAL_PROFILE_KEY, legacyProfile);
    return (body ?? {}) as T;
  }

  if (path === '/api/v1/matching/run' && method === 'POST') {
    const latest = await runLocalMatching('fast');
    return ({ run: latest.run } as unknown) as T;
  }

  if (path === '/api/v1/matching/latest' && method === 'GET') {
    return (await ensureLocalMatches()) as T;
  }

  const explainabilityMatch = path.match(/^\/api\/v1\/grants\/([^/]+)\/explainability$/);
  if (explainabilityMatch && method === 'GET') {
    return (await buildExplainability(decodeURIComponent(explainabilityMatch[1] || ''))) as T;
  }

  const grantMatch = path.match(/^\/api\/v1\/grants\/([^/]+)$/);
  if (grantMatch && method === 'GET') {
    return (await buildGrantDetail(decodeURIComponent(grantMatch[1] || ''))) as T;
  }

  return fetchExternal<T>(path, method, token, body);
}
