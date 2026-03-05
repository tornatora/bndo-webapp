import type { NormalizedMatchingProfile, ProfilePriorityRule } from '@/lib/matching/types';
import { normalizeForMatch } from '@/lib/matching/profileNormalizer';

type CaseProfileDefinition = {
  id: string;
  when: (profile: NormalizedMatchingProfile) => boolean;
  pinnedTitles: string[];
  priorityRules?: ProfilePriorityRule[];
};

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

const CENTER_NORTH_REGION_SET = new Set([
  'Piemonte',
  "Valle d'Aosta",
  'Lombardia',
  'Liguria',
  'Veneto',
  'Friuli-Venezia Giulia',
  'Emilia-Romagna',
  'Toscana',
  'Umbria',
  'Marche',
  'Lazio',
  'Trentino-Alto Adige',
]);

function textSignals(profile: NormalizedMatchingProfile) {
  return normalizeForMatch([profile.activityType, profile.fundingGoal, profile.sector].filter(Boolean).join(' '));
}

function isUnemployedLike(profile: NormalizedMatchingProfile) {
  return /(disoccupat|inoccupat|neet|working poor|non occupat|senza lavoro)/.test(
    normalizeForMatch(profile.employmentStatus ?? ''),
  );
}

function isUnder35(profile: NormalizedMatchingProfile) {
  if (profile.ageBand === 'under35') return true;
  if (profile.age === null) return false;
  return profile.age >= 18 && profile.age <= 35;
}

function hasStartupIntent(profile: NormalizedMatchingProfile) {
  return /(startup|da costituire|nuova attivita|nuova impresa|aprire|avviare|autoimpiego|iniziativa imprenditoriale)/.test(
    textSignals(profile),
  );
}

function hasDigitalIntent(profile: NormalizedMatchingProfile) {
  return /(digital|digitale|software|ict|cloud|cyber|ecommerce|crm|automazion|assessment|roadmap digitale)/.test(
    textSignals(profile),
  );
}

function hasEnergyIntent(profile: NormalizedMatchingProfile) {
  return /(energia|energetic|efficientamento|rinnovabil|fotovolta|transizione green|risparmio energetico)/.test(
    textSignals(profile),
  );
}

function hasExportFairIntent(profile: NormalizedMatchingProfile) {
  return /(export|internazionalizzazione|mercati esteri|fiera|fiere|smau|stand|b2b|buyer)/.test(textSignals(profile));
}

function hasMachineryIntent(profile: NormalizedMatchingProfile) {
  return /(macchinari|beni strumentali|attrezzature|impianti|industria 4 0)/.test(textSignals(profile));
}

const CASE_PROFILES: CaseProfileDefinition[] = [
  {
    id: 'south-youth-startup',
    when: (profile) =>
      profile.businessExists === false &&
      hasStartupIntent(profile) &&
      Boolean(profile.userRegionCanonical && SOUTH_REGION_SET.has(profile.userRegionCanonical)) &&
      isUnder35(profile) &&
      isUnemployedLike(profile),
    pinnedTitles: ['resto al sud', 'fusese', 'oltre nuove imprese a tasso zero'],
    priorityRules: [
      { tokens: ['resto al sud 2 0', 'resto al sud'], score: 16 },
      { tokens: ['fusese', 'fund for self employment', 'self entrepreneurship'], score: 12 },
      { tokens: ['oltre nuove imprese a tasso zero', 'nuove imprese a tasso zero', 'on'], score: 8 },
    ],
  },
  {
    id: 'center-north-youth-startup',
    when: (profile) =>
      profile.businessExists === false &&
      hasStartupIntent(profile) &&
      Boolean(profile.userRegionCanonical && CENTER_NORTH_REGION_SET.has(profile.userRegionCanonical)) &&
      isUnder35(profile) &&
      isUnemployedLike(profile),
    pinnedTitles: ['autoimpiego centro nord', 'oltre nuove imprese a tasso zero'],
  },
  {
    id: 'startup-innovative',
    when: (profile) => profile.businessExists === false && /(startup innovativ|innovazion|tecnolog|ai)/.test(textSignals(profile)),
    pinnedTitles: ['smart start'],
  },
  {
    id: 'active-digital',
    when: (profile) => profile.businessExists === true && hasDigitalIntent(profile),
    pinnedTitles: ['pidnext', 'voucher digitali', 'bando connessi'],
  },
  {
    id: 'active-energy',
    when: (profile) => profile.businessExists === true && hasEnergyIntent(profile),
    pinnedTitles: ['sostenibilita e risparmio energetico'],
  },
  {
    id: 'active-machinery',
    when: (profile) => profile.businessExists === true && hasMachineryIntent(profile),
    pinnedTitles: ['nuova sabatini'],
  },
  {
    id: 'active-export-fairs',
    when: (profile) => profile.businessExists === true && hasExportFairIntent(profile),
    pinnedTitles: ['smau', 'cciaa bologna', 'bando connessi'],
  },
];

export function resolveCaseProfiles(profile: NormalizedMatchingProfile): {
  activeCaseIds: string[];
  pinnedStrategicTitles: string[];
  profilePriorityRules: ProfilePriorityRule[];
} {
  const active = CASE_PROFILES.filter((entry) => entry.when(profile));
  const pinnedStrategicTitles = Array.from(new Set(active.flatMap((entry) => entry.pinnedTitles)));
  const profilePriorityRules = active.flatMap((entry) => entry.priorityRules ?? []);
  return {
    activeCaseIds: active.map((entry) => entry.id),
    pinnedStrategicTitles,
    profilePriorityRules,
  };
}

