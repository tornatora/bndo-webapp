'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProgressBarPro as ProgressBar } from '@/components/views/ProgressBarPro';
import GrantAiPopup from '@/components/views/GrantAiPopup';
import { GrantDetailExpandableSections } from '@/components/views/GrantDetailExpandableSections';

interface GrantDetail {
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
  description?: string | null;
  requiredDocuments?: string[];
  requisitiHard: Record<string, unknown>;
  requisitiSoft: Record<string, unknown>;
  requisitiStrutturati: Record<string, unknown>;
}

interface Explainability {
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
}

interface GrantDetailSectionBlock {
  kind: 'official_facts' | 'bndo_explanation' | 'examples' | 'warnings';
  title: string;
  items: string[];
}

interface GrantDetailSectionSource {
  label: string;
  location: string;
  excerpt?: string;
  url?: string;
}

interface GrantDetailSectionPayload {
  id: string;
  title: string;
  summary: string;
  status: 'grounded' | 'partial';
  blocks: GrantDetailSectionBlock[];
  sources: GrantDetailSectionSource[];
}

interface GrantDetailContentPayload {
  schemaVersion: 'grant_detail_content_v1';
  generationVersion: string;
  generatedAt: string;
  sourceFingerprint: string;
  completenessScore: number;
  warnings: string[];
  sections: GrantDetailSectionPayload[];
}

const CONSULTING_EMAIL = process.env.NEXT_PUBLIC_CONSULTING_EMAIL || 'admin@grants.local';
const CONSULTING_URL = process.env.NEXT_PUBLIC_CONSULTING_URL || '';

const formatDate = (value: string | null, fallback: string) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('it-IT');
};

const formatMoney = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || value <= 0) return 'In aggiornamento su fonte ufficiale';
  return `€ ${Math.round(value).toLocaleString('it-IT')}`;
};

const toNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.').trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const ITALIAN_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  "Valle d'Aosta",
  'Veneto',
];

const normalizeRegionToken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractRegionsFromText = (value: string): string[] => {
  const norm = normalizeRegionToken(value);
  if (!norm) return [];
  const found: string[] = [];
  for (const region of ITALIAN_REGIONS) {
    const token = normalizeRegionToken(region);
    if (token && norm.includes(token)) {
      found.push(region);
    }
  }
  return Array.from(new Set(found));
};

const hasExplicitMultiRegionSignal = (value: string) => {
  const norm = normalizeRegionToken(value);
  if (!norm) return false;
  return /(interregion|piu regioni|più regioni|multi-?region|macro-?area|tutte le regioni|tutto il territorio|nazionale|italia)/.test(norm);
};

const sanitizeTerritoryLine = (line: string, primaryRegion: string | null, allowMulti: boolean): string => {
  if (!primaryRegion || allowMulti) return line;
  const lineNorm = normalizeText(line);
  if (!/(territorio|area|regione|sede|localizz|provincia|comune)/.test(lineNorm)) return line;
  const lineRegions = extractRegionsFromText(line);
  if (lineRegions.length <= 1) return line;
  if (!lineRegions.includes(primaryRegion)) return line;
  const colonIndex = line.indexOf(':');
  if (colonIndex >= 0) {
    return `${line.slice(0, colonIndex + 1)} ${primaryRegion}`;
  }
  return primaryRegion;
};

const formatMoneyRange = (min: number | null, max: number | null): string | null => {
  if (min !== null && max !== null) {
    if (Math.abs(min - max) < 1) return formatMoney(max);
    return `Da ${formatMoney(min)} a ${formatMoney(max)}`;
  }
  if (max !== null) return `Fino a ${formatMoney(max)}`;
  if (min !== null) return `Da ${formatMoney(min)}`;
  return null;
};

const formatPercentRange = (min: number | null, max: number | null): string | null => {
  const safeMin = min !== null && Number.isFinite(min) && min > 0 ? Math.max(1, Math.min(100, min)) : null;
  const safeMax = max !== null && Number.isFinite(max) && max > 0 ? Math.max(1, Math.min(100, max)) : null;
  if (safeMin !== null && safeMax !== null) {
    const low = Math.round(Math.min(safeMin, safeMax));
    const high = Math.round(Math.max(safeMin, safeMax));
    return low === high ? `${high}%` : `${low}% - ${high}%`;
  }
  if (safeMax !== null) return `${Math.round(safeMax)}%`;
  if (safeMin !== null) return `${Math.round(safeMin)}%`;
  return null;
};

const parseCoverageRange = (
  label: string | null | undefined,
  structuredEconomic: Record<string, unknown> | undefined,
): { min: number | null; max: number | null } => {
  const fromMin = toNumeric(structuredEconomic?.estimatedCoverageMinPercent);
  const fromMax = toNumeric(structuredEconomic?.estimatedCoverageMaxPercent);
  if (fromMin !== null || fromMax !== null) {
    return { min: fromMin ?? fromMax, max: fromMax ?? fromMin };
  }

  const raw = typeof label === 'string' ? label : '';
  const matches = Array.from(raw.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g))
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 100);
  if (!matches.length) {
    return { min: null, max: null };
  }
  return {
    min: Math.min(...matches),
    max: Math.max(...matches),
  };
};

const PLACEHOLDER_PATTERNS = [
  'da verificare',
  'n/d',
  'non disponibile',
  'in aggiornamento',
  'non indicato',
  'not available',
];

const isPlaceholderValue = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return PLACEHOLDER_PATTERNS.some((token) => normalized.includes(token));
};

const cleanEconomicLabel = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isPlaceholderValue(trimmed) ? null : trimmed;
};

type AidSemanticMode =
  | 'fondo_perduto'
  | 'interessi'
  | 'finanziamento'
  | 'garanzia'
  | 'misto'
  | 'non_specificato';

const inferAidSemanticMode = (detail: GrantDetail): AidSemanticMode => {
  const source = normalizeText([detail.aidForm, detail.aidIntensity, detail.description].filter(Boolean).join(' '));
  if (!source) return 'non_specificato';

  const hasFondoPerduto = /(fondo perduto|conto capitale|conto impianti|contributo diretto|voucher)/.test(source);
  const hasInteressi = /(conto interess|abbattiment[oa] tasso|tasso agevolat|interessi passivi|contributo interessi|tasso d.?interesse)/.test(
    source,
  );
  const hasFinanziamento = /(finanziamento agevolato|mutuo agevolato|prestito agevolato|credito agevolato)/.test(source);
  const hasGaranzia = /(garanzia pubblica|fondo di garanzia|garanzia statale)/.test(source);

  const activeModes = [hasFondoPerduto, hasInteressi, hasFinanziamento, hasGaranzia].filter(Boolean).length;
  if (activeModes > 1) return 'misto';
  if (hasFondoPerduto) return 'fondo_perduto';
  if (hasInteressi) return 'interessi';
  if (hasFinanziamento) return 'finanziamento';
  if (hasGaranzia) return 'garanzia';
  return 'non_specificato';
};

const parseMoneyToken = (value: string): number | null => {
  const cleaned = value.replace(/\s+/g, '').replace(/€/g, '').replace(/[^0-9,.-]/g, '');
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = cleaned.match(/\./g)?.length ?? 0;
    if (dots >= 1) normalized = cleaned.replace(/\./g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const extractMoneyRangeFromText = (value: string | null | undefined): { min: number | null; max: number | null } => {
  if (!value) return { min: null, max: null };
  const text = value.replace(/\s+/g, ' ');

  const rangeMatch = text.match(
    /da\s+([\d.,]+)\s*(?:€|euro)?\s*(?:fino\s*)?(?:a|ad)\s+([\d.,]+)\s*(?:€|euro)/i,
  );
  if (rangeMatch) {
    const min = parseMoneyToken(rangeMatch[1]);
    const max = parseMoneyToken(rangeMatch[2]);
    if (min !== null || max !== null) {
      return {
        min: min !== null && max !== null ? Math.min(min, max) : min ?? max,
        max: min !== null && max !== null ? Math.max(min, max) : max ?? min,
      };
    }
  }

  const upToMatches = Array.from(text.matchAll(/fino\s+(?:a|ad)?\s*([\d.,]+)\s*(?:€|euro)/gi))
    .map((match) => parseMoneyToken(match[1]))
    .filter((num): num is number => num !== null);
  if (upToMatches.length > 0) {
    return { min: null, max: Math.max(...upToMatches) };
  }

  const euroMatches = Array.from(text.matchAll(/([\d][\d.,]{2,})\s*(?:€|euro)/gi))
    .map((match) => parseMoneyToken(match[1]))
    .filter((num): num is number => num !== null);
  if (euroMatches.length > 0) {
    return { min: Math.min(...euroMatches), max: Math.max(...euroMatches) };
  }

  return { min: null, max: null };
};

const buildConciseDescription = (description: string | null | undefined): string | null => {
  if (!description) return null;
  const clean = description
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!sentences.length) return `${clean.slice(0, 237).trim()}…`;

  const userValueRegex =
    /(finanzia|sostiene|agevola|copre|contribut|voucher|investiment|spes[ae]|imprese|beneficiar|attivita|progett|digital|innovaz|energia|export|internaz)/i;
  const legalNoiseRegex =
    /(decreto|circolare|regolamento|gazzetta|art\.|articolo|comma|ai sensi|d\.lgs|d\.l\.|ue\s*\d|202\d\/\d+)/i;

  const preferred = sentences.filter((sentence) => userValueRegex.test(normalizeText(sentence)) && !legalNoiseRegex.test(normalizeText(sentence)));
  const fallback = sentences.filter((sentence) => !legalNoiseRegex.test(normalizeText(sentence)));
  const source = preferred.length > 0 ? preferred : fallback.length > 0 ? fallback : sentences;

  const picked: string[] = [];
  let used = 0;
  for (const sentence of source) {
    const normalizedSentence = sentence.replace(/\s+/g, ' ').trim();
    if (!normalizedSentence) continue;
    const nextLen = used + normalizedSentence.length + (picked.length ? 1 : 0);
    if (nextLen > 280) break;
    picked.push(normalizedSentence);
    used = nextLen;
    if (picked.length >= 2) break;
  }

  if (picked.length > 0) return picked.join(' ');
  return `${source[0].slice(0, 277).trim()}…`;
};

const economicSummaryFromDetail = (
  detail: GrantDetail,
): { grantAmount: string; coverage: string; projectAmount: string; coverageTitle: string } => {
  const structuredEconomic =
    detail.requisitiStrutturati && typeof detail.requisitiStrutturati === 'object'
      ? (detail.requisitiStrutturati.economic as Record<string, unknown> | undefined)
      : undefined;
  const displayAmountLabel = cleanEconomicLabel(structuredEconomic?.displayAmountLabel);
  const displayProjectAmountLabel = cleanEconomicLabel(structuredEconomic?.displayProjectAmountLabel);
  const displayCoverageLabel = cleanEconomicLabel(structuredEconomic?.displayCoverageLabel);

  const grantMin = toNumeric(structuredEconomic?.grantMin);
  const grantMax = toNumeric(structuredEconomic?.grantMax);
  const costMin = toNumeric(structuredEconomic?.costMin);
  const costMax = toNumeric(structuredEconomic?.costMax);
  const budgetAllocation = toNumeric(structuredEconomic?.budgetAllocation);
  const estimatedCoverageLabel = cleanEconomicLabel(structuredEconomic?.estimatedCoverageLabel);
  const aidIntensityLabel = cleanEconomicLabel(detail.aidIntensity);
  const economicSourceText = [detail.description, displayCoverageLabel, estimatedCoverageLabel, aidIntensityLabel]
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const rawCoverageLabel = displayCoverageLabel || estimatedCoverageLabel || aidIntensityLabel || null;
  const coverageRange = parseCoverageRange(rawCoverageLabel || economicSourceText, structuredEconomic);
  const aidMode = inferAidSemanticMode(detail);
  const isInterestOnlyMeasure = aidMode === 'interessi';
  const isMixedMeasure = aidMode === 'misto';
  const inferredProjectFromText = extractMoneyRangeFromText(detail.description);
  const inferredGrantFromCostMin =
    costMin !== null && coverageRange.min !== null ? (costMin * coverageRange.min) / 100 : null;
  const inferredGrantFromCostMax =
    costMax !== null && coverageRange.max !== null ? (costMax * coverageRange.max) / 100 : null;

  let grantOutMin = isInterestOnlyMeasure ? null : grantMin ?? inferredGrantFromCostMin;
  let grantOutMax = isInterestOnlyMeasure ? null : grantMax ?? inferredGrantFromCostMax;
  if (grantOutMin === null && !isInterestOnlyMeasure && detail.budgetTotal && coverageRange.min !== null) {
    grantOutMin = (detail.budgetTotal * coverageRange.min) / 100;
  }
  if (grantOutMax === null && !isInterestOnlyMeasure && detail.budgetTotal && coverageRange.max !== null) {
    grantOutMax = (detail.budgetTotal * coverageRange.max) / 100;
  }

  const values = [grantMin, grantMax, costMin, costMax].filter(
    (value): value is number => value !== null && Number.isFinite(value) && value > 0,
  );
  const hasOnlyTinyEconomicValues = values.length > 0 && Math.max(...values) < 5000;

  const projectMin = costMin ?? inferredProjectFromText.min;
  const projectMax = costMax ?? inferredProjectFromText.max;

  const computedGrantAmount =
    isInterestOnlyMeasure
      ? 'Contributo calcolato sugli interessi del finanziamento (non fondo perduto diretto)'
      : !hasOnlyTinyEconomicValues
      ? formatMoneyRange(grantOutMin, grantOutMax) ??
        (detail.budgetTotal
          ? `Fino a ${formatMoney(detail.budgetTotal)}`
          : budgetAllocation
            ? `Fino a ${formatMoney(budgetAllocation)}`
            : aidMode === 'finanziamento'
              ? 'Importo finanziabile da definire con banca/ente gestore'
              : aidMode === 'garanzia'
                ? 'Importo garantibile legato al finanziamento richiesto'
                : 'Importo contributo previsto dalla misura')
      : detail.budgetTotal
        ? `Fino a ${formatMoney(detail.budgetTotal)}`
        : budgetAllocation
          ? `Fino a ${formatMoney(budgetAllocation)}`
          : 'Importo contributo previsto dalla misura';
  const fallbackCoverageLabel =
    formatPercentRange(coverageRange.min, coverageRange.max) ||
    (detail.aidForm && normalizeText(detail.aidForm).includes('fondo perduto')
      ? 'Fondo perduto previsto dal bando'
      : 'Copertura prevista dalla misura');

  const coverage = isInterestOnlyMeasure
    ? rawCoverageLabel
      ? `${rawCoverageLabel} (conto interessi, non fondo perduto)`
        : fallbackCoverageLabel && !/copertura prevista dalla misura/i.test(fallbackCoverageLabel)
        ? `${fallbackCoverageLabel} (conto interessi, non fondo perduto)`
        : 'Aliquota interessi agevolata (non fondo perduto)'
    : aidMode === 'finanziamento'
      ? 'Finanziamento agevolato (non fondo perduto diretto)'
      : aidMode === 'garanzia'
        ? 'Garanzia pubblica su finanziamento (non contributo diretto)'
        : aidMode === 'non_specificato'
          ? rawCoverageLabel || 'Copertura prevista dalla misura'
          : isMixedMeasure
            ? rawCoverageLabel || fallbackCoverageLabel
            : rawCoverageLabel || fallbackCoverageLabel;

  const coverageTitle = isInterestOnlyMeasure
    ? 'Aliquota contributo interessi'
    : aidMode === 'finanziamento' || aidMode === 'garanzia'
      ? 'Tipologia copertura'
      : aidMode === 'non_specificato'
        ? 'Copertura indicata in scheda'
    : isMixedMeasure
      ? '% copertura misura (fondo perduto + interessi)'
      : '% fondo perduto / copertura';
  const computedProjectAmount = !hasOnlyTinyEconomicValues
    ? formatMoneyRange(projectMin, projectMax) ??
      (detail.budgetTotal ? `Fino a ${formatMoney(detail.budgetTotal)}` : 'Massimale progetto indicato in scheda')
    : detail.budgetTotal
      ? `Fino a ${formatMoney(detail.budgetTotal)}`
      : 'Massimale progetto indicato in scheda';

  const projectAmount = displayProjectAmountLabel || computedProjectAmount;
  const grantAmount = displayAmountLabel || computedGrantAmount || projectAmount;

  return { grantAmount, coverage, projectAmount, coverageTitle };
};

const buildConsultingLink = (grantId: string, grantTitle: string, officialUrl: string): string => {
  if (CONSULTING_URL) {
    try {
      const url = new URL(CONSULTING_URL);
      url.searchParams.set('grantId', grantId);
      url.searchParams.set('bando', grantTitle);
      return url.toString();
    } catch {
      return CONSULTING_URL;
    }
  }

  const subject = encodeURIComponent(`Prenotazione consulenza bando: ${grantTitle}`);
  const body = encodeURIComponent(
    `Ciao, vorrei prenotare una consulenza per questo bando:\n${grantTitle}\nLink ufficiale: ${officialUrl}`,
  );
  return `mailto:${CONSULTING_EMAIL}?subject=${subject}&body=${body}`;
};

const oneLine = (items: string[] | undefined, fallback: string, take = 3): string => {
  const values = (items ?? []).map((value) => String(value).trim()).filter(Boolean).slice(0, take);
  if (values.length === 0) return fallback;
  return values.join(' · ');
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
};

const formatSectorSummary = (sectors: string[], excludedSectors: string[], forceAllSectors: boolean): string => {
  const excludedNormalized = new Set(excludedSectors.map((item) => normalizeText(item)));
  const cleaned = sectors
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !excludedNormalized.has(normalizeText(item)));

  if (forceAllSectors) {
    if (excludedSectors.length > 0) {
      return `Tutti i settori economici (esclusi ${excludedSectors.join(', ')})`;
    }
    return 'Tutti i settori economici';
  }

  if (cleaned.length > 0) {
    return cleaned.slice(0, 4).join(' · ');
  }

  if (excludedSectors.length > 0) {
    return `Tutti i settori economici (esclusi ${excludedSectors.join(', ')})`;
  }

  return 'Settori da confermare';
};

const ensureSentenceStart = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
};

const humanizePositiveItem = (value: string): string => {
  const raw = value.replace(/^ok:\s*/i, '').replace(/^idoneo:\s*/i, '').trim();
  const normalized = normalizeText(raw);

  if (/territorio coerente|regione compatibile|territorio macro coerente/.test(normalized)) {
    return 'La tua area geografica è compatibile con il bando.';
  }
  if (/beneficiario coerente|forma giuridica coerente|beneficiari compatibili/.test(normalized)) {
    return 'Il profilo impresa rientra tra i beneficiari previsti.';
  }
  if (/tipo aiuto in linea|aiuto coerente/.test(normalized)) {
    return 'La forma di agevolazione è in linea con la tua richiesta.';
  }
  if (/adatto a nuova attivita|impresa da costituire coerente/.test(normalized)) {
    return 'Il bando è adatto a una nuova attività.';
  }
  if (/copertura economica alta/.test(normalized)) {
    return 'La copertura economica del bando è alta.';
  }

  const clean = ensureSentenceStart(raw.replace(/^requisiti hard compatibili$/i, 'Requisiti principali compatibili'));
  return clean.endsWith('.') ? clean : `${clean}.`;
};

const humanizeCriticalItem = (value: string): string => {
  const raw = value.replace(/^da verificare:\s*/i, '').trim();
  const normalized = normalizeText(raw);

  if (/settore da verificare|settore non compatibile/.test(normalized)) {
    return "Il settore dell'attività va confermato sui requisiti specifici.";
  }
  if (/ateco da verificare|ateco non compatibile/.test(normalized)) {
    return 'Serve confermare il codice ATECO richiesto dal bando.';
  }
  if (/forma giuridica da verificare|forma giuridica non compatibile/.test(normalized)) {
    return 'Va verificata la forma giuridica ammessa.';
  }
  if (/stato occupazionale da verificare|richiede stato disoccupato/.test(normalized)) {
    return 'Va verificato il requisito occupazionale richiesto.';
  }
  if (/territorio da verificare|regione non inclusa/.test(normalized)) {
    return 'Va verificata la copertura territoriale del bando.';
  }

  const clean = ensureSentenceStart(raw);
  return clean.endsWith('.') ? clean : `${clean}.`;
};

const toUniqueList = (items: Array<string | null | undefined>, limit = 6): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const value = String(raw ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!value) continue;
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
};

const getNestedValue = (root: unknown, path: string[]): unknown => {
  let cursor: unknown = root;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
};

const extractStructuredList = (root: unknown, paths: string[][], limit = 6): string[] => {
  const collected: string[] = [];
  for (const path of paths) {
    const value = getNestedValue(root, path);
    if (Array.isArray(value)) {
      for (const item of value) {
        const line = String(item ?? '').trim();
        if (line) collected.push(line);
      }
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      const segments = value
        .split(/[,;•·]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      collected.push(...segments);
    }
  }
  return toUniqueList(collected, limit);
};

const DETAIL_NOISE_PATTERNS = [
  'da verificare',
  'non disponibile',
  'n/d',
  'in aggiornamento',
  'non indicato',
  'coerente con il bando',
  'profilo compatibile',
  'decreto',
  'circolare',
  'regolamento',
  'gazzetta',
  'art.',
  'articolo',
  'comma',
  'ai sensi',
  'd.lgs',
  'd.l.',
];

const isUsefulDetailLine = (value: string | null | undefined): boolean => {
  const line = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!line || line.length < 12) return false;
  const norm = normalizeText(line);
  if (!norm) return false;
  if (DETAIL_NOISE_PATTERNS.some((token) => norm.includes(token))) return false;
  if (/\bue[-\s]*\d{3,4}\/\d+\b/.test(norm)) return false;
  if (/(n\.?\s*\d{3,}|prot\.?\s*\d{3,}|del\s+\d{1,2}\/\d{1,2}\/\d{2,4})/.test(norm)) return false;
  return true;
};

const sanitizeGuideLine = (value: string): string => {
  const clean = value
    .replace(/\s+/g, ' ')
    .replace(/\b(ATTENZIONE|NOTA|NB)\s*:\s*/gi, '')
    .replace(/\s*\(\s*non disponibile[^)]*\)/gi, '')
    .trim();
  return ensureSentenceStart(clean);
};

const extractKeywordSentences = (
  description: string | null | undefined,
  keywordRegex: RegExp,
  limit = 3,
): string[] => {
  if (!description) return [];
  const clean = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const picked = sentences.filter((sentence) => keywordRegex.test(normalizeText(sentence)));
  return toUniqueList(picked.filter(isUsefulDetailLine), limit);
};

const flattenObjectText = (input: unknown, out: string[], depth = 0) => {
  if (depth > 4 || input === null || input === undefined) return;
  if (typeof input === 'string') {
    const text = input.replace(/\s+/g, ' ').trim();
    if (isUsefulDetailLine(text)) out.push(text);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) flattenObjectText(item, out, depth + 1);
    return;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      flattenObjectText(value, out, depth + 1);
    }
  }
};

const hasNegativeHint = (value: string): boolean => {
  const norm = normalizeText(value);
  return /(non ammiss|non finanzi|inammiss|esclus|escluse|esclusi|vietat|non consentit|non eleggibil)/.test(norm);
};

const extractDocumentHints = (description: string | null | undefined): string[] => {
  if (!description) return [];
  const normalized = normalizeText(description);
  if (!normalized) return [];

  const hints: string[] = [];
  const push = (condition: boolean, label: string) => {
    if (condition) hints.push(label);
  };

  push(/documento identita|documenti identita|carta identita|passaporto/.test(normalized), "Documento d'identità");
  push(/codice fiscale/.test(normalized), 'Codice fiscale');
  push(/visura camerale|camera di commercio|cciaa/.test(normalized), 'Visura camerale aggiornata');
  push(/bilancio|dichiarazion[ei] fiscali|modello unico|unico/.test(normalized), 'Bilanci o dichiarazioni fiscali');
  push(/business plan|piano d.?impresa|piano economico/.test(normalized), 'Business plan / piano economico');
  push(/preventiv|offert[ae] fornitor/i.test(normalized), 'Preventivi di spesa');
  push(/durc/.test(normalized), 'DURC in corso di validità');
  push(/atto costitutivo|statuto/.test(normalized), 'Atto costitutivo / statuto');
  push(/pec/.test(normalized), 'Indirizzo PEC');
  push(/firma digitale/.test(normalized), 'Firma digitale');
  push(/titolo di disponibilita|contratto di locazione|comodato/.test(normalized), "Titolo disponibilità immobile");
  push(/autorizzazioni|permess/i.test(normalized), 'Autorizzazioni / permessi richiesti');

  return toUniqueList(hints, 8);
};

export function GrantDetailInlinePro({
  grantId,
  sourceChannel = 'direct',
  onVerify,
  onBack,
  showGrantAiPopup = true,
}: {
  grantId: string;
  sourceChannel?: 'scanner' | 'chat' | 'direct' | 'admin';
  onVerify?: (grantId: string) => void;
  onBack?: () => void;
  showGrantAiPopup?: boolean;
}) {
  const [detail, setDetail] = useState<GrantDetail | null>(null);
  const [explain, setExplain] = useState<Explainability | null>(null);
  const [detailContent, setDetailContent] = useState<GrantDetailContentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = String(grantId || '').trim();
    if (!id) {
      setError('ID bando non valido.');
      setDetail(null);
      setExplain(null);
      setDetailContent(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setDetail(null);
    setExplain(null);
    setDetailContent(null);

    const fetchWithTimeout = async (url: string, timeoutMs = 4_000) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { cache: 'no-store', signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const normalizeGrant = (rawGrant: GrantDetail): GrantDetail => ({
      ...rawGrant,
      beneficiaries: Array.isArray(rawGrant.beneficiaries) ? rawGrant.beneficiaries : [],
      sectors: Array.isArray(rawGrant.sectors) ? rawGrant.sectors : [],
      officialAttachments: Array.isArray(rawGrant.officialAttachments) ? rawGrant.officialAttachments : []
    });

    fetchWithTimeout(`/api/grants/${encodeURIComponent(id)}/page-content`)
      .then(async (pageRes) => {
        const pageJson = (await pageRes.json().catch(() => null)) as
          | {
              detail?: GrantDetail;
              explainability?: Explainability;
              detailContent?: GrantDetailContentPayload;
              error?: string;
            }
          | null;

        if (!pageRes.ok || !pageJson?.detail || !pageJson?.explainability) {
          throw new Error((pageJson && pageJson.error) || 'Errore caricamento pagina bando');
        }

        if (cancelled) return;
        setDetail(normalizeGrant(pageJson.detail));
        setExplain(pageJson.explainability);
        setDetailContent(pageJson.detailContent ?? null);
      })
      .catch(async (primaryError) => {
        try {
          const [grantRes, explainRes] = await Promise.all([
            fetchWithTimeout(`/api/grants/${encodeURIComponent(id)}`),
            fetchWithTimeout(`/api/grants/${encodeURIComponent(id)}/explainability`),
          ]);
          const grantJson = (await grantRes.json().catch(() => null)) as GrantDetail | { error?: string } | null;
          const explainJson = (await explainRes.json().catch(() => null)) as Explainability | { error?: string } | null;

          if (!grantRes.ok) {
            throw new Error((grantJson && 'error' in grantJson && grantJson.error) || 'Errore caricamento dettaglio bando');
          }
          if (!explainRes.ok) {
            throw new Error((explainJson && 'error' in explainJson && explainJson.error) || 'Errore explainability bando');
          }

          if (cancelled) return;
          setDetail(normalizeGrant(grantJson as GrantDetail));
          setExplain(explainJson as Explainability);
          setDetailContent(null);
          return;
        } catch {
          // Fallback non disponibile: mostriamo errore principale.
        }

        if (cancelled) return;
        const message =
          primaryError instanceof Error
            ? primaryError.message
            : 'Errore caricamento dettaglio. Riprova tra qualche secondo.';
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [grantId]);

  if (error) {
    return (
      <div className="grant-detail-page grant-detail-layout">
        <section className="premium-card fade-up p-6 grant-detail-section grant-detail-hero">
          <p className="grant-detail-eyebrow">Scheda bando</p>
          <h1 className="grant-detail-title">Dettaglio incentivo non disponibile</h1>
          <p className="grant-section-subtitle">{error}</p>
          <div className="grant-cta-row">
            {onBack ? (
              <button type="button" className="grant-cta-btn grant-cta-btn--solid" onClick={onBack}>
                Torna allo scanner
              </button>
            ) : (
              <Link href="/dashboard/scanner" className="grant-cta-btn grant-cta-btn--solid">
                Torna allo scanner
              </Link>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (!detail || !explain) {
    return (
      <div className="grant-detail-page grant-detail-layout">
        <section className="premium-card fade-up p-6 grant-detail-section grant-detail-hero">
          <p className="grant-detail-eyebrow">Scheda bando</p>
          <h1 className="grant-detail-title">Caricamento dettaglio incentivo…</h1>
          <p className="grant-section-subtitle">Sto recuperando dati, compatibilità e documentazione ufficiale.</p>
        </section>
      </div>
    );
  }

  const probability = Math.max(0, Math.min(100, Math.round(explain.probabilityScore || 0)));
  const hasProbability = Number.isFinite(explain.probabilityScore) && explain.probabilityScore > 0;
  const fallbackProbability = Math.max(
    55,
    Math.round(((explain.fitScore || 0) + (explain.completenessScore || 0) + (explain.eligibilityScore || 0)) / 3),
  );
  const displayedProbability = hasProbability ? probability : fallbackProbability;
  const consultingLink = buildConsultingLink(detail.id, detail.title, detail.officialUrl);
  const grantStatus = detail.availabilityStatus === 'incoming' ? 'In arrivo' : 'Aperto';
  const beneficiariesLabel = oneLine(detail.beneficiaries, 'Imprese');
  const excludedSectors = toStringList(detail.requisitiHard?.['settori_esclusi']);
  const scopeRaw = String(detail.requisitiHard?.['settori_scope'] ?? '').trim();
  const hasAllSectorsScope =
    normalizeText(scopeRaw).includes('tutti_tranne_esclusi') ||
    detail.sectors.some((sector) => normalizeText(sector).includes('tutti i settori economici'));
  const sectorsLabel = formatSectorSummary(detail.sectors, excludedSectors, hasAllSectorsScope);
  const openingLabel = formatDate(detail.openingDate, 'Già aperto');
  const deadlineLabel = formatDate(detail.deadlineDate, 'A sportello');
  const economicSummary = economicSummaryFromDetail(detail);
  const verifyRequirementsHref = `/dashboard/new-practice/quiz?grantId=${encodeURIComponent(detail.id)}&source=${encodeURIComponent(
    sourceChannel
  )}`;

  const handleVerify = () => {
    if (onVerify) {
      onVerify(detail.id);
    } else {
      window.location.href = verifyRequirementsHref;
    }
  };

  return (
    <div className="grant-detail-page grant-detail-layout">
      <section className="premium-card fade-up p-6 grant-detail-section grant-detail-hero">
        <div className="grant-hero-grid">
          <div>
            <p className="grant-detail-eyebrow">Scheda bando</p>
            <h1 className="grant-detail-title">{detail.title}</h1>
            <p className="grant-detail-authority">{detail.authority || 'Ente non specificato'}</p>
            <div className="grant-quick-pills">
              <span className="grant-pill-chip">Stato: {grantStatus}</span>
              <span className="grant-pill-chip">Apertura: {openingLabel}</span>
              <span className="grant-pill-chip">Scadenza: {deadlineLabel}</span>
              <span className="grant-pill-chip">Beneficiari: {beneficiariesLabel}</span>
              <span className="grant-pill-chip">Forma aiuto: {detail.aidForm || 'Agevolazione'}</span>
            </div>
          </div>

          <div className="grant-probability-box">
            <div className="grant-probability-label">Probabilità stimata di ottenere il bando</div>
            <div className="grant-probability-value">{displayedProbability}%</div>
            <ProgressBar value={displayedProbability} />
            <p className="grant-probability-hint">
              {hasProbability
                ? 'Stima tecnica basata sui dati inseriti. Non è una garanzia.'
                : 'Stima preliminare con dati parziali: completa il quiz requisiti per una verifica più accurata.'}
            </p>
            {'message' in explain && explain.message ? <p className="grant-empty-note">{explain.message}</p> : null}
          </div>
        </div>
      </section>

      <section className="premium-card fade-up p-6 grant-detail-section">
        <h2 className="grant-section-title">Cosa offre in breve</h2>
        <div className="grant-summary-grid grant-summary-grid--compact">
          <div className="grant-summary-item grant-summary-item--key">
            <div className="grant-summary-k">{economicSummary.coverageTitle}</div>
            <div className="grant-summary-v">{economicSummary.coverage}</div>
          </div>
          <div className="grant-summary-item">
            <div className="grant-summary-k">Spesa progetto ammissibile</div>
            <div className="grant-summary-v">{economicSummary.projectAmount}</div>
          </div>
          <div className="grant-summary-item">
            <div className="grant-summary-k">Beneficiari principali</div>
            <div className="grant-summary-v">{beneficiariesLabel}</div>
          </div>
          <div className="grant-summary-item">
            <div className="grant-summary-k">Settori ammessi</div>
            <div className="grant-summary-v">{sectorsLabel}</div>
          </div>
        </div>

        <div className="grant-cta-row grant-cta-row--triple">
          <button type="button" className="grant-cta-btn grant-cta-btn--solid" onClick={handleVerify}>
            Verifica requisiti
          </button>
          <a href={detail.officialUrl} target="_blank" rel="noreferrer" className="grant-cta-btn grant-cta-btn--solid">
            Vai al bando ufficiale
          </a>
          <a href={consultingLink} target="_blank" rel="noreferrer" className="grant-cta-btn grant-cta-btn--consulting">
            Prenota consulenza gratuita
          </a>
        </div>

        {detail.officialAttachments.length > 0 ? (
          <div className="grant-attachments-row">
            {detail.officialAttachments.slice(0, 4).map((attachment, index) => (
              <a key={attachment} href={attachment} target="_blank" rel="noreferrer" className="grant-attachment-btn">
                Allegato {index + 1}
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <GrantDetailExpandableSections content={detailContent} officialUrl={detail.officialUrl} />

      {showGrantAiPopup ? <GrantAiPopup grantId={detail.id} grantTitle={detail.title} /> : null}
    </div>
  );
}
