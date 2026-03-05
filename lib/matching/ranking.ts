import type { CandidateLike, ProfilePriorityRule, ScanResultLike } from '@/lib/matching/types';
import { normalizeForMatch } from '@/lib/matching/profileNormalizer';
import { computeDeterministicSortScore } from '@/lib/matching/scoring';

function compareDeadlinesAsc(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
  if (!Number.isFinite(ta)) return 1;
  if (!Number.isFinite(tb)) return -1;
  return ta - tb;
}

function normalizedTitle(result: ScanResultLike) {
  return normalizeForMatch(result.title).replace(/\b(iv|iii|ii|i|edizione|202\d)\b/g, '').trim();
}

export function dedupeCandidatesByTitle<T extends ScanResultLike>(candidates: CandidateLike<T>[]) {
  const map = new Map<string, CandidateLike<T>>();
  for (const candidate of candidates) {
    const key = normalizedTitle(candidate.result);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, candidate);
      continue;
    }
    const currentScore = candidate.result.score ?? candidate.result.matchScore ?? 0;
    const existingScore = existing.result.score ?? existing.result.matchScore ?? 0;
    if (currentScore > existingScore) map.set(key, candidate);
  }
  return [...map.values()];
}

export function sortCandidatesDeterministic<T extends ScanResultLike>(
  candidates: CandidateLike<T>[],
  args: {
    pinnedStrategicTitles?: string[];
    profilePriorityRules?: ProfilePriorityRule[];
  } = {},
) {
  const sorted = [...candidates];
  sorted.sort((a, b) => {
    const aScore = computeDeterministicSortScore(a.result, args);
    const bScore = computeDeterministicSortScore(b.result, args);

    if (bScore.pinnedScore !== aScore.pinnedScore) return bScore.pinnedScore - aScore.pinnedScore;
    if (bScore.hardStatus !== aScore.hardStatus) return bScore.hardStatus - aScore.hardStatus;
    if (bScore.availability !== aScore.availability) return bScore.availability - aScore.availability;
    if (bScore.profilePriority !== aScore.profilePriority) return bScore.profilePriority - aScore.profilePriority;
    if (bScore.coverage !== aScore.coverage) return bScore.coverage - aScore.coverage;
    if (bScore.relevance !== aScore.relevance) return bScore.relevance - aScore.relevance;

    const deadlineCmp = compareDeadlinesAsc(aScore.deadlineAt, bScore.deadlineAt);
    if (deadlineCmp !== 0) return deadlineCmp;
    return (a.result.id || '').localeCompare(b.result.id || '');
  });
  return sorted;
}

export function mergeStrategicRecall<T extends ScanResultLike>(
  base: CandidateLike<T>[],
  recall: CandidateLike<T>[],
  args: {
    pinnedStrategicTitles?: string[];
    profilePriorityRules?: ProfilePriorityRule[];
  } = {},
) {
  if (recall.length === 0) return sortCandidatesDeterministic(base, args);
  const merged = new Map<string, CandidateLike<T>>();
  for (const item of [...base, ...recall]) {
    merged.set(item.result.id, item);
  }
  return sortCandidatesDeterministic(dedupeCandidatesByTitle([...merged.values()]), args);
}

