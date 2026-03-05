import type { AvailabilityStatus, HardStatus, ScanResultLike } from '@/lib/matching/types';
import { profilePriorityScoreFromRules } from '@/lib/matching/strategicProfiles';
import type { ProfilePriorityRule } from '@/lib/matching/types';

function parseCoverageValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, ' ')
    .trim();
  if (!normalized) return 0;

  const matches = normalized
    .split(' ')
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((entry) => Math.max(0, Math.min(100, entry))));
}

export function coverageScore(result: ScanResultLike): number {
  const offer = (result.economicOffer ?? {}) as Record<string, unknown>;
  return parseCoverageValue(offer.coverageMaxPercent ?? offer.displayCoverageLabel ?? result.aidIntensity ?? null);
}

export function availabilityWeight(status: AvailabilityStatus | undefined) {
  if (status === 'open') return 2;
  if (status === 'incoming') return 1;
  return 0;
}

export function hardStatusWeight(status: HardStatus | undefined) {
  if (status === 'eligible') return 2;
  if (status === 'unknown') return 1;
  return 0;
}

export function computeDeterministicSortScore(
  result: ScanResultLike,
  args: {
    pinnedStrategicTitles?: string[];
    profilePriorityRules?: ProfilePriorityRule[];
  } = {},
) {
  const pinnedStrategicTitles = args.pinnedStrategicTitles ?? [];
  const profilePriorityRules = args.profilePriorityRules ?? [];
  const titleLower = result.title.toLowerCase();
  const pinnedScore = pinnedStrategicTitles.some((token) => titleLower.includes(token.toLowerCase())) ? 1 : 0;
  const availability = availabilityWeight(result.availabilityStatus);
  const hardStatus = hardStatusWeight(result.hardStatus);
  const profilePriority = profilePriorityScoreFromRules(result, profilePriorityRules);
  const coverage = coverageScore(result);
  const relevance = Number.isFinite(result.score) ? result.score : result.matchScore ?? 0;

  return {
    pinnedScore,
    availability,
    hardStatus,
    profilePriority,
    coverage,
    relevance,
    deadlineAt: result.deadlineAt ?? null,
  };
}

