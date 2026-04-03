import { loadHybridDatasetDocs } from '@/lib/matching/datasetRepository';
import type { IncentiviDoc } from '@/lib/matching/types';
import { STRATEGIC_SCANNER_DOCS } from '@/lib/strategicScannerDocs';

export type MeasureFactSource = 'scanner_dataset' | 'none';

export type ResolvedMeasureFacts = {
  measureId: string;
  measureTitle: string;
  aidForm: string | null;
  aidIntensity: string | null;
  economicOffer: {
    displayAmountLabel?: string;
    displayProjectAmountLabel?: string;
    displayCoverageLabel?: string;
    coverageMinPercent?: number | null;
    coverageMaxPercent?: number | null;
  } | null;
  hasVoucher: boolean;
  coversUpTo100: boolean;
  sourceUrl: string | null;
  source: MeasureFactSource;
};

type MeasureHints = {
  canonicalTitle: string;
  titleTokens: string[];
  idTokens: string[];
};

const MEASURE_HINTS: Record<string, MeasureHints> = {
  'resto-al-sud-20': {
    canonicalTitle: 'Resto al Sud 2.0',
    titleTokens: ['resto', 'sud', '2.0'],
    idTokens: ['resto', 'sud'],
  },
  'autoimpiego-centro-nord': {
    canonicalTitle: 'Autoimpiego Centro-Nord',
    titleTokens: ['autoimpiego', 'centro', 'nord'],
    idTokens: ['autoimpiego', 'centro', 'nord'],
  },
  'nuova-sabatini': {
    canonicalTitle: 'Nuova Sabatini',
    titleTokens: ['sabatini'],
    idTokens: ['sabatini'],
  },
  'smart-start': {
    canonicalTitle: 'Smart&Start Italia',
    titleTokens: ['smart', 'start'],
    idTokens: ['smart', 'start'],
  },
  'on-tasso-zero': {
    canonicalTitle: 'ON - Oltre Nuove Imprese a Tasso Zero',
    titleTokens: ['oltre', 'nuove', 'imprese', 'tasso', 'zero'],
    idTokens: ['oltre', 'nuove', 'imprese', 'tasso', 'zero'],
  },
  fusese: {
    canonicalTitle: 'FUSESE',
    titleTokens: ['fusese'],
    idTokens: ['fusese'],
  },
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asDoc(raw: unknown): IncentiviDoc {
  return (raw ?? {}) as IncentiviDoc;
}

function scoreDoc(doc: IncentiviDoc, hints: MeasureHints): number {
  const titleNorm = normalize(doc.title);
  const idNorm = normalize(doc.id);
  const descNorm = normalize(doc.description);
  const searchable = `${titleNorm} ${descNorm}`.trim();

  let score = 0;
  for (const token of hints.titleTokens) {
    const tokenNorm = normalize(token);
    if (!tokenNorm) continue;
    if (titleNorm.includes(tokenNorm)) score += 6;
    else if (searchable.includes(tokenNorm)) score += 2;
  }
  for (const token of hints.idTokens) {
    const tokenNorm = normalize(token);
    if (idNorm.includes(tokenNorm)) score += 4;
  }
  if (doc.institutionalLink) score += 1;
  if (doc.displayCoverageLabel) score += 1;
  if (doc.supportForm) score += 1;
  return score;
}

function formatCoverageLabel(doc: IncentiviDoc): string | null {
  const direct = typeof doc.displayCoverageLabel === 'string' ? doc.displayCoverageLabel.trim() : '';
  if (direct) return direct;
  const min = toNumber(doc.coverageMinPercent);
  const max = toNumber(doc.coverageMaxPercent);
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    if (Math.round(min) === Math.round(max)) return `${Math.round(max)}%`;
    return `${Math.round(min)}% - ${Math.round(max)}%`;
  }
  return `${Math.round((max ?? min) as number)}%`;
}

function hasVoucherSupport(doc: IncentiviDoc): boolean {
  const support = toArray(doc.supportForm).map(normalize).join(' ');
  const titleAndDesc = `${normalize(doc.title)} ${normalize(doc.description)}`;
  return support.includes('voucher') || titleAndDesc.includes('voucher');
}

function resolvesTo100(doc: IncentiviDoc, aidIntensity: string | null): boolean {
  const max = toNumber(doc.coverageMaxPercent);
  if (max !== null && max >= 100) return true;
  const min = toNumber(doc.coverageMinPercent);
  if (min !== null && min >= 100) return true;
  const text = normalize(
    [aidIntensity, doc.displayAmountLabel, doc.displayProjectAmountLabel, doc.description]
      .filter(Boolean)
      .join(' '),
  );
  return text.includes('100') || text.includes('al 100');
}

function buildFactsFromDoc(measureId: string, hints: MeasureHints, doc: IncentiviDoc | null): ResolvedMeasureFacts | null {
  if (!doc) return null;
  const aidFormList = toArray(doc.supportForm);
  const aidForm = aidFormList.length > 0 ? aidFormList.join(', ') : null;
  const aidIntensity = formatCoverageLabel(doc);
  const coversUpTo100 = resolvesTo100(doc, aidIntensity);
  const hasVoucher = hasVoucherSupport(doc);

  return {
    measureId,
    measureTitle: doc.title?.trim() || hints.canonicalTitle,
    aidForm,
    aidIntensity,
    economicOffer: {
      displayAmountLabel: doc.displayAmountLabel ?? undefined,
      displayProjectAmountLabel: doc.displayProjectAmountLabel ?? undefined,
      displayCoverageLabel: aidIntensity ?? undefined,
      coverageMinPercent: toNumber(doc.coverageMinPercent),
      coverageMaxPercent: toNumber(doc.coverageMaxPercent),
    },
    hasVoucher,
    coversUpTo100,
    sourceUrl: (doc.institutionalLink ?? doc.url ?? null) as string | null,
    source: 'scanner_dataset',
  };
}

export async function resolveMeasureFactsById(
  measureId: string,
  fallbackTitle?: string | null,
): Promise<ResolvedMeasureFacts | null> {
  const hints =
    MEASURE_HINTS[measureId] ??
    (fallbackTitle
      ? {
          canonicalTitle: fallbackTitle,
          titleTokens: normalize(fallbackTitle).split(' ').filter((token) => token.length >= 3),
          idTokens: normalize(measureId).split(' ').filter((token) => token.length >= 3),
        }
      : null);

  if (!hints) return null;

  const hybrid = await loadHybridDatasetDocs().catch(() => ({ docs: [] as IncentiviDoc[] }));
  const datasetMatch = hybrid.docs
    .map((doc) => ({ doc, score: scoreDoc(doc, hints) }))
    .filter((entry) => entry.score >= 8)
    .sort((a, b) => b.score - a.score)[0]?.doc;

  if (datasetMatch) {
    return buildFactsFromDoc(measureId, hints, datasetMatch);
  }

  const strategicDocs = STRATEGIC_SCANNER_DOCS.map((entry) => asDoc(entry));
  const strategicMatch = strategicDocs
    .map((doc) => ({ doc, score: scoreDoc(doc, hints) }))
    .filter((entry) => entry.score >= 8)
    .sort((a, b) => b.score - a.score)[0]?.doc;

  return buildFactsFromDoc(measureId, hints, strategicMatch ?? null);
}
