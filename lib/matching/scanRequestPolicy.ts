export type UnifiedScanMode = 'fast' | 'full';
export type UnifiedScanChannel = 'scanner' | 'chat';
export type UnifiedScanStrictness = 'standard' | 'high';

export type UnifiedScanProfileLike = {
  location?: { region?: string | null; municipality?: string | null } | null;
  region?: string | null;
  activityType?: string | null;
  sector?: string | null;
  ateco?: string | null;
  fundingGoal?: string | null;
  contributionPreference?: string | null;
  employees?: number | null;
  founderAge?: number | null;
  age?: number | null;
  employmentStatus?: string | null;
  revenueOrBudgetEUR?: number | null;
  requestedContributionEUR?: number | null;
  legalForm?: string | null;
  businessExists?: boolean | null;
  annualTurnover?: number | null;
  isInnovative?: boolean | null;
  foundationYear?: number | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasStrongMatchingContext(profile: UnifiedScanProfileLike): boolean {
  const region = normalizeText(profile.location?.region ?? profile.region ?? null);
  if (!region) return false;

  const sector = normalizeText(profile.sector);
  const fundingGoal = normalizeText(profile.fundingGoal);
  const atecoDigits = (profile.ateco ?? '').replace(/\D/g, '');
  const hasTopicSignal = Boolean(sector) || fundingGoal.length >= 8 || atecoDigits.length >= 2;

  const hasBusinessContext =
    typeof profile.businessExists === 'boolean' ||
    Boolean(normalizeText(profile.activityType)) ||
    Boolean(normalizeText(profile.legalForm));

  const hasEconomicSignal =
    (typeof profile.revenueOrBudgetEUR === 'number' && profile.revenueOrBudgetEUR > 0) ||
    (typeof profile.requestedContributionEUR === 'number' && profile.requestedContributionEUR > 0) ||
    Boolean(normalizeText(profile.contributionPreference));

  return hasTopicSignal && hasBusinessContext && hasEconomicSignal;
}

function hasDecisiveQualificationContext(profile: UnifiedScanProfileLike): boolean {
  const region = normalizeText(profile.location?.region ?? profile.region ?? null);
  if (!region) return false;

  const hasSubjectSignal =
    typeof profile.businessExists === 'boolean' ||
    Boolean(normalizeText(profile.activityType)) ||
    Boolean(normalizeText(profile.legalForm));

  const hasTopicSignal =
    Boolean(normalizeText(profile.sector)) ||
    normalizeText(profile.fundingGoal).length >= 8 ||
    (profile.ateco ?? '').replace(/\D/g, '').length >= 2;

  return hasSubjectSignal && hasTopicSignal;
}

export function selectUnifiedScanMode(
  profile: UnifiedScanProfileLike | null | undefined,
  requestedMode?: UnifiedScanMode | null,
): UnifiedScanMode {
  if (requestedMode === 'fast' || requestedMode === 'full') return requestedMode;
  if (!profile) return 'fast';
  return hasStrongMatchingContext(profile) ? 'full' : 'fast';
}

export function selectUnifiedScanStrictness(
  profile: UnifiedScanProfileLike | null | undefined,
  mode: UnifiedScanMode,
  requestedStrictness?: UnifiedScanStrictness | null,
): UnifiedScanStrictness {
  if (requestedStrictness === 'high' || requestedStrictness === 'standard') return requestedStrictness;
  if (!profile) return 'standard';
  if (mode === 'fast') return 'standard';
  return hasDecisiveQualificationContext(profile) ? 'high' : 'standard';
}

export function buildUnifiedScanRequestBody(args: {
  userProfile: UnifiedScanProfileLike;
  channel?: UnifiedScanChannel | null;
  strictness?: UnifiedScanStrictness | null;
  limit?: number | null;
  mode?: UnifiedScanMode | null;
}) {
  const mode = selectUnifiedScanMode(args.userProfile, args.mode);
  const channel: UnifiedScanChannel = args.channel === 'chat' ? 'chat' : 'scanner';
  const strictness = selectUnifiedScanStrictness(args.userProfile, mode, args.strictness);
  const limit =
    typeof args.limit === 'number' && Number.isFinite(args.limit)
      ? Math.min(Math.max(Math.round(args.limit), 1), 50)
      : 8;

  return {
    userProfile: args.userProfile,
    mode,
    channel,
    strictness,
    limit,
  };
}
