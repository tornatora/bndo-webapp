import type { NormalizedMatchingProfile, ScanMissingSignal } from '@/lib/matching/types';

const REFINE_QUESTIONS: Record<ScanMissingSignal, string> = {
  fundingGoal: 'Per essere preciso: cosa vuoi finanziare esattamente?',
  location: 'In quale regione operi o vuoi aprire l’attività?',
  businessContext: "Hai già un'attività attiva oppure la devi ancora aprire?",
  founderEligibility: 'Mi dai età e stato occupazionale del proponente?',
  topicPrecision: 'Per affinare meglio: indicami settore o ATECO (anche 2 cifre).',
};

export function profileCompletenessScore(profile: NormalizedMatchingProfile, missingSignals: ScanMissingSignal[]) {
  const weightedTotal = 100;
  const weights: Record<ScanMissingSignal, number> = {
    fundingGoal: 26,
    location: 22,
    businessContext: 20,
    founderEligibility: 18,
    topicPrecision: 14,
  };

  const missingWeight = missingSignals.reduce((acc, signal) => acc + (weights[signal] ?? 0), 0);
  const rawScore = Math.max(0, Math.min(weightedTotal, weightedTotal - missingWeight));

  if ((profile.activityType ?? '').trim()) return Math.max(rawScore, 60);
  return rawScore;
}

export function nextQuestionFieldFromMissing(missingSignals: ScanMissingSignal[]) {
  if (missingSignals.length === 0) return null;
  return missingSignals[0];
}

export function buildRefineQuestionV3(args: {
  missingSignals: ScanMissingSignal[];
  fallback?: string | null;
}) {
  const first = nextQuestionFieldFromMissing(args.missingSignals);
  if (first) return REFINE_QUESTIONS[first];
  return args.fallback?.trim() || null;
}

export function scanReadinessReason(args: {
  ready: boolean;
  missingSignals: ScanMissingSignal[];
}) {
  if (args.ready) return 'ready';
  const first = args.missingSignals[0];
  return first ? `missing:${first}` : 'missing:unknown';
}

