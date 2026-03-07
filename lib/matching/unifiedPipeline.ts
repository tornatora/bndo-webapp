import type { NormalizedMatchingProfile, IncentiviDoc } from '@/lib/matching/types';
import { normalizeForMatch, canonicalizeRegion } from '@/lib/matching/profileNormalizer';

/**
 * Dimensioni di matching utilizzate nella valutazione dei bandi
 */
export type MatchDimension =
  | 'subject' // beneficiario ammissibile
  | 'territory' // territorio compatibile
  | 'purpose' // finalità reale del bisogno
  | 'expenses' // spese ammissibili
  | 'sector' // settore/attività
  | 'stage' // stadio progetto/anzianità impresa
  | 'status' // stato del bando (aperto/chiuso/in arrivo)
  | 'special'; // requisiti speciali/vincoli

/**
 * Valutazione di una singola dimensione
 */
export type DimensionEval = {
  dimension: MatchDimension;
  compatible: boolean; // hard pass/fail
  score: number; // 0-100 weighted score for this dimension
  confidence: 'high' | 'medium' | 'low';
  note: string | null; // explanation
};

/**
 * Valutazione completa di un bando
 */
export type GrantEvaluation = {
  grantId: string;
  title: string;
  totalScore: number; // 0-100 weighted
  band: 'excellent' | 'strong' | 'good' | 'borderline' | 'excluded';
  hardExcluded: boolean;
  hardExclusionReason: string | null;
  dimensions: DimensionEval[];
  whyFit: string[]; // human-readable reasons in Italian
  warnings: string[]; // residual criticalities
  availabilityStatus: 'open' | 'incoming' | 'closed' | 'unknown';
};

/**
 * Risultato della pipeline unificata
 */
export type PipelineResult = {
  evaluations: GrantEvaluation[]; // all evaluated grants
  primary: GrantEvaluation[]; // score >= 70, sorted
  borderline: GrantEvaluation[]; // 60-69, separate
  excluded: GrantEvaluation[]; // hard excluded or < 60
  totalAnalyzed: number;
  profileCompleteness: number; // 0-100
};

/**
 * Pesi per il calcolo del punteggio (devono sommare a 100)
 */
const DIMENSION_WEIGHTS: Record<MatchDimension, number> = {
  subject: 20,
  territory: 15,
  purpose: 20,
  expenses: 15,
  sector: 10,
  stage: 10,
  status: 5,
  special: 5,
};

/**
 * Canoniche regioni italiane per il matching
 */
const NATIONAL_REGION_KEYWORDS = ['tutte', 'nazionale', 'nazionale', 'italia', 'italian'];

/**
 * Parse date string to ISO format check
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Normalize array or single string to string array
 */
function toStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [value];
}

/**
 * Calculate profile completeness score (0-100)
 */
function calculateProfileCompleteness(profile: NormalizedMatchingProfile): number {
  const fields = [
    profile.businessExists !== null,
    profile.userRegionCanonical !== null,
    profile.sector !== null,
    profile.fundingGoal !== null,
    profile.ateco !== null,
    profile.employees !== null,
    profile.budget !== null,
  ];
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}

/**
 * Check if grant regions are compatible with user region
 */
function evaluateTerritory(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userRegion = profile.userRegionCanonical || profile.region;

  if (!userRegion) {
    return {
      dimension: 'territory',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Regione utente non specificata',
    };
  }

  const grantRegions = toStringArray(grant.regions);

  // Se il bando non specifica regioni, è nazionale
  if (grantRegions.length === 0) {
    return {
      dimension: 'territory',
      compatible: true,
      score: 100,
      confidence: 'high',
      note: 'Bando nazionale',
    };
  }

  // Controlla se il bando copre tutte le regioni
  const normalizedGrants = grantRegions.map((r) => normalizeForMatch(r));
  if (normalizedGrants.some((r) => NATIONAL_REGION_KEYWORDS.some((kw) => r.includes(kw)))) {
    return {
      dimension: 'territory',
      compatible: true,
      score: 100,
      confidence: 'high',
      note: 'Bando a copertura nazionale',
    };
  }

  // Controlla se la regione dell'utente è nella lista
  const userRegionNormalized = normalizeForMatch(userRegion);
  const foundRegion = grantRegions.find(
    (r) => normalizeForMatch(r) === userRegionNormalized || canonicalizeRegion(r) === userRegion,
  );

  if (foundRegion) {
    return {
      dimension: 'territory',
      compatible: true,
      score: 100,
      confidence: 'high',
      note: `Bando disponibile in ${userRegion}`,
    };
  }

  return {
    dimension: 'territory',
    compatible: false,
    score: 0,
    confidence: 'high',
    note: `Bando non disponibile in ${userRegion}`,
  };
}

/**
 * Check if subject/beneficiary is compatible
 */
function evaluateSubject(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const beneficiaries = toStringArray(grant.beneficiaries).map((b) => normalizeForMatch(b));

  if (beneficiaries.length === 0) {
    return {
      dimension: 'subject',
      compatible: true,
      score: 50,
      confidence: 'medium',
      note: 'Beneficiari non specificati nel bando',
    };
  }

  // Se l'utente non ha indicato se l'azienda esiste
  if (profile.businessExists === null) {
    return {
      dimension: 'subject',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Stato aziendale non specificato nel profilo',
    };
  }

  const combinedBeneficiaries = beneficiaries.join(' ');

  // Check for startup/new business
  if (!profile.businessExists) {
    const isStartupFocused =
      combinedBeneficiaries.includes('startup') ||
      combinedBeneficiaries.includes('nuova impresa') ||
      combinedBeneficiaries.includes('nuova') ||
      combinedBeneficiaries.includes('autoimpiego');

    if (isStartupFocused) {
      return {
        dimension: 'subject',
        compatible: true,
        score: 90,
        confidence: 'high',
        note: 'Bando rivolto a startup e nuove imprese',
      };
    }

    // Check for explicit exclusion of new businesses
    const excludesNew =
      combinedBeneficiaries.includes('gia attiva') ||
      combinedBeneficiaries.includes('imprese esistenti') ||
      combinedBeneficiaries.includes('pmi consolidate');

    if (excludesNew) {
      return {
        dimension: 'subject',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: 'Bando riservato a imprese già costituite',
      };
    }

    return {
      dimension: 'subject',
      compatible: true,
      score: 60,
      confidence: 'medium',
      note: 'Bando potenzialmente adatto a startup',
    };
  }

  // Check for existing business
  if (profile.businessExists) {
    const isExistingFocused =
      combinedBeneficiaries.includes('imprese esistenti') ||
      combinedBeneficiaries.includes('gia attiva') ||
      combinedBeneficiaries.includes('pmi');

    if (isExistingFocused) {
      return {
        dimension: 'subject',
        compatible: true,
        score: 90,
        confidence: 'high',
        note: 'Bando rivolto a imprese già costituite',
      };
    }

    // Check for explicit exclusion of existing businesses
    const excludesExisting = combinedBeneficiaries.includes('solo startup') || combinedBeneficiaries.includes('solo nuove');

    if (excludesExisting) {
      return {
        dimension: 'subject',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: 'Bando riservato a startup e nuove imprese',
      };
    }

    return {
      dimension: 'subject',
      compatible: true,
      score: 70,
      confidence: 'medium',
      note: 'Bando potenzialmente adatto a imprese esistenti',
    };
  }

  return {
    dimension: 'subject',
    compatible: true,
    score: 50,
    confidence: 'medium',
    note: 'Compatibilità beneficiario non conclusiva',
  };
}

/**
 * Check if funding purpose is compatible
 */
function evaluatePurpose(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const fundingGoal = profile.fundingGoal ? normalizeForMatch(profile.fundingGoal) : null;

  if (!fundingGoal) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Finalità di finanziamento non specificata',
    };
  }

  const purposes = toStringArray(grant.purposes).map((p) => normalizeForMatch(p));

  if (purposes.length === 0) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 50,
      confidence: 'medium',
      note: 'Finalità del bando non specificate',
    };
  }

  const combinedPurposes = purposes.join(' ');

  // Keywords from user goal
  const userKeywords = fundingGoal
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 5);

  let matchedKeywords = 0;
  for (const keyword of userKeywords) {
    if (combinedPurposes.includes(keyword)) {
      matchedKeywords++;
    }
  }

  if (userKeywords.length === 0) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Finalità troppo generica',
    };
  }

  const matchRatio = matchedKeywords / userKeywords.length;

  if (matchRatio >= 0.66) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: Math.round(85 + matchRatio * 15),
      confidence: 'high',
      note: `Finalità coerente: ${matchedKeywords}/${userKeywords.length} parametri corrispondono`,
    };
  }

  if (matchRatio >= 0.33) {
    return {
      dimension: 'purpose',
      compatible: true,
      score: 60,
      confidence: 'medium',
      note: `Finalità parzialmente coerente: ${matchedKeywords}/${userKeywords.length} parametri corrispondono`,
    };
  }

  return {
    dimension: 'purpose',
    compatible: false,
    score: 20,
    confidence: 'high',
    note: `Finalità non coerente: solo ${matchedKeywords}/${userKeywords.length} parametri corrispondono`,
  };
}

/**
 * Check if sector/activity is compatible
 */
function evaluateSector(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userSector = profile.sector ? normalizeForMatch(profile.sector) : null;
  const userAteco = profile.ateco ? normalizeForMatch(profile.ateco) : null;

  if (!userSector && !userAteco) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Settore non specificato nel profilo',
    };
  }

  const grantSectors = toStringArray(grant.sectors).map((s) => normalizeForMatch(s));
  const grantAteco = toStringArray(grant.ateco).map((a) => normalizeForMatch(a));

  if (grantSectors.length === 0 && grantAteco.length === 0) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 50,
      confidence: 'medium',
      note: 'Settore non specificato nel bando',
    };
  }

  // Check ATECO digits (prima 2, poi 4, poi 6)
  if (profile.atecoDigits && profile.atecoDigits.length > 0) {
    const atecoMatch = profile.atecoDigits.some((digit) =>
      grantAteco.some((a) => a.includes(digit) || a.startsWith(digit)),
    );

    if (atecoMatch) {
      return {
        dimension: 'sector',
        compatible: true,
        score: 95,
        confidence: 'high',
        note: 'Settore ATECO compatibile',
      };
    }
  }

  // Check sector keywords
  const combinedGrantSectors = grantSectors.join(' ');

  if (userSector && combinedGrantSectors.includes(userSector)) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 85,
      confidence: 'high',
      note: 'Settore compatibile',
    };
  }

  // Partial match with sector keywords
  const sectorKeywords = userSector?.split(/\s+/).filter((w) => w.length >= 4) || [];
  let sectorMatches = 0;

  for (const keyword of sectorKeywords) {
    if (combinedGrantSectors.includes(keyword)) {
      sectorMatches++;
    }
  }

  if (sectorKeywords.length > 0 && sectorMatches > 0) {
    return {
      dimension: 'sector',
      compatible: true,
      score: 60,
      confidence: 'medium',
      note: `Settore parzialmente compatibile: ${sectorMatches}/${sectorKeywords.length}`,
    };
  }

  return {
    dimension: 'sector',
    compatible: true,
    score: 40,
    confidence: 'low',
    note: 'Settore non chiaramente compatibile',
  };
}

/**
 * Check if business stage/age is compatible
 */
function evaluateStage(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  // Se lo stato aziendale non è noto, score neutro
  if (profile.businessExists === null) {
    return {
      dimension: 'stage',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Stato aziendale non specificato',
    };
  }

  const beneficiaries = toStringArray(grant.beneficiaries)
    .map((b) => normalizeForMatch(b))
    .join(' ');

  // Se l'utente è startup, controllare se il bando le accetta
  if (!profile.businessExists) {
    const startupFriendly =
      beneficiaries.includes('startup') ||
      beneficiaries.includes('nuova impresa') ||
      beneficiaries.includes('autoimpiego');

    if (startupFriendly) {
      return {
        dimension: 'stage',
        compatible: true,
        score: 95,
        confidence: 'high',
        note: 'Bando adatto a startup',
      };
    }

    const onlyExisting = beneficiaries.includes('gia attiva') || beneficiaries.includes('pmi consolidate');
    if (onlyExisting) {
      return {
        dimension: 'stage',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: 'Bando riservato a imprese già costituite',
      };
    }

    return {
      dimension: 'stage',
      compatible: true,
      score: 60,
      confidence: 'medium',
      note: 'Compatibilità stadio aziendale incerta per startup',
    };
  }

  // Se l'utente ha un'impresa esistente
  if (profile.businessExists) {
    const existingFriendly = beneficiaries.includes('pmi') || beneficiaries.includes('imprese esistenti');

    if (existingFriendly) {
      return {
        dimension: 'stage',
        compatible: true,
        score: 90,
        confidence: 'high',
        note: 'Bando adatto a imprese già costituite',
      };
    }

    const onlyStartup = beneficiaries.includes('solo startup') || beneficiaries.includes('solo nuova impresa');
    if (onlyStartup) {
      return {
        dimension: 'stage',
        compatible: false,
        score: 0,
        confidence: 'high',
        note: 'Bando riservato a startup',
      };
    }

    return {
      dimension: 'stage',
      compatible: true,
      score: 70,
      confidence: 'medium',
      note: 'Bando potenzialmente adatto a imprese esistenti',
    };
  }

  return {
    dimension: 'stage',
    compatible: true,
    score: 50,
    confidence: 'low',
    note: 'Compatibilità stadio aziendale non valutabile',
  };
}

/**
 * Evaluate grant status (open, incoming, closed)
 */
function evaluateStatus(grant: IncentiviDoc): DimensionEval {
  const openDate = parseDate(grant.openDate as string);
  const closeDate = parseDate(grant.closeDate as string);
  const now = new Date();

  if (!openDate && !closeDate) {
    return {
      dimension: 'status',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Date di apertura/chiusura non disponibili',
    };
  }

  // Check if bando is closed
  if (closeDate && closeDate < now) {
    return {
      dimension: 'status',
      compatible: false,
      score: 0,
      confidence: 'high',
      note: `Bando scaduto il ${closeDate.toLocaleDateString('it-IT')}`,
    };
  }

  // Check if bando is incoming
  if (openDate && openDate > now) {
    return {
      dimension: 'status',
      compatible: true,
      score: 70,
      confidence: 'high',
      note: `Bando in arrivo dal ${openDate.toLocaleDateString('it-IT')}`,
    };
  }

  // Bando is open
  if (openDate && closeDate && openDate <= now && closeDate > now) {
    const daysLeft = Math.ceil((closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      dimension: 'status',
      compatible: true,
      score: 100,
      confidence: 'high',
      note: `Bando aperto, scadenza tra ${daysLeft} giorni`,
    };
  }

  return {
    dimension: 'status',
    compatible: true,
    score: 80,
    confidence: 'medium',
    note: 'Stato del bando compatibile',
  };
}

/**
 * Evaluate expenses compatibility
 */
function evaluateExpenses(profile: NormalizedMatchingProfile, grant: IncentiviDoc): DimensionEval {
  const userBudget = profile.budget;
  const costMin = typeof grant.costMin === 'string' ? Number.parseFloat(grant.costMin) : grant.costMin;
  const costMax = typeof grant.costMax === 'string' ? Number.parseFloat(grant.costMax) : grant.costMax;

  if (!userBudget && typeof costMin === 'undefined' && typeof costMax === 'undefined') {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Budget non specificati',
    };
  }

  if (!userBudget) {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 50,
      confidence: 'low',
      note: 'Budget utente non specificato',
    };
  }

  if (typeof costMin === 'undefined' && typeof costMax === 'undefined') {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 50,
      confidence: 'medium',
      note: 'Budget del bando non specificati',
    };
  }

  // Check if user budget is within range
  let compatible = true;
  let score = 75;

  if (typeof costMin === 'number' && userBudget < costMin) {
    compatible = false;
    score = 10;
  }

  if (typeof costMax === 'number' && userBudget > costMax) {
    compatible = false;
    score = 10;
  }

  if (compatible) {
    return {
      dimension: 'expenses',
      compatible: true,
      score: 90,
      confidence: 'high',
      note: `Budget compatibile: ${userBudget.toLocaleString('it-IT')} €`,
    };
  }

  return {
    dimension: 'expenses',
    compatible: false,
    score: 0,
    confidence: 'high',
    note: `Budget non compatibile: ${userBudget.toLocaleString('it-IT')} € vs range bando`,
  };
}

/**
 * Evaluate special requirements
 */
function evaluateSpecial(_profile: NormalizedMatchingProfile, _grant: IncentiviDoc): DimensionEval {
  // Reserved for future special requirements evaluation
  return {
    dimension: 'special',
    compatible: true,
    score: 50,
    confidence: 'low',
    note: 'Valutazione requisiti speciali non ancora implementata',
  };
}

/**
 * Determine availability status
 */
function determineAvailabilityStatus(grant: IncentiviDoc): 'open' | 'incoming' | 'closed' | 'unknown' {
  const openDate = parseDate(grant.openDate as string);
  const closeDate = parseDate(grant.closeDate as string);
  const now = new Date();

  if (!openDate && !closeDate) {
    return 'unknown';
  }

  if (closeDate && closeDate < now) {
    return 'closed';
  }

  if (openDate && openDate > now) {
    return 'incoming';
  }

  return 'open';
}

/**
 * Check hard exclusion rules
 */
function checkHardExclusions(
  profile: NormalizedMatchingProfile,
  grant: IncentiviDoc,
  evals: Map<MatchDimension, DimensionEval>,
): { excluded: boolean; reason: string | null } {
  // Rule 1: Subject incompatible
  const subjectEval = evals.get('subject');
  if (subjectEval && !subjectEval.compatible) {
    return { excluded: true, reason: subjectEval.note || 'Beneficiario non ammissibile' };
  }

  // Rule 2: Territory incompatible
  const territoryEval = evals.get('territory');
  if (territoryEval && !territoryEval.compatible) {
    return { excluded: true, reason: territoryEval.note || 'Territorio non compatibile' };
  }

  // Rule 3: Purpose substantially incompatible
  const purposeEval = evals.get('purpose');
  if (purposeEval && !purposeEval.compatible) {
    return { excluded: true, reason: purposeEval.note || 'Finalità non compatibile' };
  }

  // Rule 4: Sector explicitly excluded
  const sectorEval = evals.get('sector');
  if (sectorEval && !sectorEval.compatible) {
    // Note: sector eval returns compatible=true with low score, not hard exclude
    // This is intentional - sector mismatch is soft, not hard
  }

  // Rule 5: Stage/phase incompatible
  const stageEval = evals.get('stage');
  if (stageEval && !stageEval.compatible) {
    return { excluded: true, reason: stageEval.note || 'Stadio aziendale non compatibile' };
  }

  // Rule 6: Status incompatible (closed bando)
  const statusEval = evals.get('status');
  if (statusEval && !statusEval.compatible) {
    return { excluded: true, reason: statusEval.note || 'Bando scaduto o non disponibile' };
  }

  return { excluded: false, reason: null };
}

/**
 * Generate human-readable explanations in Italian
 */
function generateWhyFit(evals: Map<MatchDimension, DimensionEval>): string[] {
  const reasons: string[] = [];

  const subjectEval = evals.get('subject');
  if (subjectEval && subjectEval.score >= 70) {
    reasons.push(subjectEval.note || 'Categoria beneficiario compatibile');
  }

  const territoryEval = evals.get('territory');
  if (territoryEval && territoryEval.score >= 70) {
    reasons.push(territoryEval.note || 'Territorio compatibile');
  }

  const purposeEval = evals.get('purpose');
  if (purposeEval && purposeEval.score >= 70) {
    reasons.push(purposeEval.note || 'Finalità coerente con il progetto');
  }

  const sectorEval = evals.get('sector');
  if (sectorEval && sectorEval.score >= 70) {
    reasons.push(sectorEval.note || 'Settore attività compatibile');
  }

  const stageEval = evals.get('stage');
  if (stageEval && stageEval.score >= 70) {
    reasons.push(stageEval.note || 'Stadio aziendale adatto');
  }

  const statusEval = evals.get('status');
  if (statusEval && statusEval.score >= 70) {
    reasons.push(statusEval.note || 'Bando disponibile');
  }

  return reasons.length > 0 ? reasons : ['Bando potenzialmente interessante'];
}

/**
 * Generate warnings for low-confidence evaluations
 */
function generateWarnings(evals: Map<MatchDimension, DimensionEval>): string[] {
  const warnings: string[] = [];

  for (const dimEval of evals.values()) {
    if (dimEval.confidence === 'low' && dimEval.score > 0 && dimEval.score < 100) {
      warnings.push(`Bassa affidabilità valutazione ${dimEval.dimension}: ${dimEval.note || 'dati incompleti'}`);
    }
  }

  return warnings;
}

/**
 * Calculate weighted total score from dimension evaluations
 */
function calculateTotalScore(evals: Map<MatchDimension, DimensionEval>): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [dimension, dimEval] of evals.entries()) {
    const weight = DIMENSION_WEIGHTS[dimension] || 0;
    weightedSum += (dimEval.score * weight) / 100;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum);
}

/**
 * Determine band based on total score
 */
function determineBand(score: number): GrantEvaluation['band'] {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'strong';
  if (score >= 70) return 'good';
  if (score >= 60) return 'borderline';
  return 'excluded';
}

/**
 * Main unified matching pipeline
 */
export function runUnifiedPipeline(args: {
  profile: NormalizedMatchingProfile;
  grants: IncentiviDoc[];
  options?: {
    channel?: 'chat' | 'scanner';
    strictness?: 'standard' | 'high';
    maxResults?: number;
  };
}): PipelineResult {
  const { profile, grants } = args;
  const options = args.options || {};

  // Evaluate all grants
  const evaluations: GrantEvaluation[] = [];

  for (const grant of grants) {
    const grantId = String(grant.id ?? '');
    const title = grant.title ?? 'Unknown Grant';

    // Run all dimension evaluations
    const evals = new Map<MatchDimension, DimensionEval>();
    evals.set('subject', evaluateSubject(profile, grant));
    evals.set('territory', evaluateTerritory(profile, grant));
    evals.set('purpose', evaluatePurpose(profile, grant));
    evals.set('expenses', evaluateExpenses(profile, grant));
    evals.set('sector', evaluateSector(profile, grant));
    evals.set('stage', evaluateStage(profile, grant));
    evals.set('status', evaluateStatus(grant));
    evals.set('special', evaluateSpecial(profile, grant));

    // Check hard exclusions
    const hardExclusion = checkHardExclusions(profile, grant, evals);

    // Calculate total score
    const totalScore = hardExclusion.excluded ? 0 : calculateTotalScore(evals);

    // Generate explanations and warnings
    const whyFit = generateWhyFit(evals);
    const warnings = generateWarnings(evals);
    const availabilityStatus = determineAvailabilityStatus(grant);

    const evaluation: GrantEvaluation = {
      grantId,
      title,
      totalScore,
      band: determineBand(totalScore),
      hardExcluded: hardExclusion.excluded,
      hardExclusionReason: hardExclusion.reason,
      dimensions: [...evals.values()],
      whyFit,
      warnings,
      availabilityStatus,
    };

    evaluations.push(evaluation);
  }

  // Sort by score descending
  evaluations.sort((a, b) => b.totalScore - a.totalScore);

  // Categorize results
  const primary = evaluations.filter((e) => e.totalScore >= 70);
  const borderline = evaluations.filter((e) => e.totalScore >= 60 && e.totalScore < 70);
  const excluded = evaluations.filter((e) => e.totalScore < 60);

  // Apply maxResults limit if specified
  const maxResults = options.maxResults;
  if (maxResults && maxResults > 0) {
    primary.splice(maxResults);
  }

  const profileCompleteness = calculateProfileCompleteness(profile);

  return {
    evaluations,
    primary,
    borderline,
    excluded,
    totalAnalyzed: grants.length,
    profileCompleteness,
  };
}
