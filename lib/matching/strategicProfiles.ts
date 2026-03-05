import type { NormalizedMatchingProfile, ProfilePriorityRule, ScanResultLike } from '@/lib/matching/types';
import { normalizeForMatch } from '@/lib/matching/profileNormalizer';

const SOUTH_REGION_SET = new Set([
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Molise',
  'Puglia',
  'Sardegna',
  'Sicilia',
]);

function isSouthRegion(region: string | null) {
  if (!region) return false;
  return SOUTH_REGION_SET.has(region);
}

function isYouth(age: number | null) {
  if (age === null) return false;
  return age >= 18 && age <= 35;
}

function isUnemployedLike(value: string | null) {
  const normalized = normalizeForMatch(value ?? '');
  return /(disoccupat|inoccupat|neet|working poor|senza lavoro|non occupat)/.test(normalized);
}

function profileSignalText(profile: NormalizedMatchingProfile) {
  return normalizeForMatch([profile.fundingGoal, profile.activityType, profile.sector].filter(Boolean).join(' '));
}

export function isSouthYouthStartupProfile(profile: NormalizedMatchingProfile) {
  const startupIntent = /(startup|da costituire|nuova attivita|nuova impresa|aprire|avviare|autoimpiego)/.test(profileSignalText(profile));
  const youthByBand = profile.ageBand === 'under35';
  return Boolean(
    profile.businessExists === false &&
    startupIntent &&
    isSouthRegion(profile.userRegionCanonical) &&
    (isYouth(profile.age) || youthByBand) &&
      isUnemployedLike(profile.employmentStatus),
  );
}

export function southYouthStartupPriorityRules(enabled: boolean): ProfilePriorityRule[] {
  if (!enabled) return [];
  return [
    { tokens: ['resto al sud 2 0', 'resto al sud'], score: 16 },
    { tokens: ['fusese', 'fund for self employment', 'self entrepreneurship'], score: 12 },
    { tokens: ['oltre nuove imprese a tasso zero', 'nuove imprese a tasso zero', 'on'], score: 8 },
  ];
}

export function profilePriorityScoreFromRules(result: ScanResultLike, rules: ProfilePriorityRule[]): number {
  if (rules.length === 0) return 0;
  const titleNorm = normalizeForMatch(result.title);
  let score = 0;
  for (const rule of rules) {
    if (rule.tokens.some((token) => token && titleNorm.includes(normalizeForMatch(token)))) {
      score = Math.max(score, rule.score);
    }
  }
  return score;
}

export function isStrategicResult(result: ScanResultLike) {
  const titleNorm = normalizeForMatch(result.title);
  return (
    titleNorm.includes('resto al sud') ||
    titleNorm.includes('fusese') ||
    titleNorm.includes('oltre nuove imprese a tasso zero') ||
    titleNorm.includes('nuove imprese a tasso zero')
  );
}
