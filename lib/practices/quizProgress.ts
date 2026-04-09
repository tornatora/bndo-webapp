export function computeMonotonicQuizProgress(args: {
  currentStep: number;
  visibleQuestionsCount: number;
  previousMaxProgress: number;
}) {
  const { currentStep, visibleQuestionsCount, previousMaxProgress } = args;
  if (!Number.isFinite(visibleQuestionsCount) || visibleQuestionsCount <= 0) return 0;
  const clampedStep = Math.max(0, Math.min(Math.floor(currentStep), Math.floor(visibleQuestionsCount) - 1));
  const rawProgress = Math.round(((clampedStep + 1) / Math.floor(visibleQuestionsCount)) * 100);
  return Math.max(0, Math.min(100, Math.max(previousMaxProgress, rawProgress)));
}
