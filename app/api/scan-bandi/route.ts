import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBandiCache, readBundledBandiSeed } from '@/lib/bandiCache';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';

const INCENTIVI_SOLR_ENDPOINT = 'https://www.incentivi.gov.it/solr/coredrupal/select';
const INCENTIVI_BASE_URL = 'https://www.incentivi.gov.it';
const ITALY_REGION_COUNT = 20;
const DEFAULT_SCANNER_API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3301';
const SCANNER_API_BASE_URL = (process.env.SCANNER_API_BASE_URL || DEFAULT_SCANNER_API_BASE_URL).replace(/\/+$/, '');
const SCANNER_API_EMAIL = process.env.SCANNER_API_EMAIL || 'demo@grants.local';
const SCANNER_API_PASSWORD = process.env.SCANNER_API_PASSWORD || 'Admin123!';
const SCANNER_API_ENABLED = process.env.SCANNER_API_ENABLED !== 'false' && Boolean(SCANNER_API_BASE_URL);
const SCANNER_API_TIMEOUT_MS = Number.parseInt(process.env.SCANNER_API_TIMEOUT_MS || '14000', 10);

const REGION_DEFS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Abruzzo', aliases: ['abruzzo'] },
  { canonical: 'Basilicata', aliases: ['basilicata'] },
  { canonical: 'Calabria', aliases: ['calabria'] },
  { canonical: 'Campania', aliases: ['campania'] },
  { canonical: 'Emilia-Romagna', aliases: ['emilia romagna'] },
  { canonical: 'Friuli-Venezia Giulia', aliases: ['friuli venezia giulia'] },
  { canonical: 'Lazio', aliases: ['lazio'] },
  { canonical: 'Liguria', aliases: ['liguria'] },
  { canonical: 'Lombardia', aliases: ['lombardia'] },
  { canonical: 'Marche', aliases: ['marche'] },
  { canonical: 'Molise', aliases: ['molise'] },
  { canonical: 'Piemonte', aliases: ['piemonte'] },
  { canonical: 'Puglia', aliases: ['puglia'] },
  { canonical: 'Sardegna', aliases: ['sardegna'] },
  { canonical: 'Sicilia', aliases: ['sicilia'] },
  { canonical: 'Toscana', aliases: ['toscana'] },
  { canonical: 'Trentino-Alto Adige', aliases: ['trentino alto adige', 'sudtirol'] },
  { canonical: 'Umbria', aliases: ['umbria'] },
  { canonical: "Valle d'Aosta", aliases: ['valle d aosta', 'vallee d aoste'] },
  { canonical: 'Veneto', aliases: ['veneto'] }
];

const userProfileSchema = z.object({}).passthrough();

const payloadSchema = z.object({
  userProfile: userProfileSchema,
  limit: z.coerce.number().int().min(1).max(50).optional()
});

function cleanString(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max).trim() : v;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (!raw) return null;
    const m = raw.match(/^(\d+(?:[.,]\d+)?)(\s*(k|m|mila|milione|milioni))?$/i);
    if (!m) return null;
    const base = Number.parseFloat((m[1] ?? '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(base)) return null;
    const unit = (m[3] ?? '').toLowerCase();
    if (unit === 'k' || unit === 'mila') return Math.round(base * 1_000);
    if (unit === 'm' || unit === 'milione' || unit === 'milioni') return Math.round(base * 1_000_000);
    return Math.round(base);
  }
  return null;
}

type ScanResult = {
  id: string;
  title: string;
  authorityName: string;
  deadlineAt: string | null;
  sourceUrl: string;
  requirements: string[];
  matchScore: number;
  matchReasons: string[];
  mismatchFlags: string[];
  score: number;
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
  hardStatus?: 'eligible' | 'unknown' | 'not_eligible';
  whyFit?: string[] | null;
  missingRequirements?: string[] | null;
};

type Candidate = {
  result: ScanResult;
  contributionMatched: boolean;
};

type QualityBand = 'high' | 'medium' | 'low';

type IncentiviDoc = {
  id?: string | number;
  title?: string;
  description?: string;
  authorityName?: string;
  openDate?: string;
  closeDate?: string;
  regions?: string[] | string;
  sectors?: string[] | string;
  beneficiaries?: string[] | string;
  dimensions?: string[] | string;
  purposes?: string[] | string;
  supportForm?: string[] | string;
  ateco?: string[] | string;
  costMin?: string | number;
  costMax?: string | number;
  institutionalLink?: string;
  url?: string;
  score?: number;
};

type ScannerAuthResponse = {
  tokens: { accessToken: string; refreshToken: string };
};

type ScannerLatestItem = {
  grantId: string;
  grantTitle: string;
  authority: string | null;
  officialUrl: string | null;
  beneficiaries: string[] | null;
  openingDate: string | null;
  deadlineDate: string | null;
  availabilityStatus: 'open' | 'incoming';
  aidForm: string | null;
  aidIntensity: string | null;
  budgetTotal: number | null;
  economicOffer: Record<string, unknown> | null;
  probabilityScore: number;
  hardStatus: 'eligible' | 'unknown' | 'not_eligible';
  whyFit: string[] | null;
  missingRequirements: string[] | null;
};

type ScannerLatestResponse = {
  run: { id: string } | null;
  items: ScannerLatestItem[];
  nearMisses?: ScannerLatestItem[];
};

type ScannerProfilePayload = {
  region: string | null;
  businessExists: boolean | null;
  age: number | null;
  employmentStatus: string | null;
  legalForm: string | null;
  employees: number | null;
  sector: string | null;
  atecoCodes: string[];
  aidPreference: string | null;
  plannedInvestment: number | null;
  targetAmount: number | null;
  constraints: Record<string, unknown>;
};

type DocTerritory =
  | { kind: 'national'; source: 'explicit' }
  | { kind: 'regions'; regions: string[]; source: 'field' | 'inferred' }
  | { kind: 'unknown'; source: 'missing' };

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
  if (low !== null) return `Da ${formatCurrency(low)} a ${formatCurrency(low)}`;
  return null;
}

function classifyAidSupport(value: string | null | undefined): 'fondo_perduto' | 'agevolato' | 'credito' | 'voucher' | 'misto' | 'altro' {
  const norm = normalizeForMatch(value ?? '');
  if (!norm) return 'altro';
  if (/(fondo perduto|contributo)/.test(norm)) return 'fondo_perduto';
  if (/(finanziamento|prestito|agevolat|garanzia|tasso zero)/.test(norm)) return 'agevolato';
  if (/(credito d imposta|tax credit|agevolazione fiscale)/.test(norm)) return 'credito';
  if (/voucher/.test(norm)) return 'voucher';
  if (/(misto|mix)/.test(norm)) return 'misto';
  return 'altro';
}

function matchesStrictPreference(
  preference: string | null,
  aidForm: string | null | undefined,
  aidIntensity: string | null | undefined,
): boolean {
  const pref = classifyContributionPreference(preference);
  if (!pref.strict) return true;

  const aidCombined = [aidForm ?? '', aidIntensity ?? ''].join(' ');
  const aidKind = classifyAidSupport(aidCombined);

  if (pref.kind === 'fondo_perduto') return aidKind === 'fondo_perduto' || aidKind === 'misto';
  if (pref.kind === 'agevolato') return aidKind === 'agevolato' || aidKind === 'misto';
  if (pref.kind === 'credito_imposta') return aidKind === 'credito';
  if (pref.kind === 'voucher') return aidKind === 'voucher';
  return true;
}

function toAtecoCodes(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s;/]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function buildScannerProfilePayload(args: {
  rawProfile: Record<string, unknown>;
  region: string | null;
  sector: string | null;
  fundingGoal: string | null;
  ateco: string | null;
  activityType: string | null;
  contributionPreference: string | null;
  budget: number | null;
  requestedContribution: number | null;
  employees: number | null;
  age: number | null;
  employmentStatus: string | null;
}): ScannerProfilePayload {
  const {
    rawProfile,
    region,
    sector,
    fundingGoal,
    ateco,
    activityType,
    contributionPreference,
    budget,
    requestedContribution,
    employees,
    age,
    employmentStatus,
  } = args;

  const businessExistsRaw = rawProfile.isConstituted ?? rawProfile.businessExists;
  const businessHints = normalizeForMatch([activityType, fundingGoal, cleanString(rawProfile.businessStage, 120)].filter(Boolean).join(' '));
  const businessExists =
    typeof businessExistsRaw === 'boolean'
      ? businessExistsRaw
      : /(da aprire|da costituire|costituend|nuova impresa|startup|avviare)/.test(businessHints)
        ? false
        : true;

  return {
    region: region ?? null,
    businessExists,
    age,
    employmentStatus: !businessExists ? employmentStatus ?? null : null,
    legalForm: cleanString(rawProfile.legalForm, 120) ?? activityType ?? null,
    employees: employees ?? null,
    sector: sector ?? null,
    atecoCodes: toAtecoCodes(ateco),
    aidPreference: contributionPreference ?? null,
    plannedInvestment: budget ?? null,
    targetAmount: requestedContribution ?? null,
    constraints: {
      flow: businessExists ? 'azienda_attiva' : 'azienda_da_aprire',
      activityType: activityType ?? null,
      fundingGoal: fundingGoal ?? null,
    },
  };
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs = SCANNER_API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const message =
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error === 'string' && json.error) ||
        `HTTP ${res.status}`;
      throw new Error(message);
    }

    return (json ?? {}) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildEconomicSummary(item: ScannerLatestItem): {
  amount: string | null;
  coverage: string | null;
  project: string | null;
} {
  const economic = item.economicOffer && typeof item.economicOffer === 'object' ? item.economicOffer : null;

  const displayAmountLabel =
    typeof economic?.displayAmountLabel === 'string' && economic.displayAmountLabel.trim()
      ? economic.displayAmountLabel.trim()
      : null;
  const displayProjectLabel =
    typeof economic?.displayProjectAmountLabel === 'string' && economic.displayProjectAmountLabel.trim()
      ? economic.displayProjectAmountLabel.trim()
      : null;
  const displayCoverageLabel =
    typeof economic?.displayCoverageLabel === 'string' && economic.displayCoverageLabel.trim()
      ? economic.displayCoverageLabel.trim()
      : null;

  const grantMin = parseMoneyValue(economic?.grantMin);
  const grantMax = parseMoneyValue(economic?.grantMax);
  const costMin = parseMoneyValue(economic?.costMin);
  const costMax = parseMoneyValue(economic?.costMax);
  const budgetTotal = parseMoneyValue(item.budgetTotal);

  const amount = displayAmountLabel || formatRange(grantMin, grantMax) || formatRange(costMin, costMax) || formatRange(null, budgetTotal);
  const project = displayProjectLabel || formatRange(costMin, costMax) || null;
  const coverage =
    displayCoverageLabel ||
    (typeof economic?.estimatedCoverageLabel === 'string' ? economic.estimatedCoverageLabel : null) ||
    item.aidIntensity ||
    null;

  return {
    amount,
    coverage,
    project: project && project !== amount ? project : null,
  };
}

function buildScannerRequirements(
  item: ScannerLatestItem,
  userRegion: string | null,
  economic: { amount: string | null; coverage: string | null; project: string | null },
): string[] {
  const req: string[] = [];
  if (economic.amount) req.push(`Importo agevolazione: ${economic.amount}`);
  if (economic.coverage) req.push(`% copertura: ${economic.coverage}`);
  if (economic.project) req.push(`Spesa progetto ammissibile: ${economic.project}`);
  if (item.beneficiaries?.length) req.push(`Beneficiari: ${item.beneficiaries.slice(0, 2).join(', ')}`);
  req.push(`Apertura: ${item.availabilityStatus === 'incoming' ? 'In arrivo' : 'Già aperto'}`);
  if (userRegion) req.push(`Territorio richiesto: ${userRegion}`);
  if (item.aidForm) req.push(`Forma aiuto: ${item.aidForm}`);
  return req.slice(0, 6);
}

async function scanViaScannerApi(args: {
  scannerProfile: ScannerProfilePayload;
  limit: number;
  region: string | null;
  contributionPreference: string | null;
}): Promise<{ items: Candidate[]; nearMisses: Candidate[]; strictMatchesFound: boolean }> {
  const { scannerProfile, limit, region, contributionPreference } = args;

  if (!SCANNER_API_ENABLED) return { items: [], nearMisses: [], strictMatchesFound: false };

  const login = await fetchJsonWithTimeout<ScannerAuthResponse>(
    `${SCANNER_API_BASE_URL}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: SCANNER_API_EMAIL,
        password: SCANNER_API_PASSWORD,
      }),
    },
  );
  const accessToken = login.tokens?.accessToken;
  if (!accessToken) throw new Error('Scanner API login senza token.');

  await fetchJsonWithTimeout(
    `${SCANNER_API_BASE_URL}/api/v1/profile/me`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(scannerProfile),
    },
  );

  await fetchJsonWithTimeout(
    `${SCANNER_API_BASE_URL}/api/v1/matching/run`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    },
    Math.max(18_000, SCANNER_API_TIMEOUT_MS),
  );

  const latest = await fetchJsonWithTimeout<ScannerLatestResponse>(
    `${SCANNER_API_BASE_URL}/api/v1/matching/latest`,
    {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    },
    Math.max(18_000, SCANNER_API_TIMEOUT_MS),
  );

  const strictPreference = classifyContributionPreference(contributionPreference);
  const toCandidate = (item: ScannerLatestItem, includeNearMissHints = false): Candidate | null => {
    if (item.availabilityStatus !== 'open' && item.availabilityStatus !== 'incoming') return null;

    const economic = buildEconomicSummary(item);
    if (economic.amount === null) return null;

    const probability = Math.max(0, Math.min(100, Math.round(item.probabilityScore ?? 0)));
    const strictMatch = matchesStrictPreference(contributionPreference, item.aidForm, item.aidIntensity);
    const mismatchFlags: string[] = [];

    if (strictPreference.strict && !strictMatch && strictPreference.label) {
      mismatchFlags.push(`Alternativa: non è ${strictPreference.label}`);
    }
    if (item.hardStatus === 'unknown') mismatchFlags.push('Alcuni requisiti sono da verificare');
    if (includeNearMissHints) {
      const hint = (item.missingRequirements ?? []).find((line) => typeof line === 'string' && line.trim());
      if (hint) mismatchFlags.push(hint.trim());
    }

    const normalizedScore = Math.max(0, Math.min(1, probability / 100));
    const result: ScanResult = {
      id: item.grantId,
      title: item.grantTitle,
      authorityName: item.authority ?? 'Ente pubblico',
      deadlineAt: item.deadlineDate,
      sourceUrl: item.officialUrl || `${INCENTIVI_BASE_URL}/it`,
      requirements: buildScannerRequirements(item, region, economic),
      matchScore: normalizedScore,
      matchReasons: (item.whyFit ?? []).slice(0, 3),
      mismatchFlags: mismatchFlags.slice(0, 2),
      score: normalizedScore,
      grantId: item.grantId,
      grantTitle: item.grantTitle,
      authority: item.authority ?? null,
      officialUrl: item.officialUrl ?? null,
      beneficiaries: item.beneficiaries ?? [],
      openingDate: item.openingDate ?? null,
      deadlineDate: item.deadlineDate ?? null,
      availabilityStatus: item.availabilityStatus,
      aidForm: item.aidForm ?? null,
      aidIntensity: item.aidIntensity ?? null,
      budgetTotal: item.budgetTotal ?? null,
      economicOffer: item.economicOffer ?? null,
      probabilityScore: probability,
      hardStatus: item.hardStatus,
      whyFit: item.whyFit ?? [],
      missingRequirements: item.missingRequirements ?? [],
    };

    return {
      result,
      contributionMatched: strictMatch,
    };
  };

  const mapped: Candidate[] = (latest.items ?? [])
    .filter((item) => item.hardStatus !== 'not_eligible')
    .map((item) => toCandidate(item))
    .filter((entry): entry is Candidate => Boolean(entry))
    .slice(0, limit);

  const nearMisses: Candidate[] = (latest.nearMisses ?? [])
    .filter((item) => item.hardStatus === 'not_eligible')
    .map((item) => toCandidate(item, true))
    .filter((entry): entry is Candidate => Boolean(entry))
    .slice(0, Math.min(limit, 6));

  const strictMatchesFound = strictPreference.strict
    ? mapped.some((entry) => entry.contributionMatched)
    : mapped.length > 0;

  return { items: mapped, nearMisses, strictMatchesFound };
}

function buildBookingUrl(base: string, params: Record<string, string | undefined | null>) {
  // Allow absolute URLs or relative paths.
  const isAbsolute = /^https?:\/\//i.test(base);
  const isRelativePath = base.startsWith('/');

  if (!isAbsolute && !isRelativePath) {
    throw new Error('NEXT_PUBLIC_BOOKING_URL deve essere un URL assoluto (https://...) o un path relativo (/prenota).');
  }

  const u = isAbsolute ? new URL(base) : new URL(`http://localhost${base}`);
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    u.searchParams.set(k, v);
  }

  return isAbsolute ? u.toString() : `${u.pathname}${u.search}`;
}

function buildExplanation(args: {
  region: string | null;
  sector: string | null;
  fundingGoal: string | null;
  contributionPreference: string | null;
  strictPreferenceLabel: string | null;
  strictPreferenceRequested: boolean;
  strictMatchesFound: boolean;
  resultsCount: number;
}) {
  const {
    region,
    sector,
    fundingGoal,
    contributionPreference,
    strictPreferenceLabel,
    strictPreferenceRequested,
    strictMatchesFound,
    resultsCount
  } = args;

  if (resultsCount === 0) {
    const r = region ? ` in ${region}` : '';
    return `Non ho trovato bandi aperti abbastanza coerenti${r} con i criteri indicati. Se vuoi, posso allargare la ricerca cambiando settore/obiettivo.`;
  }

  const reasons: string[] = [];
  if (region) reasons.push(`valido per ${region}`);
  if (sector) reasons.push(`settore ${sector}`);
  if (fundingGoal) reasons.push(`obiettivo ${fundingGoal}`);
  if (contributionPreference) reasons.push(`forma ${contributionPreference}`);

  const used = reasons.slice(0, 3);
  const why = used.length ? ` (${used.join(', ')})` : '';
  const noun = resultsCount === 1 ? 'bando' : 'bandi';
  const adjective = resultsCount === 1 ? 'aperto' : 'aperti';
  const compat = resultsCount === 1 ? 'compatibile' : 'compatibili';
  const first = `Ho trovato ${resultsCount} ${noun} ${adjective} ${compat}${why}.`;
  if (strictPreferenceRequested && !strictMatchesFound && strictPreferenceLabel) {
    return `${first} Non ho trovato bandi aperti in forma ${strictPreferenceLabel}: ti mostro anche alternative pertinenti.`;
  }
  const ordered = resultsCount === 1 ? 'Ordinato' : 'Ordinati';
  return `${first} ${ordered} per pertinenza e scadenza.`;
}

function qualityBandFromScore(topScore: number | null): QualityBand {
  if (topScore === null) return 'low';
  if (topScore >= 0.78) return 'high';
  if (topScore >= 0.62) return 'medium';
  return 'low';
}

function buildRefineQuestion(args: {
  region: string | null;
  sector: string | null;
  fundingGoal: string | null;
  ateco: string | null;
  budget: number | null;
  requestedContribution: number | null;
  topScore: number | null;
  resultsCount: number;
}) {
  const { region, sector, fundingGoal, ateco, budget, requestedContribution, topScore, resultsCount } = args;
  if (resultsCount > 0 && topScore !== null && topScore >= 0.56) return null;
  if (!region) return 'Per restringere davvero il match, indicami la Regione in cui operi.';
  if (!fundingGoal || fundingGoal.trim().length < 10) {
    return 'Dimmi in modo concreto cosa vuoi finanziare (es. macchinari, sito e-commerce, assunzioni, impianto).';
  }
  if (!sector || sector.trim().length < 3) return 'Indicami anche il settore (es. turismo, manifattura, ICT) per aumentare la precisione.';
  if (!ateco || ateco.trim().length < 2) return "Se hai il codice ATECO (anche 2 cifre), condividilo: migliora molto l'aderenza dei risultati.";
  if (budget === null && requestedContribution === null) {
    return 'Indicami investimento totale e contributo desiderato (anche stima) per filtrare solo bandi realistici.';
  }
  return 'Posso affinare ancora: confermami tipo contributo preferito e importo target da ottenere.';
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function paddedIncludes(textNorm: string, tokenNorm: string) {
  if (!tokenNorm) return false;
  const padded = ` ${textNorm} `;
  return padded.includes(` ${tokenNorm} `);
}

function detectRegions(textNorm: string) {
  const found = new Set<string>();
  for (const def of REGION_DEFS) {
    for (const alias of def.aliases) {
      if (paddedIncludes(textNorm, alias)) {
        found.add(def.canonical);
        break;
      }
    }
  }
  return [...found];
}

function canonicalizeRegion(label: string): string | null {
  const norm = normalizeForMatch(label);
  const detected = detectRegions(norm);
  if (detected.length === 1) return detected[0]!;
  if (detected.length > 1) {
    // If we detect multiple regions, it's ambiguous for a single label; return null.
    return null;
  }
  return null;
}

function parseSolrDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasTz = /Z$|[+-]\d\d:\d\d$/.test(trimmed);
  const iso = hasTz ? trimmed : `${trimmed}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string') as string[];
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function isOpenNow(openDate: Date | null, closeDate: Date | null, now = new Date()) {
  if (openDate && now.getTime() < openDate.getTime()) return false;
  if (!closeDate) return true;

  // Many items expose close date as 00:00:00; treat as end-of-day to avoid off-by-one.
  const isMidnightUtc =
    closeDate.getUTCHours() === 0 &&
    closeDate.getUTCMinutes() === 0 &&
    closeDate.getUTCSeconds() === 0 &&
    closeDate.getUTCMilliseconds() === 0;
  const deadline = isMidnightUtc ? new Date(closeDate.getTime() + 24 * 60 * 60 * 1000 - 1) : closeDate;
  return now.getTime() <= deadline.getTime();
}

function buildRequirements(
  doc: IncentiviDoc,
  opts?: {
    userRegion: string | null;
    territory: DocTerritory;
  }
): string[] {
  const req: string[] = [];
  const beneficiaries = asStringArray(doc.beneficiaries);
  const supportForm = asStringArray(doc.supportForm);
  const purposes = asStringArray(doc.purposes);
  const sectors = asStringArray(doc.sectors);
  const dimensions = asStringArray(doc.dimensions);
  const costMin = parseMoneyValue(doc.costMin);
  const costMax = parseMoneyValue(doc.costMax);

  const territoryLine = (() => {
    const userRegion = opts?.userRegion ?? null;
    const territory = opts?.territory ?? { kind: 'unknown', source: 'missing' };

    if (territory.kind === 'national') return 'Territorio: Nazionale';
    if (territory.kind === 'unknown') return 'Territorio: Non specificato';

    const docRegions = territory.regions;
    if (!docRegions.length) return 'Territorio: Non specificato';

    if (userRegion && docRegions.includes(userRegion)) {
      const others = docRegions.filter((r) => r !== userRegion);
      if (others.length === 0) return `Territorio: ${userRegion}`;
      if (others.length <= 2) return `Territorio: ${userRegion}, ${others.join(', ')}`;
      return `Territorio: ${userRegion} + altre ${others.length} regioni`;
    }

    return `Territorio: ${docRegions.slice(0, 3).join(', ')}`;
  })();

  if (beneficiaries.length) req.push(`Beneficiari: ${beneficiaries.slice(0, 3).join(', ')}`);
  if (territoryLine) req.push(territoryLine);
  if (dimensions.length) req.push(`Dimensioni: ${dimensions.slice(0, 2).join(', ')}`);
  if (supportForm.length) req.push(`Forma agevolazione: ${supportForm.slice(0, 2).join(', ')}`);
  if (purposes.length) req.push(`Finalita: ${purposes.slice(0, 2).join(', ')}`);
  if (sectors.length) req.push(`Settore: ${sectors.slice(0, 2).join(', ')}`);
  if ((costMin ?? 0) > 0 || (costMax ?? 0) > 0) {
    const parts: string[] = [];
    if ((costMin ?? 0) > 0) parts.push(`min ${Math.round(costMin as number).toLocaleString('it-IT')} EUR`);
    if ((costMax ?? 0) > 0) parts.push(`max ${Math.round(costMax as number).toLocaleString('it-IT')} EUR`);
    if (parts.length) req.push(`Spesa ammessa: ${parts.join(' / ')}`);
  }

  // Fallback: keep list concise
  return req.slice(0, 5);
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

function applyStrategicDocOverrides(doc: IncentiviDoc): IncentiviDoc {
  const titleNorm = normalizeForMatch(String(doc.title ?? ''));
  const urlNorm = normalizeForMatch(`${String(doc.institutionalLink ?? '')} ${String(doc.url ?? '')}`);
  const hints = `${titleNorm} ${urlNorm}`.trim();

  if (
    hints.includes('resto al sud 2 0') ||
    hints.includes('resto al sud 20') ||
    hints.includes('resto al sud 2.0')
  ) {
    return {
      ...doc,
      costMin: 40_000,
      costMax: 200_000,
      supportForm: Array.from(new Set([...asStringArray(doc.supportForm), 'Fondo perduto'])),
    };
  }

  if (hints.includes('smart start italia') || hints.includes('smartstart italia') || hints.includes('smart start')) {
    return {
      ...doc,
      costMin: 100_000,
      costMax: 1_500_000,
      supportForm: Array.from(new Set([...asStringArray(doc.supportForm), 'Fondo perduto'])),
    };
  }

  return doc;
}

function hasReliableEconomicDataDoc(doc: IncentiviDoc): boolean {
  const min = parseMoneyValue(doc.costMin);
  const max = parseMoneyValue(doc.costMax);
  const values = [min, max].filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  if (!values.length) return false;

  const top = Math.max(...values);
  if (top < 5_000) return false;
  if ((min ?? 0) > 0 && (max ?? 0) > 0 && (max as number) < (min as number)) return false;
  return true;
}

function classifyEmployees(employees: number) {
  if (employees < 10) return 'micro';
  if (employees < 50) return 'piccola';
  if (employees < 250) return 'media';
  return 'grande';
}

function matchDimension(userEmployees: number | null, doc: IncentiviDoc) {
  if (userEmployees === null) return { ok: true, score: 0 };
  const dimsNorm = asStringArray(doc.dimensions).map(normalizeForMatch);
  if (dimsNorm.length === 0) return { ok: true, score: 0 };

  const cls = classifyEmployees(userEmployees);
  const wantTokens =
    cls === 'micro'
      ? ['micro', 'microimpresa', 'micro imprese']
      : cls === 'piccola'
        ? ['piccola', 'piccole', 'pmi']
        : cls === 'media'
          ? ['media', 'medie', 'pmi']
          : ['grande', 'grandi'];

  const hit = dimsNorm.some((d) => wantTokens.some((t) => d.includes(t)));
  return { ok: true, score: hit ? 0.04 : 0 };
}

function expandKeywords(primary: string[]) {
  const out = new Set<string>();
  for (const kw of primary) {
    if (!kw) continue;
    out.add(kw);
    if (kw.includes('digitalizzazione')) {
      out.add('digitale');
      out.add('software');
      out.add('cloud');
      out.add('ict');
      out.add('ecommerce');
      out.add('cybersecurity');
      out.add('industria 4 0');
    }
    if (kw.includes('macchinari') || kw.includes('impianti')) {
      out.add('beni strumentali');
      out.add('attrezzature');
      out.add('impianti');
    }
    if (kw.includes('ricerca') || kw.includes('innovazione') || kw.includes('sviluppo')) {
      out.add('r d');
      out.add('r s');
      out.add('innovazione');
    }
    if (kw.includes('energia') || kw.includes('efficientamento')) {
      out.add('efficienza energetica');
      out.add('transizione green');
    }
  }
  return [...out];
}

const IT_STOPWORDS = new Set([
  'a',
  'ad',
  'al',
  'alla',
  'alle',
  'allo',
  'ai',
  'agli',
  'con',
  'da',
  'dal',
  'dalla',
  'dalle',
  'dallo',
  'dei',
  'degli',
  'del',
  'della',
  'dello',
  'di',
  'e',
  'ed',
  'o',
  'oppure',
  'in',
  'nel',
  'nella',
  'nelle',
  'nello',
  'nei',
  'negli',
  'per',
  'su',
  'sul',
  'sulla',
  'sulle',
  'tra',
  'fra',
  'che',
  'come',
  'piu',
  'meno',
  'molto',
  'poco',
  'circa',
  'ecc',
  'etc'
]);

const LOW_SIGNAL_TOKENS = new Set([
  'bando',
  'bandi',
  'avviso',
  'pubblico',
  'misura',
  'incentivo',
  'incentivi',
  'agevolazione',
  'agevolazioni',
  'finanziamento',
  'finanziamenti',
  'contributo',
  'contributi',
  'sostegno',
  'supporto',
  'progetto',
  'progetti',
  'intervento',
  'interventi',
  'azione',
  'azioni',
  'realizzazione',
  'realizzare',
  'promozione',
  'promuovere',
  'valorizzazione',
  'valorizzare',
  'partecipazione',
  'manifestazione',
  'interesse',
  'struttura',
  'strutture',
  'produttiva',
  'produttivo',
  'produttive',
  'produttivi',
  'territorio',
  'territoriale',
  'territoriali',
  'regionale',
  'regionali',
  'regione',
  'rafforzamento',
  'rafforzare',
  'investimento',
  'investimenti',
  'sviluppo',
  'crescita',
  'impresa',
  'imprese',
  'azienda',
  'aziende',
  'attivita',
  'iniziativa',
  'iniziative'
]);

function tokenizeKeywords(textNorm: string) {
  if (!textNorm) return [] as string[];
  return textNorm
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 3)
    .filter((t) => !IT_STOPWORDS.has(t))
    .filter((t) => !LOW_SIGNAL_TOKENS.has(t));
}

function buildKeywordSets(sector: string | null, fundingGoal: string | null) {
  const sectorNorm = sector ? normalizeForMatch(sector) : '';
  const goalNorm = fundingGoal ? normalizeForMatch(fundingGoal) : '';
  const buildCoreFromText = (textNorm: string, kind: 'sector' | 'goal') => {
    if (!textNorm) return [] as string[];
    const units = new Set<string>();

    for (const t of tokenizeKeywords(textNorm)) units.add(t);
    if (textNorm.split(' ').length >= 2 && textNorm.length <= 60) units.add(textNorm);

    const add = (arr: string[]) => arr.forEach((x) => units.add(normalizeForMatch(x)));

    if (/(digital|digitale|digitalizzazione|ict|software|cloud|ecommerce|e commerce|cyber|cybersecurity|industria 4|4 0)/.test(textNorm)) {
      add(['digitalizzazione', 'digitale', 'ict', 'software', 'cloud', 'ecommerce', 'cybersecurity', 'industria 4 0']);
    }
    if (/(turismo|turistic|ricettiv|albergh|hotel|alberg|b&b|bnb|agriturism|campegg|ospitalit|accoglienza)/.test(textNorm)) {
      if (kind === 'sector') {
        add(['turismo', 'turistico', 'ricettivo', 'alberghiero', 'ospitalita', 'accoglienza', 'ristorazione']);
      } else {
        // Goal: keep it specific (avoid matching any generic "turismo" mention).
        if (textNorm.includes('turismo') || textNorm.includes('turistic')) add(['turismo', 'turistico']);
        add(['ricettivo', 'alberghiero', 'ospitalita', 'accoglienza', 'hotel', 'albergo', 'agriturismo', 'campeggio', 'b b', 'b&b']);
      }
    }
    if (/(agricolt|agro|alimentare|zootec|pesca)/.test(textNorm)) {
      add(['agricoltura', 'agroalimentare', 'zootecnia', 'pesca']);
    }
    if (/(energia|energetic|rinnovabil|fotovolta|efficientamento|efficienza|green|decarbon|transizione)/.test(textNorm)) {
      add(['energia', 'rinnovabili', 'fotovoltaico', 'efficientamento', 'efficienza energetica', 'transizione green']);
    }
    if (/(formazione|competenze|upskilling|reskilling)/.test(textNorm)) {
      add(['formazione', 'competenze', 'upskilling', 'reskilling']);
    }
    if (/(assunzion|occupaz|lavoro|dipendent)/.test(textNorm)) {
      add(['assunzioni', 'occupazione', 'lavoro', 'dipendenti']);
    }
    if (/(ricerca|innovazione|r d|r s|sviluppo sperimentale|brevet)/.test(textNorm)) {
      add(['ricerca', 'sviluppo', 'innovazione', 'r d', 'r s', 'brevetti']);
    }

    return [...units];
  };

  const sectorCore = buildCoreFromText(sectorNorm, 'sector');
  const goalCore = buildCoreFromText(goalNorm, 'goal');

  const core = new Set<string>([...sectorCore, ...goalCore]);

  // Expanded keywords are used for scoring (recall).
  const expanded = new Set<string>(expandKeywords([...core]));
  return { sectorCore, goalCore, core: [...core], expanded: [...expanded] };
}

function anyTextMatch(textNorm: string, keywordsNorm: string[]) {
  if (!keywordsNorm.length) return false;
  for (const kw of keywordsNorm) {
    if (!kw) continue;
    if (kw.includes(' ')) {
      if (textNorm.includes(kw)) return true;
    } else {
      if (paddedIncludes(textNorm, kw)) return true;
    }
  }
  return false;
}

function normalizeDocTerritory(
  doc: IncentiviDoc,
  args: { titleNorm: string; descriptionNorm: string; authorityNorm: string }
): DocTerritory {
  const { titleNorm, descriptionNorm, authorityNorm } = args;

  const raw = asStringArray(doc.regions);
  const rawNorm = raw.map(normalizeForMatch);

  // Explicit "national" markers.
  const isNationalMarker = rawNorm.some((r) => r === 'italia' || r.includes('nazionale') || r.includes('tutte le regioni'));
  if (isNationalMarker) return { kind: 'national', source: 'explicit' };

  const set = new Set<string>();
  for (const r of raw) {
    const canon = canonicalizeRegion(r);
    if (canon) set.add(canon);
  }

  if (set.size > 0) return { kind: 'regions', regions: [...set], source: 'field' };

  // Infer from title/authority/description when region field is missing or not canonicalized.
  const inferred = detectRegions(`${titleNorm} ${authorityNorm} ${descriptionNorm}`.trim());
  if (inferred.length > 0) return { kind: 'regions', regions: inferred, source: 'inferred' };

  return { kind: 'unknown', source: 'missing' };
}

type ContributionPrefKind =
  | 'none'
  | 'any'
  | 'misto'
  | 'voucher'
  | 'credito_imposta'
  | 'fondo_perduto'
  | 'agevolato'
  | 'unknown';

function classifyContributionPreference(preference: string | null): {
  kind: ContributionPrefKind;
  strict: boolean;
  label: string | null;
} {
  if (!preference) return { kind: 'none', strict: false, label: null };
  const pref = normalizeForMatch(preference);
  if (!pref) return { kind: 'none', strict: false, label: null };

  if (pref.includes('non importa') || pref.includes('indifferente') || pref.includes('qualsiasi')) {
    return { kind: 'any', strict: false, label: null };
  }
  if (pref.includes('misto') || pref.includes('mix')) return { kind: 'misto', strict: false, label: 'misto' };
  if (pref.includes('voucher')) return { kind: 'voucher', strict: true, label: 'voucher' };
  if (pref.includes('credito') && pref.includes('imposta')) return { kind: 'credito_imposta', strict: true, label: "credito d'imposta" };
  if (pref.includes('fondo') && pref.includes('perduto')) return { kind: 'fondo_perduto', strict: true, label: 'fondo perduto' };
  if (pref.includes('agevolato') || pref.includes('finanziamento') || pref.includes('tasso zero')) {
    return { kind: 'agevolato', strict: true, label: 'finanziamento agevolato' };
  }

  return { kind: 'unknown', strict: false, label: preference };
}

function matchContribution(preference: string | null, doc: IncentiviDoc) {
  const pref = classifyContributionPreference(preference);
  const support = asStringArray(doc.supportForm).map(normalizeForMatch).join(' ');
  if (pref.kind === 'none') return { matched: true, strict: false, score: 0 };
  if (pref.kind === 'any') return { matched: true, strict: false, score: 0.02 };
  if (pref.kind === 'misto') return { matched: true, strict: false, score: support ? 0.035 : 0 };

  if (pref.kind === 'voucher') return { matched: support.includes('voucher'), strict: true, score: support.includes('voucher') ? 0.08 : 0 };
  if (pref.kind === 'credito_imposta') return { matched: support.includes('credito'), strict: true, score: support.includes('credito') ? 0.08 : 0 };
  if (pref.kind === 'fondo_perduto') {
    const hit = support.includes('fondo perduto') || support.includes('contributo');
    return { matched: hit, strict: true, score: hit ? 0.08 : 0 };
  }
  if (pref.kind === 'agevolato') {
    const hit = support.includes('finanziamento') || support.includes('prestito') || support.includes('agevol');
    return { matched: hit, strict: true, score: hit ? 0.08 : 0 };
  }

  // Unknown preference: don't block, don't boost.
  return { matched: true, strict: false, score: 0 };
}

function matchBeneficiaries(activityType: string | null, doc: IncentiviDoc) {
  if (!activityType) return { ok: true, score: 0, matched: false, strict: false };
  const at = normalizeForMatch(activityType);
  if (!at) return { ok: true, score: 0, matched: false, strict: false };

  const b = asStringArray(doc.beneficiaries).map(normalizeForMatch).join(' ');
  if (!b) return { ok: true, score: 0, matched: false, strict: false };

  const want: string[] = [];
  if (at.includes('startup')) want.push('startup', 'impresa', 'pmi');
  if (at.includes('pmi') || at.includes('impresa') || at.includes('azienda')) want.push('impresa', 'pmi');
  if (at.includes('professionista') || at.includes('libero professionista')) want.push('professionista', 'persona fisica');
  if (at.includes('ente pubblico') || at.includes('pa') || at.includes('comune') || at.includes('pubblica')) want.push('ente pubblico');
  if (at.includes('associazione') || at.includes('ets') || at.includes('terzo settore') || at.includes('onlus')) {
    want.push('ente del terzo settore', 'associazione', 'ets', 'onlus', 'terzo settore');
  }

  if (!want.length) return { ok: true, score: 0, matched: false, strict: false };
  const hit = want.some((t) => b.includes(normalizeForMatch(t)));
  return { ok: hit, score: hit ? 0.08 : 0, matched: hit, strict: true };
}

function matchBudget(budget: number | null, doc: IncentiviDoc) {
  if (budget === null) return { ok: true, score: 0 };
  const min = typeof doc.costMin === 'number' ? doc.costMin : Number.parseFloat(String(doc.costMin ?? ''));
  const max = typeof doc.costMax === 'number' ? doc.costMax : Number.parseFloat(String(doc.costMax ?? ''));
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) return { ok: true, score: 0 };

  // If max is present and budget is above, small penalty by zeroing bonus.
  if (hasMax && budget > (max as number) * 1.25) return { ok: true, score: 0 };
  if (hasMin && budget < (min as number) * 0.8) return { ok: true, score: 0 };

  // Budget seems within a reasonable range.
  return { ok: true, score: 0.03 };
}

function extractAtecoDigitsFromText(text: string) {
  const out = new Set<string>();
  const raw = text ?? '';

  // Formats like 55, 55.10, 55.10.00
  const dotted = /\b(\d{2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\b/g;
  let m: RegExpExecArray | null = null;
  while ((m = dotted.exec(raw))) {
    const a = m[1];
    const b = m[2];
    const c = m[3];
    if (!a) continue;

    const aDigits = a.replace(/\D/g, '');
    if (aDigits.length >= 2) out.add(aDigits);

    if (b) {
      const b2 = b.replace(/\D/g, '').padStart(2, '0');
      const ab = `${aDigits}${b2}`;
      if (ab.length >= 4) out.add(ab);

      if (c) {
        const c2 = c.replace(/\D/g, '').padStart(2, '0');
        const abc = `${ab}${c2}`;
        if (abc.length >= 6) out.add(abc);
      }
    }
  }

  // Also accept compact forms like 5510 or 551000 (avoid catching years/prices by requiring >=4 digits).
  const compact = /\b(\d{4,6})\b/g;
  while ((m = compact.exec(raw))) {
    const digits = (m[1] ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 6) out.add(digits);
  }

  return [...out];
}

function matchAteco(userAtecoDigits: string[], doc: IncentiviDoc) {
  if (!userAtecoDigits.length) return { ok: true, score: 0 };

  const atecoText = asStringArray(doc.ateco).join(' ');
  const atecoNorm = normalizeForMatch(atecoText);

  // If the document is sector-unrestricted, don't block.
  if (
    atecoNorm.includes('tutti i settori') ||
    atecoNorm.includes('tutte le attivita') ||
    atecoNorm.includes('tutte le attivita') ||
    atecoNorm.includes('tutti i settori economici')
  ) {
    return { ok: true, score: 0 };
  }

  const docDigits = extractAtecoDigitsFromText(atecoText);
  if (!docDigits.length) {
    // Unknown doc ATECO: keep, but don't boost.
    return { ok: true, score: 0 };
  }

  const matched = userAtecoDigits.some((u) => docDigits.some((d) => d.startsWith(u) || u.startsWith(d)));
  if (!matched) return { ok: false, score: 0 };

  const maxUserLen = userAtecoDigits.reduce((acc, v) => Math.max(acc, v.length), 0);
  return { ok: true, score: maxUserLen >= 4 ? 0.12 : 0.08 };
}

function computeScore(args: {
  doc: IncentiviDoc;
  titleNorm: string;
  descriptionNorm: string;
  authorityNorm: string;
  territory: DocTerritory;
  userRegion: string | null;
  keywords: string[];
  activityType: string | null;
  employees: number | null;
  budget: number | null;
  contributionPreference: string | null;
}) {
  const {
    doc,
    titleNorm,
    descriptionNorm,
    authorityNorm,
    territory,
    userRegion,
    keywords,
    activityType,
    employees,
    budget,
    contributionPreference
  } = args;

  let score = 0;

  // Region (hard filter applied elsewhere; here we prioritize specificity).
  if (userRegion) {
    if (territory.kind === 'national') {
      score += 0.12;
    } else if (territory.kind === 'regions') {
      const n = territory.regions.length;
      const isWide = n >= ITALY_REGION_COUNT - 2; // treat "almost all regions" like nationwide
      if (isWide) score += 0.14;
      else {
        score += 0.26; // includes requested region
        if (n === 1) score += 0.08;
        else if (n <= 3) score += 0.06;
        else if (n <= 6) score += 0.04;
        else if (n <= 10) score += 0.02;
        else score += 0.01;
      }
    } else {
      // Unknown territory is low-trust when user asked for a region.
      score += 0.01;
    }
  } else {
    score += 0.06;
  }

  // Keyword relevance
  const sectorsArr = asStringArray(doc.sectors);
  const purposesArr = asStringArray(doc.purposes);
  const sectorsNorm = sectorsArr.map(normalizeForMatch).join(' ');
  const purposesNorm = purposesArr.map(normalizeForMatch).join(' ');
  const combined = `${titleNorm} ${purposesNorm} ${sectorsNorm} ${authorityNorm} ${descriptionNorm}`.trim();
  if (keywords.length) {
    const titleHit = anyTextMatch(titleNorm, keywords);
    const sectorsHit = sectorsNorm ? anyTextMatch(sectorsNorm, keywords) : false;
    const purposesHit = purposesNorm ? anyTextMatch(purposesNorm, keywords) : false;
    const authorityHit = anyTextMatch(authorityNorm, keywords);
    const bodyHit = anyTextMatch(descriptionNorm, keywords);

    if (purposesHit) score += 0.18;
    if (sectorsHit) {
      const n = sectorsArr.length;
      score += n <= 3 ? 0.16 : n <= 6 ? 0.12 : n <= 10 ? 0.08 : n <= 15 ? 0.05 : 0.03;
    }
    if (titleHit) score += 0.18;
    if (authorityHit) score += 0.06;
    if (bodyHit) score += 0.05;

    // Penalize low-signal matches that only appear in the long body.
    if (!sectorsHit && !purposesHit && !titleHit && !authorityHit && bodyHit) score -= 0.05;

    // Extra small bonus for multiple keyword hits.
    let hits = 0;
    for (const kw of keywords) if (kw && (kw.includes(' ') ? combined.includes(kw) : paddedIncludes(combined, kw))) hits += 1;
    score += Math.min(hits * 0.01, 0.06);
  } else {
    score += 0.06;
  }

  // Beneficiaries/activity type
  score += matchBeneficiaries(activityType, doc).score;

  // Contribution preference
  score += matchContribution(contributionPreference, doc).score;

  // Company size
  score += matchDimension(employees, doc).score;

  // Budget range
  score += matchBudget(budget, doc).score;

  // Solr score as a tiny tie-breaker
  const solrScore = typeof doc.score === 'number' ? doc.score : 0;
  score += Math.min(solrScore / 40, 0.03);

  return Math.max(0, Math.min(1, score));
}

async function fetchIncentiviDocs(keyword: string | null, rows: number, timeoutMs: number): Promise<IncentiviDoc[]> {
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
      params.set(
        'qf',
        [
          'tum_X3b_it_title_ft^3',
          'twm_X3b_it_field_search_meta^2.5',
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

function mergeIncentiviDocs(...lists: IncentiviDoc[][]) {
  const byKey = new Map<string, IncentiviDoc>();
  const extras: IncentiviDoc[] = [];

  for (const list of lists) {
    for (const doc of list) {
      const key =
        doc.id !== undefined && doc.id !== null
          ? `id:${String(doc.id)}`
          : typeof doc.url === 'string' && doc.url.trim()
            ? `url:${doc.url.trim()}`
            : null;
      if (!key) {
        extras.push(doc);
        continue;
      }
      if (!byKey.has(key)) byKey.set(key, doc);
    }
  }

  return [...byKey.values(), ...extras];
}

export async function POST(req: Request) {
  const rate = checkRateLimit(req, { keyPrefix: 'scan-bandi', windowMs: 60_000, max: 25 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Hai fatto troppe ricerche in poco tempo. Attendi qualche secondo e riprova.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  try {
    const rawBody = await req.json();
    const parsedPayload = payloadSchema.safeParse(rawBody);
    const parsed = parsedPayload.success
      ? parsedPayload.data
      : (() => {
          const legacyBody =
            rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : null;
          const legacyProfile =
            legacyBody?.userProfile && typeof legacyBody.userProfile === 'object' && !Array.isArray(legacyBody.userProfile)
              ? legacyBody.userProfile
              : legacyBody;

          if (!legacyProfile || typeof legacyProfile !== 'object' || Array.isArray(legacyProfile)) {
            throw new z.ZodError([]);
          }

          return {
            userProfile: legacyProfile,
            limit:
              typeof legacyBody?.limit === 'number' || typeof legacyBody?.limit === 'string' ? legacyBody.limit : undefined
          };
        })();
    const parsedLimit = typeof parsed.limit === 'string' ? Number(parsed.limit) : parsed.limit;
    const limit: number = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit ?? 10, 1), 50) : 10;

    const rawProfile = parsed.userProfile as Record<string, unknown>;
    const rawLocation =
      rawProfile.location && typeof rawProfile.location === 'object' ? (rawProfile.location as Record<string, unknown>) : null;

    const region = cleanString(rawLocation?.region ?? rawProfile.region, 80);
    const sector = cleanString(rawProfile.sector, 120);
    const fundingGoal = cleanString(rawProfile.fundingGoal, 220);
    const ateco = cleanString(rawProfile.ateco, 80);
    const userAtecoDigits = typeof ateco === 'string' ? extractAtecoDigitsFromText(ateco) : [];
    // Include ATECO in the query even when numeric: it improves recall vs fetching "latest N" and then filtering.
    const atecoQuery = typeof ateco === 'string' && ateco.trim() ? ateco.trim() : null;
    const fundingGoalQuery = [fundingGoal, atecoQuery].filter(Boolean).join(' ').trim() || null;
    const keyword = [sector, fundingGoalQuery].filter(Boolean).join(' ').trim() || null;
    const activityType = cleanString(rawProfile.activityType, 120);
    const contributionPreference = cleanString(rawProfile.contributionPreference, 80);
    const contributionPrefInfo = classifyContributionPreference(contributionPreference);
    const userRegionCanonical = region ? canonicalizeRegion(region) : null;
    const employees = cleanNumber(rawProfile.employees);
    const age = cleanNumber(rawProfile.age ?? rawProfile.founderAge);
    const employmentStatus =
      cleanString(rawProfile.employmentStatus, 80) ??
      cleanString(rawProfile.occupationalStatus, 80) ??
      cleanString(rawProfile.workStatus, 80);
    const budget = cleanNumber(rawProfile.revenueOrBudgetEUR);
    const requestedContribution = cleanNumber(rawProfile.requestedContributionEUR);

    const bookingBase = process.env.NEXT_PUBLIC_BOOKING_URL;
    if (!bookingBase) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_BOOKING_URL. Impostalo in .env.local (vedi .env.example).' },
        { status: 500 }
      );
    }

    const scannerProfile = buildScannerProfilePayload({
      rawProfile,
      region,
      sector,
      fundingGoal: fundingGoalQuery,
      ateco,
      activityType,
      contributionPreference,
      budget,
      requestedContribution,
      employees,
      age,
      employmentStatus,
    });

    if (SCANNER_API_ENABLED) {
      try {
        const scanner = await scanViaScannerApi({
          scannerProfile,
          limit,
          region,
          contributionPreference,
        });
        const scannerResults = scanner.items.map((entry) => entry.result);
        const scannerNearMisses = scanner.nearMisses.map((entry) => entry.result);
        const scannerTopScore = scannerResults[0]?.matchScore ?? null;
        const scannerQualityBand = qualityBandFromScore(scannerTopScore);
        const scannerRefineQuestion = buildRefineQuestion({
          region,
          sector,
          fundingGoal,
          ateco,
          budget,
          requestedContribution,
          topScore: scannerTopScore,
          resultsCount: scannerResults.length,
        });

        const scannerTopPickBandoId = scannerResults[0]?.id ?? null;
        const scannerBookingUrl = buildBookingUrl(bookingBase, {
          bandoId: scannerTopPickBandoId,
          region,
          sector,
        });
        const scannerExplanationBase = buildExplanation({
          region,
          sector,
          fundingGoal,
          contributionPreference,
          strictPreferenceLabel: contributionPrefInfo.label,
          strictPreferenceRequested: contributionPrefInfo.strict,
          strictMatchesFound: scanner.strictMatchesFound,
          resultsCount: scannerResults.length,
        });
        const scannerExplanation =
          scannerResults.length === 0 && scannerNearMisses.length > 0
            ? `${scannerExplanationBase} Ti mostro bandi recuperabili se completi alcuni requisiti.`
            : scannerExplanationBase;

        return NextResponse.json({
          explanation: scannerExplanation,
          results: scannerResults,
          nearMisses: scannerNearMisses,
          qualityBand: scannerQualityBand,
          refineQuestion: scannerRefineQuestion ?? undefined,
          topPickBandoId: scannerTopPickBandoId,
          bookingUrl: scannerBookingUrl,
        });
      } catch (scannerError) {
        console.error('scan-bandi scanner-api fallback', {
          message: scannerError instanceof Error ? scannerError.message : 'unknown',
        });
      }
    }

    let docs: IncentiviDoc[] = [];
    const loadFallbackDocs = async () => {
      const cached = await readBandiCache<IncentiviDoc>();
      if ((cached?.docs?.length ?? 0) > 0) return cached!.docs;

      const bundled = await readBundledBandiSeed<IncentiviDoc>();
      return bundled?.docs ?? [];
    };

    try {
      if (keyword && userRegionCanonical) {
        const boosted = [keyword, userRegionCanonical, contributionPrefInfo.strict ? contributionPrefInfo.label : null]
          .filter(Boolean)
          .join(' ');
        const results = await Promise.allSettled([
          fetchIncentiviDocs(keyword, 220, 6500),
          fetchIncentiviDocs(boosted, 220, 6500)
        ]);
        const a = results[0].status === 'fulfilled' ? results[0].value : [];
        const b = results[1].status === 'fulfilled' ? results[1].value : [];
        docs = mergeIncentiviDocs(a, b);
      } else {
        docs = await fetchIncentiviDocs(keyword, 240, 8500);
      }
    } catch {
      docs = await loadFallbackDocs();
    }

    if (docs.length === 0) {
      docs = await loadFallbackDocs();
    }

    const keywordSets = buildKeywordSets(sector, fundingGoalQuery);
    const sectorCoreKeywords = keywordSets.sectorCore;
    const goalCoreKeywords = keywordSets.goalCore;
    const coreKeywords = keywordSets.core;
    const expandedKeywords = keywordSets.expanded;
    const wantsTopic = Boolean(sector?.trim()) || Boolean(fundingGoal?.trim());

    const now = new Date();
    const mapped = docs.map((docRaw) => {
        const doc = applyStrategicDocOverrides(docRaw);
        const openDate = parseSolrDate(doc.openDate);
        const closeDate = parseSolrDate(doc.closeDate);
        const isOpen = isOpenNow(openDate, closeDate, now);

        const titleNorm = typeof doc.title === 'string' ? normalizeForMatch(doc.title) : '';
        const descriptionNorm = typeof doc.description === 'string' ? normalizeForMatch(doc.description) : '';
        const authorityNorm = typeof doc.authorityName === 'string' ? normalizeForMatch(doc.authorityName) : '';

        const territory = normalizeDocTerritory(doc, { titleNorm, descriptionNorm, authorityNorm });

        const regionOk = !userRegionCanonical
          ? true
          : territory.kind === 'national'
            ? true
            : territory.kind === 'regions'
              ? territory.regions.includes(userRegionCanonical)
              : false;

        const atecoMatch = matchAteco(userAtecoDigits, doc);
        const beneficiariesMatch = matchBeneficiaries(activityType, doc);
        const contribution = matchContribution(contributionPreference, doc);

        // Text relevance gating:
        // - strictTextOk tries to match both sector + goal (high precision)
        // - relaxedTextOk allows partial matches as fallback (higher recall)
        const purposesNorm = asStringArray(doc.purposes).map(normalizeForMatch).join(' ');
        const docSectors = asStringArray(doc.sectors);
        const docSectorsNorm = docSectors.map(normalizeForMatch).join(' ');
        const metaNorm = `${purposesNorm} ${docSectorsNorm}`.trim();

        const sectorTitleHit = sectorCoreKeywords.length ? anyTextMatch(titleNorm, sectorCoreKeywords) : false;
        const sectorMetaHit = sectorCoreKeywords.length ? anyTextMatch(metaNorm, sectorCoreKeywords) : false;
        const sectorAuthorityHit = sectorCoreKeywords.length ? anyTextMatch(authorityNorm, sectorCoreKeywords) : false;
        const sectorBodyHit = sectorCoreKeywords.length ? anyTextMatch(descriptionNorm, sectorCoreKeywords) : false;

        const goalTitleHit = goalCoreKeywords.length ? anyTextMatch(titleNorm, goalCoreKeywords) : false;
        const goalPurposesHit = goalCoreKeywords.length ? anyTextMatch(purposesNorm, goalCoreKeywords) : false;
        const goalSectorsHit =
          goalCoreKeywords.length && docSectors.length > 0 && docSectors.length <= 4
            ? anyTextMatch(docSectorsNorm, goalCoreKeywords)
            : false;
        const goalMetaHit = goalPurposesHit || goalSectorsHit;
        const goalAuthorityHit = goalCoreKeywords.length ? anyTextMatch(authorityNorm, goalCoreKeywords) : false;
        const goalBodyHit = goalCoreKeywords.length ? anyTextMatch(descriptionNorm, goalCoreKeywords) : false;

        const sectorStrongHit = sectorTitleHit || sectorMetaHit || sectorAuthorityHit;
        const goalStrongHit = goalTitleHit || goalPurposesHit || goalAuthorityHit;
        const sectorAnyHit = sectorStrongHit || sectorBodyHit;
        const goalAnyHit = goalStrongHit || goalBodyHit || goalSectorsHit;

        const coreTitleHit = coreKeywords.length ? anyTextMatch(titleNorm, coreKeywords) : false;
        const coreMetaHit = coreKeywords.length ? anyTextMatch(metaNorm, coreKeywords) : false;
        const coreAuthorityHit = coreKeywords.length ? anyTextMatch(authorityNorm, coreKeywords) : false;
        const coreBodyHit = coreKeywords.length ? anyTextMatch(descriptionNorm, coreKeywords) : false;
        const combinedCore = `${titleNorm} ${metaNorm} ${authorityNorm} ${descriptionNorm}`.trim();

        let coreHits = 0;
        for (const kw of coreKeywords) {
          if (!kw) continue;
          if (kw.includes(' ')) {
            if (combinedCore.includes(kw)) coreHits += 1;
          } else {
            if (paddedIncludes(combinedCore, kw)) coreHits += 1;
          }
        }

        const strictTextOk = !wantsTopic
          ? true
          : (() => {
              const requireSector = Boolean(sector?.trim()) && sectorCoreKeywords.length > 0;
              const requireGoal = Boolean(fundingGoal?.trim()) && goalCoreKeywords.length > 0;

              if (requireSector && requireGoal) return sectorStrongHit && goalAnyHit;
              if (requireSector && !requireGoal) return sectorStrongHit;
              if (!requireSector && requireGoal) return goalStrongHit || (goalAnyHit && coreHits >= 2);
              return true;
            })();

        const relaxedTextOk = !wantsTopic
          ? true
          : (() => {
              if (!coreKeywords.length) return false;
              if (coreTitleHit || coreMetaHit) return true;
              // Allow authority/body-only only if we see several signals.
              if (coreAuthorityHit && coreHits >= 2) return true;
              if (coreBodyHit && coreHits >= 4) return true;
              // If sector/goal matched only in body but we saw some signals, allow as last resort.
              if ((sectorAnyHit || goalAnyHit) && coreHits >= 3) return true;
              return false;
            })();

        const sectorMatchedInTaxonomy = sectorCoreKeywords.length ? anyTextMatch(docSectorsNorm, sectorCoreKeywords) : false;
        const sectorSpecificityBoost = sectorMatchedInTaxonomy
          ? docSectors.length <= 1
            ? 0.07
            : docSectors.length <= 3
              ? 0.05
              : docSectors.length <= 6
                ? 0.03
                : docSectors.length <= 10
                  ? 0.02
                  : 0
          : 0;

        const baseScore = computeScore({
          doc,
          titleNorm,
          descriptionNorm,
          authorityNorm,
          territory,
          userRegion: userRegionCanonical,
          keywords: expandedKeywords,
          activityType,
          employees,
          budget,
          contributionPreference
        });
        const localScore = Math.max(0, Math.min(1, baseScore + sectorSpecificityBoost + atecoMatch.score));
        const matchReasons: string[] = [];
        const mismatchFlags: string[] = [];

        if (userRegionCanonical && regionOk) {
          if (territory.kind === 'national') matchReasons.push('Territorio nazionale compatibile');
          if (territory.kind === 'regions') matchReasons.push(`Territorio compatibile con ${userRegionCanonical}`);
        }
        if (userAtecoDigits.length && atecoMatch.ok) matchReasons.push('ATECO coerente');
        if (wantsTopic && strictTextOk) matchReasons.push('Finalita e settore coerenti');
        if (beneficiariesMatch.matched) matchReasons.push('Beneficiari ammessi coerenti');
        if (contribution.matched && contributionPrefInfo.strict && contributionPrefInfo.label) {
          matchReasons.push(`Forma contributo coerente (${contributionPrefInfo.label})`);
        }
        if (!matchReasons.length && isOpen) matchReasons.push('Bando aperto con segnali di compatibilita');

        if (userRegionCanonical && !regionOk) mismatchFlags.push('territory_mismatch');
        if (userAtecoDigits.length && !atecoMatch.ok) mismatchFlags.push('ateco_mismatch');
        if (beneficiariesMatch.strict && !beneficiariesMatch.matched) mismatchFlags.push('beneficiary_mismatch');
        if (contributionPrefInfo.strict && !contribution.matched) mismatchFlags.push('contribution_preference_mismatch');
        if (wantsTopic && !strictTextOk && !relaxedTextOk) mismatchFlags.push('goal_sector_weak');

        const deadline = closeDate
          ? (() => {
              const isMidnightUtc =
                closeDate.getUTCHours() === 0 &&
                closeDate.getUTCMinutes() === 0 &&
                closeDate.getUTCSeconds() === 0 &&
                closeDate.getUTCMilliseconds() === 0;
              const adjusted = isMidnightUtc ? new Date(closeDate.getTime() + 24 * 60 * 60 * 1000 - 1) : closeDate;
              return adjusted.toISOString();
            })()
          : null;

        const result: ScanResult = {
          id: doc.id ? `incentivi-${String(doc.id)}` : `incentivi-${Math.random().toString(16).slice(2)}`,
          title: doc.title ?? 'Incentivo (Incentivi.gov)',
          authorityName: doc.authorityName ?? 'Incentivi.gov',
          deadlineAt: deadline,
          sourceUrl: buildSourceUrl(doc),
          requirements: buildRequirements(doc, { userRegion: userRegionCanonical, territory }),
          matchScore: localScore,
          matchReasons: matchReasons.slice(0, 3),
          mismatchFlags: mismatchFlags.slice(0, 3),
          score: localScore
        };

        return {
          isOpen,
          regionOk,
          atecoOk: atecoMatch.ok,
          beneficiariesOk: beneficiariesMatch.ok,
          economicReliable: hasReliableEconomicDataDoc(doc),
          strictTextOk,
          relaxedTextOk,
          contributionMatched: contribution.matched,
          result
        };
      });

    const openAndRegionStrict = mapped.filter(
      (x) => x.isOpen && x.regionOk && x.atecoOk && x.beneficiariesOk && x.economicReliable,
    );
    const openAndRegion =
      openAndRegionStrict.length > 0
        ? openAndRegionStrict
        : mapped.filter((x) => x.isOpen && x.regionOk && x.atecoOk && x.beneficiariesOk);
    const strictTextPool = wantsTopic ? openAndRegion.filter((x) => x.strictTextOk) : openAndRegion;
    const relaxedTextPool = wantsTopic ? openAndRegion.filter((x) => x.relaxedTextOk) : openAndRegion;
    const requireGoal = Boolean(fundingGoal?.trim());

    const chosenTextPool = !wantsTopic
      ? openAndRegion
      : requireGoal
        ? strictTextPool
        : strictTextPool.length >= Math.min(3, limit)
          ? strictTextPool
          : relaxedTextPool;

    const candidates: Candidate[] = chosenTextPool.map((x) => ({ result: x.result, contributionMatched: x.contributionMatched }));

    const sortByRelevance = (a: Candidate, b: Candidate) => {
      if (a.result.score !== b.result.score) return b.result.score - a.result.score;
      const at = a.result.deadlineAt ? new Date(a.result.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.result.deadlineAt ? new Date(b.result.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    };

    const sorted = [...candidates].sort(sortByRelevance);

    const qualityThreshold = 0.56;
    const pickFrom = (pool: Candidate[]) => {
      return pool.filter((x) => x.result.score >= qualityThreshold).slice(0, limit);
    };

    let strictMatchesFound = false;
    let pickedCandidates: Candidate[] = [];

    if (contributionPrefInfo.strict) {
      const strictPool = sorted.filter((c) => c.contributionMatched);
      strictMatchesFound = strictPool.length > 0;

      const strictPicked = pickFrom(strictPool);
      if (strictPicked.length > 0) {
        if (strictPicked.length >= limit) {
          pickedCandidates = strictPicked.slice(0, limit);
        } else {
          const generalPicked = pickFrom(sorted);
          const byId = new Set(strictPicked.map((c) => c.result.id));
          pickedCandidates = [...strictPicked];
          for (const c of generalPicked) {
            if (byId.has(c.result.id)) continue;
            pickedCandidates.push(c);
            byId.add(c.result.id);
            if (pickedCandidates.length >= limit) break;
          }
        }
      } else {
        pickedCandidates = pickFrom(sorted);
      }
    } else {
      pickedCandidates = pickFrom(sorted);
    }

    const items = pickedCandidates.map((c) => c.result);
    const topScore = items[0]?.matchScore ?? null;
    const qualityBand = qualityBandFromScore(topScore);
    const refineQuestion = buildRefineQuestion({
      region,
      sector,
      fundingGoal,
      ateco,
      budget,
      requestedContribution,
      topScore,
      resultsCount: items.length
    });

    const topPickBandoId = items[0]?.id ?? null;
    const bookingUrl = buildBookingUrl(bookingBase, {
      bandoId: topPickBandoId,
      region,
      sector
    });

    return NextResponse.json({
      explanation: buildExplanation({
        region,
        sector,
        fundingGoal,
        contributionPreference,
        strictPreferenceLabel: contributionPrefInfo.label,
        strictPreferenceRequested: contributionPrefInfo.strict,
        strictMatchesFound,
        resultsCount: items.length
      }),
      results: items,
      nearMisses: [],
      qualityBand,
      refineQuestion: refineQuestion ?? undefined,
      topPickBandoId,
      bookingUrl
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore scan.' }, { status: 500 });
  }
}
