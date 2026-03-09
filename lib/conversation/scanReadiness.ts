/**
 * Scan Readiness Module
 *
 * Integra il Profile Completeness Engine per determinare se il profilo
 * è sufficientemente completo per lanciare lo scanner.
 *
 * REGOLA FONDAMENTALE: lo scanner parte SOLO con strong_ready.
 * weak_ready e not_ready continuano il profiling.
 */
import type { UserProfile } from '@/lib/conversation/types';
import type { ScanMissingSignal } from '@/lib/matching/types';
import { type ScanReadinessReason } from '@/lib/conversation/types';
import { evaluateProfileCompleteness, isStrongReady, type ProfileCompletenessResult } from '@/lib/conversation/profileCompleteness';

export type ScanReadinessResult = {
  ready: boolean;
  reason: ScanReadinessReason;
  missingSignals: ScanMissingSignal[];
  completeness: ProfileCompletenessResult;
};

/**
 * Valutazione deterministica completa della scan readiness.
 * Usa il ProfileCompleteness Engine V2.
 *
 * ready=true SOLO se il profilo è strong_ready.
 */
export function evaluateScanReadiness(profile: UserProfile): ScanReadinessResult {
  const completeness = evaluateProfileCompleteness(profile);

  // Mappa i segnali mancanti del completeness engine ai ScanMissingSignal
  const missingSignals: ScanMissingSignal[] = [];
  for (const s of completeness.missingSignals) {
    if (s === 'location') missingSignals.push('location');
    else if (s === 'businessContext') missingSignals.push('businessContext');
    else if (s === 'fundingGoal') missingSignals.push('fundingGoal');
    else if (s === 'sector') missingSignals.push('topicPrecision');
    else if (s === 'founderData') missingSignals.push('founderEligibility');
    else if (s === 'additionalContext') missingSignals.push('topicPrecision');
  }

  const ready = completeness.level === 'strong_ready';

  const reason: ScanReadinessReason = ready
    ? 'ready'
    : (() => {
        const priorities: Array<{ signal: ScanMissingSignal; reason: ScanReadinessReason }> = [
          { signal: 'fundingGoal', reason: 'missing:fundingGoal' },
          { signal: 'location', reason: 'missing:location' },
          { signal: 'businessContext', reason: 'missing:businessContext' },
          { signal: 'founderEligibility', reason: 'missing:founderEligibility' },
          { signal: 'topicPrecision', reason: 'missing:topicPrecision' },
        ];
        for (const { signal, reason: r } of priorities) {
          if (missingSignals.includes(signal)) return r;
        }
        return 'missing:unknown';
      })();

  return { ready, reason, missingSignals, completeness };
}

/**
 * Check rapido: il profilo ha i 3 pilastri minimi
 * (usato per logica di early scan / fast path).
 * NOTA: non basta per lanciare lo scan – serve strong_ready.
 */
export function isMinimumProfileReady(profile: UserProfile): boolean {
  const hasRegion = Boolean(profile.location?.region?.trim());
  const hasGoal =
    (Boolean(profile.fundingGoal?.trim()) && profile.fundingGoal!.trim().length >= 5) ||
    Boolean(profile.sector?.trim());
  const hasBusinessStatus =
    profile.businessExists !== null || Boolean(profile.activityType?.trim());
  return hasRegion && hasGoal && hasBusinessStatus;
}

/**
 * Shorthand per lo scanner: profilo abbastanza completo da produrre risultati affidabili.
 */
export { isStrongReady };
