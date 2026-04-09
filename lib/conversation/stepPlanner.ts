import { evaluateProfileCompleteness } from '@/lib/conversation/profileCompleteness';
import type { Step, UserProfile } from '@/lib/conversation/types';

export function needsFounderEligibilityData(profile: UserProfile) {
  const hasAgeSignal = profile.age !== null || profile.ageBand === 'under35' || profile.ageBand === 'over35';
  return profile.businessExists === false && (!hasAgeSignal || !profile.employmentStatus);
}

export function nextStepFromProfile(profile: UserProfile): Step {
  if (profile.locationNeedsConfirmation && profile.location?.region) return 'location';

  const completeness = evaluateProfileCompleteness(profile);
  if (completeness.level === 'strong_ready') return 'ready';
  if (completeness.level === 'hard_scan_ready') return 'preScanConfirm';

  const nextField = completeness.nextPriorityField;
  if (!nextField) return 'ready';

  switch (nextField) {
    case 'location':
    case 'locationConfirmation':
      return 'location';
    case 'businessContext':
      return 'activityType';
    case 'fundingGoal':
      return 'fundingGoal';
    case 'sector':
      return 'sector';
    case 'legalForm':
      return 'legalForm';
    case 'founderData':
      return 'activityType';
    case 'budgetOrPreference':
      return profile.contributionPreference ? 'budget' : 'contributionPreference';
    case 'agricultureStatus':
      return 'agricultureStatus';
    case 'professionalRegister':
      return 'professionalRegister';
    case 'tech40':
      return 'tech40';
    case 'propertyStatus':
      return 'propertyStatus';
    case 'isThirdSector':
      return 'isThirdSector';
    case 'foundationYear':
      return 'foundationYear';
    case 'teamMajority':
      return 'teamMajority';
    case 'annualTurnover':
      return 'annualTurnover';
    case 'isInnovative':
      return 'isInnovative';
    default:
      return 'budget';
  }
}

export function scanReadinessReasonForStep(step: Step, profile: UserProfile) {
  if (step === 'ready') return 'ready';
  if (step === 'location') return 'missing:location';
  if (step === 'fundingGoal') return 'missing:fundingGoal';
  if (step === 'activityType') {
    return needsFounderEligibilityData(profile) ? 'missing:founderEligibility' : 'missing:businessContext';
  }
  return 'missing:topicPrecision';
}

