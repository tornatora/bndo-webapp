import type { NextBestField, ProfileMemory, UserProfile } from '@/lib/conversation/types';

function nowIso() {
  return new Date().toISOString();
}

export function emptyProfileMemory(): ProfileMemory {
  return {};
}

export function markProfileField(
  memory: ProfileMemory | undefined,
  field: NextBestField,
  source: 'user' | 'extractor' | 'system'
) {
  const next: ProfileMemory = { ...(memory ?? {}) };
  next[field] = {
    lastUpdatedAt: nowIso(),
    source
  };
  return next;
}

export function markProfileFields(
  memory: ProfileMemory | undefined,
  fields: NextBestField[],
  source: 'user' | 'extractor' | 'system'
) {
  let next = { ...(memory ?? {}) };
  for (const field of fields) {
    next = markProfileField(next, field, source);
  }
  return next;
}

function sameNorm(a: string | null | undefined, b: string | null | undefined) {
  const av = (a ?? '').trim().toLowerCase();
  const bv = (b ?? '').trim().toLowerCase();
  return av === bv;
}

/**
 * Merges a new goal declaration into the existing one if they are semantically related.
 * Ensures the project vision "evolves" instead of being overwritten.
 */
export function evolveFundingGoal(current: string | null | undefined, next: string | null | undefined): string | null {
  if (!next) return current ?? null;
  if (!current) return next;

  const currentNorm = (current ?? '').toLowerCase();
  const nextNorm = (next ?? '').toLowerCase();
  const currentWords = currentNorm.split(/\s+/);
  const nextWords = nextNorm.split(/\s+/);

  // If the new goal is a short refinement that isn't already there
  const isRefinement = nextWords.length <= 4 && !nextWords.every((w: string) => currentWords.includes(w));
  
  if (isRefinement) {
      return `${current} e ${next}`;
  }

  // If the new goal is significantly longer and contains the old one, it's an overwrite
  if (nextNorm.includes(currentNorm) && nextNorm.length > currentNorm.length + 5) return next;

  // Default: take the latest
  return next;
}

export function validateProfileConstraint(profile: UserProfile): { isValid: boolean; conflictReason?: string } {
  // Prevent contradictions like marking an enterprise as "micro" but having 1000 employees
  if (profile.employees !== null && profile.employees !== undefined && profile.employees > 250 && profile.legalForm !== 'SPA') {
      // return { isValid: false, conflictReason: 'Contraddizione: un\'impresa con oltre 250 dipendenti è considerata "Grande" e raramente ha forme giuridiche semplici.' };
  }

  // Prevent conflicting startup vs existing states
  const isStartupIntent = profile.activityType === 'Startup' || profile.activityType === 'Da costituire' || profile.businessExists === false;
  if (profile.businessExists === true && (profile.activityType === 'Startup' || profile.activityType === 'Da costituire')) {
     return { isValid: false, conflictReason: 'Contraddizione: hai dichiarato un\'attività già esistente, ma stai chiedendo incentivi per una nuova startup.' };
  }

  // Budget/Turnover logical guardrail
  if (profile.annualTurnover !== null && profile.revenueOrBudgetEUR !== null) {
      if (profile.revenueOrBudgetEUR > profile.annualTurnover * 10 && profile.annualTurnover > 0) {
          // A bit suspicious if a company wants to invest 10x its annual turnover, 
          // but could be valid with venture capital. We just log or flag.
      }
  }

  return { isValid: true };
}

export function getChangedFields(prev: UserProfile, next: UserProfile): NextBestField[] {
  const changed: NextBestField[] = [];
  if (!sameNorm(prev.activityType, next.activityType) || prev.businessExists !== next.businessExists) {
    changed.push('activityType');
  }
  if (!sameNorm(prev.sector, next.sector)) changed.push('sector');
  if (!sameNorm(prev.ateco, next.ateco) || prev.atecoAnswered !== next.atecoAnswered) changed.push('ateco');
  if (
    !sameNorm(prev.location?.region, next.location?.region) ||
    !sameNorm(prev.location?.municipality, next.location?.municipality)
  ) {
    changed.push('location');
  }
  if ((prev.employees ?? null) !== (next.employees ?? null)) changed.push('employees');
  if (
    (prev.revenueOrBudgetEUR ?? null) !== (next.revenueOrBudgetEUR ?? null) ||
    (prev.requestedContributionEUR ?? null) !== (next.requestedContributionEUR ?? null) ||
    prev.budgetAnswered !== next.budgetAnswered
  ) {
    changed.push('budget');
  }
  if (!sameNorm(prev.fundingGoal, next.fundingGoal)) changed.push('fundingGoal');
  if ((prev.contributionPreference ?? null) !== (next.contributionPreference ?? null)) changed.push('contributionPreference');
  if (!sameNorm(prev.contactEmail, next.contactEmail)) changed.push('contactEmail');
  if (!sameNorm(prev.contactPhone, next.contactPhone)) changed.push('contactPhone');
  return changed;
}

export function summarizeProfileForPrompt(profile: UserProfile) {
  const bits: string[] = [];
  if (profile.activityType) bits.push(`tipo=${profile.activityType}`);
  if (profile.businessExists === true) bits.push('stato=attivita_esistente');
  if (profile.businessExists === false) bits.push('stato=nuova_attivita');
  if (profile.location?.region) {
    const municipality = profile.location?.municipality ? `, comune=${profile.location.municipality}` : '';
    bits.push(`territorio=${profile.location.region}${municipality}`);
  }
  if (profile.age !== null) bits.push(`eta=${profile.age}`);
  if (profile.employmentStatus) bits.push(`occupazione=${profile.employmentStatus}`);
  if (profile.legalForm) bits.push(`forma=${profile.legalForm}`);
  if (profile.sector) bits.push(`settore=${profile.sector}`);
  if (profile.ateco) bits.push(`ateco=${profile.ateco}`);
  if (profile.fundingGoal) bits.push(`obiettivo=${profile.fundingGoal}`);
  if (profile.revenueOrBudgetEUR !== null) bits.push(`budget=${profile.revenueOrBudgetEUR}EUR`);
  if (profile.requestedContributionEUR !== null) bits.push(`contributo_richiesto=${profile.requestedContributionEUR}EUR`);
  if (profile.contributionPreference) bits.push(`preferenza=${profile.contributionPreference}`);
  if (profile.employees !== null) bits.push(`addetti=${profile.employees}`);
  if (profile.contactEmail) bits.push(`email=${profile.contactEmail}`);
  if (profile.contactPhone) bits.push(`phone=${profile.contactPhone}`);
  return bits.join(' | ');
}
