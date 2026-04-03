import type { UserProfile } from '@/lib/conversation/types';
import { normalizeForMatch } from '@/lib/conversation/intentRouter';

export type ScanMissingSignal =
  | 'fundingGoal'
  | 'location'
  | 'businessContext'
  | 'founderEligibility'
  | 'topicPrecision';

export type ScanAdaptiveReadiness = {
  ready: boolean;
  missingSignals: ScanMissingSignal[];
  southYouthStartupPriority: boolean;
};

const SOUTH_PRIORITY_REGIONS = new Set(['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Molise', 'Puglia', 'Sardegna', 'Sicilia']);

function isGenericFundingGoal(text: string) {
  const n = normalizeForMatch(text);
  if (!n) return true;
  const words = n.split(' ').filter((w) => w.length >= 3);
  if (words.length <= 1) return true;
  const specificTerms = [
    'ristruttur',
    'macchinar',
    'attrezz',
    'software',
    'digital',
    'energia',
    'fotovolta',
    'assunz',
    'formaz',
    'export',
    'brevett',
    'ricerca',
    'sviluppo',
    'marketing',
    'e-commerce'
  ];
  if (words.some((w) => specificTerms.some((t) => w.includes(t)))) return false;
  const generic = [
    'bando',
    'bandi',
    'finanziamento',
    'finanziamenti',
    'contributo',
    'contributi',
    'agevolazione',
    'agevolazioni',
    'investimento',
    'investimenti',
    'spese',
    'progetto',
    'attivita',
    'impresa',
    'azienda',
    'fondo',
    'perduto',
    'aiuto',
    'aiuti'
  ];
  return words.every((w) => generic.includes(w));
}

function hasTopicSignal(profile: UserProfile) {
  const ateco = (profile.ateco ?? '').trim();
  if (/\d{2}/.test(ateco)) return true;
  if (profile.sector && profile.sector.trim().length >= 3) return true;
  if (profile.fundingGoal && profile.fundingGoal.trim().length >= 6 && !isGenericFundingGoal(profile.fundingGoal)) return true;
  return false;
}

function hasPrecisionSignal(profile: UserProfile) {
  return Boolean(
    profile.budgetAnswered ||
      profile.contributionPreference ||
      profile.atecoAnswered ||
      profile.sector ||
      profile.employees !== null ||
      profile.requestedContributionEUR !== null ||
      ((profile.age !== null || profile.ageBand === 'under35' || profile.ageBand === 'over35') && Boolean(profile.employmentStatus))
  );
}

function hasBusinessContext(profile: UserProfile) {
  return profile.businessExists !== null || Boolean(profile.activityType?.trim());
}

function needsFounderEligibilityData(profile: UserProfile) {
  const hasAgeSignal = profile.age !== null || profile.ageBand === 'under35' || profile.ageBand === 'over35';
  return profile.businessExists === false && (!hasAgeSignal || !profile.employmentStatus);
}

function isSouthYouthStartupPriorityProfile(profile: UserProfile) {
  if (profile.businessExists !== false) return false;
  const region = (profile.location?.region ?? '').trim();
  if (!region || !SOUTH_PRIORITY_REGIONS.has(region)) return false;
  const age = profile.age ?? null;
  const youthByAge = age !== null && age >= 18 && age <= 35;
  const youthByBand = profile.ageBand === 'under35';
  if (!youthByAge && !youthByBand) return false;
  const employmentNorm = normalizeForMatch(profile.employmentStatus ?? '');
  return /(disoccupat|inoccupat|neet|working poor|senza lavoro|non occupat)/.test(employmentNorm);
}

export function evaluateAdaptiveScanReadiness(profile: UserProfile): ScanAdaptiveReadiness {
  const missingSignals: ScanMissingSignal[] = [];
  const southYouthStartupPriority = isSouthYouthStartupPriorityProfile(profile);

  const goalText = profile.fundingGoal?.trim() ?? '';
  const goalIsGeneric = goalText ? isGenericFundingGoal(goalText) : true;
  const hasRegion = Boolean(profile.location?.region?.trim()) && !profile.locationNeedsConfirmation;
  const hasContext = hasBusinessContext(profile);

  if (!goalText) missingSignals.push('fundingGoal');
  if (!hasRegion) missingSignals.push('location');
  if (!hasContext) missingSignals.push('businessContext');
  if (profile.businessExists === false && needsFounderEligibilityData(profile)) missingSignals.push('founderEligibility');

  const hasTopic = hasTopicSignal(profile);
  const hasPrecision = hasPrecisionSignal(profile);
  const corePillarsOk = Boolean(goalText && !goalIsGeneric && hasRegion && hasContext);
  const genericWithPrecisionOk = Boolean(goalIsGeneric && hasRegion && hasContext && (hasTopic || hasPrecision || southYouthStartupPriority));

  if (!corePillarsOk && !genericWithPrecisionOk && !missingSignals.includes('topicPrecision')) {
    missingSignals.push('topicPrecision');
  }

  const isReady = corePillarsOk || missingSignals.length === 0;
  return {
    ready: isReady,
    missingSignals: corePillarsOk ? [] : missingSignals,
    southYouthStartupPriority
  };
}

