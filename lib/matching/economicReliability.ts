import type { CandidateLike, NormalizedMatchingProfile, ScanResultLike } from '@/lib/matching/types';
import { normalizeForMatch } from '@/lib/matching/profileNormalizer';

const MICRO_TICKET_TOKENS = ['voucher', 'assessment', 'smau', 'fiera', 'fiere', 'servizi brevi', 'audit'];

export type EconomicReliability = {
  reliable: boolean;
  reason: string | null;
};

export type DynamicAmountThreshold = {
  targetAmount: number | null;
  minRelevantAmount: number;
  microTicketIntent: boolean;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    const normalized = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isCoverageOutlier(value: number | null) {
  if (value === null) return false;
  return value < 0 || value > 100;
}

function isAmountOutlier(value: number | null) {
  if (value === null) return false;
  return value < 0 || value > 100_000_000;
}

export function extractEconomicRange(result: ScanResultLike) {
  const offer = (result.economicOffer ?? {}) as Record<string, unknown>;
  const costMin = toNumber(offer.costMin);
  const costMax = toNumber(offer.costMax);
  const grantMin = toNumber(offer.grantMin);
  const grantMax = toNumber(offer.grantMax);
  const coverageMin = toNumber(offer.coverageMinPercent);
  const coverageMax = toNumber(offer.coverageMaxPercent);
  return {
    costMin,
    costMax,
    grantMin,
    grantMax,
    coverageMin,
    coverageMax,
  };
}

export function computeEconomicReliability(result: ScanResultLike): EconomicReliability {
  const { costMin, costMax, grantMin, grantMax, coverageMin, coverageMax } = extractEconomicRange(result);
  if (isAmountOutlier(costMin) || isAmountOutlier(costMax) || isAmountOutlier(grantMin) || isAmountOutlier(grantMax)) {
    return { reliable: false, reason: 'amount_outlier' };
  }
  if (isCoverageOutlier(coverageMin) || isCoverageOutlier(coverageMax)) {
    return { reliable: false, reason: 'coverage_outlier' };
  }
  if (costMin !== null && costMax !== null && costMin > costMax) {
    return { reliable: false, reason: 'cost_inverted' };
  }
  if (grantMin !== null && grantMax !== null && grantMin > grantMax) {
    return { reliable: false, reason: 'grant_inverted' };
  }
  return { reliable: true, reason: null };
}

function normalizeText(value: string | null | undefined) {
  return normalizeForMatch(value ?? '');
}

export function detectMicroTicketIntent(profile: NormalizedMatchingProfile) {
  const text = normalizeText([profile.fundingGoal, profile.sector, profile.activityType].filter(Boolean).join(' '));
  return MICRO_TICKET_TOKENS.some((token) => text.includes(token));
}

export function computeDynamicAmountThreshold(profile: NormalizedMatchingProfile): DynamicAmountThreshold {
  const targetAmount = profile.requestedContribution ?? profile.budget ?? null;
  const microTicketIntent = detectMicroTicketIntent(profile);

  if (targetAmount === null) {
    return {
      targetAmount: null,
      minRelevantAmount: microTicketIntent ? 0 : 2_000,
      microTicketIntent,
    };
  }

  let minRelevantAmount = 2_000;
  if (targetAmount >= 100_000) minRelevantAmount = 15_000;
  else if (targetAmount >= 40_000) minRelevantAmount = 8_000;
  else if (targetAmount >= 15_000) minRelevantAmount = 4_000;

  if (microTicketIntent) minRelevantAmount = 0;

  return {
    targetAmount,
    minRelevantAmount,
    microTicketIntent,
  };
}

function extractReferenceAmount(result: ScanResultLike) {
  const { costMax, grantMax, costMin, grantMin } = extractEconomicRange(result);
  const amount = costMax ?? grantMax ?? costMin ?? grantMin ?? null;
  return amount !== null && amount >= 0 ? amount : null;
}

export function applyEconomicThresholdFilter<T extends ScanResultLike>(
  candidates: CandidateLike<T>[],
  threshold: DynamicAmountThreshold,
) {
  if (threshold.minRelevantAmount <= 0) return candidates;

  return candidates.filter((candidate) => {
    const amount = extractReferenceAmount(candidate.result);
    if (amount === null) return true;
    return amount >= threshold.minRelevantAmount;
  });
}

export function sanitizeUnreliableEconomicLabels<T extends ScanResultLike>(result: T): T {
  const reliability = computeEconomicReliability(result);
  if (reliability.reliable) return result;

  const offer = { ...(result.economicOffer ?? {}) } as Record<string, unknown>;
  offer.displayAmountLabel = 'Da verificare';
  offer.displayProjectAmountLabel = 'Da verificare';
  offer.displayCoverageLabel = 'Da verificare';

  return {
    ...result,
    aidIntensity: 'Da verificare',
    economicOffer: offer,
  };
}

