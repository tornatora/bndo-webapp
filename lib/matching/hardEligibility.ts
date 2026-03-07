import type { AvailabilityStatus, HardStatus, NormalizedMatchingProfile, ScanResultLike } from '@/lib/matching/types';
import { normalizeForMatch } from '@/lib/matching/profileNormalizer';

export type HardEligibilityGateKey =
  | 'trustedAuthority'
  | 'businessTarget'
  | 'territory'
  | 'businessStage'
  | 'demographics'
  | 'goalSector'
  | 'hardStatus';

export type HardEligibilityEvaluation = {
  passed: boolean;
  gates: Record<HardEligibilityGateKey, boolean>;
  availabilityStatus: AvailabilityStatus;
  hardStatus: HardStatus;
  diagnostics: string[];
};

const TRUSTED_AUTHORITY_TOKENS = [
  'invitalia',
  'ministero',
  'regione',
  'camere di commercio',
  'camera di commercio',
  'cciaa',
  'unioncamere',
  'agenzia nazionale',
  'dipartimento',
];

const NOT_BUSINESS_TARGET_TOKENS = [
  'inserimento lavorativo',
  'orientamento al lavoro',
  'politiche attive del lavoro',
  'borse di studio',
  'dote scuola',
  'servizio civile',
];

type EvaluateArgs = {
  result: ScanResultLike;
  profile: NormalizedMatchingProfile;
  trustedAuthorityTokens?: string[];
  strategicTitleTokens?: string[];
};

function includesAnyToken(text: string, tokens: string[]) {
  if (!text || tokens.length === 0) return false;
  return tokens.some((token) => token && text.includes(token));
}

function inferBusinessStageCompatible(result: ScanResultLike, profile: NormalizedMatchingProfile) {
  const titleNorm = normalizeForMatch(result.title);
  const profileActivityNorm = normalizeForMatch(profile.activityType ?? '');
  const profileGoalNorm = normalizeForMatch(profile.fundingGoal ?? '');
  const profileSignals = `${profileActivityNorm} ${profileGoalNorm}`;
  const profileStartupIntent = /(startup|da costituire|nuova attivita|nuova impresa|aprire|avviare)/.test(profileSignals);
  const profileExistingIntent = /(gia attiva|azienda attiva|impresa attiva|ampliare|espandere|digitalizzare)/.test(profileSignals);

  const bandoStartupHint = /(startup|nuova impresa|da costituire|autoimpiego|self employment|resto al sud)/.test(titleNorm);
  const bandoExistingHint = /(pmi|imprese esistenti|digitalizzazione|transizione|ammodernamento)/.test(titleNorm);

  if (profileStartupIntent && bandoExistingHint && !bandoStartupHint) return false;
  if (profileExistingIntent && bandoStartupHint && !bandoExistingHint) return false;
  return true;
}

function inferDemographicCompatible(result: ScanResultLike, profile: NormalizedMatchingProfile) {
  const titleNorm = normalizeForMatch(result.title);
  const reasonsNorm = normalizeForMatch((result.matchReasons ?? []).join(' '));
  const combined = `${titleNorm} ${reasonsNorm}`;
  const age = profile.age ?? null;
  const employment = normalizeForMatch(profile.employmentStatus ?? '');

  if (combined.includes('under 35') || combined.includes('18 35')) {
    if (age === null) return false;
    if (age < 18 || age > 35) return false;
  }

  if (combined.includes('disoccupat') || combined.includes('inoccupat') || combined.includes('neet')) {
    if (!employment) return false;
    if (!/(disoccupat|inoccupat|neet|non occupat|senza lavoro|working poor)/.test(employment)) return false;
  }

  return true;
}

function inferGoalSectorCompatible(result: ScanResultLike, profile: NormalizedMatchingProfile) {
  const goalNorm = normalizeForMatch(profile.fundingGoal ?? '');
  const sectorNorm = normalizeForMatch(profile.sector ?? '');
  if (!goalNorm && !sectorNorm) return true;

  const titleNorm = normalizeForMatch(result.title);
  const reasonsNorm = normalizeForMatch((result.matchReasons ?? []).join(' '));
  const mismatchesNorm = normalizeForMatch((result.mismatchFlags ?? []).join(' '));
  const combined = `${titleNorm} ${reasonsNorm}`;

  if (mismatchesNorm.includes('settore') || mismatchesNorm.includes('goal')) return false;
  if (!goalNorm && !sectorNorm) return true;

  const tokens = new Set(
    `${goalNorm} ${sectorNorm}`
      .split(' ')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length >= 4),
  );
  if (tokens.size === 0) return true;

  let hits = 0;
  for (const token of tokens) {
    if (combined.includes(token)) hits += 1;
  }
  return hits > 0;
}

function inferTerritoryCompatible(result: ScanResultLike, profile: NormalizedMatchingProfile) {
  const regionNorm = normalizeForMatch(profile.userRegionCanonical ?? profile.region ?? '');
  if (!regionNorm) return true;

  const mismatchNorm = normalizeForMatch((result.mismatchFlags ?? []).join(' '));
  // Check for both Italian and English mismatch tokens
  if (
    mismatchNorm.includes('regione') ||
    mismatchNorm.includes('territorio') ||
    mismatchNorm.includes('territory') ||
    mismatchNorm.includes('hard excluded')
  ) {
    return false;
  }

  const titleNorm = normalizeForMatch(result.title);
  const authorityNorm = normalizeForMatch(result.authorityName ?? '');
  const reasonsNorm = normalizeForMatch((result.matchReasons ?? []).join(' '));
  const combined = `${titleNorm} ${authorityNorm} ${reasonsNorm}`;

  // If we have explicit mismatch flag or hard excluded status, it's NOT compatible
  if (result.hardStatus === 'not_eligible') return false;

  // Be stricter: it must explicitly include the region or be national.
  const isNational =
    combined.includes('nazionale') ||
    combined.includes('italia') ||
    combined.includes('tutto il territorio') ||
    combined.includes('tutte le regioni');

  if (isNational) return true;

  // If authority is a specific region (e.g. "Regione Piemonte") and user is in another region, reject.
  if (authorityNorm.includes('regione') && !authorityNorm.includes(regionNorm)) {
    return false;
  }

  return combined.includes(regionNorm);
}

export function evaluateHardEligibility(args: EvaluateArgs): HardEligibilityEvaluation {
  const { result, profile } = args;
  const authorityNorm = normalizeForMatch(result.authorityName ?? '');
  const titleNorm = normalizeForMatch(result.title);
  const strategicTitleTokens = (args.strategicTitleTokens ?? []).map((entry) => normalizeForMatch(entry)).filter(Boolean);
  const trustedAuthorityTokens = (args.trustedAuthorityTokens ?? TRUSTED_AUTHORITY_TOKENS)
    .map((entry) => normalizeForMatch(entry))
    .filter(Boolean);

  const trustedAuthority = includesAnyToken(authorityNorm, trustedAuthorityTokens) || includesAnyToken(titleNorm, strategicTitleTokens);
  const businessTarget = !includesAnyToken(titleNorm, NOT_BUSINESS_TARGET_TOKENS);
  const territory = inferTerritoryCompatible(result, profile);
  const businessStage = inferBusinessStageCompatible(result, profile);
  const demographics = inferDemographicCompatible(result, profile);
  const goalSector = inferGoalSectorCompatible(result, profile);
  const hardStatus = (result.hardStatus ?? 'unknown') as HardStatus;
  const hardStatusGate = hardStatus !== 'not_eligible';
  const availabilityStatus = (result.availabilityStatus ?? 'open') as AvailabilityStatus;

  const gates: Record<HardEligibilityGateKey, boolean> = {
    trustedAuthority,
    businessTarget,
    territory,
    businessStage,
    demographics,
    goalSector,
    hardStatus: hardStatusGate,
  };

  const diagnostics = (Object.entries(gates) as Array<[HardEligibilityGateKey, boolean]>)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  const passed = diagnostics.length === 0;

  return {
    passed,
    gates,
    availabilityStatus,
    hardStatus,
    diagnostics,
  };
}

