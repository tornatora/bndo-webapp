import type { NormalizedMatchingProfile } from '@/lib/matching/types';

const REGION_DEFS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Abruzzo', aliases: ['abruzzo'] },
  { canonical: 'Basilicata', aliases: ['basilicata'] },
  { canonical: 'Calabria', aliases: ['calabria'] },
  { canonical: 'Campania', aliases: ['campania'] },
  { canonical: 'Emilia-Romagna', aliases: ['emilia romagna'] },
  { canonical: 'Friuli-Venezia Giulia', aliases: ['friuli venezia giulia'] },
  { canonical: 'Lazio', aliases: ['lazio'] },
  { canonical: 'Liguria', aliases: ['liguria'] },
  { canonical: 'Lombardia', aliases: ['lombardia'] },
  { canonical: 'Marche', aliases: ['marche'] },
  { canonical: 'Molise', aliases: ['molise'] },
  { canonical: 'Piemonte', aliases: ['piemonte'] },
  { canonical: 'Puglia', aliases: ['puglia'] },
  { canonical: 'Sardegna', aliases: ['sardegna'] },
  { canonical: 'Sicilia', aliases: ['sicilia'] },
  { canonical: 'Toscana', aliases: ['toscana'] },
  { canonical: 'Trentino-Alto Adige', aliases: ['trentino alto adige', 'sudtirol'] },
  { canonical: 'Umbria', aliases: ['umbria'] },
  { canonical: "Valle d'Aosta", aliases: ['valle d aosta', 'vallee d aoste'] },
  { canonical: 'Veneto', aliases: ['veneto'] },
];

export function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanString(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max).trim() : v;
}

export function cleanNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (!raw) return null;
    const m = raw.match(/^(\d+(?:[.,]\d+)?)(\s*(k|m|mila|milione|milioni))?$/i);
    if (!m) return null;
    const base = Number.parseFloat((m[1] ?? '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(base)) return null;
    const unit = (m[3] ?? '').toLowerCase();
    if (unit === 'k' || unit === 'mila') return Math.round(base * 1_000);
    if (unit === 'm' || unit === 'milione' || unit === 'milioni') return Math.round(base * 1_000_000);
    return Math.round(base);
  }
  return null;
}

export function extractAtecoDigitsFromText(text: string) {
  const out = new Set<string>();
  const raw = text ?? '';

  const dotted = /\b(\d{2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\b/g;
  let m: RegExpExecArray | null = null;
  while ((m = dotted.exec(raw))) {
    const a = m[1];
    const b = m[2];
    const c = m[3];
    if (!a) continue;
    const aDigits = a.replace(/\D/g, '');
    if (aDigits.length >= 2) out.add(aDigits);
    if (b) {
      const b2 = b.replace(/\D/g, '').padStart(2, '0');
      const ab = `${aDigits}${b2}`;
      if (ab.length >= 4) out.add(ab);
      if (c) {
        const c2 = c.replace(/\D/g, '').padStart(2, '0');
        const abc = `${ab}${c2}`;
        if (abc.length >= 6) out.add(abc);
      }
    }
  }

  const compact = /\b(\d{4,6})\b/g;
  while ((m = compact.exec(raw))) {
    const digits = (m[1] ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 6) out.add(digits);
  }

  return [...out];
}

export function canonicalizeRegion(label: string): string | null {
  const norm = normalizeForMatch(label);
  if (!norm) return null;
  const hits = REGION_DEFS.filter((entry) => entry.aliases.some((alias) => alias === norm));
  if (hits.length === 1) return hits[0]!.canonical;
  if (hits.length > 1) return null;

  for (const entry of REGION_DEFS) {
    if (normalizeForMatch(entry.canonical) === norm) return entry.canonical;
  }
  return null;
}

export function normalizeProfile(rawProfile: Record<string, unknown>): NormalizedMatchingProfile {
  const rawLocation =
    rawProfile.location && typeof rawProfile.location === 'object' && !Array.isArray(rawProfile.location)
      ? (rawProfile.location as Record<string, unknown>)
      : null;

  const region = cleanString(rawLocation?.region ?? rawProfile.region, 80);
  const investmentRegion = cleanString(rawLocation?.investmentRegion ?? rawProfile.investmentRegion, 80);
  
  // Primary region for matching is investmentRegion if present, else headquarters region
  const effectiveRegionForMatching = investmentRegion || region;
  const userRegionCanonical = effectiveRegionForMatching ? canonicalizeRegion(effectiveRegionForMatching) : null;
  const sector = cleanString(rawProfile.sector, 120);
  const fundingGoal = cleanString(rawProfile.fundingGoal, 220);
  const ateco = cleanString(rawProfile.ateco, 80);
  const activityType = cleanString(rawProfile.activityType, 120);
  const contributionPreference = cleanString(rawProfile.contributionPreference, 80);
  const employees = cleanNumber(rawProfile.employees);
  const age = cleanNumber(rawProfile.age ?? rawProfile.founderAge);
  const rawAgeBand = cleanString(rawProfile.ageBand, 30) ?? cleanString(rawProfile.founderAgeBand, 30);
  const ageBandNorm = normalizeForMatch(rawAgeBand ?? '');
  const ageBand =
    ageBandNorm && /(under\s*35|u35|meno di 35|<\s*35|sotto i 35)/.test(ageBandNorm)
      ? 'under35'
      : ageBandNorm && /(over\s*35|oltre 35|piu di 35|>\s*35|sopra i 35)/.test(ageBandNorm)
        ? 'over35'
        : null;
  const employmentStatus =
    cleanString(rawProfile.employmentStatus, 80) ??
    cleanString(rawProfile.occupationalStatus, 80) ??
    cleanString(rawProfile.workStatus, 80);
  const annualTurnover = cleanNumber(rawProfile.annualTurnover ?? rawProfile.revenueOrBudgetEUR);
  const budget = cleanNumber(rawProfile.budget ?? rawProfile.projectCost);
  const requestedContribution = cleanNumber(rawProfile.requestedContributionEUR ?? rawProfile.requestedContribution);
  const atecoDigits = typeof ateco === 'string' ? extractAtecoDigitsFromText(ateco) : [];
  
  let businessExists = typeof rawProfile.businessExists === 'boolean' ? rawProfile.businessExists : null;
  if (businessExists === null && typeof rawProfile.businessExists === 'string') {
    const n = normalizeForMatch(rawProfile.businessExists);
    if (/(operativa|gia operativa|attiva|gia attiva|ho gia l azienda|azienda attiva|impresa attiva|siamo gia operativi|societa attiva)/.test(n)) {
      businessExists = true;
    } else if (/(da aprire|da costituire|nuova attivita|non e ancora attiva|non l ho ancora aperta)/.test(n)) {
      businessExists = false;
    }
  }

  const result: NormalizedMatchingProfile = {
    businessExists,
    region,
    investmentRegion,
    userRegionCanonical,
    sector,
    fundingGoal,
    ateco,
    activityType,
    contributionPreference,
    employees,
    age,
    ageBand,
    employmentStatus,
    budget,
    annualTurnover,
    requestedContribution,
    atecoDigits,
    teamMajority: rawProfile.teamMajority as "female" | "youth" | "mixed" | "none" | null ?? null,
    agricultureStatus: rawProfile.agricultureStatus as "has_land_iap" | "no_land_iap" | "unknown" | null ?? null,
    tech40: typeof rawProfile.tech40 === 'boolean' ? rawProfile.tech40 : null,
    professionalRegister: typeof rawProfile.professionalRegister === 'boolean' ? rawProfile.professionalRegister : null,
    isThirdSector: typeof rawProfile.isThirdSector === 'boolean' ? rawProfile.isThirdSector : null,
    propertyStatus: rawProfile.propertyStatus as 'owned' | 'rented_registered' | 'none' | null ?? null,
    foundationYear: cleanNumber(rawProfile.foundationYear),
    isInnovative: typeof rawProfile.isInnovative === 'boolean' ? rawProfile.isInnovative : null,
  };

  // EU Company Size Inference (Raccomandazione 2003/361/CE)
  if (result.businessExists !== false && (result.employees !== null || result.annualTurnover !== null)) {
    const emp = result.employees ?? 0;
    const fatt = result.annualTurnover ?? 0;

    if (emp >= 250 || fatt >= 50_000_000) {
      result.companySize = 'grande';
    } else if ((emp >= 50 && emp < 250) || (fatt >= 10_000_000 && fatt < 50_000_000)) {
      result.companySize = 'media';
    } else if ((emp >= 10 && emp < 50) || (fatt >= 2_000_000 && fatt < 10_000_000)) {
      result.companySize = 'piccola';
    } else if (emp < 10 && fatt < 2_000_000) {
      result.companySize = 'micro';
    }
  }

  return result;
}
