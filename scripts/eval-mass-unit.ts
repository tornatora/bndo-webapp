/**
 * Mass unit tests: profile extraction, normalization, businessExists.
 * Run with: npx tsx scripts/eval-mass-unit.ts
 * No server required - hundreds of assertions.
 */
import {
  extractProfileFromMessage,
  parseBusinessExistsFromMessage,
  extractSectorFromMessage,
  parseRegionAndMunicipality,
  detectRegionAnywhere,
  parseActivityType,
  parseAge,
  parseAgeBand,
  parseEmploymentStatus,
  parseBudgetEUR,
  parseLegalForm,
  extractFundingGoalFromMessage,
} from '../lib/engines/profileExtractor';
import { normalizeForMatch } from '../lib/text/normalize';
import { detectTurnIntent } from '../lib/conversation/intentRouter';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const norm = (s: string) => normalizeForMatch(s);
let passed = 0;

// --- businessExists TRUE phrases ---
const businessExistsTrue = [
  'ho un impresa agricola',
  'ho un azienda attiva',
  'impresa attiva',
  'già operativa',
  'siamo già operativi',
  'società attiva',
  'azienda agricola',
  'operativa',
  'attiva',
  'ho partita iva',
  'ho già l\'azienda',
];
for (const msg of businessExistsTrue) {
  const v = parseBusinessExistsFromMessage(msg);
  assert(v === true, `businessExists true for "${msg}" got ${v}`);
  passed++;
}

// --- businessExists FALSE phrases ---
const businessExistsFalse = [
  'devo aprire',
  'da costituire',
  'da aprire',
  'nuova attività',
  'voglio aprire',
  'vorrei avviare',
  'sto avviando',
  'ancora non esiste',
  'non è ancora attiva',
  'non l\'ho ancora aperta',
  'devo aprirla',
  'startup',
  'autoimpiego',
  'devo avviare',
];
for (const msg of businessExistsFalse) {
  const v = parseBusinessExistsFromMessage(msg);
  assert(v === false, `businessExists false for "${msg}" got ${v}`);
  passed++;
}

// --- Region extraction (explicit) ---
const regionExplicit = [
  ['Sicilia', 'Ho un impresa in Sicilia'],
  ['Calabria', 'in Calabria'],
  ['Lombardia', 'siamo in Lombardia'],
  ['Campania', 'Campania'],
  ['Puglia', 'regione Puglia'],
  ['Sardegna', 'in Sardegna'],
  ['Lazio', 'operiamo nel Lazio'],
  ['Emilia-Romagna', 'Emilia-Romagna'],
  ['Piemonte', 'Piemonte'],
  ['Veneto', 'Veneto'],
  ['Toscana', 'Toscana'],
  ['Friuli-Venezia Giulia', 'Friuli-Venezia Giulia'],
  ['Marche', 'nelle Marche'],
  ['Umbria', 'Umbria'],
  ['Basilicata', 'Basilicata'],
  ['Molise', 'Molise'],
  ['Liguria', 'Liguria'],
  ['Valle d\'Aosta', 'Valle d\'Aosta'],
  ['Trentino-Alto Adige', 'Trentino-Alto Adige'],
];
for (const [expected, msg] of regionExplicit) {
  const r = detectRegionAnywhere(msg);
  assert(r === expected, `region "${msg}" expected ${expected} got ${r}`);
  passed++;
}

// --- Region from demonym ---
const regionDemonym = [
  ['Calabria', 'sono calabrese'],
  ['Calabria', 'calabresi'],
  ['Sicilia', 'siciliano'],
  ['Campania', 'campano'],
  ['Lombardia', 'lombardo'],
  ['Puglia', 'pugliese'],
  ['Sardegna', 'sardo'],
  ['Piemonte', 'piemontese'],
  ['Veneto', 'veneto'],
  ['Toscana', 'toscano'],
  ['Abruzzo', 'abruzzese'],
  ['Sicilia', 'siciliana'],
  ['Lazio', 'laziale'],
  ['Emilia-Romagna', 'emiliano'],
  ['Marche', 'marchigiano'],
  ['Liguria', 'ligure'],
];
for (const [expected, msg] of regionDemonym) {
  const r = detectRegionAnywhere(msg);
  assert(r === expected, `demonym "${msg}" expected ${expected} got ${r}`);
  passed++;
}

// --- Sector extraction ---
const sectorCases = [
  ['agricoltura', 'impresa agricola'],
  ['agricoltura', 'agricolo'],
  ['agricoltura', 'agriturismo'],
  ['agricoltura', 'agroalimentare'],
  ['turismo', 'turismo'],
  ['turismo', 'ricettiva'],
  ['turismo', 'alberghiero'],
  ['ristorazione', 'ristorazione'],
  ['ristorazione', 'ristorante'],
  ['commercio', 'commercio'],
  ['commercio', 'negozio'],
  ['ICT', 'ict'],
  ['ICT', 'digitale'],
  ['ICT', 'software'],
  ['manifattura', 'manifattura'],
  ['manifattura', 'produzione'],
  ['cultura', 'cultura'],
  ['cultura', 'arte'],
  ['artigianato', 'artigianato'],
  ['turismo', 'B&B'],
  ['ristorazione', 'pizzeria'],
  ['commercio', 'e-commerce'],
  ['ICT', 'siti web'],
  ['edilizia', 'edilizia'],
  ['logistica', 'logistica'],
  ['trasporti', 'trasporti'],
  ['energia', 'energia'],
  ['pesca', 'pesca'],
  ['moda', 'moda'],
  ['design', 'design'],
  ['manifattura', 'manifattura'],
  ['ICT', 'software'],
  ['sanita', 'sanitario'],
  ['formazione', 'formazione'],
];
for (const [expectedSubstr, msg] of sectorCases) {
  const s = extractSectorFromMessage(msg);
  assert(Boolean(s && norm(s).includes(norm(expectedSubstr))), `sector "${msg}" expected ~${expectedSubstr} got ${s}`);
  passed++;
}

// --- ActivityType ---
const activityTypeCases = [
  ['startup', 'Startup'],
  ['da costituire', 'Da costituire'],
  ['devo aprire', 'Da costituire'],
  ['ho un impresa', 'PMI'],
  ['pmi', 'PMI'],
  ['srl', 'PMI'],
  ['spa', 'PMI'],
  ['snc', 'PMI'],
  ['professionista', 'Professionista'],
  ['libero professionista', 'Professionista'],
  ['abbiamo una azienda', 'PMI'],
  ['impresa attiva', 'PMI'],
  ['azienda agricola', 'PMI'],
  ['voglio costituire', 'Da costituire'],
] as const;
for (const [msg, expected] of activityTypeCases) {
  const v = parseActivityType(msg);
  assert(v === expected, `activityType "${msg}" expected ${expected} got ${v}`);
  passed++;
}

// --- Age / AgeBand ---
const ageCases = [
  ['ho 28 anni', 28],
  ['25 anni', 25],
  ['ho 40 anni', 40],
  ['33 anni', 33],
  ['ho 22 anni', 22],
] as const;
for (const [msg, expected] of ageCases) {
  const v = parseAge(msg);
  assert(v === expected, `parseAge "${msg}" expected ${expected} got ${v}`);
  passed++;
}
const ageBandCases = [
  ['under35', 'under35'],
  ['meno di 35', 'under35'],
  ['sotto i 35', 'under35'],
  ['over 35', 'over35'],
  ['oltre 35', 'over35'],
] as const;
for (const [msg, expected] of ageBandCases) {
  const v = parseAgeBand(msg);
  assert(v === expected, `ageBand "${msg}" expected ${expected} got ${v}`);
  passed++;
}

// --- EmploymentStatus ---
const employmentCases = [
  ['disoccupato', 'disoccupato'],
  ['inoccupato', 'inoccupato'],
  ['occupato', 'occupato'],
  ['studente', 'studente'],
  ['autonomo', 'autonomo'],
  ['sono disoccupato', 'disoccupato'],
  ['sono inoccupato', 'inoccupato'],
  ['sono studente', 'studente'],
  ['sono autonomo', 'autonomo'],
] as const;
for (const [msg, expected] of employmentCases) {
  const v = parseEmploymentStatus(msg);
  assert(v === expected, `employment "${msg}" expected ${expected} got ${v}`);
  passed++;
}

// --- Budget ---
const budgetCases = [
  ['50.000 euro', 50000],
  ['100k', 100000],
  ['1 milione', 1000000],
  ['10.000', 10000],
  ['200.000 euro', 200000],
  ['500k', 500000],
  ['25000 euro', 25000],
  ['150.000', 150000],
] as const;
for (const [msg, expected] of budgetCases) {
  const v = parseBudgetEUR(msg);
  assert(v === expected, `budget "${msg}" expected ${expected} got ${v}`);
  passed++;
}

// --- LegalForm ---
const legalCases = [
  ['SRL', 'SRL'],
  ['srl', 'SRL'],
  ['SPA', 'SPA'],
  ['Srl', 'SRL'],
  ['SrlS', 'SRLS'],
  ['SNC', 'SNC'],
  ['SAS', 'SAS'],
  ['cooperativa', 'Cooperativa'],
  ['ditta individuale', 'Ditta individuale'],
] as const;
for (const [msg, expected] of legalCases) {
  const v = parseLegalForm(msg);
  assert(v === expected, `legal "${msg}" expected ${expected} got ${v}`);
  passed++;
}

// --- extractProfileFromMessage (full extraction) ---
const fullExtractCases = [
  {
    msg: 'Ho un impresa agricola in Sicilia',
    checks: (ex: ReturnType<typeof extractProfileFromMessage>) => {
      assert(ex.updates.location?.region === 'Sicilia', 'full: region Sicilia');
      assert(Boolean(ex.updates.sector && norm(ex.updates.sector).includes('agricolt')), 'full: sector agricolt');
      assert(ex.updates.businessExists === true, 'full: businessExists true');
    },
  },
  {
    msg: 'Sono under35 calabrese disoccupato',
    checks: (ex: ReturnType<typeof extractProfileFromMessage>) => {
      assert(ex.updates.location?.region === 'Calabria', 'full: demonym Calabria');
      assert(ex.updates.ageBand === 'under35', 'full: ageBand');
      assert(ex.updates.employmentStatus === 'disoccupato', 'full: employment');
    },
  },
  {
    msg: 'Devo aprire un agriturismo in Calabria',
    checks: (ex: ReturnType<typeof extractProfileFromMessage>) => {
      assert(ex.updates.businessExists === false, 'full: businessExists false');
      assert(ex.updates.location?.region === 'Calabria', 'full: region Calabria');
    },
  },
  {
    msg: '50.000 euro per macchinari',
    checks: (ex: ReturnType<typeof extractProfileFromMessage>) => {
      assert(ex.updates.revenueOrBudgetEUR === 50000, 'full: budget');
    },
  },
  {
    msg: 'SRL in Lombardia, settore ICT',
    checks: (ex: ReturnType<typeof extractProfileFromMessage>) => {
      assert(ex.updates.location?.region === 'Lombardia', 'full: Lombardia');
      assert(Boolean(ex.updates.sector && norm(ex.updates.sector).includes('ict')), 'full: ICT');
    },
  },
];
for (const { msg, checks } of fullExtractCases) {
  const ex = extractProfileFromMessage(msg);
  checks(ex);
  passed += 1;
}

// --- Intent routing ---
const intentCases = [
  ['Come funziona il fondo perduto?', 'qa'],
  ['voglio parlare con un consulente', 'handoff_human'],
  ['procediamo con il matching', 'scan_refine'],
  ['ok grazie', 'small_talk'],
  ['ciao', 'greeting'],
];
for (const [msg, expectedHint] of intentCases) {
  const ir = detectTurnIntent({ message: String(msg), sessionQaMode: false });
  const hint = expectedHint === 'greeting' ? ir.greeting : ir.modeHint;
  assert(hint === expectedHint || (expectedHint === 'greeting' && ir.greeting), `intent "${msg}" expected ${expectedHint} got ${String(hint)}`);
  passed++;
}

// --- normalizeForMatch ---
assert(norm('sicilia') === 'sicilia', 'normalize basic');
assert(norm('FESR') === 'fesr', 'normalize case');
passed += 2;

// --- parseRegionAndMunicipality ---
const rmCases = [
  ['Calabria, Cosenza', 'Calabria', 'Cosenza'],
  ['Sicilia, Palermo', 'Sicilia', 'Palermo'],
  ['Lombardia, Milano', 'Lombardia', 'Milano'],
] as const;
for (const [input, expRegion, expMun] of rmCases) {
  const rm = parseRegionAndMunicipality(input);
  assert(rm.region === expRegion && rm.municipality === expMun, `region+municipality "${input}"`);
  passed++;
}

// --- extractFundingGoalFromMessage ---
const fg = extractFundingGoalFromMessage('voglio acquistare macchinari e software per digitalizzazione');
assert(Boolean(fg && (norm(fg).includes('macchinari') || norm(fg).includes('digitalizzazione'))), 'fundingGoal extraction');
passed++;

console.log(`PASS eval-mass-unit: ${passed} assertions`);