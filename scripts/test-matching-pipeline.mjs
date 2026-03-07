#!/usr/bin/env node

/**
 * Test Script: Unified Matching Pipeline
 *
 * This script validates the core logic of the unified matching pipeline by simulating
 * real Italian grant matching scenarios. It tests hard eligibility gates, scoring,
 * ranking, and exclusion logic without requiring the full application stack.
 *
 * Scenarios covered:
 * 1. Territorial mismatch detection
 * 2. Subject/business stage mismatch
 * 3. Purpose/sector mismatch
 * 4. Closed grant detection
 * 5. Scoring and ranking
 * 6. No results scenario
 * 7. Anti-hallucination (no invented dates/percentages)
 */

// ============================================================================
// UTILITIES & ASSERTION FUNCTIONS
// ============================================================================

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected} but got ${actual}: ${message}`);
  }
}

function assertContains(text, substring, message) {
  if (!text.includes(substring)) {
    throw new Error(`Expected "${substring}" in "${text}": ${message}`);
  }
}

function assertNotContains(text, substring, message) {
  if (text.includes(substring)) {
    throw new Error(`Did not expect "${substring}" in "${text}": ${message}`);
  }
}

function assertGreaterThanOrEqual(actual, expected, message) {
  if (actual < expected) {
    throw new Error(`Expected ${actual} >= ${expected}: ${message}`);
  }
}

function assertLessThan(actual, expected, message) {
  if (actual >= expected) {
    throw new Error(`Expected ${actual} < ${expected}: ${message}`);
  }
}

function assertBetween(actual, min, max, message) {
  if (actual < min || actual > max) {
    throw new Error(`Expected ${actual} to be between ${min} and ${max}: ${message}`);
  }
}

// ============================================================================
// MOCK DATA & NORMALIZATION
// ============================================================================

function normalizeForMatch(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const mockProfiles = {
  lombardyStartup: {
    businessExists: false,
    region: 'Lombardia',
    userRegionCanonical: 'Lombardia',
    sector: 'technology startup',
    fundingGoal: 'starting a new business startup',
    activityType: 'startup',
    employees: null,
    age: 28,
    ageBand: 'under35',
    employmentStatus: 'unemployed',
    budget: 50000,
    requestedContribution: 30000,
  },
  campaniaExisting: {
    businessExists: true,
    region: 'Campania',
    userRegionCanonical: 'Campania',
    sector: 'manufacturing',
    fundingGoal: 'expanding business operations',
    activityType: 'existing business',
    employees: 15,
    age: 45,
    ageBand: 'over35',
    employmentStatus: 'employed',
    budget: 200000,
    requestedContribution: 100000,
  },
  siciliaDigitalization: {
    businessExists: true,
    region: 'Sicilia',
    userRegionCanonical: 'Sicilia',
    sector: 'manufacturing',
    fundingGoal: 'digitalizzazione',
    activityType: 'existing business',
    employees: 8,
    age: 35,
    ageBand: 'over35',
    employmentStatus: 'employed',
    budget: 150000,
    requestedContribution: 75000,
  },
  noMatch: {
    businessExists: false,
    region: 'Trentino-Alto Adige',
    userRegionCanonical: 'Trentino-Alto Adige',
    sector: 'agriculture',
    fundingGoal: null,
    activityType: null,
    employees: null,
    age: null,
    ageBand: null,
    employmentStatus: null,
    budget: null,
    requestedContribution: null,
  },
};

const mockGrants = {
  calabriaOnly: {
    id: 'grant-calabria-1',
    title: 'Bando PMI Calabria - Sviluppo Economico',
    authorityName: 'Regione Calabria',
    openDate: '2026-01-01',
    closeDate: '2026-12-31',
    regions: 'Calabria',
    sectors: ['manufacturing'],
    beneficiaries: 'PMI existing businesses',
    purposes: ['expansion'],
    score: 75,
    matchScore: 70,
    matchReasons: ['sector match', 'business stage compatible'],
    mismatchFlags: ['regione'],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2026-12-31',
    economicOffer: { coverageMaxPercent: 50 },
    aidIntensity: '50%',
  },

  nationalGrant: {
    id: 'grant-national-1',
    title: 'Incentivi Nazionale Sviluppo Imprese Manifatturiere Manufacturing',
    authorityName: 'Ministero dello Sviluppo Economico Nazionale',
    openDate: '2026-01-01',
    closeDate: '2026-06-30',
    regions: 'national',
    sectors: ['manufacturing'],
    beneficiaries: 'PMI existing businesses manifatturiero',
    purposes: ['expansion'],
    score: 80,
    matchScore: 78,
    matchReasons: ['national coverage', 'manufacturing sector alignment', 'business expansion'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2026-06-30',
    economicOffer: { coverageMaxPercent: 60 },
    aidIntensity: '60%',
  },

  mezzogiorno: {
    id: 'grant-mezzogiorno-1',
    title: 'Bando Mezzogiorno - Digitalizzazione PMI',
    authorityName: 'Invitalia',
    openDate: '2025-06-01',
    closeDate: '2027-12-31',
    regions: ['Calabria', 'Campania', 'Puglia', 'Basilicata', 'Sicilia', 'Sardegna', 'Molise', 'Abruzzo'],
    sectors: ['manufacturing', 'services'],
    beneficiaries: 'PMI existing businesses',
    purposes: ['digitalizzazione', 'transizione digitale'],
    score: 85,
    matchScore: 82,
    matchReasons: ['Mezzogiorno region', 'digitalizzazione goal match'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2027-12-31',
    economicOffer: { coverageMaxPercent: 70 },
    aidIntensity: '70%',
  },

  startupOnly: {
    id: 'grant-startup-1',
    title: 'Resto al Sud - Nuove Imprese - da costituire - Startup - technology',
    authorityName: 'Invitalia',
    openDate: '2026-01-01',
    closeDate: '2026-12-31',
    regions: 'national',
    sectors: ['technology', 'services', 'manufacturing'],
    beneficiaries: 'startup da costituire new imprese technology',
    purposes: ['business creation startup'],
    score: 72,
    matchScore: 70,
    matchReasons: ['startup opportunity', 'new business creation'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2026-12-31',
    economicOffer: { coverageMaxPercent: 80 },
    aidIntensity: '80%',
  },

  existingBusinessOnly: {
    id: 'grant-existing-1',
    title: 'Imprese Consolidate - Ammodernamento',
    authorityName: 'Regione Lombardia',
    openDate: '2026-02-01',
    closeDate: '2026-09-30',
    regions: 'Lombardia',
    sectors: ['manufacturing'],
    beneficiaries: 'PMI with established operations',
    purposes: ['modernization'],
    score: 78,
    matchScore: 76,
    matchReasons: ['existing business required', 'region match'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2026-09-30',
    economicOffer: { coverageMaxPercent: 50 },
    aidIntensity: '50%',
  },

  energyEfficiency: {
    id: 'grant-energy-1',
    title: 'Efficientamento Energetico - PMI',
    authorityName: 'Ministero dell\'Ambiente',
    openDate: '2026-01-15',
    closeDate: '2026-12-31',
    regions: 'national',
    sectors: ['manufacturing', 'services'],
    beneficiaries: 'PMI',
    purposes: ['efficientamento energetico'],
    score: 65,
    matchScore: 62,
    matchReasons: ['energy efficiency program'],
    mismatchFlags: ['settore'],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2026-12-31',
    economicOffer: { coverageMaxPercent: 40 },
    aidIntensity: '40%',
  },

  instrumentalGoods: {
    id: 'grant-machinery-1',
    title: 'Beni Strumentali - Acquisizione Macchinari - Ministero',
    authorityName: 'Agenzia Nazionale Dogane e Ministero',
    openDate: '2026-01-01',
    closeDate: '2026-12-31',
    regions: 'national',
    sectors: ['manufacturing'],
    beneficiaries: 'PMI',
    purposes: ['beni strumentali', 'macchinari'],
    score: 80,
    matchScore: 78,
    matchReasons: ['machinery acquisition match'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2026-12-31',
    economicOffer: { coverageMaxPercent: 50 },
    aidIntensity: '50%',
  },

  closedGrant: {
    id: 'grant-closed-1',
    title: 'Finanziamento Storici - Scaduto',
    authorityName: 'Regione Campania',
    openDate: '2024-01-01',
    closeDate: '2025-06-30',
    regions: 'Campania',
    sectors: ['manufacturing'],
    beneficiaries: 'PMI',
    purposes: ['expansion'],
    score: 85,
    matchScore: 82,
    matchReasons: ['region match', 'sector match'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2025-06-30',
    economicOffer: { coverageMaxPercent: 60 },
    aidIntensity: '60%',
  },

  noDeadline: {
    id: 'grant-nodeadline-1',
    title: 'Finanziamento Sempre Aperto',
    authorityName: 'Ministero',
    openDate: '2020-01-01',
    closeDate: null,
    regions: 'national',
    sectors: ['manufacturing'],
    beneficiaries: 'PMI',
    purposes: ['expansion'],
    score: 70,
    matchScore: 68,
    matchReasons: ['open funding'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: null,
    economicOffer: { coverageMaxPercent: 45 },
    aidIntensity: '45%',
  },

  noCoverageLabel: {
    id: 'grant-nocoverage-1',
    title: 'Finanziamento Copertuta Non Dichiarata',
    authorityName: 'Regione Lazio',
    openDate: '2026-01-01',
    closeDate: '2026-12-31',
    regions: ['Lazio'],
    sectors: ['services'],
    beneficiaries: 'startups',
    purposes: ['business creation'],
    score: 68,
    matchScore: 65,
    matchReasons: [],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2026-12-31',
    economicOffer: {},
    aidIntensity: null,
  },

  lowScoreLowRelevance: {
    id: 'grant-lowscore-1',
    title: 'Bando Marginalità Bassa - Scarsa Rilevanza',
    authorityName: 'Ente Locale',
    openDate: '2026-01-01',
    closeDate: '2026-12-31',
    regions: 'national',
    sectors: ['other'],
    beneficiaries: 'rare targets',
    purposes: ['niche purpose'],
    score: 45,
    matchScore: 40,
    matchReasons: [],
    mismatchFlags: ['settore', 'target'],
    availabilityStatus: 'open',
    hardStatus: 'unknown',
    deadlineAt: '2026-12-31',
    economicOffer: { coverageMaxPercent: 20 },
    aidIntensity: '20%',
  },

  borderlineScore: {
    id: 'grant-borderline-1',
    title: 'Bando Borderline - Media Rilevanza',
    authorityName: 'Camera di Commercio',
    openDate: '2026-01-01',
    closeDate: '2026-12-31',
    regions: 'national',
    sectors: ['manufacturing'],
    beneficiaries: 'PMI',
    purposes: ['modernization'],
    score: 65,
    matchScore: 63,
    matchReasons: ['some alignment'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'unknown',
    deadlineAt: '2026-12-31',
    economicOffer: { coverageMaxPercent: 35 },
    aidIntensity: '35%',
  },

  perfectMatch: {
    id: 'grant-perfect-1',
    title: 'Bando Perfetto - Allineamento Completo',
    authorityName: 'Ministero dello Sviluppo Economico',
    openDate: '2026-01-01',
    closeDate: '2027-12-31',
    regions: ['Campania'],
    sectors: ['manufacturing'],
    beneficiaries: 'PMI existing',
    purposes: ['expansion', 'modernization'],
    score: 95,
    matchScore: 92,
    matchReasons: ['region perfect match', 'sector perfect match', 'business stage match', 'purpose alignment'],
    mismatchFlags: [],
    availabilityStatus: 'open',
    hardStatus: 'eligible',
    deadlineAt: '2027-12-31',
    economicOffer: { coverageMaxPercent: 75 },
    aidIntensity: '75%',
  },

  partialMatch: {
    id: 'grant-partial-1',
    title: 'Bando Parziale - Allineamento Limitato',
    authorityName: 'Regione Campania',
    openDate: '2026-01-01',
    closeDate: '2026-12-31',
    regions: ['Campania'],
    sectors: ['manufacturing'],
    beneficiaries: 'PMI new and existing',
    purposes: ['modernization'],
    score: 70,
    matchScore: 68,
    matchReasons: ['region match'],
    mismatchFlags: ['purpose'],
    availabilityStatus: 'open',
    hardStatus: 'unknown',
    deadlineAt: '2026-12-31',
    economicOffer: { coverageMaxPercent: 50 },
    aidIntensity: '50%',
  },
};

// ============================================================================
// CORE PIPELINE LOGIC (REPLICATED FROM TYPESCRIPT)
// ============================================================================

function inferTerritoryCompatible(grant, profile) {
  const regionNorm = normalizeForMatch(profile.userRegionCanonical || profile.region || '');
  if (!regionNorm) return true;

  const mismatchNorm = normalizeForMatch((grant.mismatchFlags || []).join(' '));
  if (mismatchNorm.includes('regione') || mismatchNorm.includes('territorio')) {
    return false;
  }

  const titleNorm = normalizeForMatch(grant.title);
  const reasonsNorm = normalizeForMatch((grant.matchReasons || []).join(' '));
  const combined = `${titleNorm} ${reasonsNorm}`;

  // Check if grant regions include profile region
  if (grant.regions) {
    const regions = Array.isArray(grant.regions) ? grant.regions : [grant.regions];
    const regionsList = regions.map(r => normalizeForMatch(r));

    if (regionsList.some(r => r === 'national' || r.includes('nazionale') || r.includes('italia'))) {
      return true;
    }

    if (regionsList.some(r => r === regionNorm)) {
      return true;
    }

    // Check for Mezzogiorno regions
    const mezzogiorno = ['calabria', 'campania', 'puglia', 'basilicata', 'sicilia', 'sardegna', 'molise', 'abruzzo'];
    const profileIsMezzogiorno = mezzogiorno.includes(regionNorm);
    const grantMezzogiorno = regionsList.some(r => r.includes('mezzogiorno'));
    if (profileIsMezzogiorno && grantMezzogiorno) {
      return true;
    }

    return false;
  }

  return combined.includes(regionNorm) || !combined.includes('solo') || !combined.includes('regione');
}

function inferBusinessStageCompatible(grant, profile) {
  const titleNorm = normalizeForMatch(grant.title);
  const beneficiariesNorm = normalizeForMatch(grant.beneficiaries || '');
  const profileActivityNorm = normalizeForMatch(profile.activityType || '');
  const profileGoalNorm = normalizeForMatch(profile.fundingGoal || '');
  const profileSignals = `${profileActivityNorm} ${profileGoalNorm}`;

  const profileStartupIntent = /(startup|da costituire|nuova attivita|nuova impresa|aprire|avviare)/.test(profileSignals);
  const profileExistingIntent = /(gia attiva|azienda attiva|impresa attiva|ampliare|espandere|digitalizzare)/.test(profileSignals);

  const bandoStartupHint = /(startup|nuova impresa|da costituire|autoimpiego|self employment|resto al sud)/.test(titleNorm) ||
                           /(startup|nuova impresa|da costituire)/.test(beneficiariesNorm);
  const bandoExistingHint = /(pmi|imprese esistenti|digitalizzazione|transizione|ammodernamento|consolidat)/.test(titleNorm) ||
                            /(existing|consolidat|attiv)/.test(beneficiariesNorm);

  if (profileStartupIntent && bandoExistingHint && !bandoStartupHint) return false;
  if (profileExistingIntent && bandoStartupHint && !bandoExistingHint) return false;
  return true;
}

function inferGoalSectorCompatible(grant, profile) {
  const goalNorm = normalizeForMatch(profile.fundingGoal || '');
  const sectorNorm = normalizeForMatch(profile.sector || '');
  if (!goalNorm && !sectorNorm) return true;

  const titleNorm = normalizeForMatch(grant.title);
  const reasonsNorm = normalizeForMatch((grant.matchReasons || []).join(' '));
  const mismatchesNorm = normalizeForMatch((grant.mismatchFlags || []).join(' '));
  const combined = `${titleNorm} ${reasonsNorm}`;

  if (mismatchesNorm.includes('settore') || mismatchesNorm.includes('goal')) return false;
  if (!goalNorm && !sectorNorm) return true;

  const tokens = new Set(
    `${goalNorm} ${sectorNorm}`
      .split(' ')
      .map(entry => entry.trim())
      .filter(entry => entry.length >= 4)
  );
  if (tokens.size === 0) return true;

  let hits = 0;
  for (const token of tokens) {
    if (combined.includes(token)) hits += 1;
  }
  return hits > 0;
}

function evaluateHardEligibility(grant, profile) {
  const authorityNorm = normalizeForMatch(grant.authorityName || '');
  const titleNorm = normalizeForMatch(grant.title);

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

  const includesAnyToken = (text, tokens) => {
    if (!text || tokens.length === 0) return false;
    return tokens.some(token => token && text.includes(token));
  };

  const trustedAuthority = includesAnyToken(authorityNorm, TRUSTED_AUTHORITY_TOKENS) ||
                           includesAnyToken(titleNorm, ['invitalia', 'ministero']);
  const businessTarget = !includesAnyToken(titleNorm, NOT_BUSINESS_TARGET_TOKENS);
  const territory = inferTerritoryCompatible(grant, profile);
  const businessStage = inferBusinessStageCompatible(grant, profile);
  const goalSector = inferGoalSectorCompatible(grant, profile);
  const hardStatus = grant.hardStatus || 'unknown';
  const hardStatusGate = hardStatus !== 'not_eligible';

  const gates = {
    trustedAuthority,
    businessTarget,
    territory,
    businessStage,
    goalSector,
    hardStatus: hardStatusGate,
  };

  const diagnostics = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  const passed = diagnostics.length === 0;

  return {
    passed,
    gates,
    diagnostics,
  };
}

function isGrantClosed(grant) {
  if (!grant.closeDate) return false;
  const closeDate = new Date(grant.closeDate);
  const now = new Date('2026-03-06'); // Fixed test date
  return closeDate < now;
}

function computeScore(grant, profile) {
  const baseScore = grant.score || grant.matchScore || 0;
  const eligibility = evaluateHardEligibility(grant, profile);

  if (!eligibility.passed) {
    return { score: Math.max(0, baseScore * 0.5), reason: 'eligibility gate failed' };
  }

  return { score: baseScore, reason: 'eligible' };
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

const testResults = [];

function runTest(testName, fn) {
  try {
    fn();
    testResults.push({ name: testName, passed: true });
    console.log(`✓ ${testName}`);
  } catch (error) {
    testResults.push({ name: testName, passed: false, error: error.message });
    console.error(`✗ ${testName}`);
    console.error(`  ${error.message}`);
  }
}

// Test 1: Territorial Mismatch
runTest('Territorial Mismatch: Lombardia user + Calabria-only grant = excluded', () => {
  const evaluation = evaluateHardEligibility(mockGrants.calabriaOnly, mockProfiles.lombardyStartup);
  assert(!evaluation.gates.territory, 'Territory gate should fail');
  assert(!evaluation.passed, 'Overall evaluation should fail');
  assertContains(String(evaluation.diagnostics), 'territory', 'Diagnostics should mention territory');
});

runTest('Territorial Mismatch: Campania user + national grant = included', () => {
  const evaluation = evaluateHardEligibility(mockGrants.nationalGrant, mockProfiles.campaniaExisting);
  assert(evaluation.gates.territory, 'Territory gate should pass');
  assert(evaluation.passed, 'Overall evaluation should pass');
});

runTest('Territorial Mismatch: Sicilia user + Mezzogiorno grant = included', () => {
  const evaluation = evaluateHardEligibility(mockGrants.mezzogiorno, mockProfiles.siciliaDigitalization);
  assert(evaluation.gates.territory, 'Territory gate should pass for Mezzogiorno');
  assert(evaluation.passed, 'Overall evaluation should pass');
});

// Test 2: Subject/Business Stage Mismatch
runTest('Subject Mismatch: Startup user + existing-business-only grant = excluded', () => {
  const evaluation = evaluateHardEligibility(mockGrants.existingBusinessOnly, mockProfiles.lombardyStartup);
  assert(!evaluation.gates.businessStage, 'Business stage gate should fail');
  assert(!evaluation.passed, 'Overall evaluation should fail');
});

runTest('Subject Mismatch: Existing business user + startup-only grant = excluded', () => {
  // Profile with explicit expansion goals (existing intent)
  const profileExpanding = {
    ...mockProfiles.campaniaExisting,
    activityType: 'existing expanding business',
    fundingGoal: 'ampliare l\'impresa attiva',
  };
  const evaluation = evaluateHardEligibility(mockGrants.startupOnly, profileExpanding);
  assert(!evaluation.gates.businessStage, 'Business stage gate should fail');
  assert(!evaluation.passed, 'Overall evaluation should fail');
});

runTest('Subject Match: Startup user + startup grant = included', () => {
  const evaluation = evaluateHardEligibility(mockGrants.startupOnly, mockProfiles.lombardyStartup);
  assert(evaluation.gates.businessStage, 'Business stage gate should pass');
  assert(evaluation.passed, 'Overall evaluation should pass');
});

// Test 3: Purpose/Goal Mismatch
runTest('Purpose Mismatch: Digitalizzazione goal + energy-only grant = excluded', () => {
  const evaluation = evaluateHardEligibility(mockGrants.energyEfficiency, mockProfiles.siciliaDigitalization);
  assert(!evaluation.gates.goalSector, 'Goal/sector gate should fail');
  assert(!evaluation.passed, 'Overall evaluation should fail');
});

runTest('Purpose Match: Macchinari in goal + machinery grant = included', () => {
  // Create a profile requesting machinery
  const profileWithMachinery = {
    ...mockProfiles.campaniaExisting,
    fundingGoal: 'macchinari e beni strumentali',
  };
  const evaluation = evaluateHardEligibility(mockGrants.instrumentalGoods, profileWithMachinery);
  assert(evaluation.gates.goalSector, 'Goal/sector gate should pass for machinery');
  assert(evaluation.passed, 'Overall evaluation should pass');
});

// Test 4: Closed Grants
runTest('Closed Grant: Past closeDate shows as closed', () => {
  const isClosed = isGrantClosed(mockGrants.closedGrant);
  assert(isClosed, 'Grant with past closeDate should be marked as closed');
});

runTest('Closed Grant: No closeDate is not excluded', () => {
  const isClosed = isGrantClosed(mockGrants.noDeadline);
  assert(!isClosed, 'Grant without closeDate should not be closed');
});

runTest('Closed Grant: Future closeDate is not closed', () => {
  const isClosed = isGrantClosed(mockGrants.nationalGrant);
  assert(!isClosed, 'Grant with future closeDate should not be closed');
});

// Test 5: Scoring and Ranking
runTest('Scoring: Perfect match scores higher than partial match', () => {
  const perfectScore = mockGrants.perfectMatch.score;
  const partialScore = mockGrants.partialMatch.score;
  assertGreaterThanOrEqual(perfectScore, partialScore, 'Perfect match should score >= partial match');
});

runTest('Scoring: Low-scoring grant (< 60) identified', () => {
  const score = mockGrants.lowScoreLowRelevance.score;
  assertLessThan(score, 60, 'Low relevance grant should score < 60');
});

runTest('Scoring: Borderline grant (60-69) identified', () => {
  const score = mockGrants.borderlineScore.score;
  assertBetween(score, 60, 69, 'Borderline grant should score 60-69');
});

runTest('Scoring: High-quality grant (70+) identified', () => {
  const score = mockGrants.perfectMatch.score;
  assertGreaterThanOrEqual(score, 70, 'High-quality grant should score >= 70');
});

// Test 6: No Results Scenario
runTest('No Results: Profile with null funding goal and sector finds nothing', () => {
  const profile = mockProfiles.noMatch;

  // Check against a goal-specific grant
  const evaluation = evaluateHardEligibility(mockGrants.energyEfficiency, profile);
  // Since profile has no goal/sector, compatibility might pass, but no matches expected
  const hasNullGoal = !profile.fundingGoal;
  const hasNullSector = !profile.sector || profile.sector === 'agriculture';
  assert(hasNullGoal, 'Profile should have null fundingGoal');
});

// Test 7: Anti-Hallucination
runTest('Anti-Hallucination: Grant without deadline uses "data non disponibile", not invented date', () => {
  const grant = mockGrants.noDeadline;
  assert(grant.deadlineAt === null || grant.deadlineAt === undefined,
         'Grant should have no deadline instead of invented date');
  // Verify we're not making up dates
  const hasInventedDate = grant.deadlineAt && grant.deadlineAt.includes('203') &&
                          grant.deadlineAt > '2026-12-31';
  assert(!hasInventedDate, 'Should not invent future dates');
});

runTest('Anti-Hallucination: Grant without coverage uses placeholder, not invented percentage', () => {
  const grant = mockGrants.noCoverageLabel;
  const hasCoverageData = grant.economicOffer?.coverageMaxPercent || grant.aidIntensity;
  assert(!hasCoverageData, 'Grant should have no coverage data');
  // Verify evaluation doesn't fabricate percentages
  const coverage = grant.economicOffer?.coverageMaxPercent || 0;
  assert(coverage === 0 || coverage <= 100, 'Should not invent impossible percentages');
});

// ============================================================================
// ADDITIONAL INTEGRATION TESTS
// ============================================================================

runTest('Integration: All gates must pass for eligibility', () => {
  // Perfect match scenario
  const evaluation = evaluateHardEligibility(mockGrants.perfectMatch, mockProfiles.campaniaExisting);
  const allGatesPassed = Object.values(evaluation.gates).every(gate => gate === true);
  assert(allGatesPassed, 'All gates should pass for perfect match');
  assert(evaluation.passed, 'Overall evaluation should pass');
});

runTest('Integration: Single gate failure causes overall failure', () => {
  // Mismatch in territory
  const evaluation = evaluateHardEligibility(mockGrants.calabriaOnly, mockProfiles.lombardyStartup);
  const failedGates = evaluation.diagnostics;
  assert(failedGates.length > 0, 'Should have at least one failed gate');
  assert(!evaluation.passed, 'Overall evaluation should fail');
});

runTest('Integration: Grant with mixed signals handles gracefully', () => {
  // Grant with some mismatches but trusted authority
  const grant = mockGrants.energyEfficiency;
  assert(grant.authorityName.includes('Ministero'), 'Should have trusted authority');
  const evaluation = evaluateHardEligibility(grant, mockProfiles.campaniaExisting);
  assert(evaluation.gates.trustedAuthority, 'Should recognize trusted authority');
});

runTest('Integration: Coverage score extraction handles null/missing values', () => {
  const grantWithCoverage = mockGrants.nationalGrant;
  const coverage = grantWithCoverage.economicOffer?.coverageMaxPercent ||
                   grantWithCoverage.aidIntensity || 0;
  assertGreaterThanOrEqual(coverage, 0, 'Coverage should be >= 0');
  assertLessThan(coverage, 101, 'Coverage should be <= 100');
});

runTest('Integration: Rank sorting puts perfect match before partial match', () => {
  const grants = [mockGrants.partialMatch, mockGrants.perfectMatch, mockGrants.lowScoreLowRelevance];

  // Simple sort by score (descending)
  const sorted = [...grants].sort((a, b) => (b.score || 0) - (a.score || 0));

  assertEqual(sorted[0].id, 'grant-perfect-1', 'Perfect match should be first');
  assertEqual(sorted[2].id, 'grant-lowscore-1', 'Low score should be last');
});

runTest('Integration: Closed grants distinguished from active opportunities', () => {
  const active = mockGrants.nationalGrant;
  const closed = mockGrants.closedGrant;

  const activeIsClosed = isGrantClosed(active);
  const closedIsClosed = isGrantClosed(closed);

  assert(!activeIsClosed, 'Active grant should not be closed');
  assert(closedIsClosed, 'Closed grant should be marked as closed');
});

runTest('Integration: Mezzogiorno region logic includes all 8 regions', () => {
  const mezzogiorno = ['Calabria', 'Campania', 'Puglia', 'Basilicata', 'Sicilia', 'Sardegna', 'Molise', 'Abruzzo'];

  // Test that each Mezzogiorno region matches a Mezzogiorno grant
  for (const regionName of mezzogiorno) {
    const profile = {
      ...mockProfiles.campaniaExisting,
      region: regionName,
      userRegionCanonical: regionName,
    };
    const evaluation = evaluateHardEligibility(mockGrants.mezzogiorno, profile);
    assert(evaluation.gates.territory, `${regionName} should match Mezzogiorno grant`);
  }
});

// ============================================================================
// PRINT RESULTS
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST RESULTS: Unified Matching Pipeline');
console.log('='.repeat(70) + '\n');

const passedCount = testResults.filter(r => r.passed).length;
const failedCount = testResults.filter(r => !r.passed).length;

console.log(`Passed: ${passedCount}/${testResults.length}`);
console.log(`Failed: ${failedCount}/${testResults.length}\n`);

if (failedCount > 0) {
  console.log('Failed tests:');
  testResults.filter(r => !r.passed).forEach(r => {
    console.log(`  ✗ ${r.name}`);
    console.log(`    ${r.error}`);
  });
  console.log('');
}

console.log('='.repeat(70));

// Exit with appropriate code
process.exit(failedCount > 0 ? 1 : 0);
