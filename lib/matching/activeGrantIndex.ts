import { loadHybridDatasetDocs } from '@/lib/matching/datasetRepository';
import type { IncentiviDoc } from '@/lib/matching/types';

const ITALIAN_REGION_HINTS = [
  'abruzzo',
  'basilicata',
  'calabria',
  'campania',
  'emilia-romagna',
  'emilia romagna',
  'friuli-venezia giulia',
  'friuli venezia giulia',
  'lazio',
  'liguria',
  'lombardia',
  'marche',
  'molise',
  'piemonte',
  'puglia',
  'sardegna',
  'sicilia',
  'toscana',
  'trentino-alto adige',
  'trentino alto adige',
  "valle d'aosta",
  'valle d aosta',
  'veneto',
];

const ITALIAN_SCOPE_HINTS = ['italia', 'nazional', 'tutto il territorio'];
const EU_ONLY_HINTS = [
  'unione europea',
  'european union',
  'european commission',
  'commissione europea',
  'horizon',
  'erasmus',
  'creative europe',
  'msca',
  'eacea',
];

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isOpenNow(doc: IncentiviDoc, nowMs: number): boolean {
  const openDate = parseDate(doc.openDate);
  const closeDate = parseDate(doc.closeDate);
  if (openDate && nowMs < openDate.getTime()) return false;
  if (closeDate && nowMs > closeDate.getTime()) return false;
  return true;
}

function inferItalianScope(doc: IncentiviDoc): boolean {
  const regions = asList(doc.regions).map(normalizeText);
  if (regions.some((entry) => ITALIAN_REGION_HINTS.some((hint) => entry.includes(hint)))) return true;
  if (regions.some((entry) => ITALIAN_SCOPE_HINTS.some((hint) => entry.includes(hint)))) return true;

  const authority = normalizeText(doc.authorityName);
  const title = normalizeText(doc.title);
  const sourceUrl = typeof doc.url === 'string' ? doc.url.trim().toLowerCase() : '';
  const officialUrl = typeof doc.institutionalLink === 'string' ? doc.institutionalLink.trim().toLowerCase() : '';
  const url = normalizeText(doc.url);
  const source = `${authority} ${title} ${url}`.trim();

  const hasItalianSignal =
    ITALIAN_SCOPE_HINTS.some((hint) => source.includes(hint)) ||
    /(regione|camera di commercio|cciaa|invitalia|minist|comune|provincia|unioncamere|agenzia delle entrate|inail|inps)/.test(source);
  if (hasItalianSignal) return true;

  const hasItalianDomainSignal =
    sourceUrl.includes('.it/') ||
    sourceUrl.endsWith('.it') ||
    officialUrl.includes('.it/') ||
    officialUrl.endsWith('.it') ||
    sourceUrl.includes('/it/') ||
    officialUrl.includes('/it/');
  if (hasItalianDomainSignal) return true;

  return false;
}

function isLikelyItalianSource(doc: IncentiviDoc): boolean {
  if (inferItalianScope(doc)) return true;

  const authority = normalizeText(doc.authorityName);
  const title = normalizeText(doc.title);
  const description = normalizeText(doc.description);
  const source = `${authority} ${title} ${description}`.trim();
  return /(impresa|imprese|italia|nazional|camera di commercio|regione|ministero|incentivo)/.test(source);
}

function isEuOnly(doc: IncentiviDoc): boolean {
  const title = normalizeText(doc.title);
  const authority = normalizeText(doc.authorityName);
  const description = normalizeText(doc.description);
  const regions = asList(doc.regions).map(normalizeText).join(' ');
  const source = `${title} ${authority} ${description} ${regions}`.trim();

  const hasEuSignals = EU_ONLY_HINTS.some((hint) => source.includes(hint));
  if (!hasEuSignals) return false;

  const hasItalianSignals =
    inferItalianScope(doc) ||
    /(invitalia|minist|regione|camera di commercio|cciaa|unioncamere)/.test(source);
  return !hasItalianSignals;
}

function dedupeKey(doc: IncentiviDoc): string {
  const institutional = String(doc.institutionalLink ?? '').trim();
  if (institutional) return `official:${institutional}`;
  const url = String(doc.url ?? '').trim();
  if (url) return `url:${url}`;
  const id = String(doc.id ?? '').trim();
  if (id) return `id:${id}`;
  return `title:${normalizeText(doc.title)}`;
}

export type ActiveGrantUniverse = {
  docs: IncentiviDoc[];
  universeCount: number;
  excludedEuCount: number;
  excludedInactiveCount: number;
  dedupedCount: number;
  source: 'supabase' | 'tmp-cache' | 'bundled-seed';
  fetchedAt: string | null;
};

export async function loadActiveGrantUniverse(): Promise<ActiveGrantUniverse> {
  const snapshot = await loadHybridDatasetDocs();
  const nowMs = Date.now();

  const italianNoEuFiltered: IncentiviDoc[] = [];
  let excludedEuCount = 0;
  for (const doc of snapshot.docs) {
    if (isEuOnly(doc)) {
      excludedEuCount += 1;
      continue;
    }
    if (!isLikelyItalianSource(doc)) {
      excludedEuCount += 1;
      continue;
    }
    italianNoEuFiltered.push(doc);
  }

  const activeOnly: IncentiviDoc[] = [];
  let excludedInactiveCount = 0;
  for (const doc of italianNoEuFiltered) {
    if (!isOpenNow(doc, nowMs)) {
      excludedInactiveCount += 1;
      continue;
    }
    activeOnly.push(doc);
  }

  const unique = new Map<string, IncentiviDoc>();
  for (const doc of activeOnly) {
    const key = dedupeKey(doc);
    if (!unique.has(key)) unique.set(key, doc);
  }

  const docs = [...unique.values()];
  const dedupedCount = Math.max(0, activeOnly.length - docs.length);

  return {
    docs,
    universeCount: docs.length,
    excludedEuCount,
    excludedInactiveCount,
    dedupedCount,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
  };
}
