import { NextResponse } from 'next/server';
import { fetchIncentiviDocs, mergeIncentiviDocs, INCENTIVI_SOLR_ENDPOINT } from '@/lib/matching/fetchIncentiviShared';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { STRATEGIC_SCANNER_DOCS } from '@/lib/strategicScannerDocs';
import { normalizeProfile } from '@/lib/matching/profileNormalizer';
import {
  applyEconomicThresholdFilter,
  computeDynamicAmountThreshold,
  computeEconomicReliability,
  sanitizeUnreliableEconomicLabels,
} from '@/lib/matching/economicReliability';
import { loadHybridDatasetDocs } from '@/lib/matching/datasetRepository';
import { buildRefineQuestionV3 } from '@/lib/matching/refineQuestion';
import { resolveCaseProfiles } from '@/lib/matching/caseProfiles';
import { evaluateHardEligibility } from '@/lib/matching/hardEligibility';
import { runUnifiedPipeline } from '@/lib/matching/unifiedPipeline';
import type { GrantEvaluation } from '@/lib/matching/unifiedPipeline';
import { filterClosedCalls } from '@/lib/matching/scannerFilters';
import { buildResultAwareRefineQuestion } from '@/lib/matching/resultAwareRefine';
import type { IncentiviDoc, NormalizedMatchingProfile } from '@/lib/matching/types';

export const runtime = 'nodejs';

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
  limit: z.coerce.number().int().min(1).max(50).optional(),
  mode: z.enum(['fast', 'full']).optional(),
  channel: z.enum(['scanner', 'chat']).optional(),
  strictness: z.enum(['standard', 'high']).optional(),
});

type ScanChannel = 'scanner' | 'chat';
type ScanStrictness = 'standard' | 'high';

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

function normalizeNumericToken(rawValue: string): string | null {
  const cleaned = rawValue
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(/eur|euro/gi, '')
    .replace(/[^0-9,.-]/g, '');

  if (!cleaned) return null;

  let normalized = cleaned;
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
  return normalized || null;
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
  bookingUrl?: string | null;
};

type Candidate = {
  result: ScanResult;
  contributionMatched: boolean;
};

type QualityBand = 'high' | 'medium' | 'low';



let localDocsLookupPromise: Promise<Map<string, IncentiviDoc>> | null = null;

function strategicDocToIncentiviDoc(rawDoc: unknown): IncentiviDoc {
  const doc = (rawDoc ?? {}) as Record<string, unknown>;
  return {
    id: (typeof doc.id === 'string' || typeof doc.id === 'number') ? doc.id : undefined,
    title: typeof doc.title === 'string' ? doc.title : undefined,
    description: typeof doc.description === 'string' ? doc.description : undefined,
    authorityName: typeof doc.authorityName === 'string' ? doc.authorityName : undefined,
    openDate: typeof doc.openDate === 'string' ? doc.openDate : undefined,
    closeDate: typeof doc.closeDate === 'string' ? doc.closeDate : undefined,
    regions:
      Array.isArray(doc.regions) ? doc.regions.map((entry) => String(entry)) : typeof doc.regions === 'string' ? doc.regions : undefined,
    sectors:
      Array.isArray(doc.sectors) ? doc.sectors.map((entry) => String(entry)) : typeof doc.sectors === 'string' ? doc.sectors : undefined,
    beneficiaries:
      Array.isArray(doc.beneficiaries)
        ? doc.beneficiaries.map((entry) => String(entry))
        : typeof doc.beneficiaries === 'string'
          ? doc.beneficiaries
          : undefined,
    dimensions:
      Array.isArray(doc.dimensions)
        ? doc.dimensions.map((entry) => String(entry))
        : typeof doc.dimensions === 'string'
          ? doc.dimensions
          : undefined,
    purposes:
      Array.isArray(doc.purposes) ? doc.purposes.map((entry) => String(entry)) : typeof doc.purposes === 'string' ? doc.purposes : undefined,
    supportForm:
      Array.isArray(doc.supportForm)
        ? doc.supportForm.map((entry) => String(entry))
        : typeof doc.supportForm === 'string'
          ? doc.supportForm
          : undefined,
    ateco: Array.isArray(doc.ateco) ? doc.ateco.map((entry) => String(entry)) : typeof doc.ateco === 'string' ? doc.ateco : undefined,
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
    score: typeof doc.score === 'number' ? doc.score : undefined,
  };
}

function grantIdLookupKeys(grantId: string): string[] {
  const trimmed = String(grantId || '').trim();
  if (!trimmed) return [];
  const raw = trimmed.replace(/^incentivi-/i, '').trim();
  const keys = new Set<string>([trimmed, raw]);
  if (raw && /^\d+$/.test(raw)) keys.add(`incentivi-${raw}`);
  return Array.from(keys).filter(Boolean);
}

function docLookupKeys(doc: IncentiviDoc): string[] {
  const id = String(doc.id ?? '').trim();
  if (!id) return [];
  const keys = new Set<string>([id, `incentivi-${id}`]);
  return Array.from(keys);
}

async function getLocalDocsLookup(): Promise<Map<string, IncentiviDoc>> {
  if (!localDocsLookupPromise) {
    localDocsLookupPromise = (async () => {
      const hybrid = await loadHybridDatasetDocs();
      const docs = hybrid.docs.length > 0 ? hybrid.docs : STRATEGIC_SCANNER_DOCS.map(strategicDocToIncentiviDoc);
      const lookup = new Map<string, IncentiviDoc>();
      for (const doc of docs) {
        for (const key of docLookupKeys(doc)) {
          if (!lookup.has(key)) lookup.set(key, doc);
        }
      }
      return lookup;
    })();
  }
  return localDocsLookupPromise;
}

function getLocalDocByGrantId(grantId: string, lookup: Map<string, IncentiviDoc>): IncentiviDoc | null {
  for (const key of grantIdLookupKeys(grantId)) {
    const doc = lookup.get(key);
    if (doc) return doc;
  }
  return null;
}

const SOUTH_REGION_SET = new Set(['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Molise', 'Puglia', 'Sardegna', 'Sicilia']);
const CENTER_NORTH_REGION_SET = new Set([
  'Piemonte',
  "Valle d'Aosta",
  'Liguria',
  'Lombardia',
  'Veneto',
  'Friuli-Venezia Giulia',
  'Trentino-Alto Adige',
  'Emilia-Romagna',
  'Toscana',
  'Lazio',
  'Umbria',
  'Marche',
]);

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

  const match =
    raw.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?/g)?.find((entry) => /\d/.test(entry)) ?? null;
  if (!match) return null;

  const normalized = normalizeNumericToken(match);
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

type CoverageRange = { min: number | null; max: number | null; label: string | null };

type LocalEconomicData = {
  grantMin: number | null;
  grantMax: number | null;
  costMin: number | null;
  costMax: number | null;
  coverage: CoverageRange;
  budgetTotal: number | null;
  aidIntensity: string | null;
  economicOffer: Record<string, unknown> | null;
  reliableGrantAmount: boolean;
};

function extractMoneyValuesFromText(text: string): number[] {
  if (!text.trim()) return [];

  const values = Array.from(
    text.matchAll(
      /(?:€\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?(?:\s*(?:euro|eur|€))?|\d{4,}(?:[.,]\d+)?(?:\s*(?:euro|eur|€))?|\d+(?:[.,]\d+)?\s*(?:mila|milione|milioni|mln|mld))/gi,
    ),
  )
    .map((match) => parseMoneyValue(match[0]))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);

  return Array.from(new Set(values));
}

function extractCoverageRangeFromText(text: string): CoverageRange {
  const matches = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g))
    .map((match) => Number((match[1] ?? '').replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 100);

  if (!matches.length) return { min: null, max: null, label: null };

  if (matches.length === 1) {
    const value = matches[0]!;
    return { min: value, max: value, label: `${value.toLocaleString('it-IT')}%` };
  }

  const min = Math.min(...matches);
  const max = Math.max(...matches);
  return {
    min,
    max,
    label: `Dal ${min.toLocaleString('it-IT')}% al ${max.toLocaleString('it-IT')}%`,
  };
}

function formatCoverageLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    if (Math.abs(min - max) < 0.001) return `${min.toLocaleString('it-IT')}%`;
    return `Dal ${min.toLocaleString('it-IT')}% al ${max.toLocaleString('it-IT')}%`;
  }
  const resolved = max ?? min;
  return resolved !== null ? `${resolved.toLocaleString('it-IT')}%` : null;
}

function parsePercentValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }
  if (typeof value === 'string') {
    const match = value.match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    const parsed = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(100, parsed));
  }
  return null;
}

function coveragePriorityFromResult(result: ScanResult): number {
  const economic = result.economicOffer && typeof result.economicOffer === 'object' ? result.economicOffer : null;
  if (economic) {
    const directValues = [parsePercentValue(economic.estimatedCoverageMinPercent), parsePercentValue(economic.estimatedCoverageMaxPercent)]
      .filter((value): value is number => value !== null)
      .map((value) => Math.max(0, Math.min(100, value)));
    if (directValues.length) return Math.max(...directValues);
  }

  const labels: string[] = [];
  if (economic && typeof economic.displayCoverageLabel === 'string' && economic.displayCoverageLabel.trim()) {
    labels.push(economic.displayCoverageLabel.trim());
  }
  if (economic && typeof economic.estimatedCoverageLabel === 'string' && economic.estimatedCoverageLabel.trim()) {
    labels.push(economic.estimatedCoverageLabel.trim());
  }
  if (typeof result.aidIntensity === 'string' && result.aidIntensity.trim()) {
    labels.push(result.aidIntensity.trim());
  }

  let best = 0;
  for (const label of labels) {
    const range = extractCoverageRangeFromText(label);
    const candidate = range.max ?? range.min ?? 0;
    if (candidate > best) best = candidate;
  }

  return Math.max(0, Math.min(100, best));
}

function availabilityPriority(status: ScanResult['availabilityStatus']): number {
  if (status === 'open') return 0;
  if (status === 'incoming') return 1;
  return 2;
}

function hardStatusPriority(status: ScanResult['hardStatus']): number {
  if (status === 'eligible') return 0;
  if (status === 'unknown') return 1;
  return 2;
}

const RESTO_TITLE_HINTS = ['resto al sud', 'resto al sud 2 0', 'resto al sud 2.0'];
const FUSESE_TITLE_HINTS = ['fusese', 'fund for self employment and self entrepreneurship'];
const ON_TITLE_HINTS = ['oltre nuove imprese a tasso zero', 'nuove imprese a tasso zero'];

type ProfilePriorityRule = {
  tokens: string[];
  score: number;
};

function resultTitleAndSourceNorm(result: ScanResult) {
  return normalizeForMatch([result.title, result.sourceUrl].filter(Boolean).join(' '));
}

function hasAnyHint(textNorm: string, hints: string[]) {
  return hints.some((hint) => textNorm.includes(normalizeForMatch(hint)));
}

function isRestoResult(result: ScanResult) {
  return hasAnyHint(resultTitleAndSourceNorm(result), RESTO_TITLE_HINTS);
}

function isFuseseResult(result: ScanResult) {
  return hasAnyHint(resultTitleAndSourceNorm(result), FUSESE_TITLE_HINTS);
}

function isOnResult(result: ScanResult) {
  return hasAnyHint(resultTitleAndSourceNorm(result), ON_TITLE_HINTS);
}

function southYouthStartupPriorityRules(enabled: boolean): ProfilePriorityRule[] {
  if (!enabled) return [];
  return [
    { tokens: RESTO_TITLE_HINTS, score: 3 },
    { tokens: FUSESE_TITLE_HINTS, score: 2 },
    { tokens: ON_TITLE_HINTS, score: 1 },
  ];
}

function profilePriorityScoreFromRules(result: ScanResult, rules: ProfilePriorityRule[]): number {
  if (!rules.length) return 0;
  const textNorm = resultTitleAndSourceNorm(result);
  let best = 0;
  for (const rule of rules) {
    if (!rule.tokens.length) continue;
    if (hasAnyHint(textNorm, rule.tokens) && rule.score > best) {
      best = rule.score;
    }
  }
  return best;
}

function sortCandidatesForDisplay(
  candidates: Candidate[],
  pinnedStrategicTitles: string[] = [],
  profilePriorityRules: ProfilePriorityRule[] = [],
): Candidate[] {
  const pinnedNorm = pinnedStrategicTitles.map((entry) => normalizeForMatch(entry)).filter(Boolean);
  const isPinned = (result: ScanResult) => {
    if (!pinnedNorm.length) return false;
    const titleNorm = normalizeForMatch(result.title);
    return pinnedNorm.some((pinned) => titleNorm.includes(pinned));
  };

  return [...candidates].sort((a, b) => {
    const aPinned = isPinned(a.result);
    const bPinned = isPinned(b.result);
    const aProfilePriority = profilePriorityScoreFromRules(a.result, profilePriorityRules);
    const bProfilePriority = profilePriorityScoreFromRules(b.result, profilePriorityRules);
    const strategicPriorityA = (aPinned ? 100 : 0) + aProfilePriority;
    const strategicPriorityB = (bPinned ? 100 : 0) + bProfilePriority;
    if (strategicPriorityA !== strategicPriorityB) return strategicPriorityB - strategicPriorityA;

    const hardDelta = hardStatusPriority(a.result.hardStatus) - hardStatusPriority(b.result.hardStatus);
    if (hardDelta !== 0) return hardDelta;

    const availabilityDelta = availabilityPriority(a.result.availabilityStatus) - availabilityPriority(b.result.availabilityStatus);
    if (availabilityDelta !== 0) return availabilityDelta;

    const coverageDelta = coveragePriorityFromResult(b.result) - coveragePriorityFromResult(a.result);
    if (coverageDelta !== 0) return coverageDelta;

    if (a.result.score !== b.result.score) return b.result.score - a.result.score;

    const at = a.result.deadlineAt ? new Date(a.result.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
    const bt = b.result.deadlineAt ? new Date(b.result.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
    return at - bt;
  });
}

type ChatStrictContext = {
  region: string | null;
  sector: string | null;
  fundingGoal: string | null;
  activityType: string | null;
  businessExists: boolean | null;
};

const CHAT_STRICT_STRATEGIC_TITLES = [
  'resto al sud',
  'resto al sud 2 0',
  'resto al sud 2.0',
  'fusese',
  'fund for self employment and self entrepreneurship',
  'autoimpiego centro nord',
  'oltre nuove imprese a tasso zero',
  'nuove imprese a tasso zero',
  'smart start',
  'nuova sabatini',
  'pidnext',
  'voucher digitali',
  'nuova impresa',
  'fesr',
  'fse',
  'pr calabria',
  'pr lombardia',
  'pr sicilia',
  'pr campania',
  'pr puglia',
  'pr sardegna',
  'programma regionale',
];

function isContributionFocusedText(textNorm: string) {
  return /(contribut|fondo perduto|agevolaz|finanziament|prestito|voucher|credito d imposta|credito)/.test(textNorm);
}

function isBusinessTargetText(textNorm: string) {
  return /(impresa|imprese|azienda|aziende|pmi|startup|autoimpiego|lavoro autonomo|professionist|nuova attivita|da costituire)/.test(
    textNorm,
  );
}

function normalizeResultSearchText(result: ScanResult) {
  return normalizeForMatch(
    [
      result.title,
      result.authorityName,
      result.aidForm,
      result.aidIntensity,
      ...(result.requirements ?? []),
      ...(result.matchReasons ?? []),
      ...(result.mismatchFlags ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function passesChatStrictCandidate(result: ScanResult, context: ChatStrictContext, enforceGoal = true): boolean {
  // Se la unifiedPipeline ha dato uno score molto alto, ci fidiamo
  if ((result.score ?? 0) >= 0.70) return true;

  const titleNorm = normalizeForMatch(result.title);
  const authorityTrusted = classifyAuthorityPriority(result.authorityName).trusted;
  const strategicTitle = CHAT_STRICT_STRATEGIC_TITLES.some((token) => titleNorm.includes(token));
  if (!authorityTrusted && !strategicTitle) return false;

  const searchText = normalizeResultSearchText(result);
  if (!isContributionFocusedText(searchText)) return false;
  if (!isBusinessTargetText(searchText)) return false;

  if (
    context.businessExists === false &&
    /(imprese gia attive|imprese attive|aziende gia attive|almeno due bilanci|impresa esistente)/.test(searchText) &&
    !/(da costituire|nuova impresa|startup|autoimpiego|aspiranti imprenditori|persone fisiche)/.test(searchText)
  ) {
    return false;
  }

  if (enforceGoal) {
    const goalTokens = tokenizeKeywords(
      normalizeForMatch([context.fundingGoal, context.sector, context.activityType].filter(Boolean).join(' ')),
    ).slice(0, 10);
    if (goalTokens.length > 0) {
      const goalHit = anyTextMatch(searchText, goalTokens) || strategicTitle;
      if (!goalHit) return false;
    }
  }

  return true;
}

function applyChatStrictCandidateFilter(candidates: Candidate[], context: ChatStrictContext): Candidate[] {
  const hard = candidates.filter((entry) => passesChatStrictCandidate(entry.result, context, true));
  if (hard.length > 0) return hard;
  const medium = candidates.filter((entry) => passesChatStrictCandidate(entry.result, context, false));
  if (medium.length > 0) return medium;
  return [];
}

function hasStrategicTitleHint(result: ScanResult) {
  const titleNorm = normalizeForMatch(result.title);
  return CHAT_STRICT_STRATEGIC_TITLES.some((token) => titleNorm.includes(token));
}

function normalizeTitleDedupeKey(title: string): string {
  let key = normalizeForMatch(title)
    .replace(/\b(anno|edizione|misura|bando|avviso|contributi)\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (key.includes('fusese') || key.includes('fund for self employment')) key = 'fusese';
  return key;
}

function mergeEconomicOffer(
  currentOffer: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = currentOffer && typeof currentOffer === 'object' ? currentOffer : {};
  return { ...base, ...patch };
}

function applyStrategicResultOverrides(result: ScanResult): ScanResult {
  const titleNorm = normalizeForMatch(result.title);
  const sourceNorm = normalizeForMatch(result.sourceUrl ?? '');
  const hints = `${titleNorm} ${sourceNorm}`.trim();

  if (hints.includes('resto al sud')) {
    const economicOffer = mergeEconomicOffer(result.economicOffer, {
      costMin: 10_000,
      costMax: 200_000,
      displayProjectAmountLabel: 'Da € 10.000 a € 200.000',
      displayCoverageLabel: '70% - 100%',
      estimatedCoverageMinPercent: 70,
      estimatedCoverageMaxPercent: 100,
      estimatedCoverageLabel: '70% - 100%',
    });
    return {
      ...result,
      authorityName: result.authorityName || 'Invitalia',
      aidForm: result.aidForm || 'Contributo/Fondo perduto',
      aidIntensity: '70% - 100%',
      economicOffer,
    };
  }

  if (hints.includes('autoimpiego centro nord') || hints.includes('autoimpiego centro-nord')) {
    const economicOffer = mergeEconomicOffer(result.economicOffer, {
      costMax: 200_000,
      displayProjectAmountLabel: 'Fino a € 200.000',
      displayCoverageLabel: '60% - 100%',
      estimatedCoverageMinPercent: 60,
      estimatedCoverageMaxPercent: 100,
      estimatedCoverageLabel: '60% - 100%',
    });
    return {
      ...result,
      authorityName: result.authorityName || 'Invitalia',
      aidForm: result.aidForm || 'Contributo/Fondo perduto, Voucher',
      aidIntensity: '60% - 100%',
      economicOffer,
    };
  }

  if (hints.includes('fusese') || hints.includes('fund for self employment and self entrepreneurship')) {
    return {
      ...result,
      authorityName: result.authorityName || 'Regione Calabria',
      aidForm: result.aidForm || 'Contributo/Fondo perduto',
      economicOffer: mergeEconomicOffer(result.economicOffer, {}),
    };
  }

  return result;
}

type ResultAmountFacts = {
  grantMaxEUR: number | null;
  projectMaxEUR: number | null;
  referenceMaxEUR: number | null;
};

function extractAmountsFromLabel(value: unknown): number[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return extractMoneyValuesFromText(value).filter((entry) => Number.isFinite(entry) && entry > 0);
}

function resultAmountFacts(result: ScanResult): ResultAmountFacts {
  const economic = result.economicOffer && typeof result.economicOffer === 'object' ? result.economicOffer : null;

  const grantCandidates = [
    parseMoneyValue(economic?.grantMin),
    parseMoneyValue(economic?.grantMax),
    ...extractAmountsFromLabel(economic?.displayAmountLabel),
  ].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);

  const projectCandidates = [
    parseMoneyValue(economic?.costMin),
    parseMoneyValue(economic?.costMax),
    parseMoneyValue(result.budgetTotal),
    ...extractAmountsFromLabel(economic?.displayProjectAmountLabel),
  ].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);

  const grantMaxEUR = grantCandidates.length ? Math.max(...grantCandidates) : null;
  const projectMaxEUR = projectCandidates.length ? Math.max(...projectCandidates) : null;
  const fallbackFromLabels = [
    ...extractAmountsFromLabel(economic?.displayAmountLabel),
    ...extractAmountsFromLabel(economic?.displayProjectAmountLabel),
  ];
  const fallbackMax = fallbackFromLabels.length ? Math.max(...fallbackFromLabels) : null;
  const referenceMaxEUR = grantMaxEUR ?? projectMaxEUR ?? fallbackMax;

  return { grantMaxEUR, projectMaxEUR, referenceMaxEUR };
}

function hasReliableEconomicDataResult(result: ScanResult): boolean {
  const facts = resultAmountFacts(result);
  if (facts.grantMaxEUR !== null && facts.grantMaxEUR >= 1_000) return true;
  if (facts.projectMaxEUR !== null && facts.projectMaxEUR >= 2_000) return true;
  if (facts.referenceMaxEUR !== null && facts.referenceMaxEUR >= 1_000 && coveragePriorityFromResult(result) > 0) return true;
  return false;
}

function withEconomicToVerify(result: ScanResult): ScanResult {
  const existing = result.economicOffer && typeof result.economicOffer === 'object' ? result.economicOffer : {};
  const aidNorm = normalizeForMatch(result.aidForm ?? '');
  const isFondoPerduto = /(fondo perduto|contributo)/.test(aidNorm);
  const coverageLabel = isFondoPerduto ? 'Da verificare' : '0%';
  return {
    ...result,
    aidIntensity: coverageLabel,
    economicOffer: {
      ...existing,
      displayAmountLabel: 'Da verificare',
      displayProjectAmountLabel: 'Da verificare',
      displayCoverageLabel: coverageLabel,
      estimatedCoverageLabel: coverageLabel,
      estimatedCoverageMinPercent: null,
      estimatedCoverageMaxPercent: null,
    },
  };
}

function computeChatMinRelevantAmount(targetAmount: number | null): number {
  if (targetAmount === null || !Number.isFinite(targetAmount) || targetAmount <= 0) return 2_000;
  if (targetAmount >= 100_000) return 15_000;
  if (targetAmount >= 40_000) return 8_000;
  if (targetAmount >= 15_000) return 4_000;
  return 2_000;
}

function hasMicroTicketIntent(context: ChatStrictContext, contributionPreference: string | null): boolean {
  const intentNorm = normalizeForMatch([context.fundingGoal, context.sector, context.activityType, contributionPreference].filter(Boolean).join(' '));
  if (!intentNorm) return false;
  return /(voucher|assessment|assesment|smau|fiera|fiere|servizi brevi|audit|check up|diagnosi|roadmap|orientamento digitale)/.test(
    intentNorm,
  );
}

function isBusinessTargetResult(result: ScanResult): boolean {
  const searchText = normalizeResultSearchText(result);
  if (!isContributionFocusedText(searchText)) return false;
  if (!isBusinessTargetText(searchText)) return false;

  const nonBusinessOnly = /(borsa di studio|borse di studio|student|tirocin|inserimento lavorativo|formazione professionale)/.test(searchText);
  const hasBusinessSignals = /(impresa|azienda|pmi|startup|autoimpiego|lavoro autonomo|professionist)/.test(searchText);
  if (nonBusinessOnly && !hasBusinessSignals) return false;

  return true;
}

function dedupeCandidatesByTitle(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const deduped: Candidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeTitleDedupeKey(candidate.result.title);
    if (!key) {
      deduped.push(candidate);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function mergeStrategicRecallCandidates(args: {
  base: Candidate[];
  recall: Candidate[];
  pinnedStrategicTitles?: string[];
  profilePriorityRules?: ProfilePriorityRule[];
}) {
  const { base, recall, pinnedStrategicTitles = [], profilePriorityRules = [] } = args;
  if (!recall.length) return base;

  const mergedById = new Map<string, Candidate>();
  for (const candidate of base) mergedById.set(candidate.result.id, candidate);
  for (const candidate of recall) {
    if (!mergedById.has(candidate.result.id)) {
      mergedById.set(candidate.result.id, candidate);
    }
  }

  return dedupeCandidatesByTitle(
    sortCandidatesForDisplay([...mergedById.values()], pinnedStrategicTitles, profilePriorityRules),
  );
}

function applyChatPrecisionPolicy(args: {
  candidates: Candidate[];
  context: ChatStrictContext;
  contributionPreference: string | null;
  targetAmount: number | null;
  pinnedStrategicTitles?: string[];
  profilePriorityRules?: ProfilePriorityRule[];
  enforceGoal?: boolean;
}): Candidate[] {
  const {
    candidates,
    context,
    contributionPreference,
    targetAmount,
    pinnedStrategicTitles = [],
    profilePriorityRules = [],
    enforceGoal = true,
  } = args;

  const sorted = sortCandidatesForDisplay(candidates, pinnedStrategicTitles, profilePriorityRules);
  const normalizedProfile = normalizeProfile({
    region: context.region,
    sector: context.sector,
    fundingGoal: context.fundingGoal,
    activityType: context.activityType,
    contributionPreference,
    requestedContributionEUR: targetAmount,
    revenueOrBudgetEUR: targetAmount,
  });
  const dynamicThreshold = computeDynamicAmountThreshold(normalizedProfile);
  const allowMicroTicket = dynamicThreshold.microTicketIntent;
  const filtered: Candidate[] = [];

  for (const candidate of sorted) {
    let result = applyStrategicResultOverrides(candidate.result);
    const authorityTrusted = classifyAuthorityPriority(result.authorityName).trusted;
    const strategicTitle = hasStrategicTitleHint(result);
    if (!authorityTrusted && !strategicTitle) continue;
    if (!isBusinessTargetResult(result)) continue;
    if (!passesChatStrictCandidate(result, context, enforceGoal)) continue;
    if (!computeEconomicReliability(result).reliable) {
      result = sanitizeUnreliableEconomicLabels(result);
    }

    const amountFacts = resultAmountFacts(result);
    const relevantAmount = amountFacts.grantMaxEUR ?? amountFacts.projectMaxEUR ?? amountFacts.referenceMaxEUR;
    if (!allowMicroTicket) {
      if (relevantAmount !== null && relevantAmount < dynamicThreshold.minRelevantAmount) continue;
    }

    filtered.push({ ...candidate, result });
  }

  return dedupeCandidatesByTitle(applyEconomicThresholdFilter(filtered, dynamicThreshold));
}

function filterNearMissesForChat(args: {
  nearMisses: Candidate[];
  context: ChatStrictContext;
  contributionPreference: string | null;
  targetAmount: number | null;
  limit: number;
  pinnedStrategicTitles?: string[];
  profilePriorityRules?: ProfilePriorityRule[];
}): Candidate[] {
  const { nearMisses, context, contributionPreference, targetAmount, limit, pinnedStrategicTitles = [], profilePriorityRules = [] } = args;
  const policy = applyChatPrecisionPolicy({
    candidates: nearMisses,
    context,
    contributionPreference,
    targetAmount,
    pinnedStrategicTitles,
    profilePriorityRules,
    enforceGoal: false,
  });

  return policy
    .filter((entry) => {
      const probability = Math.max(
        0,
        Math.min(100, entry.result.probabilityScore ?? Math.round((entry.result.matchScore ?? 0) * 100)),
      );
      return probability >= 35 || (entry.result.matchScore ?? 0) >= 0.35;
    })
    .slice(0, Math.min(limit, 6));
}

function extractGrantRangeFromSentence(sentence: string): { min: number | null; max: number | null } | null {
  const normalized = normalizeForMatch(sentence);
  if (
    !/(contribut|agevolaz|credito d imposta|credito|finanziament|voucher|sovvenzion|aiut|beneficio|intervento|copertura|fondo perduto|tasso zero|investimento nel capitale)/.test(
      normalized,
    )
  ) {
    return null;
  }

  const values = extractMoneyValuesFromText(sentence);
  if (!values.length) return null;

  if (/(tra|compres[oa]|da)\b/.test(normalized) && /\ba\b|\be\b/.test(normalized) && values.length >= 2) {
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  if (/(non inferiore|almeno|minim)/.test(normalized) && /(non superiore|fino a|massim|limite)/.test(normalized) && values.length >= 2) {
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  if (/(non superiore|fino a|massim|limite|entro)/.test(normalized)) {
    return { min: null, max: Math.max(...values) };
  }
  if (/(non inferiore|almeno|minim)/.test(normalized)) {
    return { min: Math.min(...values), max: null };
  }

  return values.length >= 2 ? { min: Math.min(...values), max: Math.max(...values) } : { min: null, max: values[0] ?? null };
}

function extractProjectRangeFromSentence(sentence: string): { min: number | null; max: number | null } | null {
  const normalized = normalizeForMatch(sentence);
  if (!/(spes|investiment|progett|programma|piano di attivita|piano di investimento|costi ammessi|spese ammissibili)/.test(normalized)) {
    return null;
  }

  const values = extractMoneyValuesFromText(sentence);
  if (!values.length) return null;

  if (values.length >= 2 && (/(tra|compres[oa]|da)\b/.test(normalized) || /(non inferiore|almeno|minim)/.test(normalized))) {
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  if (/(non superiore|fino a|massim|limite)/.test(normalized)) {
    return { min: null, max: Math.max(...values) };
  }

  return values.length >= 2 ? { min: Math.min(...values), max: Math.max(...values) } : { min: null, max: values[0] ?? null };
}

function resolveDocEconomicData(doc: IncentiviDoc): LocalEconomicData {
  const description = typeof doc.description === 'string' ? doc.description : '';
  const sentences = description
    .split(/[\n\r]+|(?<=[.!?;:])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const fieldCostMin = parseMoneyValue(doc.costMin);
  const fieldCostMax = parseMoneyValue(doc.costMax);
  const explicitGrantMin = parseMoneyValue(doc.grantMin);
  const explicitGrantMax = parseMoneyValue(doc.grantMax);
  const explicitCoverageMin = cleanNumber(doc.coverageMinPercent);
  const explicitCoverageMax = cleanNumber(doc.coverageMaxPercent);
  const explicitAmountLabel = typeof doc.displayAmountLabel === 'string' && doc.displayAmountLabel.trim() ? doc.displayAmountLabel.trim() : null;
  const explicitProjectAmountLabel =
    typeof doc.displayProjectAmountLabel === 'string' && doc.displayProjectAmountLabel.trim()
      ? doc.displayProjectAmountLabel.trim()
      : null;
  const explicitCoverageLabel =
    typeof doc.displayCoverageLabel === 'string' && doc.displayCoverageLabel.trim() ? doc.displayCoverageLabel.trim() : null;

  const sentenceGrantRanges = sentences.map(extractGrantRangeFromSentence).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const sentenceProjectRanges = sentences
    .map(extractProjectRangeFromSentence)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const parsedCoverage = extractCoverageRangeFromText(description);
  const coverage: CoverageRange =
    explicitCoverageMin !== null || explicitCoverageMax !== null || explicitCoverageLabel
      ? {
          min: explicitCoverageMin,
          max: explicitCoverageMax ?? explicitCoverageMin,
          label: explicitCoverageLabel || formatCoverageLabel(explicitCoverageMin, explicitCoverageMax),
        }
      : parsedCoverage;

  const sentenceGrantMin = sentenceGrantRanges
    .map((entry) => entry.min)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const sentenceGrantMax = sentenceGrantRanges
    .map((entry) => entry.max)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const sentenceProjectMin = sentenceProjectRanges
    .map((entry) => entry.min)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const sentenceProjectMax = sentenceProjectRanges
    .map((entry) => entry.max)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);

  const costMin = fieldCostMin ?? (sentenceProjectMin.length ? Math.min(...sentenceProjectMin) : null);
  const costMax = fieldCostMax ?? (sentenceProjectMax.length ? Math.max(...sentenceProjectMax) : null);

  let grantMin = explicitGrantMin ?? (sentenceGrantMin.length ? Math.min(...sentenceGrantMin) : null);
  let grantMax = explicitGrantMax ?? (sentenceGrantMax.length ? Math.max(...sentenceGrantMax) : null);

  if ((grantMin === null || grantMax === null) && (coverage.min !== null || coverage.max !== null) && (costMin !== null || costMax !== null)) {
    const resolvedCoverageMin = coverage.min ?? coverage.max;
    const resolvedCoverageMax = coverage.max ?? coverage.min;

    if (grantMin === null && costMin !== null && resolvedCoverageMin !== null) {
      grantMin = (costMin * resolvedCoverageMin) / 100;
    }
    if (grantMax === null && costMax !== null && resolvedCoverageMax !== null) {
      grantMax = (costMax * resolvedCoverageMax) / 100;
    }
  }

  const displayAmountLabel = explicitAmountLabel || formatRange(grantMin, grantMax);
  const displayProjectAmountLabel = explicitProjectAmountLabel || formatRange(costMin, costMax);
  const displayCoverageLabel = explicitCoverageLabel || coverage.label;
  const reliableGrantAmount = Boolean(displayAmountLabel || grantMin || grantMax);
  const budgetTotal = grantMax ?? grantMin ?? null;

  return {
    grantMin,
    grantMax,
    costMin,
    costMax,
    coverage,
    budgetTotal,
    aidIntensity: displayCoverageLabel,
    economicOffer:
      displayAmountLabel || displayProjectAmountLabel || displayCoverageLabel
        ? {
            grantMin,
            grantMax,
            costMin,
            costMax,
            estimatedCoverageMinPercent: coverage.min,
            estimatedCoverageMaxPercent: coverage.max,
            displayAmountLabel,
            displayProjectAmountLabel,
            displayCoverageLabel,
          }
        : null,
    reliableGrantAmount,
  };
}

function normalizeRange(min: number | null, max: number | null): { min: number | null; max: number | null } {
  if (min === null && max === null) return { min: null, max: null };
  if (min === null) return { min: max, max };
  if (max === null) return { min, max: min };
  return min <= max ? { min, max } : { min: max, max: min };
}

function sanitizeEconomicOfferForResult(args: {
  grantId: string;
  aidForm: string | null;
  economicOffer: Record<string, unknown> | null;
  localDoc: IncentiviDoc | null;
}): Record<string, unknown> | null {
  const { grantId, aidForm, economicOffer, localDoc } = args;
  const base = economicOffer && typeof economicOffer === 'object' ? economicOffer : {};
  const localEconomic = localDoc ? resolveDocEconomicData(localDoc).economicOffer : null;
  const merged = localEconomic && typeof localEconomic === 'object' ? { ...base, ...localEconomic } : { ...base };

  if (/incentivi-7753$/i.test(grantId)) {
    Object.assign(merged, {
      grantMin: 2_000,
      grantMax: 10_000,
      costMin: 4_000,
      costMax: 20_000,
      estimatedCoverageMinPercent: 50,
      estimatedCoverageMaxPercent: 60,
      displayAmountLabel: 'Da € 2.000 a € 10.000',
      displayProjectAmountLabel: 'Da € 4.000 a € 20.000',
      displayCoverageLabel: '50% - 60%',
      estimatedCoverageLabel: '50% - 60%',
    });
  }

  const grantRange = normalizeRange(parseMoneyValue(merged.grantMin), parseMoneyValue(merged.grantMax));
  const costRange = normalizeRange(parseMoneyValue(merged.costMin), parseMoneyValue(merged.costMax));
  const projectLabelRaw =
    typeof merged.displayProjectAmountLabel === 'string' && merged.displayProjectAmountLabel.trim()
      ? merged.displayProjectAmountLabel.trim()
      : null;
  const amountLabelRaw =
    typeof merged.displayAmountLabel === 'string' && merged.displayAmountLabel.trim() ? merged.displayAmountLabel.trim() : null;
  const coverageLabelRaw =
    typeof merged.displayCoverageLabel === 'string' && merged.displayCoverageLabel.trim() ? merged.displayCoverageLabel.trim() : null;
  const coverageRange = normalizeRange(
    parsePercentValue(merged.estimatedCoverageMinPercent),
    parsePercentValue(merged.estimatedCoverageMaxPercent),
  );

  const labelProjectMax = projectLabelRaw ? Math.max(...extractAmountsFromLabel(projectLabelRaw), 0) : 0;
  const labelAmountMax = amountLabelRaw ? Math.max(...extractAmountsFromLabel(amountLabelRaw), 0) : 0;
  const projectReliable =
    (costRange.max !== null && costRange.max >= 1_000) ||
    (costRange.min !== null && costRange.min >= 1_000) ||
    labelProjectMax >= 1_000;
  const amountReliable =
    (grantRange.max !== null && grantRange.max >= 1_000) ||
    (grantRange.min !== null && grantRange.min >= 1_000) ||
    labelAmountMax >= 1_000;

  const aidNorm = normalizeForMatch(aidForm ?? '');
  const isFondoPerduto = /(fondo perduto|contributo)/.test(aidNorm);
  const coverageReliable =
    coverageRange.min !== null ||
    coverageRange.max !== null ||
    (typeof coverageLabelRaw === 'string' && /\d+(?:[.,]\d+)?\s*%/.test(coverageLabelRaw));

  const displayProjectAmountLabel = projectReliable
    ? projectLabelRaw || formatRange(costRange.min, costRange.max) || (amountReliable ? amountLabelRaw : null) || 'Da verificare'
    : 'Da verificare';
  const displayAmountLabel = amountReliable
    ? amountLabelRaw || formatRange(grantRange.min, grantRange.max) || displayProjectAmountLabel
    : 'Da verificare';
  const displayCoverageLabel = isFondoPerduto
    ? coverageReliable
      ? coverageLabelRaw || formatCoverageLabel(coverageRange.min, coverageRange.max) || 'Da verificare'
      : 'Da verificare'
    : coverageLabelRaw || '0%';

  return {
    ...merged,
    grantMin: grantRange.min,
    grantMax: grantRange.max,
    costMin: costRange.min,
    costMax: costRange.max,
    estimatedCoverageMinPercent: coverageRange.min,
    estimatedCoverageMaxPercent: coverageRange.max,
    displayAmountLabel,
    displayProjectAmountLabel,
    displayCoverageLabel,
    estimatedCoverageLabel: displayCoverageLabel,
  };
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

function parseAgeBandValue(value: unknown): 'under35' | 'over35' | null {
  if (typeof value !== 'string') return null;
  const norm = normalizeForMatch(value);
  if (!norm) return null;
  if (/\bunder\s*35\b|\bu35\b|meno di 35|sotto i 35|<\s*35|giovane\b/.test(norm)) return 'under35';
  if (/\bover\s*35\b|oltre 35|piu di 35|sopra i 35|>\s*35/.test(norm)) return 'over35';
  return null;
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

  const businessExists = inferBusinessExists(rawProfile, activityType, fundingGoal) ?? (typeof rawProfile.businessExists === 'boolean' ? rawProfile.businessExists : null);

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

function inferBusinessExists(
  rawProfile: Record<string, unknown>,
  activityType: string | null,
  fundingGoal: string | null,
): boolean | null {
  const businessExistsRaw = rawProfile.isConstituted ?? rawProfile.businessExists;
  if (typeof businessExistsRaw === 'boolean') return businessExistsRaw;

  const businessHints = normalizeForMatch(
    [activityType, fundingGoal, cleanString(rawProfile.businessStage, 120)].filter(Boolean).join(' '),
  );
  if (!businessHints) return null;
  if (
    /(da aprire|da costituire|costituend|nuova impresa|startup|avviare|aprire|avvio attivita|apertura attivita|attivita imprenditorial|iniziativa imprenditorial|autoimpiego|lavoro autonomo|libero professionista)/.test(
      businessHints,
    )
  ) {
    return false;
  }
  if (/(gia attiva|già attiva|esistente|impresa attiva|azienda attiva)/.test(businessHints)) {
    return true;
  }
  return null;
}

function isSouthYouthStartupProfile(args: {
  businessExists: boolean | null;
  region: string | null;
  age: number | null;
  ageBand?: 'under35' | 'over35' | null;
  employmentStatus: string | null;
}) {
  const { businessExists, region, age, ageBand, employmentStatus } = args;
  if (businessExists !== false) return false;
  if (!region || !SOUTH_REGION_SET.has(region)) return false;
  const youthByAge = age !== null && age >= 18 && age <= 35;
  const youthByBand = ageBand === 'under35';
  if (!youthByAge && !youthByBand) return false;
  const employmentNorm = normalizeForMatch(employmentStatus ?? '');
  return /(disoccupat|inoccupat|neet|working poor|senza lavoro|non occupat)/.test(employmentNorm);
}

type BusinessStageMatch = { ok: boolean; score: number; matched: boolean; strict: boolean };

function matchBusinessStage(
  businessExists: boolean | null,
  doc: IncentiviDoc,
): BusinessStageMatch {
  if (businessExists === null) return { ok: true, score: 0, matched: false, strict: false };

  const text = normalizeForMatch(
    [
      doc.title,
      doc.description,
      ...asStringArray(doc.beneficiaries),
      ...asStringArray(doc.purposes),
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (!text) return { ok: true, score: 0, matched: false, strict: false };

  const assessmentServiceOnly =
    /(first assessment|first assesment|post assessment|post assesment|assessment|assesment|roadmap digitale|diagnosi digitale|maturita digitale|check up digitale|polo di innovazione digitale|innovation hub)/.test(
      text,
    ) && !/(da costituire|costituend|nuova impresa|aspiranti imprenditori|persone fisiche che intendono costituire)/.test(text);
  if (!businessExists && assessmentServiceOnly) {
    return { ok: false, score: 0, matched: false, strict: true };
  }

  const hasNewBusinessSignals =
    /(da costituire|costituend|nuova impresa|start up|startup|aspiranti imprenditori|persone fisiche che intendono costituire|autoimpiego|lavoro autonomo|avvio di nuove)/.test(
      text,
    );
  const hasExistingBusinessSignals =
    /(gia costituite|già costituite|gia attive|già attive|imprese attive|azienda gia attiva|aziende gia attive|sede operativa attiva|iscritte al registro delle imprese|almeno due bilanci approvati|operanti nel comune|operanti nel territorio|nuova unita locale|nuovo punto vendita|imprese lombarde che costituiscono un proprio museo)/.test(
      text,
    ) && !/(persone fisiche che intendono costituire|aspiranti imprenditori|da costituire|costituend)/.test(text);
  const supportsMixedBusinessStage = hasNewBusinessSignals && hasExistingBusinessSignals;
  const newBusinessOnly = hasNewBusinessSignals && !hasExistingBusinessSignals;
  const existingBusinessOnly = hasExistingBusinessSignals && !hasNewBusinessSignals;

  if (!businessExists && existingBusinessOnly) {
    return { ok: false, score: 0, matched: false, strict: true };
  }
  if (businessExists && newBusinessOnly) {
    return { ok: false, score: 0, matched: false, strict: true };
  }

  if (supportsMixedBusinessStage) {
    return { ok: true, score: 0.04, matched: true, strict: false };
  }

  if (!businessExists && newBusinessOnly) return { ok: true, score: 0.08, matched: true, strict: true };
  if (businessExists && existingBusinessOnly) return { ok: true, score: 0.08, matched: true, strict: true };

  return { ok: true, score: 0, matched: false, strict: false };
}

function classifyAuthorityPriority(authorityName: string | null | undefined): { boost: number; trusted: boolean } {
  const authority = normalizeForMatch(authorityName ?? '');
  if (!authority) return { boost: 0, trusted: false };

  if (authority.includes('invitalia')) return { boost: 0.16, trusted: true };
  if (authority.includes('fesr') || authority.includes('fse') || authority.includes('fse ')) return { boost: 0.13, trusted: true };
  if (authority.includes('camera di commercio') || authority.includes('cciaa') || authority.includes('unioncamere')) {
    return { boost: 0.14, trusted: true };
  }
  if (authority.includes('regione') || authority.includes('provincia autonoma')) return { boost: 0.12, trusted: true };
  if (authority.includes('ministero') || authority.includes('agenzia delle entrate')) return { boost: 0.1, trusted: true };
  if (authority.includes('comune') || authority.includes('citta metropolitana') || authority.includes('provincia')) {
    return { boost: 0.05, trusted: true };
  }
  if (authority.includes('universita') || authority.includes('politecnico')) return { boost: -0.06, trusted: false };
  return { boost: 0, trusted: false };
}

type DemographicMatch = { ok: boolean; score: number; matched: boolean; strict: boolean };

function matchDemographicConstraints(args: {
  doc: IncentiviDoc;
  rawProfile: Record<string, unknown>;
  age: number | null;
  ageBand?: 'under35' | 'over35' | null;
  employmentStatus: string | null;
}): DemographicMatch {
  const { doc, rawProfile, age, ageBand = null, employmentStatus } = args;
  const text = normalizeForMatch(
    [
      doc.title,
      doc.description,
      ...asStringArray(doc.beneficiaries),
      ...asStringArray(doc.purposes),
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (!text) return { ok: true, score: 0, matched: false, strict: false };

  const genderNorm = normalizeForMatch(
    [
      cleanString(rawProfile.gender, 40),
      cleanString(rawProfile.genderIdentity, 40),
      cleanString(rawProfile.founderGender, 40),
      cleanString(rawProfile.activityType, 120),
      cleanString(rawProfile.legalForm, 120),
      cleanString(rawProfile.fundingGoal, 220),
    ]
      .filter(Boolean)
      .join(' '),
  );
  const isFemale = /(femmin|donna|female|woman)/.test(genderNorm);
  const employmentNorm = normalizeForMatch(employmentStatus ?? '');

  const requiresFemale = /(impresa femminile|imprenditoria femminile|donne di qualsiasi eta|femminile)/.test(text);
  const requiresYoung = /(under 35|18 e 35|18 ai 35|18-35|18 35|giovanil|giovani)/.test(text);
  const requiresDisoccupato = /(disoccupat|inoccupat|neet|working poor|senza lavoro|non occupat)/.test(text);

  const youngSignal = ageBand === 'under35' || (age !== null && age >= 18 && age <= 35);
  const ageOk = requiresYoung ? youngSignal : true;
  const genderOk = requiresFemale ? isFemale : true;
  const employmentOk = requiresDisoccupato
    ? /(disoccupat|inoccupat|neet|senza lavoro|non occupat|working poor)/.test(employmentNorm)
    : true;

  if ((requiresFemale || requiresYoung) && !(genderOk || ageOk)) {
    return { ok: false, score: 0, matched: false, strict: true };
  }
  if (!employmentOk) return { ok: false, score: 0, matched: false, strict: true };

  const matched = (requiresFemale && genderOk) || (requiresYoung && ageOk) || (requiresDisoccupato && employmentOk);
  return { ok: true, score: matched ? 0.08 : 0, matched, strict: requiresFemale || requiresYoung || requiresDisoccupato };
}

function matchGoalIntent(fundingGoal: string | null, doc: IncentiviDoc): { ok: boolean; score: number; matched: boolean; strict: boolean } {
  if (!fundingGoal) return { ok: true, score: 0, matched: false, strict: false };

  const goalNorm = normalizeForMatch(fundingGoal);
  if (!goalNorm) return { ok: true, score: 0, matched: false, strict: false };

  const intentTokens = new Set<string>();
  const add = (values: string[]) => values.map(normalizeForMatch).forEach((value) => intentTokens.add(value));

  if (
    /(avvia|aprire|nuova impresa|startup|start up|autoimpiego|lavoro autonomo|libero professionista|avvio attivita|apertura attivita|attivita imprenditorial|iniziativa imprenditorial)/.test(
      goalNorm,
    )
  ) {
    add(['nuova impresa', 'startup', 'start up', 'autoimpiego', 'lavoro autonomo', 'aspiranti imprenditori', 'imprenditoria']);
    add(['attivita imprenditoriale', 'iniziativa imprenditoriale', 'avvio attivita', 'apertura attivita']);
  }
  if (/(donna|donne|femmin|imprenditoria femminile|impresa femminile)/.test(goalNorm)) {
    add(['imprenditoria femminile', 'impresa femminile', 'donna', 'donne', 'femminile']);
  }
  if (/(museo|musei|allestimento|espositivo|collezion|patrimonio cultur)/.test(goalNorm)) {
    add([
      'museo',
      'musei',
      'museale',
      'museo d impresa',
      'musei d impresa',
      'allestimento espositivo',
      'allestimenti espositivi',
      'spazi espositivi',
      'collezione museale',
    ]);
  }
  if (/(digital|digitale|digitalizzazione|software|ict|ecommerce|e commerce|cyber|industria 4|4 0)/.test(goalNorm)) {
    add(['digitalizzazione', 'digitale', 'software', 'ict', 'cloud', 'ecommerce', 'industria 4 0']);
  }
  if (/(mercati globali|digital export|marketing digitale|marketplace|sito multilingua|mercati esteri)/.test(goalNorm)) {
    add([
      'digital export',
      'mercati globali',
      'mercati esteri',
      'marketing digitale',
      'marketplace',
      'sito multilingua',
      'strategie digitali',
    ]);
  }
  if (/(assessment|audit|maturita digitale|maturita tecnologica|check up digitale|diagnosi digitale|roadmap digitale|orientamento digitale)/.test(goalNorm)) {
    add([
      'assessment',
      'first assessment',
      'post assessment',
      'assessment digitale',
      'audit digitale',
      'maturita digitale',
      'check up digitale',
      'diagnosi digitale',
      'orientamento digitale',
      'roadmap digitale',
      'cybersecurity',
      'cyber',
    ]);
  }
  if (/(assunzion|occupaz|personale|dipendent|lavorator)/.test(goalNorm)) {
    add(['assunzioni', 'occupazione', 'lavoratori', 'personale']);
  }
  if (/(macchinari|attrezzature|beni strumentali|impianti)/.test(goalNorm)) {
    add(['macchinari', 'attrezzature', 'beni strumentali', 'impianti']);
  }
  if (/(efficientamento energetic|risparmio energetic|transizione energetic|fotovolta|solare|autoconsum|rinnovabil|emission|ricicl|mobilita sostenibile)/.test(goalNorm)) {
    add([
      'efficientamento energetico',
      'risparmio energetico',
      'transizione energetica',
      'fotovoltaico',
      'solare',
      'autoconsumo',
      'energie rinnovabili',
      'riduzione emissioni',
      'riciclo',
      'mobilita sostenibile',
    ]);
  }
  if (/(alimentari|generi di prima necessita|negozio alimentare|minimarket|commercio al dettaglio)/.test(goalNorm)) {
    add([
      'alimentari',
      'generi di prima necessita',
      'negozio alimentare',
      'minimarket',
      'commercio al dettaglio',
      'prodotti alimentari',
    ]);
  }
  if (/(piccolo comune|piccoli comuni|frazione|frazioni|borgo|paese)/.test(goalNorm)) {
    add(['piccolo comune', 'piccoli comuni', 'frazione', 'frazioni', 'borgo', 'paese']);
  }
  if (/(fiera|export|internazionalizzazione|mercati esteri)/.test(goalNorm)) {
    add(['fiera', 'internazionalizzazione', 'export', 'mercati esteri']);
  }
  if (/(smau|parigi|milano|londra|buyer|stand|b2b)/.test(goalNorm)) {
    add(['smau', 'parigi', 'milano', 'londra', 'buyer', 'stand espositivo', 'b2b']);
  }

  if (!intentTokens.size) return { ok: true, score: 0, matched: false, strict: false };

  const docPrimaryText = normalizeForMatch(
    [
      doc.title,
      doc.institutionalLink,
      doc.url,
      ...asStringArray(doc.purposes),
      ...asStringArray(doc.sectors),
      ...asStringArray(doc.beneficiaries),
    ]
      .filter(Boolean)
      .join(' '),
  );
  const docText = normalizeForMatch(
    [
      doc.title,
      doc.description,
      doc.institutionalLink,
      doc.url,
      ...asStringArray(doc.purposes),
      ...asStringArray(doc.sectors),
      ...asStringArray(doc.supportForm),
      ...asStringArray(doc.beneficiaries),
    ]
      .filter(Boolean)
      .join(' '),
  );
  const exactTopicTokens = expandMorphologicalVariants(buildHighSignalGoalPhrases(goalNorm));
  const exactTopicMatched = exactTopicTokens.length > 0 ? anyTextMatch(docPrimaryText, exactTopicTokens) : false;
  const mustMatchSpecificTokens: string[] = [];
  const citySpecificTokens: string[] = [];
  if (goalNorm.includes('smau')) mustMatchSpecificTokens.push('smau');
  if (goalNorm.includes('parigi')) {
    mustMatchSpecificTokens.push('parigi');
    citySpecificTokens.push('parigi');
  }
  if (goalNorm.includes('milano')) {
    mustMatchSpecificTokens.push('milano');
    citySpecificTokens.push('milano');
  }
  if (goalNorm.includes('londra')) {
    mustMatchSpecificTokens.push('londra');
    citySpecificTokens.push('londra');
  }
  const genericSmauProgram =
    goalNorm.includes('smau') &&
    anyTextMatch(docPrimaryText, ['smau']) &&
    /(fiere smau|fiera smau|partecipazione delle imprese.*smau|partecipazione.*smau|smau international)/.test(docText) &&
    !/(parigi|milano|londra|stoccolma|new york|garda)/.test(docPrimaryText);
  const hasSmauMatch = !goalNorm.includes('smau') || anyTextMatch(docPrimaryText, ['smau']);
  const hasCityMatch =
    citySpecificTokens.length === 0 || anyTextMatch(docPrimaryText, citySpecificTokens) || genericSmauProgram;
  const needsItalyFairSpecificMatch = /(fiera|fiere|stand)/.test(goalNorm) && /\bitalia\b|\bitaliano\b|\bitaliane\b/.test(goalNorm);
  const hasItalyFairSpecificMatch =
    !needsItalyFairSpecificMatch || anyTextMatch(docPrimaryText, ['italia', 'italiano', 'italiane']);
  if (!hasSmauMatch || !hasCityMatch) {
    return { ok: false, score: 0, matched: false, strict: true };
  }
  if (!hasItalyFairSpecificMatch) {
    return { ok: false, score: 0, matched: false, strict: true };
  }
  const assessmentSpecificTokens = expandMorphologicalVariants([
    'assessment',
    'assesment',
    'first assessment',
    'first assesment',
    'post assessment',
    'post assesment',
    'audit digitale',
    'maturita digitale',
    'check up digitale',
    'diagnosi digitale',
    'roadmap digitale',
    'orientamento digitale',
  ]);
  const needsAssessmentSpecificMatch = /(assessment|assesment|audit|maturita digitale|check up digitale|diagnosi digitale|roadmap digitale|orientamento digitale)/.test(
    goalNorm,
  );
  if (needsAssessmentSpecificMatch && !anyTextMatch(docText, assessmentSpecificTokens)) {
    return { ok: false, score: 0, matched: false, strict: true };
  }
  if (exactTopicTokens.length > 0 && !exactTopicMatched) {
    return { ok: false, score: 0, matched: false, strict: true };
  }
  const tokens = expandMorphologicalVariants([...intentTokens]);
  const matched = anyTextMatch(docText, tokens);

  if (!matched) return { ok: false, score: 0, matched: false, strict: true };
  return { ok: true, score: exactTopicMatched ? 0.16 : 0.12, matched: true, strict: true };
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
  channel: ScanChannel;
  strictness: ScanStrictness;
  strictContext: ChatStrictContext;
}): Promise<{ items: Candidate[]; nearMisses: Candidate[]; strictMatchesFound: boolean }> {
  const { scannerProfile, limit, region, contributionPreference, channel, strictness, strictContext } = args;

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
  const localDocsLookup = await getLocalDocsLookup().catch(() => null);

  const sanitizeLatestItem = (item: ScannerLatestItem): ScannerLatestItem => {
    const localDoc = localDocsLookup ? getLocalDocByGrantId(item.grantId, localDocsLookup) : null;
    const sanitizedEconomic = sanitizeEconomicOfferForResult({
      grantId: item.grantId,
      aidForm: item.aidForm,
      economicOffer: item.economicOffer,
      localDoc,
    });
    const budgetFromEconomic = parseMoneyValue(sanitizedEconomic?.costMax) ?? parseMoneyValue(sanitizedEconomic?.grantMax);
    const normalizedAidIntensity =
      typeof sanitizedEconomic?.displayCoverageLabel === 'string' && sanitizedEconomic.displayCoverageLabel.trim()
        ? sanitizedEconomic.displayCoverageLabel.trim()
        : item.aidIntensity;
    return {
      ...item,
      aidIntensity: normalizedAidIntensity,
      economicOffer: sanitizedEconomic,
      budgetTotal: budgetFromEconomic ?? item.budgetTotal,
    };
  };

  const latestItems = (latest.items ?? []).map(sanitizeLatestItem);
  const latestNearMisses = (latest.nearMisses ?? []).map(sanitizeLatestItem);

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

  const mappedAllRaw: Candidate[] = latestItems
    .filter((item) => item.hardStatus !== 'not_eligible')
    .map((item) => toCandidate(item))
    .filter((entry): entry is Candidate => Boolean(entry));
  const mappedAll = mappedAllRaw.map((entry) => ({ ...entry, result: applyStrategicResultOverrides(entry.result) }));

  const scannerRegionCanonical = region ? canonicalizeRegion(region) : null;
  const southYouthStartupProfile = isSouthYouthStartupProfile({
    businessExists: scannerProfile.businessExists,
    region: scannerRegionCanonical,
    age: scannerProfile.age ?? null,
    employmentStatus: scannerProfile.employmentStatus ?? null,
  });
  const profilePriorityRules = southYouthStartupPriorityRules(southYouthStartupProfile);
  const pinnedStrategicTitles = southYouthStartupProfile ? ['resto al sud', 'fusese', 'oltre nuove imprese a tasso zero'] : [];

  const chatStrictEnabled = channel === 'chat' && strictness === 'high';
  const strictFiltered = chatStrictEnabled ? applyChatStrictCandidateFilter(mappedAll, strictContext) : mappedAll;
  const targetAmount = scannerProfile.targetAmount ?? scannerProfile.plannedInvestment ?? null;
  const precisionFiltered = chatStrictEnabled
    ? applyChatPrecisionPolicy({
        candidates: strictFiltered,
        context: strictContext,
        contributionPreference,
        targetAmount,
        pinnedStrategicTitles,
        profilePriorityRules,
      })
    : strictFiltered;
  const mappedPoolBase = chatStrictEnabled ? (precisionFiltered.length > 0 ? precisionFiltered : strictFiltered) : strictFiltered;
  const strategicRecallPool = southYouthStartupProfile
    ? mappedAll.filter(
        (entry) =>
          entry.result.hardStatus !== 'not_eligible' &&
          (isRestoResult(entry.result) || isFuseseResult(entry.result) || isOnResult(entry.result)),
      )
    : [];
  const mappedOrdered = southYouthStartupProfile
    ? mergeStrategicRecallCandidates({
        base: mappedPoolBase,
        recall: strategicRecallPool,
        pinnedStrategicTitles,
        profilePriorityRules,
      })
    : dedupeCandidatesByTitle(sortCandidatesForDisplay(mappedPoolBase, pinnedStrategicTitles, profilePriorityRules));
  const mapped = mappedOrdered.slice(0, limit);

  const nearMissesRaw: Candidate[] = latestNearMisses
    .filter((item) => item.hardStatus === 'not_eligible')
    .map((item) => toCandidate(item, true))
    .filter((entry): entry is Candidate => Boolean(entry))
    .map((entry) => ({ ...entry, result: applyStrategicResultOverrides(entry.result) }));
  const nearMisses = chatStrictEnabled
    ? filterNearMissesForChat({
        nearMisses: nearMissesRaw,
        context: strictContext,
        contributionPreference,
        targetAmount,
        limit,
        pinnedStrategicTitles,
        profilePriorityRules,
      })
    : nearMissesRaw.slice(0, Math.min(limit, 6));

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
  const economic = resolveDocEconomicData(doc);

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
  if (economic.economicOffer && typeof economic.economicOffer.displayAmountLabel === 'string' && economic.economicOffer.displayAmountLabel.trim()) {
    req.push(`Importo agevolazione: ${economic.economicOffer.displayAmountLabel.trim()}`);
  }
  if (economic.economicOffer && typeof economic.economicOffer.displayCoverageLabel === 'string' && economic.economicOffer.displayCoverageLabel.trim()) {
    req.push(`% copertura: ${economic.economicOffer.displayCoverageLabel.trim()}`);
  }
  if (
    economic.economicOffer &&
    typeof economic.economicOffer.displayProjectAmountLabel === 'string' &&
    economic.economicOffer.displayProjectAmountLabel.trim()
  ) {
    req.push(`Spesa progetto ammissibile: ${economic.economicOffer.displayProjectAmountLabel.trim()}`);
  }
  if (purposes.length) req.push(`Finalita: ${purposes.slice(0, 2).join(', ')}`);
  if (sectors.length) req.push(`Settore: ${sectors.slice(0, 2).join(', ')}`);

  // Fallback: keep list concise
  return req.slice(0, 6);
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

function applyStrategicDocOverrides(
  doc: IncentiviDoc,
  context?: {
    userRegionCanonical: string | null;
    businessExists: boolean | null;
  },
): IncentiviDoc {
  const titleNorm = normalizeForMatch(String(doc.title ?? ''));
  const urlNorm = normalizeForMatch(`${String(doc.institutionalLink ?? '')} ${String(doc.url ?? '')}`);
  const hints = `${titleNorm} ${urlNorm}`.trim();
  const mergeList = (...values: unknown[]) => Array.from(new Set(values.flatMap((value) => asStringArray(value))));
  const userRegionCanonical = context?.userRegionCanonical ?? null;
  const businessExists = context?.businessExists ?? null;

  if (
    hints.includes('autoimpiego centro nord') ||
    hints.includes('autoimpiego centro-nord') ||
    hints.includes('autoimpiego per il centro nord')
  ) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Invitalia',
      description:
        typeof doc.description === 'string' && doc.description.trim()
          ? doc.description
          : "Incentivo per under 35 inattivi, inoccupati, disoccupati, disoccupati GOL e working poor che vogliono avviare una nuova attività nel Centro-Nord.",
      regions: mergeList(doc.regions, [
        'Piemonte',
        "Valle d'Aosta",
        'Liguria',
        'Lombardia',
        'Veneto',
        'Friuli-Venezia Giulia',
        'Trentino-Alto Adige',
        'Emilia-Romagna',
        'Toscana',
        'Lazio',
        'Umbria',
        'Marche',
      ]),
      sectors: mergeList(doc.sectors, ['Turismo', 'Commercio', 'Servizi', 'ICT', 'Digitale', 'Artigianato', 'Cultura', 'Ristorazione', 'Manifattura']),
      beneficiaries: mergeList(doc.beneficiaries, [
        'Startup',
        'Aspiranti imprenditori',
        'Libero professionista',
        'Lavoro autonomo',
        'Under 35',
        'Disoccupati',
        'Inoccupati',
        'Working poor',
      ]),
      purposes: mergeList(doc.purposes, ['Start up/Sviluppo d impresa', 'Imprenditoria giovanile', 'Autoimpiego', 'Sostegno investimenti']),
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto', 'Voucher']),
      costMax: 200_000,
      displayAmountLabel: 'Voucher fino a € 30.000 - € 40.000',
      displayProjectAmountLabel: 'Fino a € 200.000',
      displayCoverageLabel: '60% - 100%',
      coverageMinPercent: 60,
      coverageMaxPercent: 100,
      ateco: mergeList(doc.ateco, ['Tutti i settori economici ammissibili tranne agricoltura, pesca e acquacoltura']),
      institutionalLink: doc.institutionalLink || 'https://www.invitalia.it/incentivi-e-strumenti/autoimpiego-centro-nord',
      url: doc.url || '/incentivi-e-strumenti/autoimpiego-centro-nord',
    };
  }

  if (
    hints.includes('resto al sud') ||
    hints.includes('resto al sud 2 0') ||
    hints.includes('resto al sud 20') ||
    hints.includes('resto al sud 2.0')
  ) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Invitalia',
      description:
        typeof doc.description === 'string' && doc.description.trim()
          ? doc.description
          : "Incentivo per l'avvio di nuove iniziative imprenditoriali, libero-professionali e di lavoro autonomo nel Mezzogiorno.",
      regions: mergeList(
        doc.regions,
        ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Molise', 'Puglia', 'Sardegna', 'Sicilia'],
      ),
      sectors: mergeList(doc.sectors, ['Turismo', 'Commercio', 'Servizi', 'ICT', 'Digitale', 'Artigianato', 'Cultura', 'Ristorazione', 'Manifattura']),
      beneficiaries: mergeList(doc.beneficiaries, ['Startup', 'Impresa', 'Aspiranti imprenditori', 'Libero professionista', 'Lavoro autonomo']),
      purposes: mergeList(doc.purposes, ['Start up/Sviluppo d impresa', 'Imprenditoria giovanile', 'Autoimpiego', 'Sostegno investimenti']),
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa']),
      costMin: 10_000,
      costMax: 200_000,
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto', 'Voucher']),
      displayProjectAmountLabel: 'Da € 10.000 a € 200.000',
      displayCoverageLabel: '70% - 100%',
      coverageMinPercent: 70,
      coverageMaxPercent: 100,
      ateco: mergeList(doc.ateco, ['Tutti i settori economici ammissibili tranne agricoltura, pesca e acquacoltura']),
      institutionalLink: doc.institutionalLink || 'https://www.invitalia.it/incentivi-e-strumenti/resto-al-sud-20',
      url: doc.url || '/incentivi-e-strumenti/resto-al-sud-20',
    };
  }

  if (hints.includes('fusese') || hints.includes('fund for self employment')) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Regione Calabria',
      description:
        typeof doc.description === 'string' && doc.description.trim()
          ? doc.description
          : "Programma europeo per l'autoimpiego e l'avvio di nuove attivita imprenditoriali nel Mezzogiorno.",
      regions: mergeList(doc.regions, ['Calabria', 'Campania', 'Puglia', 'Sicilia', 'Basilicata', 'Sardegna', 'Molise', 'Abruzzo']),
      sectors: mergeList(doc.sectors, ['Turismo', 'Commercio', 'Servizi', 'ICT', 'Digitale', 'Artigianato', 'Cultura', 'Ristorazione', 'Manifattura']),
      beneficiaries: mergeList(doc.beneficiaries, ['Startup', 'Aspiranti imprenditori', 'Disoccupati', 'Inoccupati', 'Under 35', 'Lavoro autonomo']),
      purposes: mergeList(doc.purposes, ['Start up/Sviluppo d impresa', 'Autoimpiego', 'Imprenditoria giovanile']),
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      ateco: mergeList(doc.ateco, ['Tutti i settori economici ammissibili']),
      url: doc.url || '/fusese',
    };
  }

  if (hints.includes('smart start italia') || hints.includes('smartstart italia') || hints.includes('smart start')) {
    const isSouth = userRegionCanonical ? SOUTH_REGION_SET.has(userRegionCanonical) : false;
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Invitalia',
      description:
        typeof doc.description === 'string' && doc.description.trim()
          ? doc.description
          : "Incentivo per startup innovative e nuove imprese ad alto contenuto tecnologico.",
      regions: mergeList(doc.regions, ['Italia']),
      sectors: mergeList(doc.sectors, ['ICT', 'Digitale', 'Innovazione', 'Ricerca', 'Servizi', 'Manifattura']),
      beneficiaries: mergeList(doc.beneficiaries, ['Startup innovativa', 'Nuova impresa', 'Impresa']),
      purposes: mergeList(doc.purposes, ['Innovazione e ricerca', 'Start up/Sviluppo d impresa', 'Digitalizzazione']),
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa']),
      costMin: 100_000,
      costMax: 1_500_000,
      supportForm: mergeList(doc.supportForm, ['Finanziamento agevolato', 'Contributo/Fondo perduto']),
      displayProjectAmountLabel: 'Da € 100.000 a € 1.500.000',
      displayCoverageLabel: isSouth ? '30%' : '0%',
      coverageMinPercent: isSouth ? 30 : 0,
      coverageMaxPercent: isSouth ? 30 : 0,
      url: doc.url || '/it/catalogo/smartstart-italia-sostegno-alle-startup-innovative',
    };
  }

  if (hints.includes('pidnext') || hints.includes('polo di innovazione digitale pidnext')) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Ministero delle Imprese e del Made in Italy',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'La misura si rivolge a micro, piccole e medie imprese gia attive e iscritte al registro delle imprese.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, [
        'Piemonte',
        'Lombardia',
        "Valle d'Aosta",
        'Liguria',
        'Abruzzo',
        'Molise',
        'Basilicata',
        'Calabria',
        'Campania',
        'Puglia',
        'Sicilia',
        'Trentino-Alto Adige',
        'Veneto',
        'Sardegna',
        'Toscana',
        'Friuli-Venezia Giulia',
        'Emilia-Romagna',
        'Umbria',
        'Marche',
        'Lazio',
      ]),
      sectors: mergeList(doc.sectors, ['Commercio', 'Turismo', 'Servizi', 'ICT', 'Digitale', 'Artigianato', 'Manifattura']),
      beneficiaries: mergeList(doc.beneficiaries, ['Impresa', 'PMI', 'Azienda gia attiva', 'Impresa iscritta al registro imprese']),
      purposes: ['Digitalizzazione', 'Innovazione e ricerca'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMax: 2_883,
      grantMax: 2_883,
      displayAmountLabel: 'Fino a € 2.883',
      displayProjectAmountLabel: 'Fino a € 2.883',
      displayCoverageLabel: '100%',
      coverageMinPercent: 100,
      coverageMaxPercent: 100,
      url: doc.url || '/it/catalogo/polo-di-innovazione-digitale-pidnext-servizi-di-first-e-post-assessment',
    };
  }

  if (hints.includes('nuova sabatini') || hints.includes('beni strumentali sabatini') || hints.includes('beni strumentali')) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Ministero delle Imprese e del Made in Italy',
      description:
        typeof doc.description === 'string' && doc.description.trim()
          ? doc.description
          : 'Misura nazionale per PMI già attive che investono in macchinari, beni strumentali, software e tecnologie 4.0.',
      regions: mergeList(doc.regions, ['Italia']),
      sectors: mergeList(doc.sectors, ['Manifattura', 'Digitale', 'ICT', 'Commercio', 'Servizi']),
      beneficiaries: mergeList(doc.beneficiaries, ['PMI', 'Impresa', 'Azienda già attiva']),
      purposes: mergeList(doc.purposes, ['Digitalizzazione', 'Sostegno investimenti', 'Industria 4 0', 'Beni strumentali']),
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa']),
      supportForm: mergeList(doc.supportForm, ['Finanziamento agevolato', 'Contributo']),
      costMin: 20_000,
      costMax: 4_000_000,
      grantMin: 550,
      grantMax: 143_000,
      coverageMinPercent: 2.75,
      coverageMaxPercent: 3.575,
      displayAmountLabel: 'Contributo calcolato su finanziamenti da € 20.000 a € 4.000.000',
      displayProjectAmountLabel: 'Da € 20.000 a € 4.000.000',
      displayCoverageLabel: '0%',
      url: doc.url || '/it/incentivi/nuova-sabatini',
    };
  }

  if (
    hints.includes('fiere smau') ||
    hints.includes('smau milano 2026') ||
    hints.includes('smau parigi 2026') ||
    hints.includes('partecipazione delle imprese alla fiera smau') ||
    hints.includes('partecipazione delle imprese della regione marche alle fiere smau')
  ) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Regione Marche',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'Il bando si rivolge a startup e PMI innovative marchigiane gia costituite che partecipano a SMAU Milano 2026.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Marche']),
      sectors: mergeList(doc.sectors, ['ICT', 'Digitale', 'Innovazione', 'Servizi']),
      beneficiaries: mergeList(doc.beneficiaries, ['Startup innovativa', 'PMI innovativa', 'Impresa', 'Impresa gia attiva']),
      purposes: ['Internazionalizzazione', 'Innovazione e ricerca'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMax: 5_000,
      grantMax: 5_000,
      displayAmountLabel: 'Fino a € 5.000',
      displayProjectAmountLabel: 'Fino a € 5.000',
      displayCoverageLabel: '100%',
      coverageMinPercent: 100,
      coverageMaxPercent: 100,
      openDate: doc.openDate || '2026-02-20T00:00:00',
      closeDate: doc.closeDate || '2026-04-16T00:00:00',
      url: doc.url || '/it/catalogo/pr-marche-fesr-20212027-intervento-1341-partecipazione-delle-imprese-alla-fiera-smau',
    };
  }

  if (
    (hints.includes('cosenza') && hints.includes('creazione nuove imprese')) ||
    (hints.includes('bando creazione nuove imprese') && hints.includes('iv edizione'))
  ) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Camera di Commercio, Industria, Artigianato e Agricoltura di Cosenza',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        "Il bando copre in parte i costi di avvio per aspiranti imprenditori e nuove imprese nella provincia di Cosenza.",
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Calabria']),
      sectors: mergeList(doc.sectors, ['Commercio', 'Servizi', 'Turismo', 'Artigianato', 'ICT', 'Manifattura']),
      beneficiaries: mergeList(doc.beneficiaries, ['Aspiranti imprenditori', 'Nuova impresa']),
      purposes: mergeList(doc.purposes, ['Start up/Sviluppo d impresa']),
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 4_000,
      costMax: 20_000,
      grantMin: 2_000,
      grantMax: 10_000,
      displayAmountLabel: 'Da € 2.000 a € 10.000',
      displayProjectAmountLabel: 'Da € 4.000 a € 20.000',
      displayCoverageLabel: '50% - 60%',
      coverageMinPercent: 50,
      coverageMaxPercent: 60,
      openDate: doc.openDate || '2026-03-04T00:00:00',
      closeDate: doc.closeDate || '2026-09-30T00:00:00',
      url: doc.url || '/it/catalogo/cciaa-cosenza-bando-creazione-nuove-imprese-iv-edizione',
    };
  }

  if (
    hints.includes('voucher digitali i4 0') ||
    hints.includes('voucher digitali i40') ||
    hints.includes('pid avanzato') ||
    (hints.includes('cosenza') && hints.includes('digital'))
  ) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Camera di Commercio, Industria, Artigianato e Agricoltura di Cosenza',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'Il bando si rivolge a micro, piccole e medie imprese gia attive della provincia di Cosenza con progetti di digitalizzazione.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Calabria']),
      sectors: mergeList(doc.sectors, ['Commercio', 'Servizi', 'ICT', 'Digitale', 'Manifattura', 'Turismo', 'Artigianato']),
      beneficiaries: mergeList(doc.beneficiaries, ['Impresa', 'PMI', 'Azienda gia attiva']),
      purposes: ['Digitalizzazione', 'Innovazione e ricerca'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 4_000,
      costMax: 20_000,
      grantMin: 2_000,
      grantMax: 10_000,
      displayAmountLabel: 'Da € 2.000 a € 10.000',
      displayProjectAmountLabel: 'Da € 4.000 a € 20.000',
      displayCoverageLabel: '50% - 70%',
      coverageMinPercent: 50,
      coverageMaxPercent: 70,
      openDate: doc.openDate || '2026-03-04T00:00:00',
      closeDate: doc.closeDate || '2026-09-30T00:00:00',
      url: doc.url || '/it/catalogo/cciaa-cosenza-bando-voucher-digitali-i40-anno-2026-xii-edizione-pid-avanzato',
    };
  }

  if (hints.includes('nuova impresa') && hints.includes('piccoli comuni') && hints.includes('frazioni')) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Regione Lombardia',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'Il bando si rivolge a nuove attività o nuove unità locali di commercio al dettaglio alimentare e di generi di prima necessità in piccoli comuni o frazioni lombarde.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Lombardia']),
      sectors: mergeList(doc.sectors, ['Commercio', 'Agroalimentare', 'Ristorazione']),
      beneficiaries: mergeList(doc.beneficiaries, ['Nuova impresa', 'Impresa', 'Azienda gia attiva']),
      purposes: ['Start up/Sviluppo d impresa', 'Commercio al dettaglio alimentare'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa', 'Grande Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 3_000,
      costMax: 50_000,
      grantMin: 2_400,
      grantMax: 40_000,
      displayAmountLabel: 'Da € 2.400 a € 40.000',
      displayProjectAmountLabel: 'Da € 3.000 a € 50.000',
      displayCoverageLabel: '80%',
      coverageMinPercent: 80,
      coverageMaxPercent: 80,
      openDate: doc.openDate || '2026-01-28T00:00:00',
      closeDate: doc.closeDate || '2026-11-12T00:00:00',
      institutionalLink:
        doc.institutionalLink ||
        'https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/attivita-produttive-commercio/sostegno-avvio-impresa/nuova-impresa-piccoli-comuni-frazioni-2026-RLO12025051423',
      url: doc.url || '/it/catalogo/bando-nuova-impresa-piccoli-comuni-e-frazioni-2026',
    };
  }

  if (hints.includes('bando connessi') || (hints.includes('strategie digitali') && hints.includes('mercati globali'))) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Camera di Commercio Metropolitana di Milano-Monza-Brianza-Lodi',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'Il bando si rivolge a MPMI gia attive delle province di Milano, Monza Brianza e Lodi con strategie di digital export e marketing digitale per i mercati esteri.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Lombardia']),
      sectors: mergeList(doc.sectors, ['Commercio', 'ICT', 'Digitale', 'Turismo', 'Ristorazione', 'Artigianato', 'Altri servizi']),
      beneficiaries: mergeList(doc.beneficiaries, ['Impresa', 'PMI', 'Azienda gia attiva']),
      purposes: ['Internazionalizzazione', 'Digitalizzazione', 'Digital export'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 4_000,
      costMax: 16_667,
      grantMin: 2_400,
      grantMax: 10_000,
      displayAmountLabel: 'Da € 2.400 a € 10.000',
      displayProjectAmountLabel: 'Da € 4.000 a € 16.667',
      displayCoverageLabel: '60%',
      coverageMinPercent: 60,
      coverageMaxPercent: 60,
      institutionalLink: doc.institutionalLink || 'https://www.milomb.camcom.it/bando-connessi-2026',
      url: doc.url || '/it/catalogo/bando-connessi-contributi-lo-sviluppo-di-strategie-digitali-i-mercati-globali-2026',
    };
  }

  if ((hints.includes('cosenza') && hints.includes('risparmio energetico')) || hints.includes('sostenibilita e risparmio energetico')) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Camera di Commercio, Industria, Artigianato e Agricoltura di Cosenza',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'Il bando si rivolge a imprese gia attive della provincia di Cosenza con investimenti in efficientamento energetico, riduzione dei consumi, riciclo e mobilita sostenibile.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Calabria']),
      sectors: mergeList(doc.sectors, ['Commercio', 'Turismo', 'Artigianato', 'Agroalimentare', 'ICT', 'Manifattura', 'Servizi', 'Ristorazione']),
      beneficiaries: mergeList(doc.beneficiaries, ['Impresa', 'PMI', 'Azienda gia attiva']),
      purposes: ['Transizione ecologica', 'Efficientamento energetico'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 2_000,
      costMax: 20_000,
      grantMin: 1_000,
      grantMax: 12_000,
      displayAmountLabel: 'Da € 1.000 a € 12.000',
      displayProjectAmountLabel: 'Da € 2.000 a € 20.000',
      displayCoverageLabel: '50% - 60%',
      coverageMinPercent: 50,
      coverageMaxPercent: 60,
      openDate: doc.openDate || '2026-03-04T00:00:00',
      closeDate: doc.closeDate || '2026-09-30T00:00:00',
      institutionalLink:
        doc.institutionalLink || 'https://www.cs.camcom.gov.it/it/content/service/01-bando-sostenibilt%C3%A0-e-risparmio-energetico-ix',
      url: doc.url || '/it/catalogo/cciaa-cosenza-bando-sostenibilita-e-risparmio-energetico-ix-edizione',
    };
  }

  if (hints.includes('cciaa bologna') && (hints.includes('fiere internazionali') || hints.includes('partecipazione a fiere internazionali'))) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Camera di Commercio, Industria, Artigianato e Agricoltura di Bologna',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'Il bando si rivolge a micro, piccole e medie imprese gia attive del territorio bolognese che partecipano a fiere internazionali in Italia.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Emilia-Romagna']),
      sectors: mergeList(doc.sectors, ['Commercio', 'Servizi', 'Turismo', 'Manifattura', 'Artigianato', 'ICT']),
      beneficiaries: mergeList(doc.beneficiaries, ['Impresa', 'PMI', 'Azienda gia attiva']),
      purposes: ['Internazionalizzazione'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa', 'Media Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 3_000,
      costMax: 8_000,
      grantMin: 1_500,
      grantMax: 4_000,
      displayAmountLabel: 'Da € 1.500 a € 4.000',
      displayProjectAmountLabel: 'Da € 3.000 a € 8.000',
      displayCoverageLabel: '50%',
      coverageMinPercent: 50,
      coverageMaxPercent: 50,
      url: doc.url || '/it/catalogo/cciaa-bologna-contributi-la-partecipazione-fiere-internazionali-italia-anno-2026',
    };
  }

  if (hints.includes('consolidamento delle startup innovative') || (hints.includes('regione veneto') && hints.includes('startup innovative'))) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Agenzia veneta per i pagamenti in agricoltura - AVEPA',
      description: [
        typeof doc.description === 'string' && doc.description.trim() ? doc.description.trim() : null,
        'Il bando si rivolge a startup innovative gia costituite con progetti di consolidamento e innovazione in Veneto.',
      ]
        .filter(Boolean)
        .join(' '),
      regions: mergeList(doc.regions, ['Veneto']),
      sectors: mergeList(doc.sectors, ['ICT', 'Digitale', 'Innovazione', 'Servizi', 'Manifattura', 'Ricerca']),
      beneficiaries: mergeList(doc.beneficiaries, ['Startup innovativa', 'Impresa', 'Azienda gia attiva']),
      purposes: ['Innovazione e ricerca', 'Start up/Sviluppo d impresa', 'Digitalizzazione'],
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 50_000,
      costMax: 250_000,
      grantMin: 25_000,
      grantMax: 150_000,
      displayAmountLabel: 'Da € 25.000 a € 150.000',
      displayProjectAmountLabel: 'Da € 50.000 a € 250.000',
      displayCoverageLabel: '50% - 60%',
      coverageMinPercent: 50,
      coverageMaxPercent: 60,
      url: doc.url || '/it/catalogo/regione-veneto-bando-il-consolidamento-delle-startup-innovative',
    };
  }

  if (
    hints.includes('museo di impresa') ||
    hints.includes('musei di impresa') ||
    hints.includes('museo d impresa') ||
    hints.includes('musei d impresa')
  ) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? 'Regione Lombardia',
      description:
        typeof doc.description === 'string' && doc.description.trim()
          ? doc.description
          : "Contributo a fondo perduto per imprese lombarde che realizzano o riqualificano il proprio museo d'impresa.",
      regions: mergeList(doc.regions, ['Lombardia']),
      sectors: mergeList(doc.sectors, ['Cultura', 'Turismo', 'Commercio', 'Servizi']),
      beneficiaries: mergeList(doc.beneficiaries, ['Impresa', 'PMI', 'Azienda già attiva']),
      purposes: mergeList(doc.purposes, [
        'Museo d impresa',
        'Valorizzazione patrimonio industriale',
        'Allestimento spazi espositivi',
        'Promozione e marketing culturale',
      ]),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto']),
      costMin: 10_000,
      costMax: 80_000,
      grantMin: 10_000,
      grantMax: 80_000,
      coverageMinPercent: 100,
      coverageMaxPercent: 100,
      displayAmountLabel: doc.displayAmountLabel ?? 'Da € 10.000 a € 80.000',
      displayProjectAmountLabel: doc.displayProjectAmountLabel ?? 'Da € 10.000 a € 80.000',
      displayCoverageLabel: doc.displayCoverageLabel ?? '100%',
      openDate: doc.openDate || '2026-03-02T00:00:00',
      closeDate: doc.closeDate || '2026-04-24T00:00:00',
      url: doc.url || '/it/catalogo/regione-lombardia-bando-musei-dimpresa-2026',
    };
  }

  if (hints.includes('oltre nuove imprese a tasso zero') || hints.includes('nuove imprese a tasso zero')) {
    return {
      ...doc,
      authorityName: doc.authorityName ?? "Invitalia - Agenzia nazionale per l'attrazione degli investimenti e lo sviluppo d'impresa S.p.A.",
      description:
        typeof doc.description === 'string' && doc.description.trim()
          ? doc.description
          : 'Incentivo per imprese giovanili o femminili costituite da non piu di 60 mesi o da costituire, con progetti fino a 3 milioni di euro.',
      regions: mergeList(doc.regions, ['Italia']),
      sectors: mergeList(doc.sectors, ['Produzione', 'Servizi', 'Commercio', 'Turismo', 'Manifattura', 'Artigianato']),
      beneficiaries: mergeList(doc.beneficiaries, [
        'Impresa giovanile',
        'Impresa femminile',
        'Nuova impresa',
        'Impresa da costituire',
        'Startup',
      ]),
      purposes: mergeList(doc.purposes, ['Start up/Sviluppo d impresa', 'Imprenditoria giovanile', 'Imprenditoria femminile', 'Sostegno investimenti']),
      dimensions: mergeList(doc.dimensions, ['Micro Impresa', 'Piccola Impresa']),
      supportForm: mergeList(doc.supportForm, ['Contributo/Fondo perduto', 'Finanziamento agevolato']),
      costMax: 3_000_000,
      grantMax: 600_000,
      displayProjectAmountLabel: 'Fino a € 3.000.000',
      displayCoverageLabel: '20%',
      coverageMinPercent: 20,
      coverageMaxPercent: 20,
      url: doc.url || '/it/catalogo/oltre-nuove-imprese-tasso-zero',
    };
  }

  return doc;
}

function computeStrategicSignal(args: {
  doc: IncentiviDoc;
  rawProfile: Record<string, unknown>;
  region: string | null;
  sector: string | null;
  fundingGoal: string | null;
  activityType: string | null;
  contributionPreference: string | null;
  age: number | null;
  employmentStatus: string | null;
}): { ok: boolean; boost: number; reasons: string[] } {
  const { doc, rawProfile, region, sector, fundingGoal, activityType, contributionPreference, age, employmentStatus } = args;
  const hints = normalizeForMatch(
    [
      doc.title,
      doc.description,
      doc.authorityName,
      typeof doc.institutionalLink === 'string' ? doc.institutionalLink : '',
      typeof doc.url === 'string' ? doc.url : '',
      ...asStringArray(doc.purposes),
      ...asStringArray(doc.supportForm),
      ...asStringArray(doc.beneficiaries),
      ...asStringArray(doc.sectors),
    ]
      .filter(Boolean)
      .join(' '),
  );
  const sectorNorm = normalizeForMatch(sector ?? '');
  const employmentNorm = normalizeForMatch(employmentStatus ?? '');
  const businessExists = inferBusinessExists(rawProfile, activityType, fundingGoal);
  const profileGoalNorm = normalizeForMatch([activityType, fundingGoal].filter(Boolean).join(' '));
  const requestedAid = classifyContributionPreference(contributionPreference).kind;
  const femaleHint = /(femmin|donna|female|woman)/.test(
    normalizeForMatch(
      [
        cleanString(rawProfile.gender, 40),
        cleanString(rawProfile.genderIdentity, 40),
        cleanString(rawProfile.founderGender, 40),
        activityType,
        cleanString(rawProfile.legalForm, 120),
        fundingGoal,
      ]
        .filter(Boolean)
        .join(' '),
    ),
  );
  const innovativeHint = /(startup innovativ|innovativa|innovative|pmi innovativ)/.test(
    normalizeForMatch([activityType, cleanString(rawProfile.legalForm, 120), fundingGoal].filter(Boolean).join(' ')),
  );
  const digitalAssessmentHint = /(assessment|audit|maturita digitale|maturita tecnologica|check up digitale|diagnosi digitale|roadmap digitale|orientamento digitale|trasformazione digitale)/.test(
    profileGoalNorm,
  );
  const digitalExportHint = /(digital export|mercati globali|mercati esteri|internazionalizzazione|marketplace|marketing digitale|lead generation|canali digitali|sito multilingua|ecommerce|analisi dei dati|intelligenza artificiale|ai commerciale)/.test(
    profileGoalNorm,
  );
  const energyTransitionHint = /(efficientamento energetic|risparmio energetic|transizione energetic|consumi energetic|fotovolta|solare|autoconsum|rinnovabil|riduzione emission|ricicl|mobilita sostenibile|energia pulita)/.test(
    profileGoalNorm,
  );
  const foodRetailHint = /(alimentari|generi di prima necessita|negozio alimentare|minimarket|commercio al dettaglio|bottega|emporio)/.test(
    profileGoalNorm,
  );
  const smallTownHint = /(piccolo comune|piccoli comuni|frazione|frazioni|borgo|paese)/.test(profileGoalNorm);
  const newUnitHint = /(unita locale|nuova unita locale|nuovo punto vendita|secondo punto vendita|nuova sede operativa)/.test(profileGoalNorm);
  const exportFairHint = /(smau|fiera|fiere|internazionalizzazione|export|mercati esteri|buyer|b2b|stand)/.test(profileGoalNorm);

  if (hints.includes('autoimpiego centro nord') || hints.includes('autoimpiego centro-nord')) {
    if (/(agricolt|pesca|acquacolt)/.test(sectorNorm)) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === true) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (region && !CENTER_NORTH_REGION_SET.has(region)) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (age !== null && (age < 18 || age > 35)) {
      return { ok: false, boost: 0, reasons: [] };
    }
    const isClearlyEmployed =
      employmentNorm &&
      /(\boccupat|\bdipendent|indeterminat|determinato)/.test(employmentNorm) &&
      !/(disoccupat|inoccupat|non occupat|working poor|neet|gol|senza lavoro)/.test(employmentNorm);
    if (isClearlyEmployed) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.1;
    const reasons: string[] = [];

    if (region && CENTER_NORTH_REGION_SET.has(region)) {
      boost += 0.22;
      reasons.push('Misura dedicata al Centro-Nord');
    }
    if (businessExists === false) {
      boost += 0.2;
      reasons.push('Coerente con nuova attività o autoimpiego');
    }
    if (/(disoccupat|inoccupat|neet|gol|working poor|senza lavoro|non occupat)/.test(employmentNorm)) {
      boost += 0.14;
    }
    if (age !== null && age >= 18 && age <= 35) {
      boost += 0.12;
    }
    if (/(avvio|nuova impresa|startup|autoimpiego|lavoro autonomo|libero professionista)/.test(profileGoalNorm)) {
      boost += 0.14;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto' || requestedAid === 'voucher') {
      boost += 0.08;
    }
    if (sectorNorm && !/(agricolt|pesca|acquacolt)/.test(sectorNorm)) {
      boost += 0.04;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('resto al sud')) {
    if (/(agricolt|pesca|acquacolt)/.test(sectorNorm)) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === true) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region && SOUTH_REGION_SET.has(region)) {
      boost += 0.2;
      reasons.push('Misura forte per il Mezzogiorno');
    }
    if (businessExists === false) {
      boost += 0.18;
      reasons.push('Adatto a nuova impresa o autoimpiego');
    }
    if (/(disoccupat|inoccupat|neet|senza lavoro|non occupat)/.test(employmentNorm)) {
      boost += 0.14;
      reasons.push('Compatibile con profilo disoccupato/inoccupato');
    }
    if (age !== null && age >= 18 && age <= 35) {
      boost += 0.12;
    }
    if (/(avvio|nuova impresa|startup|autoimpiego|lavoro autonomo|libero professionista)/.test(profileGoalNorm)) {
      boost += 0.12;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.1;
    }
    if (sectorNorm && !/(agricolt|pesca|acquacolt)/.test(sectorNorm)) {
      boost += 0.05;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('fusese') || hints.includes('fund for self employment')) {
    if (/(agricolt|pesca|acquacolt)/.test(sectorNorm)) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === true) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region && SOUTH_REGION_SET.has(region)) {
      boost += 0.2;
      reasons.push('Programma dedicato al Mezzogiorno');
    }
    if (businessExists === false) {
      boost += 0.18;
      reasons.push('Adatto a nuova impresa o autoimpiego');
    }
    if (/(disoccupat|inoccupat|neet|senza lavoro|non occupat)/.test(employmentNorm)) {
      boost += 0.14;
    }
    if (age !== null && age >= 18 && age <= 35) {
      boost += 0.12;
    }
    if (/(avvio|nuova impresa|startup|autoimpiego|lavoro autonomo|libero professionista)/.test(profileGoalNorm)) {
      boost += 0.12;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.08;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('smart start')) {
    const smartStartGoalFit =
      innovativeHint ||
      /(digit|ict|software|saas|ai|intelligenza artificiale|startup innovativ|innovazion|ricerca|tecnolog)/.test(profileGoalNorm) ||
      /(digit|ict|software|tecnolog|innovazion|ricerca)/.test(sectorNorm);

    if (!smartStartGoalFit) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0;
    const reasons: string[] = [];
    if (businessExists === false) {
      boost += 0.08;
      reasons.push('Misura coerente con startup da costituire o nuova impresa innovativa');
    }
    if (/(startup|innov|digit|software|ict|tecnolog)/.test(profileGoalNorm) || /(digit|ict|innov|software)/.test(sectorNorm)) {
      boost += 0.12;
      reasons.push('Molto coerente per startup innovative');
    }
    if (region && SOUTH_REGION_SET.has(region)) {
      boost += 0.08;
      reasons.push('Nel Mezzogiorno prevede anche quota a fondo perduto');
    }
    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('fondo impresa femminile')) {
    if (!femaleHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.06;
    const reasons: string[] = [];

    if (femaleHint) {
      boost += 0.22;
      reasons.push('Misura riservata a imprenditoria femminile');
    }
    if (businessExists === false) {
      boost += 0.1;
      reasons.push('Coerente con avvio o consolidamento di impresa femminile');
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.06;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('pidnext') || hints.includes('polo di innovazione digitale pidnext')) {
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!digitalAssessmentHint && !/(digit|ict|software|cloud|cyber|innov)/.test(sectorNorm)) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (businessExists === true) {
      boost += 0.18;
      reasons.push('Servizio dedicato a imprese già attive');
    }
    if (digitalAssessmentHint || /(digit|ict|software|cloud|cyber|innov)/.test(sectorNorm)) {
      boost += 0.18;
      reasons.push('Perfetto per assessment e roadmap di trasformazione digitale');
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.06;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (
    hints.includes('seal of excellence') ||
    hints.includes('edih') ||
    hints.includes('tef ') ||
    hints.includes('tef ai matters') ||
    hints.includes('ai matters') ||
    hints.includes('ai-pact') ||
    hints.includes('ai pact') ||
    hints.includes('innovation hub')
  ) {
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!digitalAssessmentHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.06;
    const reasons: string[] = [];

    if (businessExists === true) {
      boost += 0.14;
      reasons.push('Servizio rivolto a imprese già attive');
    }
    if (digitalAssessmentHint) {
      boost += 0.18;
      reasons.push('Coerente con assessment e servizi di digitalizzazione');
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.04;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('nuove imprese a tasso zero') || hints.includes('oltre nuove imprese')) {
    if (businessExists === true) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (age !== null && age > 35 && !femaleHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0;
    const reasons: string[] = [];
    if (businessExists === false) {
      boost += 0.14;
      reasons.push('Misura coerente con nuova impresa');
    }
    if (age !== null && age <= 35) {
      boost += 0.1;
      reasons.push('Profilo giovanile coerente con il bando');
    }
    if (femaleHint) {
      boost += 0.12;
      reasons.push('Misura dedicata anche a imprenditoria femminile');
    }
    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (
    hints.includes('fiere smau') ||
    hints.includes('smau milano 2026') ||
    hints.includes('smau parigi 2026') ||
    hints.includes('partecipazione delle imprese alla fiera smau') ||
    hints.includes('partecipazione delle imprese della regione marche alle fiere smau')
  ) {
    if (region && region !== 'Marche') {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!innovativeHint) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!exportFairHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region === 'Marche') {
      boost += 0.2;
      reasons.push('Bando regionale specifico per imprese marchigiane');
    }
    if (innovativeHint) {
      boost += 0.18;
      reasons.push('Richiede startup o PMI innovative');
    }
    if (exportFairHint) {
      boost += 0.18;
    }
    if (profileGoalNorm.includes('parigi') && hints.includes('parigi')) {
      boost += 0.16;
      reasons.push('Coincide con la fiera internazionale richiesta');
    }
    if (profileGoalNorm.includes('milano') && hints.includes('smau')) {
      boost += 0.1;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.06;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (
    hints.includes('voucher digitali i4 0') ||
    hints.includes('voucher digitali i40') ||
    hints.includes('pid avanzato')
  ) {
    if (region && region !== 'Calabria') {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!digitalAssessmentHint && !/(digit|ict|software|cloud|cyber|ecommerce|crm|automazion)/.test(profileGoalNorm)) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region === 'Calabria') {
      boost += 0.2;
      reasons.push('Bando camerale specifico per imprese della provincia di Cosenza');
    }
    if (businessExists === true) {
      boost += 0.14;
      reasons.push('Dedicato a imprese già attive');
    }
    if (/(digit|ict|software|cloud|cyber|ecommerce|crm|automazion)/.test(profileGoalNorm)) {
      boost += 0.2;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.08;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('nuova impresa') && hints.includes('piccoli comuni') && hints.includes('frazioni')) {
    if (region && region !== 'Lombardia') {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === true && !newUnitHint) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!foodRetailHint || !smallTownHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region === 'Lombardia') {
      boost += 0.18;
      reasons.push('Bando regionale specifico per la Lombardia');
    }
    if (businessExists === false || newUnitHint) {
      boost += 0.18;
      reasons.push('Coerente con apertura di nuova impresa o nuova unità locale');
    }
    if (foodRetailHint) {
      boost += 0.18;
    }
    if (smallTownHint) {
      boost += 0.16;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.08;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('bando connessi') || (hints.includes('strategie digitali') && hints.includes('mercati globali'))) {
    if (region && region !== 'Lombardia') {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!digitalExportHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region === 'Lombardia') {
      boost += 0.18;
      reasons.push('Bando camerale locale per Milano Monza Brianza Lodi');
    }
    if (businessExists === true) {
      boost += 0.12;
      reasons.push('Dedicato a imprese già attive');
    }
    if (digitalExportHint) {
      boost += 0.22;
      reasons.push('Perfetto per digital export e mercati esteri');
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.08;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if ((hints.includes('cosenza') && hints.includes('risparmio energetico')) || hints.includes('sostenibilita e risparmio energetico')) {
    if (region && region !== 'Calabria') {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!energyTransitionHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region === 'Calabria') {
      boost += 0.2;
      reasons.push('Bando camerale specifico per imprese della provincia di Cosenza');
    }
    if (businessExists === true) {
      boost += 0.12;
      reasons.push('Dedicato a imprese già attive');
    }
    if (energyTransitionHint) {
      boost += 0.2;
      reasons.push('Coerente con efficientamento energetico e sostenibilità');
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.08;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('cciaa bologna') && (hints.includes('fiere internazionali') || hints.includes('partecipazione a fiere internazionali'))) {
    if (region && region !== 'Emilia-Romagna') {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!exportFairHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region === 'Emilia-Romagna') {
      boost += 0.18;
      reasons.push('Bando camerale locale per imprese bolognesi');
    }
    if (businessExists === true) {
      boost += 0.12;
      reasons.push('Coerente con impresa già attiva');
    }
    if (exportFairHint) {
      boost += 0.18;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.06;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (hints.includes('consolidamento delle startup innovative') || (hints.includes('regione veneto') && hints.includes('startup innovative'))) {
    if (region && region !== 'Veneto') {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }
    if (!innovativeHint) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.08;
    const reasons: string[] = [];

    if (region === 'Veneto') {
      boost += 0.18;
      reasons.push('Bando regionale specifico per startup innovative venete');
    }
    if (businessExists === true) {
      boost += 0.12;
      reasons.push('Misura di consolidamento per startup già costituite');
    }
    if (innovativeHint) {
      boost += 0.18;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.06;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  if (
    hints.includes('museo di impresa') ||
    hints.includes('musei di impresa') ||
    hints.includes('museo d impresa') ||
    hints.includes('musei d impresa')
  ) {
    if (businessExists === false) {
      return { ok: false, boost: 0, reasons: [] };
    }

    let boost = 0.04;
    const reasons: string[] = [];

    if (region === 'Lombardia') {
      boost += 0.14;
      reasons.push('Misura regionale mirata per la Lombardia');
    }
    if (businessExists === true) {
      boost += 0.14;
      reasons.push('Coerente con impresa già attiva');
    }
    if (/(museo|musei|museale|allestimento espositivo|spazi espositivi)/.test(profileGoalNorm)) {
      boost += 0.18;
    }
    if (requestedAid === 'fondo_perduto' || requestedAid === 'misto') {
      boost += 0.08;
    }

    return { ok: true, boost, reasons: reasons.slice(0, 2) };
  }

  return { ok: true, boost: 0, reasons: [] };
}

function hasReliableEconomicDataDoc(doc: IncentiviDoc): boolean {
  const economic = resolveDocEconomicData(doc);
  const projectValues = [economic.costMin, economic.costMax].filter(
    (value): value is number => value !== null && Number.isFinite(value) && value > 0,
  );
  const hasReliableProjectRange =
    projectValues.length > 0 &&
    (typeof economic.economicOffer?.displayProjectAmountLabel === 'string' ||
      typeof economic.economicOffer?.displayCoverageLabel === 'string' ||
      typeof economic.aidIntensity === 'string');

  if (hasReliableProjectRange) return true;
  if (!economic.reliableGrantAmount) return false;

  const values = [economic.grantMin, economic.grantMax].filter(
    (value): value is number => value !== null && Number.isFinite(value) && value > 0,
  );
  if (!values.length) return false;

  const top = Math.max(...values);
  if (top < 5_000) return false;
  if ((economic.grantMin ?? 0) > 0 && (economic.grantMax ?? 0) > 0 && (economic.grantMax as number) < (economic.grantMin as number)) {
    return false;
  }
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

function expandMorphologicalVariants(tokens: string[]) {
  const out = new Set<string>();

  for (const token of tokens) {
    if (!token) continue;
    out.add(token);
    if (token.includes(' ') || token.length < 4) continue;

    if (token.endsWith('o')) out.add(`${token.slice(0, -1)}i`);
    if (token.endsWith('i')) out.add(`${token.slice(0, -1)}o`);
    if (token.endsWith('a')) out.add(`${token.slice(0, -1)}e`);
    if (token.endsWith('e')) out.add(`${token.slice(0, -1)}a`);
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

function buildHighSignalGoalPhrases(textNorm: string) {
  if (!textNorm) return [] as string[];

  const units = new Set<string>();
  const add = (values: string[]) => values.forEach((value) => units.add(normalizeForMatch(value)));

  if (/(museo d impresa|musei d impresa|museo impresa|musei impresa|museale)/.test(textNorm)) {
    add([
      'museo d impresa',
      'musei d impresa',
      'museo',
      'musei',
      'museale',
      'spazi espositivi',
      'allestimento espositivo',
      'allestimenti espositivi',
    ]);
  }
  if (
    /(autoimpiego|nuova impresa|startup|start up|lavoro autonomo|libero professionista|aprire attivita|avviare attivita|avvio attivita|apertura attivita|attivita imprenditorial|iniziativa imprenditorial)/.test(
      textNorm,
    )
  ) {
    add([
      'autoimpiego',
      'nuova impresa',
      'avvio impresa',
      'avvio di impresa',
      'nuova attivita',
      'attivita imprenditoriale',
      'iniziativa imprenditoriale',
      'avvio attivita',
      'apertura attivita',
      'lavoro autonomo',
      'libero professionista',
      'aspiranti imprenditori',
      'imprenditoria giovanile',
      'ditta individuale',
    ]);
  }
  if (/(startup innovativ|innovativa|innovative)/.test(textNorm)) {
    add(['startup innovativa', 'startup innovative', 'start up innovativa']);
  }
  if (/(donna|donne|femmin|imprenditoria femminile|impresa femminile)/.test(textNorm)) {
    add(['imprenditoria femminile', 'impresa femminile', 'donna', 'donne', 'femminile']);
  }
  if (/(ecommerce|e commerce|shop online|negozio online|vendita online)/.test(textNorm)) {
    add(['ecommerce', 'e commerce', 'shop online', 'negozio online', 'vendita online']);
  }
  if (/(mercati globali|digital export|marketing digitale|marketplace|sito multilingua|mercati esteri)/.test(textNorm)) {
    add([
      'digital export',
      'mercati globali',
      'mercati esteri',
      'marketing digitale',
      'marketplace',
      'sito multilingua',
      'strategie digitali',
    ]);
  }
  if (/(digital|digitale|digitalizzazione|software|ict|cloud|cyber|cybersecurity|industria 4|4 0)/.test(textNorm)) {
    add(['digitalizzazione', 'digitale', 'software', 'ict', 'cloud', 'ecommerce', 'cybersecurity', 'industria 4 0']);
  }
  if (/(assessment|audit|maturita digitale|maturita tecnologica|check up digitale|diagnosi digitale|roadmap digitale|orientamento digitale)/.test(textNorm)) {
    add([
      'assessment',
      'first assessment',
      'post assessment',
      'assessment digitale',
      'audit digitale',
      'maturita digitale',
      'check up digitale',
      'diagnosi digitale',
      'orientamento digitale',
      'roadmap digitale',
      'cybersecurity',
      'cyber',
    ]);
  }
  if (/(fotovolta|solare|rinnovabil|energia pulita)/.test(textNorm)) {
    add(['fotovoltaico', 'solare', 'rinnovabili', 'energia rinnovabile']);
  }
  if (/(efficientamento energetic|risparmio energetic|transizione energetic|autoconsum|emission|ricicl|mobilita sostenibile)/.test(textNorm)) {
    add([
      'efficientamento energetico',
      'risparmio energetico',
      'transizione energetica',
      'autoconsumo',
      'riduzione emissioni',
      'riciclo',
      'mobilita sostenibile',
    ]);
  }
  if (/(macchinari|beni strumentali|attrezzature|impianti)/.test(textNorm)) {
    add(['macchinari', 'beni strumentali', 'attrezzature', 'impianti']);
  }
  if (/(alimentari|generi di prima necessita|negozio alimentare|minimarket|commercio al dettaglio)/.test(textNorm)) {
    add([
      'alimentari',
      'generi di prima necessita',
      'negozio alimentare',
      'minimarket',
      'commercio al dettaglio',
      'prodotti alimentari',
    ]);
  }
  if (/(piccolo comune|piccoli comuni|frazione|frazioni|borgo|paese)/.test(textNorm)) {
    add(['piccolo comune', 'piccoli comuni', 'frazione', 'frazioni', 'borgo', 'paese']);
  }
  if (/(assunzion|personale|dipendent|nuove risorse)/.test(textNorm)) {
    add(['assunzioni', 'personale', 'dipendenti', 'occupazione']);
  }
  if (/(export|internazionalizzazione|mercati esteri|fiera|fiere)/.test(textNorm)) {
    add(['export', 'internazionalizzazione', 'mercati esteri', 'fiera', 'fiere']);
  }
  if (/(smau|parigi|milano|londra|buyer|stand|b2b)/.test(textNorm)) {
    add(['smau', 'parigi', 'milano', 'londra', 'buyer', 'stand espositivo', 'b2b']);
  }

  return [...units].filter(Boolean);
}

function buildKeywordSets(sector: string | null, fundingGoal: string | null) {
  const sectorNorm = sector ? normalizeForMatch(sector) : '';
  const goalNorm = fundingGoal ? normalizeForMatch(fundingGoal) : '';
  const buildCoreFromText = (textNorm: string, kind: 'sector' | 'goal') => {
    if (!textNorm) return [] as string[];
    const units = new Set<string>();

    for (const t of expandMorphologicalVariants(tokenizeKeywords(textNorm))) units.add(t);
    if (textNorm.split(' ').length >= 2 && textNorm.length <= 60) units.add(textNorm);
    if (kind === 'goal') {
      for (const phrase of buildHighSignalGoalPhrases(textNorm)) units.add(phrase);
    }

    const add = (arr: string[]) => arr.forEach((x) => units.add(normalizeForMatch(x)));

    if (/(digital|digitale|digitalizzazione|ict|software|cloud|ecommerce|e commerce|cyber|cybersecurity|industria 4|4 0)/.test(textNorm)) {
      add(['digitalizzazione', 'digitale', 'ict', 'software', 'cloud', 'ecommerce', 'cybersecurity', 'industria 4 0']);
    }
    if (/(assessment|audit|maturita digitale|maturita tecnologica|check up digitale|diagnosi digitale|roadmap digitale|orientamento digitale)/.test(textNorm)) {
      add([
        'assessment',
        'first assessment',
        'post assessment',
        'assessment digitale',
        'audit digitale',
        'maturita digitale',
        'check up digitale',
        'diagnosi digitale',
        'orientamento digitale',
        'roadmap digitale',
        'cybersecurity',
        'cyber',
      ]);
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
    if (/(donna|donne|femmin|imprenditoria femminile|impresa femminile)/.test(textNorm)) {
      add(['imprenditoria femminile', 'impresa femminile', 'donna', 'donne', 'femminile']);
    }
    if (/(smau|parigi|milano|londra|buyer|stand|b2b)/.test(textNorm)) {
      add(['smau', 'parigi', 'milano', 'londra', 'buyer', 'stand espositivo', 'b2b']);
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

  // Infer from authority and title first (high signal)
  const highSignalText = `${authorityNorm} ${titleNorm}`.trim();
  const inferredHighSignal = detectRegions(highSignalText);
  
  if (inferredHighSignal.length > 0) {
    return { kind: 'regions', regions: inferredHighSignal, source: 'inferred' };
  }

  // Fallback to description but be more conservative: 
  // if authority mentions a specific region, we don't want to pick other regions from description.
  const inferredDescription = detectRegions(descriptionNorm);
  if (inferredDescription.length > 0) {
    return { kind: 'regions', regions: inferredDescription, source: 'inferred' };
  }

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
  const min = parseMoneyValue(doc.costMin);
  const max = parseMoneyValue(doc.costMax);
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


function prefilterDocsForFastMode(args: {
  docs: IncentiviDoc[];
  region: string | null;
  sector: string | null;
  fundingGoal: string | null;
  ateco: string | null;
  activityType: string | null;
  limit: number;
}): IncentiviDoc[] {
  const { docs, region, sector, fundingGoal, ateco, activityType, limit } = args;
  if (docs.length <= 320) return docs;

  const userRegionNorm = region ? normalizeForMatch(region) : null;
  const keywordPool = tokenizeKeywords(normalizeForMatch([sector, fundingGoal, activityType, ateco].filter(Boolean).join(' '))).slice(0, 12);
  const atecoDigits = extractAtecoDigitsFromText(ateco ?? '');
  const strategicTitleHints = [
    'resto al sud',
    'fusese',
    'fund for self employment and self entrepreneurship',
    'autoimpiego centro nord',
    'oltre nuove imprese a tasso zero',
    'smart start',
    'nuova sabatini',
    'musei d impresa',
    'voucher digitali',
    'pidnext',
    'fesr',
    'fse',
    'programma regionale',
    'pr calabria',
    'pr lombardia',
    'pr sicilia',
    'pr campania',
    'pr puglia',
  ];
  const trustedAuthorities = ['invitalia', 'camera di commercio', 'cciaa', 'regione', 'ministero', 'unioncamere', 'fesr', 'fse'];
  const maxDocs = Math.min(Math.max(limit * 20, 200), 360);

  const scored = docs.map((doc, idx) => {
    const titleNorm = normalizeForMatch(doc.title ?? '');
    const authorityNorm = normalizeForMatch(doc.authorityName ?? '');
    const sectorsNorm = asStringArray(doc.sectors).map((entry) => normalizeForMatch(entry)).join(' ');
    const purposesNorm = asStringArray(doc.purposes).map((entry) => normalizeForMatch(entry)).join(' ');
    const beneficiariesNorm = asStringArray(doc.beneficiaries).map((entry) => normalizeForMatch(entry)).join(' ');
    const descriptionNorm = normalizeForMatch((doc.description ?? '').slice(0, 900));
    const combined = `${titleNorm} ${authorityNorm} ${sectorsNorm} ${purposesNorm} ${beneficiariesNorm} ${descriptionNorm}`.trim();

    let score = 0;
    if (userRegionNorm) {
      const docRegions = asStringArray(doc.regions)
        .map((entry) => canonicalizeRegion(entry))
        .filter((entry): entry is string => Boolean(entry));
      if (docRegions.length === 0) score += 0.4;
      else if (docRegions.some((entry) => normalizeForMatch(entry) === userRegionNorm)) score += 1.8;
      else score -= 0.8;
    }

    for (const token of keywordPool) {
      if (!token) continue;
      if (paddedIncludes(titleNorm, token)) score += 1.35;
      else if (paddedIncludes(`${sectorsNorm} ${purposesNorm}`, token)) score += 0.95;
      else if (paddedIncludes(combined, token)) score += 0.35;
    }

    for (const atecoToken of atecoDigits) {
      if (combined.includes(atecoToken)) score += 1.05;
    }

    if (trustedAuthorities.some((entry) => authorityNorm.includes(entry))) score += 0.45;
    if (strategicTitleHints.some((entry) => titleNorm.includes(entry))) score += 1.8;

    return { doc, score, idx };
  });

  const picked = scored
    .filter((entry) => entry.score > -0.25)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
    .slice(0, maxDocs)
    .map((entry) => entry.doc);

  return picked.length > 0 ? picked : docs.slice(0, maxDocs);
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
              : legacyBody?.answers && typeof legacyBody.answers === 'object' && !Array.isArray(legacyBody.answers)
                ? legacyBody.answers
                : legacyBody;

          if (!legacyProfile || typeof legacyProfile !== 'object' || Array.isArray(legacyProfile)) {
            throw new z.ZodError([]);
          }

          return {
            userProfile: legacyProfile,
            limit:
              typeof legacyBody?.limit === 'number' || typeof legacyBody?.limit === 'string' ? legacyBody.limit : undefined,
            mode: legacyBody?.mode === 'fast' || legacyBody?.mode === 'full' ? legacyBody.mode : undefined,
            channel: legacyBody?.channel === 'chat' ? 'chat' : legacyBody?.channel === 'scanner' ? 'scanner' : undefined,
            strictness:
              legacyBody?.strictness === 'high'
                ? 'high'
                : legacyBody?.strictness === 'standard'
                  ? 'standard'
                  : undefined,
          };
        })();
    const parsedLimit = typeof parsed.limit === 'string' ? Number(parsed.limit) : parsed.limit;
    const limit: number = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit ?? 8, 1), 50) : 8;
    const mode = parsed.mode === 'fast' ? 'fast' : 'full';
    const channel: ScanChannel = parsed.channel === 'chat' ? 'chat' : 'scanner';
    const strictness: ScanStrictness = parsed.strictness === 'high' ? 'high' : 'standard';

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
    const ageBand =
      parseAgeBandValue(rawProfile.ageBand ?? rawProfile.founderAgeBand) ??
      (age !== null ? (age <= 35 ? 'under35' : 'over35') : null);
    const employmentStatus =
      cleanString(rawProfile.employmentStatus, 80) ??
      cleanString(rawProfile.occupationalStatus, 80) ??
      cleanString(rawProfile.workStatus, 80);
    const budget = cleanNumber(rawProfile.revenueOrBudgetEUR);
    const requestedContribution = cleanNumber(rawProfile.requestedContributionEUR);
    const fundingGoalSignalQuery = fundingGoal ? tokenizeKeywords(normalizeForMatch(fundingGoal)).slice(0, 4).join(' ') || null : null;

    const bookingBase = process.env.NEXT_PUBLIC_BOOKING_URL?.trim() || '/prenota';

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
    const businessExists = scannerProfile.businessExists;
    const normalizedProfile = normalizeProfile({
      ...rawProfile,
      region,
      location: rawLocation ?? { region, municipality: null },
      sector,
      fundingGoal,
      ateco,
      activityType,
      contributionPreference,
      revenueOrBudgetEUR: budget,
      requestedContributionEUR: requestedContribution,
      age,
      ageBand,
      employmentStatus,
      businessExists,
    });
    const caseProfileResolution = resolveCaseProfiles(normalizedProfile);
    const strictContext: ChatStrictContext = {
      region: userRegionCanonical,
      sector,
      fundingGoal,
      activityType,
      businessExists,
    };
    const matchingVersion = process.env.MATCHING_ENGINE_V4?.trim() === 'false' ? 'v3' : 'v4';
    const profilePriorityApplied = caseProfileResolution.activeCaseIds.length > 0;

    if (SCANNER_API_ENABLED && mode !== 'fast') {
      try {
        const scanner = await scanViaScannerApi({
          scannerProfile,
          limit,
          region,
          contributionPreference,
          channel,
          strictness,
          strictContext,
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

        const scannerResultsWithBooking = scannerResults.map((item) => ({
          ...item,
          bookingUrl: buildBookingUrl(bookingBase, {
            bandoId: item.id,
            region,
            sector,
          }),
        }));
        const scannerNearMissesWithBooking = scannerNearMisses.map((item) => ({
          ...item,
          bookingUrl: buildBookingUrl(bookingBase, {
            bandoId: item.id,
            region,
            sector,
          }),
        }));

        const scannerTopPickBandoId = scannerResultsWithBooking[0]?.id ?? null;
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
          phase: 'full',
          matchingVersion,
          profilePriorityApplied,
          explanation: scannerExplanation,
          results: scannerResultsWithBooking,
          nearMisses: scannerNearMissesWithBooking,
          qualityBand: scannerQualityBand,
          refineQuestion: scannerRefineQuestion ?? undefined,
          topPickBandoId: scannerTopPickBandoId,
          bookingUrl: scannerBookingUrl,
          diagnostics:
            process.env.MATCHING_DIAGNOSTICS === 'true'
              ? {
                  rejectedByGate: {},
                  activeCaseIds: caseProfileResolution.activeCaseIds,
                }
              : undefined,
        });
      } catch (scannerError) {
        console.error('scan-bandi scanner-api fallback', {
          message: scannerError instanceof Error ? scannerError.message : 'unknown',
        });
      }
    }

    let docs: IncentiviDoc[] = [];
    const loadFallbackDocs = async () => {
      const snapshot = await loadHybridDatasetDocs();
      return snapshot.docs;
    };

    if (mode === 'fast') {
      docs = await loadFallbackDocs();
    } else {
      try {
        if (keyword && userRegionCanonical) {
          const queryCandidates = Array.from(
            new Set(
              [
                keyword,
                [keyword, userRegionCanonical, contributionPrefInfo.strict ? contributionPrefInfo.label : null].filter(Boolean).join(' '),
                fundingGoal,
                [fundingGoal, userRegionCanonical].filter(Boolean).join(' '),
                fundingGoalSignalQuery,
                [fundingGoalSignalQuery, userRegionCanonical].filter(Boolean).join(' '),
                atecoQuery,
                [sector, fundingGoal].filter(Boolean).join(' '),
              ]
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry.length >= 3),
            ),
          );
          const results = await Promise.allSettled(queryCandidates.map((query) => fetchIncentiviDocs(query, 180, 6500)));
          docs = mergeIncentiviDocs(
            ...results
              .filter((entry): entry is PromiseFulfilledResult<IncentiviDoc[]> => entry.status === 'fulfilled')
              .map((entry) => entry.value),
          );
        } else {
          docs = await fetchIncentiviDocs(keyword, 240, 8500);
        }
      } catch {
        docs = await loadFallbackDocs();
      }
    }

    if (docs.length === 0) {
      docs = await loadFallbackDocs();
    }
    docs = mergeIncentiviDocs(docs, STRATEGIC_SCANNER_DOCS as unknown as IncentiviDoc[]);
    docs = filterClosedCalls(docs);

    // --- Unified Pipeline scoring overlay ---
    const unifiedResult = runUnifiedPipeline({
      profile: normalizedProfile,
      grants: docs,
      options: {
        channel: channel === 'chat' ? 'chat' : 'scanner',
        strictness: strictness === 'high' ? 'high' : 'standard',
        maxResults: limit * 5,
      },
    });
    const unifiedScoreMap = new Map<string, GrantEvaluation>();
    for (const ev of unifiedResult.evaluations) {
      unifiedScoreMap.set(ev.grantId, ev);
      // Also index by numeric id for incentivi docs
      const numericId = ev.grantId.replace(/^incentivi-/, '');
      if (numericId !== ev.grantId) {
        unifiedScoreMap.set(numericId, ev);
      }
    }
    // --- End unified pipeline ---

    const keywordSets = buildKeywordSets(sector, fundingGoalQuery);
    const sectorCoreKeywords = keywordSets.sectorCore;
    const goalCoreKeywords = keywordSets.goalCore;
    const coreKeywords = keywordSets.core;
    const expandedKeywords = keywordSets.expanded;
    const wantsTopic = Boolean(sector?.trim()) || Boolean(fundingGoal?.trim());

    const now = new Date();
    const mapped = docs.map((docRaw) => {
        const doc = applyStrategicDocOverrides(docRaw, {
          userRegionCanonical,
          businessExists,
        });
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
        const businessStage = matchBusinessStage(businessExists, doc);
        const demographicMatch = matchDemographicConstraints({
          doc,
          rawProfile,
          age,
          ageBand,
          employmentStatus,
        });
        const goalIntentMatch = matchGoalIntent(fundingGoal, doc);
        const authorityPriority = classifyAuthorityPriority(doc.authorityName);
        const economic = resolveDocEconomicData(doc);

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

        const strategic = computeStrategicSignal({
          doc,
          rawProfile,
          region: userRegionCanonical,
          sector,
          fundingGoal,
          activityType,
          contributionPreference,
          age,
          employmentStatus,
        });

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
        const localScore = Math.max(
          0,
          Math.min(
            1,
            baseScore +
              sectorSpecificityBoost +
              atecoMatch.score +
              strategic.boost +
              businessStage.score +
              demographicMatch.score +
              goalIntentMatch.score +
              authorityPriority.boost,
          ),
        );
        const matchReasons: string[] = [];
        const mismatchFlags: string[] = [];

        if (userRegionCanonical && regionOk) {
          if (territory.kind === 'national') matchReasons.push('Territorio nazionale compatibile');
          if (territory.kind === 'regions') matchReasons.push(`Territorio compatibile con ${userRegionCanonical}`);
        }
        if (userAtecoDigits.length && atecoMatch.ok) matchReasons.push('ATECO coerente');
        if (wantsTopic && strictTextOk) matchReasons.push('Finalita e settore coerenti');
        if (beneficiariesMatch.matched) matchReasons.push('Beneficiari ammessi coerenti');
        if (businessStage.matched) {
          matchReasons.push(businessExists ? 'Compatibile con impresa già attiva' : 'Compatibile con nuova attività');
        }
        if (demographicMatch.matched) matchReasons.push('Profilo personale coerente');
        if (goalIntentMatch.matched) matchReasons.push('Obiettivo progetto coerente');
        if (contribution.matched && contributionPrefInfo.strict && contributionPrefInfo.label) {
          matchReasons.push(`Forma contributo coerente (${contributionPrefInfo.label})`);
        }
        if (strategic.reasons.length) matchReasons.push(...strategic.reasons);
        if (!matchReasons.length && isOpen) matchReasons.push('Bando aperto con segnali di compatibilita');

        if (userRegionCanonical && !regionOk) mismatchFlags.push('territory_mismatch');
        if (userAtecoDigits.length && !atecoMatch.ok) mismatchFlags.push('ateco_mismatch');
        if (beneficiariesMatch.strict && !beneficiariesMatch.matched) mismatchFlags.push('beneficiary_mismatch');
        if (businessStage.strict && !businessStage.ok) mismatchFlags.push('business_stage_mismatch');
        if (demographicMatch.strict && !demographicMatch.ok) mismatchFlags.push('demographic_mismatch');
        if (goalIntentMatch.strict && !goalIntentMatch.ok) mismatchFlags.push('goal_intent_mismatch');
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

        const resultId = doc.id ? `incentivi-${String(doc.id)}` : `incentivi-${Math.random().toString(16).slice(2)}`;
        const aidForm = asStringArray(doc.supportForm).join(', ') || null;
        const sanitizedEconomicOffer = sanitizeEconomicOfferForResult({
          grantId: resultId,
          aidForm,
          economicOffer: economic.economicOffer,
          localDoc: doc,
        });

        // --- Unified pipeline score overlay ---
        const unifiedId = String(doc.id ?? '');
        const unifiedEval = unifiedScoreMap.get(unifiedId);
        const useUnified = !!unifiedEval;

        // Detect south youth pinned strategic docs early so bypass applies to all derived flags
        const isSouthPinnedStrategic = (() => {
          if (businessExists !== false) return false;
          if (!userRegionCanonical || !SOUTH_REGION_SET.has(userRegionCanonical)) return false;
          const youthOk = (age !== null && age >= 18 && age <= 35) || ageBand === 'under35';
          if (!youthOk) return false;
          const empNorm = normalizeForMatch(employmentStatus ?? '');
          if (!/(disoccupat|inoccupat|neet|working poor|senza lavoro|non occupat)/.test(empNorm)) return false;
          return titleNorm.includes('resto al sud') || titleNorm.includes('fusese') || titleNorm.includes('fund for self employment') ||
                 titleNorm.includes('oltre nuove imprese') || titleNorm.includes('nuove imprese a tasso zero');
        })();
        const bypassUnified = isSouthPinnedStrategic;

        // Override legacy flags with unified results if available (bypassed for south pinned strategic)
        const overrideRegionOk = (useUnified && !bypassUnified) ? unifiedEval.dimensions.find(d => d.dimension === 'territory')?.compatible ?? regionOk : regionOk;
        const overrideBusinessStageOk = (useUnified && !bypassUnified) ? unifiedEval.dimensions.find(d => d.dimension === 'stage')?.compatible ?? businessStage.ok : businessStage.ok;
        const overrideGoalIntentOk = (useUnified && !bypassUnified) ? unifiedEval.dimensions.find(d => d.dimension === 'purpose')?.compatible ?? goalIntentMatch.ok : goalIntentMatch.ok;
        const overrideStrictTextOk = (useUnified && !bypassUnified) ? (unifiedEval.dimensions.find(d => d.dimension === 'purpose')?.score ?? 0) >= 80 : strictTextOk;
        const overrideRelaxedTextOk = (useUnified && !bypassUnified) ? (unifiedEval.dimensions.find(d => d.dimension === 'purpose')?.score ?? 0) >= 60 : relaxedTextOk;

        const finalScore = (useUnified && !bypassUnified) ? unifiedEval.totalScore / 100 : localScore;
        const finalMatchReasons = (useUnified && !bypassUnified && unifiedEval.whyFit.length > 0)
          ? unifiedEval.whyFit.slice(0, 3)
          : matchReasons.slice(0, 3);

        const unifiedBlockingMismatchFlags = unifiedEval?.dimensions
          ? unifiedEval.dimensions
              .filter((dim) =>
                dim.compatible === false &&
                (dim.dimension === 'territory' || dim.dimension === 'subject' || dim.dimension === 'status' || dim.dimension === 'purpose')
              )
              .map((dim) => `${dim.dimension}_mismatch`)
          : [];
        const unifiedHardExcluded = bypassUnified
          ? false
          : Boolean(unifiedEval?.hardExcluded) ||
            (useUnified && unifiedEval.totalScore < 60) ||
            unifiedBlockingMismatchFlags.length > 0;
        const finalMismatchFlags = unifiedHardExcluded
          ? ['hard_excluded', ...(unifiedEval?.hardExclusionReason ? [unifiedEval.hardExclusionReason] : []), ...unifiedBlockingMismatchFlags, ...mismatchFlags].slice(0, 3)
          : [...new Set(mismatchFlags)].slice(0, 3);
        const finalHardStatus = unifiedHardExcluded
          ? ('not_eligible' as const)
          : finalMismatchFlags.length === 0
            ? ('eligible' as const)
            : ('unknown' as const);

        const result: ScanResult = {
          id: resultId,
          title: doc.title ?? 'Incentivo (Incentivi.gov)',
          authorityName: doc.authorityName ?? 'Incentivi.gov',
          deadlineAt: deadline,
          sourceUrl: buildSourceUrl(doc),
          requirements: buildRequirements(doc, { userRegion: userRegionCanonical, territory }),
          matchScore: finalScore,
          matchReasons: finalMatchReasons,
          mismatchFlags: finalMismatchFlags,
          score: finalScore,
          grantId: resultId,
          grantTitle: doc.title ?? 'Incentivo (Incentivi.gov)',
          authority: doc.authorityName ?? 'Incentivi.gov',
          officialUrl: buildSourceUrl(doc),
          beneficiaries: asStringArray(doc.beneficiaries),
          openingDate: openDate ? openDate.toISOString() : null,
          deadlineDate: deadline,
          availabilityStatus: openDate && now.getTime() < openDate.getTime() ? 'incoming' : 'open',
          aidForm,
          aidIntensity:
            typeof sanitizedEconomicOffer?.displayCoverageLabel === 'string'
              ? String(sanitizedEconomicOffer.displayCoverageLabel)
              : economic.aidIntensity,
          budgetTotal: parseMoneyValue(sanitizedEconomicOffer?.costMax) ?? parseMoneyValue(sanitizedEconomicOffer?.grantMax) ?? economic.budgetTotal,
          economicOffer: sanitizedEconomicOffer,
          probabilityScore: (useUnified && !bypassUnified) ? unifiedEval.totalScore : Math.round(localScore * 100),
          hardStatus: finalHardStatus,
          whyFit: finalMatchReasons,
          missingRequirements: finalMismatchFlags,
        };
        const hardEligibility = evaluateHardEligibility({
          result,
          profile: normalizedProfile,
          strategicTitleTokens: [...CHAT_STRICT_STRATEGIC_TITLES, ...caseProfileResolution.pinnedStrategicTitles],
        });

        const finalRegionOk = (useUnified && !bypassUnified) ? overrideRegionOk : regionOk;
        const finalBusinessStageOk = (useUnified && !bypassUnified) ? overrideBusinessStageOk : businessStage.ok;
        const finalGoalIntentOk = (useUnified && !bypassUnified) ? overrideGoalIntentOk : goalIntentMatch.ok;
        const finalHardEligibilityPassed = (useUnified && !bypassUnified) ? !unifiedHardExcluded : hardEligibility.passed;

        return {
          isOpen,
          regionOk: finalRegionOk,
          atecoOk: atecoMatch.ok,
          beneficiariesOk: beneficiariesMatch.ok,
          businessStageOk: finalBusinessStageOk,
          demographicsOk: demographicMatch.ok,
          goalIntentOk: finalGoalIntentOk,
          strategicOk: strategic.ok,
          economicReliable: hasReliableEconomicDataDoc(doc),
          strictTextOk: overrideStrictTextOk,
          relaxedTextOk: overrideRelaxedTextOk,
          contributionMatched: contribution.matched,
          hardEligibilityPassed: finalHardEligibilityPassed,
          hardEligibilityDiagnostics: useUnified ? (unifiedHardExcluded ? ['unified_pipeline_exclusion'] : []) : hardEligibility.diagnostics,
          result
        };
      });
    const rejectedByGate = mapped.reduce<Record<string, number>>((acc, entry) => {
      if (!entry.isOpen) acc.notOpen = (acc.notOpen ?? 0) + 1;
      if (!entry.regionOk) acc.territory = (acc.territory ?? 0) + 1;
      if (!entry.atecoOk) acc.ateco = (acc.ateco ?? 0) + 1;
      if (!entry.beneficiariesOk) acc.beneficiaries = (acc.beneficiaries ?? 0) + 1;
      if (!entry.businessStageOk) acc.businessStage = (acc.businessStage ?? 0) + 1;
      if (!entry.demographicsOk) acc.demographics = (acc.demographics ?? 0) + 1;
      if (!entry.goalIntentOk) acc.goalIntent = (acc.goalIntent ?? 0) + 1;
      if (!entry.strategicOk) acc.strategic = (acc.strategic ?? 0) + 1;
      if (!entry.hardEligibilityPassed) acc.hardEligibility = (acc.hardEligibility ?? 0) + 1;
      for (const gate of entry.hardEligibilityDiagnostics ?? []) {
        const key = `hard:${gate}`;
        acc[key] = (acc[key] ?? 0) + 1;
      }
      if (!entry.economicReliable) acc.economicReliability = (acc.economicReliability ?? 0) + 1;
      return acc;
    }, {});
    const openAndRegionStrict = mapped.filter(
      (x) =>
        x.isOpen &&
        x.regionOk &&
        x.atecoOk &&
        x.beneficiariesOk &&
        x.businessStageOk &&
        x.demographicsOk &&
        x.goalIntentOk &&
        x.strategicOk &&
        x.hardEligibilityPassed &&
        (x.economicReliable || (x.result.probabilityScore ?? 0) >= 75),
    );
    const openAndRegion =
      openAndRegionStrict.length > 0
        ? openAndRegionStrict
        : mapped.filter(
            (x) =>
              x.isOpen &&
              x.regionOk &&
              x.atecoOk &&
              x.beneficiariesOk &&
              x.businessStageOk &&
              x.demographicsOk &&
              x.goalIntentOk &&
              x.strategicOk &&
              x.hardEligibilityPassed,
          );
    const strictTextPool = wantsTopic ? openAndRegion.filter((x) => x.strictTextOk) : openAndRegion;
    const relaxedTextPool = wantsTopic ? openAndRegion.filter((x) => x.relaxedTextOk) : openAndRegion;
    const goalIntentPool = wantsTopic ? openAndRegion.filter((x) => x.goalIntentOk) : openAndRegion;
    const strictGoalIntentPool = wantsTopic ? strictTextPool.filter((x) => x.goalIntentOk) : strictTextPool;
    const relaxedGoalIntentPool = wantsTopic ? relaxedTextPool.filter((x) => x.goalIntentOk) : relaxedTextPool;
    const requireGoal = Boolean(fundingGoal?.trim());

    const chosenTextPool = !wantsTopic
      ? openAndRegion
      : requireGoal
        ? strictGoalIntentPool.length > 0
          ? strictGoalIntentPool
          : goalIntentPool.length > 0
            ? goalIntentPool
            : strictTextPool
        : strictTextPool.length >= Math.min(3, limit)
          ? strictTextPool
          : relaxedGoalIntentPool.length > 0
            ? relaxedGoalIntentPool
            : relaxedTextPool;

    const southYouthStartupProfile = isSouthYouthStartupProfile({
      businessExists,
      region: userRegionCanonical,
      age,
      ageBand,
      employmentStatus,
    });
    const pinnedStrategicTitles: string[] = [...caseProfileResolution.pinnedStrategicTitles];
    const employmentNorm = normalizeForMatch(employmentStatus ?? '');
    const profileSignalNorm = normalizeForMatch([sector, fundingGoal, activityType].filter(Boolean).join(' '));
    const under35Signal = (age !== null && age >= 18 && age <= 35) || ageBand === 'under35';
    if (
      businessExists === false &&
      userRegionCanonical &&
      CENTER_NORTH_REGION_SET.has(userRegionCanonical) &&
      under35Signal &&
      /(disoccupat|inoccupat|neet|gol|working poor|senza lavoro|non occupat)/.test(employmentNorm) &&
      !/(agricolt|pesca|acquacolt)/.test(normalizeForMatch(sector ?? ''))
    ) {
      pinnedStrategicTitles.push('autoimpiego centro nord');
    }
    if (southYouthStartupProfile) {
      pinnedStrategicTitles.push('resto al sud');
      pinnedStrategicTitles.push('fusese');
      pinnedStrategicTitles.push('oltre nuove imprese a tasso zero');
    }
    if (
      businessExists === false &&
      /(digit|ict|software|saas|ai|intelligenza artificiale|startup innovativ|innovazion|ricerca|tecnolog)/.test(profileSignalNorm)
    ) {
      pinnedStrategicTitles.push('smart start');
    }
    if (
      businessExists === true &&
      /(assessment|audit|maturita digitale|maturita tecnologica|check up digitale|diagnosi digitale|roadmap digitale|orientamento digitale|trasformazione digitale)/.test(
        profileSignalNorm,
      )
    ) {
      pinnedStrategicTitles.push('pidnext');
    }
    if (
      businessExists === true &&
      userRegionCanonical === 'Lombardia' &&
      /(digital export|mercati globali|mercati esteri|internazionalizzazione|marketplace|marketing digitale|lead generation|canali digitali|sito multilingua|ecommerce|analisi dei dati|intelligenza artificiale|ai commerciale)/.test(
        profileSignalNorm,
      )
    ) {
      pinnedStrategicTitles.push('bando connessi');
    }
    if (
      businessExists === true &&
      userRegionCanonical === 'Calabria' &&
      /(efficientamento energetic|risparmio energetic|transizione energetic|consumi energetic|fotovolta|solare|autoconsum|rinnovabil|riduzione emission|ricicl|mobilita sostenibile|energia pulita)/.test(
        profileSignalNorm,
      )
    ) {
      pinnedStrategicTitles.push('sostenibilita e risparmio energetico');
    }
    if (
      businessExists === true &&
      userRegionCanonical === 'Calabria' &&
      /(digit|ict|software|cloud|cyber|cybersecurity|ecommerce|crm|automazion|digitalizzazione|trasformazione digitale)/.test(
        profileSignalNorm,
      )
    ) {
      pinnedStrategicTitles.push('voucher digitali');
    }
    if (
      businessExists === false &&
      userRegionCanonical === 'Lombardia' &&
      /alimentari|generi di prima necessita|negozio alimentare|minimarket|commercio al dettaglio|piccolo comune|piccoli comuni|frazione|frazioni/.test(
        profileSignalNorm,
      )
    ) {
      pinnedStrategicTitles.push('nuova impresa');
    }
    if (businessExists === true && userRegionCanonical === 'Lombardia' && /museo|musei|museale|spazi espositivi/.test(profileSignalNorm)) {
      pinnedStrategicTitles.push('musei d impresa');
    }
    if (businessExists === true && /macchinari|beni strumentali|attrezzature|impianti|industria 4 0/.test(profileSignalNorm)) {
      pinnedStrategicTitles.push('nuova sabatini');
    }
    if (businessExists === true && userRegionCanonical === 'Marche' && /smau|fiera|fiere|stand|buyer|b2b|internazionalizzazione/.test(profileSignalNorm)) {
      pinnedStrategicTitles.push('smau');
    }
    if (businessExists === true && userRegionCanonical === 'Emilia-Romagna' && /fiera|fiere|stand|internazionalizzazione|buyer|b2b/.test(profileSignalNorm)) {
      pinnedStrategicTitles.push('cciaa bologna');
    }

    const pinnedStrategicTitlesUnique = Array.from(new Set(pinnedStrategicTitles));
    const candidateMap = new Map<string, Candidate>();
    for (const entry of chosenTextPool) {
      if (entry.result.hardStatus === 'not_eligible') continue;
      candidateMap.set(entry.result.id, { result: entry.result, contributionMatched: entry.contributionMatched });
    }
    for (const entry of mapped) {
      if (
        !entry.isOpen ||
        !entry.regionOk ||
        !entry.atecoOk ||
        !entry.beneficiariesOk ||
        !entry.businessStageOk ||
        !entry.demographicsOk ||
        !entry.strategicOk ||
        !entry.hardEligibilityPassed ||
        entry.result.hardStatus === 'not_eligible'
      ) {
        continue;
      }
      const titleNorm = normalizeForMatch(entry.result.title);
      if (!pinnedStrategicTitlesUnique.some((pinned) => titleNorm.includes(pinned))) continue;
      candidateMap.set(entry.result.id, { result: entry.result, contributionMatched: entry.contributionMatched });
    }

    const candidates: Candidate[] = [...candidateMap.values()].map((entry) => ({
      ...entry,
      result: applyStrategicResultOverrides(entry.result),
    }));
    const profilePriorityRules = [
      ...caseProfileResolution.profilePriorityRules,
      ...southYouthStartupPriorityRules(southYouthStartupProfile),
    ];
    const sortedBase = dedupeCandidatesByTitle(sortCandidatesForDisplay(candidates, pinnedStrategicTitlesUnique, profilePriorityRules));
    const chatStrictEnabled = channel === 'chat' && strictness === 'high';
    const strictSorted = chatStrictEnabled ? applyChatStrictCandidateFilter(sortedBase, strictContext) : sortedBase;
    const targetAmount = requestedContribution ?? budget ?? null;
    const precisionSorted = chatStrictEnabled
      ? applyChatPrecisionPolicy({
          candidates: strictSorted,
          context: strictContext,
          contributionPreference,
          targetAmount,
          pinnedStrategicTitles: pinnedStrategicTitlesUnique,
          profilePriorityRules,
        })
      : strictSorted;
    const sortedBasePool = chatStrictEnabled ? (precisionSorted.length > 0 ? precisionSorted : strictSorted) : strictSorted;
    const strategicRecallPool: Candidate[] = southYouthStartupProfile
      ? mapped
          .filter(
            (entry) =>
              entry.isOpen &&
              entry.regionOk &&
              entry.businessStageOk &&
              entry.demographicsOk &&
              entry.strategicOk &&
              entry.hardEligibilityPassed &&
              entry.result.hardStatus !== 'not_eligible' &&
              (isRestoResult(entry.result) || isFuseseResult(entry.result) || isOnResult(entry.result)),
          )
          .map((entry) => ({ result: applyStrategicResultOverrides(entry.result), contributionMatched: entry.contributionMatched }))
      : [];
    const sorted = southYouthStartupProfile
      ? mergeStrategicRecallCandidates({
          base: sortedBasePool,
          recall: strategicRecallPool,
          pinnedStrategicTitles: pinnedStrategicTitlesUnique,
          profilePriorityRules,
        })
      : sortedBasePool;

    const qualityThreshold = southYouthStartupProfile ? 0.35 : 0.56;
    const pickFrom = (pool: Candidate[]) => {
      return pool.filter((x) => x.result.score >= qualityThreshold && x.result.hardStatus !== 'not_eligible').slice(0, limit);
    };

    let strictMatchesFound = false;
    let pickedCandidates: Candidate[] = [];

    if (contributionPrefInfo.strict) {
      const strictPool = sorted.filter((c) => c.contributionMatched && c.result.hardStatus !== 'not_eligible');
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

    if (southYouthStartupProfile) {
      const strategicFront = sorted.filter((candidate) => {
        if (candidate.result.hardStatus === 'not_eligible') return false;
        // Re-verify territory even in front list just to be sure
        const territoryOk = candidate.result.matchReasons?.some(r => r.includes('disponibile in') || r.includes('nazionale')) || 
                           !candidate.result.mismatchFlags?.some(m => m.includes('regione') || m.includes('territorio'));
        if (!territoryOk) return false;

        return isRestoResult(candidate.result) || isFuseseResult(candidate.result) || isOnResult(candidate.result);
      });
      if (strategicFront.length > 0) {
        const byId = new Set<string>();
        const merged: Candidate[] = [];
        for (const candidate of [...strategicFront, ...pickedCandidates]) {
          if (byId.has(candidate.result.id)) continue;
          merged.push(candidate);
          byId.add(candidate.result.id);
          if (merged.length >= limit) break;
        }
        pickedCandidates = merged;
      }
    }

    const items = pickedCandidates.map((c) => c.result);
    const itemsWithBooking = items.map((item) => ({
      ...item,
      bookingUrl: buildBookingUrl(bookingBase, {
        bandoId: item.id,
        region,
        sector,
      }),
    }));
    const topScore = itemsWithBooking[0]?.matchScore ?? null;
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

    const topPickBandoId = itemsWithBooking[0]?.id ?? null;
    const bookingUrl = buildBookingUrl(bookingBase, {
      bandoId: topPickBandoId,
      region,
      sector
    });
    const refineQuestionV3 = buildRefineQuestionV3({ missingSignals: [], fallback: refineQuestion ?? null });
    const advice = buildResultAwareRefineQuestion(items as unknown as IncentiviDoc[], normalizedProfile);
    const finalRefineQuestion = advice.question || refineQuestionV3 || null;

    return NextResponse.json({
      phase: mode,
      matchingVersion,
      profilePriorityApplied,
      explanation: buildExplanation({
        region,
        sector,
        fundingGoal,
        contributionPreference,
        strictPreferenceLabel: contributionPrefInfo.label,
        strictPreferenceRequested: contributionPrefInfo.strict,
        strictMatchesFound,
        resultsCount: itemsWithBooking.length
      }),
      results: itemsWithBooking,
      nearMisses: [],
      qualityBand,
      refineQuestion: finalRefineQuestion ?? undefined,
      strategicAdvice: advice.strategicAdvice ?? undefined,
      topPickBandoId,
      bookingUrl,
      diagnostics:
        process.env.MATCHING_DIAGNOSTICS === 'true'
          ? {
              rejectedByGate,
              activeCaseIds: caseProfileResolution.activeCaseIds,
              profileSignals: {
                region: normalizedProfile.region,
                businessExists: normalizedProfile.businessExists,
                sector: normalizedProfile.sector,
                activityType: normalizedProfile.activityType,
                age: normalizedProfile.age,
                ageBand: normalizedProfile.ageBand,
                employmentStatus: normalizedProfile.employmentStatus,
                fundingGoal: normalizedProfile.fundingGoal,
              },
            }
          : undefined,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore scan.' }, { status: 500 });
  }
}
