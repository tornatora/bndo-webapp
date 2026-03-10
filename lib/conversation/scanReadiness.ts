/**
 * Scan Readiness Module V2
 *
 * Integra il Profile Completeness Engine V2.
 *
 * REGOLA FONDAMENTALE:
 * - not_ready / weak_ready → continua profiling (chiedi la prossima domanda)
 * - pre_scan_ready         → chiedi la domanda pre-scan di conferma
 * - strong_ready           → avvia lo scanner automaticamente
 *
 * Lo scanner parte SOLO con strong_ready (dopo che l'utente ha risposto alla domanda pre-scan).
 */
import type { UserProfile } from '@/lib/conversation/types';
import type { ScanMissingSignal } from '@/lib/matching/types';
import { type ScanReadinessReason } from '@/lib/conversation/types';
import {
  evaluateProfileCompleteness,
  isStrongReady,
  isPreScanReady,
  type ProfileCompletenessResult
} from '@/lib/conversation/profileCompleteness';

export type ScanReadinessResult = {
  ready: boolean;
  preScanReady: boolean;
  reason: ScanReadinessReason;
  missingSignals: ScanMissingSignal[];
  completeness: ProfileCompletenessResult;
};

/**
 * Valutazione deterministica completa della scan readiness.
 *
 * ready=true SOLO se il profilo è strong_ready.
 * preScanReady=true se il profilo è pre_scan_ready O strong_ready.
 */
export function evaluateScanReadiness(profile: UserProfile): ScanReadinessResult {
  const completeness = evaluateProfileCompleteness(profile);

  // Mappa i segnali mancanti del completeness engine ai ScanMissingSignal
  const missingSignals: ScanMissingSignal[] = [];
  for (const s of completeness.missingSignals) {
    if (s === 'location' || s === 'locationConfirmation') missingSignals.push('location');
    else if (s === 'businessContext') missingSignals.push('businessContext');
    else if (s === 'fundingGoal') missingSignals.push('fundingGoal');
    else if (s === 'sector') missingSignals.push('topicPrecision');
    else if (s === 'founderData') missingSignals.push('founderEligibility');
    else if (s === 'budgetOrPreference') missingSignals.push('topicPrecision');
    else if (s === 'additionalContext') missingSignals.push('topicPrecision');
  }

  const ready = completeness.level === 'strong_ready';
  const preScanReady = completeness.level === 'pre_scan_ready' || completeness.level === 'strong_ready';

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

  return { ready, preScanReady, reason, missingSignals, completeness };
}

/**
 * Check rapido: il profilo ha i 3 pilastri minimi
 * (usato per fast path / early scan requests)
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
export { isStrongReady, isPreScanReady };
