import type { GrantDetailRecord, GrantExplainabilityRecord } from '@/lib/grants/details';
import { createHash } from 'node:crypto';

export type PracticeQuizQuestionType = 'single_select' | 'boolean' | 'text' | 'number';

export type PracticeQuizOption = {
  value: string;
  label: string;
};

export type PracticeQuizQuestion = {
  questionKey: string;
  label: string;
  description: string | null;
  reasoning: string | null;
  questionType: PracticeQuizQuestionType;
  options: PracticeQuizOption[];
  isRequired: boolean;
  validation: Record<string, unknown>;
  rule: {
    kind:
      | 'critical_boolean'
      | 'investment_range'
      | 'ateco_validation'
      | 'geographic_validation'
      | 'choice_in_set'
      | 'informational'
      | 'none';
    expected?: string | null;
  };
  metadata: Record<string, unknown>;
};

export type RequirementCategory =
  | 'beneficiary'
  | 'territory'
  | 'age'
  | 'employment_status'
  | 'legal_subject_type'
  | 'business_stage'
  | 'sector'
  | 'project_type'
  | 'financial_threshold'
  | 'local_unit'
  | 'time_constraint'
  | 'exclusion'
  | 'other';

export type RequirementImportance = 'critical' | 'high' | 'medium' | 'low';

export type TerritoryRule =
  | 'activity_must_be_located_in'
  | 'investment_must_be_located_in'
  | 'applicant_must_reside_in'
  | 'registered_office_must_be_in'
  | 'operating_site_must_be_in'
  | 'one_of_multiple_territorial_conditions'
  | 'unknown';

export type BusinessStageRule =
  | 'not_yet_constituted'
  | 'already_constituted'
  | 'constituted_after_specific_date'
  | 'constituted_within_max_months'
  | 'existing_business'
  | 'new_initiative'
  | 'unknown';

export type RequirementBase = {
  id: string;
  category: RequirementCategory;
  label: string;
  importance: RequirementImportance;
  blocking: boolean;
  askable: boolean;
  sourceExcerpt: string;
  sourceLocation?: string;
  confidence: number;
};

export type BeneficiaryRequirement = RequirementBase & {
  category: 'beneficiary';
  normalizedValue: {
    allowedSubjects: string[];
    excludedSubjects?: string[];
    notes?: string[];
  };
};

export type TerritoryRequirement = RequirementBase & {
  category: 'territory';
  normalizedValue: {
    rule: TerritoryRule;
    regions: string[];
    provinces: string[];
    municipalities: string[];
  };
};

export type AgeRequirement = RequirementBase & {
  category: 'age';
  normalizedValue: {
    minAge?: number;
    maxAge?: number;
    inclusive?: boolean;
  };
};

export type EmploymentStatusRequirement = RequirementBase & {
  category: 'employment_status';
  normalizedValue: {
    allowedStatuses: string[];
    excludedStatuses?: string[];
  };
};

export type LegalSubjectTypeRequirement = RequirementBase & {
  category: 'legal_subject_type';
  normalizedValue: {
    allowedTypes: string[];
    excludedTypes?: string[];
  };
};

export type BusinessStageRequirement = RequirementBase & {
  category: 'business_stage';
  normalizedValue: {
    rule: BusinessStageRule;
    referenceDate?: string;
    maxMonthsSinceConstitution?: number;
  };
};

export type SectorRequirement = RequirementBase & {
  category: 'sector';
  normalizedValue: {
    allowedSectors?: string[];
    excludedSectors?: string[];
    allowedAtecoPrefixes?: string[];
    excludedAtecoPrefixes?: string[];
  };
};

export type ProjectTypeRequirement = RequirementBase & {
  category: 'project_type';
  normalizedValue: {
    allowedProjectTypes?: string[];
    excludedProjectTypes?: string[];
  };
};

export type FinancialThresholdRequirement = RequirementBase & {
  category: 'financial_threshold';
  normalizedValue: {
    metric: 'investment' | 'revenue' | 'employees' | 'generic';
    min?: number;
    max?: number;
    unit?: 'eur' | 'count' | 'percent';
  };
};

export type ExclusionRequirement = RequirementBase & {
  category: 'exclusion';
  normalizedValue: {
    exclusionType: string;
    description: string;
  };
};

export type GenericRequirement =
  | BeneficiaryRequirement
  | TerritoryRequirement
  | AgeRequirement
  | EmploymentStatusRequirement
  | LegalSubjectTypeRequirement
  | BusinessStageRequirement
  | SectorRequirement
  | ProjectTypeRequirement
  | FinancialThresholdRequirement
  | ExclusionRequirement
  | (RequirementBase & { category: 'other'; normalizedValue: Record<string, unknown> });

type OtherRequirement = Extract<GenericRequirement, { category: 'other' }>;

export type IdealApplicantProfile = {
  summary: string;
  targetSubjects: string[];
  excludedSubjects: string[];
  targetTerritories: {
    regions: string[];
    provinces: string[];
    municipalities: string[];
  };
  targetBusinessStage?: string;
  targetAge?: {
    minAge?: number;
    maxAge?: number;
  };
  targetEmploymentStatuses?: string[];
  targetSectors?: string[];
  decisiveFactors: string[];
  immediateDisqualifiers: string[];
};

export type QuestionCategory =
  | 'beneficiary'
  | 'territory'
  | 'age'
  | 'employment_status'
  | 'legal_subject_type'
  | 'business_stage'
  | 'sector'
  | 'project_type'
  | 'exclusion'
  | 'financial_threshold'
  | 'other';

export type AnswerType =
  | 'single_choice_yes_no'
  | 'single_choice'
  | 'multi_choice'
  | 'number'
  | 'text'
  | 'date';

export type QuestionIntent = 'gate' | 'qualification' | 'evidence' | 'exclusion_check';

export type VerificationQuestion = {
  id: string;
  requirementIds: string[];
  category: QuestionCategory;
  priority: number;
  blocking: boolean;
  question: string;
  helpText?: string;
  answerType: AnswerType;
  options?: Array<{ value: string; label: string }>;
  disqualifyIf?: string[];
  informativeOnly?: boolean;
  intent?: QuestionIntent;
  sourceExcerpt: string;
  showIf?: {
    questionId: string;
    anyOf?: string[];
    equals?: string;
    noneOf?: string[];
  };
  validation?: {
    min?: number;
    max?: number;
    maxLength?: number;
  };
  validatorFlags: {
    grounded: boolean;
    territorySafe: boolean;
    explicitEnough: boolean;
    nonGeneric: boolean;
    nonDuplicate: boolean;
    askable: boolean;
    benchmarkDepth: boolean;
  };
};

export type ValidationResult = {
  ok: boolean;
  reasons: string[];
};

export type BandoQuizPlan = {
  bandoId: string;
  title: string;
  idealApplicantSummary: string;
  requirements: GenericRequirement[];
  questions: VerificationQuestion[];
  transitions: Array<{
    fromQuestionId: string;
    answerValue: string;
    to: string; // next question id | blocked | success
  }>;
};

export type EligibilityFamily =
  | 'natural_person_new_business'
  | 'existing_business'
  | 'startup_innovativa'
  | 'female_entrepreneurship'
  | 'youth_entrepreneurship'
  | 'university_research_entity'
  | 'network_consortium'
  | 'territorial_chamber'
  | 'local_unit_required'
  | 'mixed_beneficiaries';

export type EligibilityCompileStatus = 'ready' | 'needs_review' | 'failed';

export type EligibilitySpecRevision = {
  revision: number;
  sourceFingerprint: string;
  compiledAt: string;
  reviewerAt: string | null;
  reviewerStatus: 'ok' | 'warning' | 'failed';
};

export type EligibilityReviewReport = {
  deterministicIssues: string[];
  reviewerIssues: string[];
  branchConsistencyRisks: string[];
  reliabilityScore: number;
  recommendedActions: string[];
};

export type PublicationGateStatus = 'publish' | 'publish_with_warning' | 'quarantine';

export type PublicationGateReport = {
  status: PublicationGateStatus;
  reasons: string[];
  warnings: string[];
  decisiveDimensions: string[];
  askableDimensions: string[];
  resolvedDimensions: string[];
  resolvedDimensionsOnShortestSuccessPath: string[];
  shortestSuccessDepth: number;
  discriminatingQuestionCount: number;
  depthTarget: number;
  discriminatingScore: number;
  semanticSpecificityScore: number;
  redundancyScore: number;
};

export type CompiledEligibilitySpec = {
  schemaVersion: 'single_bando_eligibility_spec_v1';
  bandoId: string;
  bandoTitle: string;
  family: EligibilityFamily;
  familyTags: EligibilityFamily[];
  compileStatus: EligibilityCompileStatus;
  compileConfidence: number;
  sourceFingerprint: string;
  requirements: GenericRequirement[];
  idealApplicant: IdealApplicantProfile;
  plan: BandoQuizPlan;
  review: EligibilityReviewReport;
  publicationGate: PublicationGateReport;
  depthTarget: number;
  resolvedDecisiveByShortestSuccessPath: string[];
  discriminatingScore: number;
  semanticSpecificityScore: number;
  redundancyScore: number;
  publicationWarnings: string[];
  revision: EligibilitySpecRevision;
  aiCompilation?: {
    model: string;
    confidence: number;
    decisiveDimensions: string[];
    missingDecisiveDimensions: string[];
    notes: string[];
  } | null;
  aiReview?: {
    model: string;
    reliabilityScore: number;
    issues: string[];
    contradictions: string[];
    repairSuggestions: string[];
  } | null;
};

type CompileEligibilityOptions = {
  cachedSpec?: CompiledEligibilitySpec | null;
  forceRecompile?: boolean;
  enableAi?: boolean;
};

type SourceSegment = {
  location: string;
  text: string;
  normalized: string;
};

const ITALIAN_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto'
] as const;

const REGION_BY_NORMALIZED = new Map(
  ITALIAN_REGIONS.map((region) => [normalizeText(region), region])
);

const PROVINCE_TO_REGION_ENTRIES: Array<{ province: string; region: (typeof ITALIAN_REGIONS)[number] }> = [
  { province: "L'Aquila", region: 'Abruzzo' },
  { province: 'Chieti', region: 'Abruzzo' },
  { province: 'Pescara', region: 'Abruzzo' },
  { province: 'Teramo', region: 'Abruzzo' },
  { province: 'Matera', region: 'Basilicata' },
  { province: 'Potenza', region: 'Basilicata' },
  { province: 'Catanzaro', region: 'Calabria' },
  { province: 'Cosenza', region: 'Calabria' },
  { province: 'Crotone', region: 'Calabria' },
  { province: 'Reggio Calabria', region: 'Calabria' },
  { province: 'Vibo Valentia', region: 'Calabria' },
  { province: 'Avellino', region: 'Campania' },
  { province: 'Benevento', region: 'Campania' },
  { province: 'Caserta', region: 'Campania' },
  { province: 'Napoli', region: 'Campania' },
  { province: 'Salerno', region: 'Campania' },
  { province: 'Bologna', region: 'Emilia-Romagna' },
  { province: 'Ferrara', region: 'Emilia-Romagna' },
  { province: 'Forlì-Cesena', region: 'Emilia-Romagna' },
  { province: 'Modena', region: 'Emilia-Romagna' },
  { province: 'Parma', region: 'Emilia-Romagna' },
  { province: 'Piacenza', region: 'Emilia-Romagna' },
  { province: 'Ravenna', region: 'Emilia-Romagna' },
  { province: 'Reggio Emilia', region: 'Emilia-Romagna' },
  { province: 'Rimini', region: 'Emilia-Romagna' },
  { province: 'Gorizia', region: 'Friuli-Venezia Giulia' },
  { province: 'Pordenone', region: 'Friuli-Venezia Giulia' },
  { province: 'Trieste', region: 'Friuli-Venezia Giulia' },
  { province: 'Udine', region: 'Friuli-Venezia Giulia' },
  { province: 'Frosinone', region: 'Lazio' },
  { province: 'Latina', region: 'Lazio' },
  { province: 'Rieti', region: 'Lazio' },
  { province: 'Roma', region: 'Lazio' },
  { province: 'Viterbo', region: 'Lazio' },
  { province: 'Genova', region: 'Liguria' },
  { province: 'Imperia', region: 'Liguria' },
  { province: 'La Spezia', region: 'Liguria' },
  { province: 'Savona', region: 'Liguria' },
  { province: 'Bergamo', region: 'Lombardia' },
  { province: 'Brescia', region: 'Lombardia' },
  { province: 'Como', region: 'Lombardia' },
  { province: 'Cremona', region: 'Lombardia' },
  { province: 'Lecco', region: 'Lombardia' },
  { province: 'Lodi', region: 'Lombardia' },
  { province: 'Mantova', region: 'Lombardia' },
  { province: 'Milano', region: 'Lombardia' },
  { province: 'Monza e Brianza', region: 'Lombardia' },
  { province: 'Pavia', region: 'Lombardia' },
  { province: 'Sondrio', region: 'Lombardia' },
  { province: 'Varese', region: 'Lombardia' },
  { province: 'Ancona', region: 'Marche' },
  { province: 'Ascoli Piceno', region: 'Marche' },
  { province: 'Fermo', region: 'Marche' },
  { province: 'Macerata', region: 'Marche' },
  { province: 'Pesaro e Urbino', region: 'Marche' },
  { province: 'Campobasso', region: 'Molise' },
  { province: 'Isernia', region: 'Molise' },
  { province: 'Alessandria', region: 'Piemonte' },
  { province: 'Asti', region: 'Piemonte' },
  { province: 'Biella', region: 'Piemonte' },
  { province: 'Cuneo', region: 'Piemonte' },
  { province: 'Novara', region: 'Piemonte' },
  { province: 'Torino', region: 'Piemonte' },
  { province: 'Verbano-Cusio-Ossola', region: 'Piemonte' },
  { province: 'Vercelli', region: 'Piemonte' },
  { province: 'Bari', region: 'Puglia' },
  { province: 'Barletta-Andria-Trani', region: 'Puglia' },
  { province: 'Brindisi', region: 'Puglia' },
  { province: 'Foggia', region: 'Puglia' },
  { province: 'Lecce', region: 'Puglia' },
  { province: 'Taranto', region: 'Puglia' },
  { province: 'Cagliari', region: 'Sardegna' },
  { province: 'Nuoro', region: 'Sardegna' },
  { province: 'Oristano', region: 'Sardegna' },
  { province: 'Sassari', region: 'Sardegna' },
  { province: 'Sud Sardegna', region: 'Sardegna' },
  { province: 'Agrigento', region: 'Sicilia' },
  { province: 'Caltanissetta', region: 'Sicilia' },
  { province: 'Catania', region: 'Sicilia' },
  { province: 'Enna', region: 'Sicilia' },
  { province: 'Messina', region: 'Sicilia' },
  { province: 'Palermo', region: 'Sicilia' },
  { province: 'Ragusa', region: 'Sicilia' },
  { province: 'Siracusa', region: 'Sicilia' },
  { province: 'Trapani', region: 'Sicilia' },
  { province: 'Arezzo', region: 'Toscana' },
  { province: 'Firenze', region: 'Toscana' },
  { province: 'Grosseto', region: 'Toscana' },
  { province: 'Livorno', region: 'Toscana' },
  { province: 'Lucca', region: 'Toscana' },
  { province: 'Massa-Carrara', region: 'Toscana' },
  { province: 'Pisa', region: 'Toscana' },
  { province: 'Pistoia', region: 'Toscana' },
  { province: 'Prato', region: 'Toscana' },
  { province: 'Siena', region: 'Toscana' },
  { province: 'Bolzano', region: 'Trentino-Alto Adige' },
  { province: 'Trento', region: 'Trentino-Alto Adige' },
  { province: 'Perugia', region: 'Umbria' },
  { province: 'Terni', region: 'Umbria' },
  { province: 'Aosta', region: "Valle d'Aosta" },
  { province: 'Belluno', region: 'Veneto' },
  { province: 'Padova', region: 'Veneto' },
  { province: 'Rovigo', region: 'Veneto' },
  { province: 'Treviso', region: 'Veneto' },
  { province: 'Venezia', region: 'Veneto' },
  { province: 'Verona', region: 'Veneto' },
  { province: 'Vicenza', region: 'Veneto' }
];

const PROVINCE_TO_REGION = new Map(
  PROVINCE_TO_REGION_ENTRIES.map((entry) => [normalizeText(entry.province), entry.region])
);

const PROVINCE_CANONICAL_BY_NORMALIZED = new Map(
  PROVINCE_TO_REGION_ENTRIES.map((entry) => [normalizeText(entry.province), entry.province])
);

const GENERIC_FORBIDDEN_PATTERNS = [
  /rientra tra i beneficiari ammessi/,
  /rispetti i requisiti chiave/,
  /confermi questo requisito/,
  /requisiti previsti dal bando/,
  /sei in regola con/,
  /possiedi i requisiti richiesti/,
  /verificare se il soggetto/,
  /verificare requisiti specifici/,
  /territorio indicato dal bando/,
  /area ammessa dal bando/
];

const BENEFICIARY_PLACEHOLDER_PATTERNS = [
  /beneficiar[io]|soggetto richiedente/,
  /profilo coerente/,
  /verificare/,
  /requisit/,
  /^impres[ae]?$/i
];

const TERRITORY_SEGMENT_HINT = /(territor|region[ei]|provincia|comune|sede|localizz|residenz|mezzogiorn|zzs|zon[ae])/i;
const NATIONAL_SCOPE_PATTERN =
  /(tutto il territorio nazionale|ambito nazionale|intero territorio nazionale|su tutto il territorio italiano|tutta italia)/i;
const MULTI_REGION_HINT =
  /(regioni|interregionale|piu regioni|più regioni|multi-?region|macro-?area|su tutto il territorio|tutta italia)/i;

const ASKABLE_EXCLUSION_PATTERN =
  /(falliment|liquidazion|procedur[ae] concorsual|condann|durc|irregolarit[aà] contributiv|interdittiv|antimafia|de minimis|aiuti illegali|morosit[aà]|insolvenza)/i;

const PROJECT_CONTEXT_PATTERN =
  /(progett|intervent|iniziativ|attivit|investiment|spes|misur[ae])/i;
const PROJECT_ELIGIBILITY_PATTERN =
  /(ammissibil|finanziabil|agevolabil|spes[ae] ammess|sono ammess|interventi ammess|investimenti ammissibil|progetti ammissibil)/i;
const BENEFICIARY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bpmi\b|piccole e medie imprese|micro, piccole e medie imprese/i, label: 'PMI' },
  { pattern: /micro impresa|microimpresa/i, label: 'Micro impresa' },
  { pattern: /piccola impresa/i, label: 'Piccola impresa' },
  { pattern: /media impresa/i, label: 'Media impresa' },
  { pattern: /startup innovativ|startup/i, label: 'Startup' },
  { pattern: /persone fisiche|persona fisica/i, label: 'Persona fisica' },
  { pattern: /liber[oi] professionist|professionist[ai]/i, label: 'Libero professionista' },
  { pattern: /ditta individuale|impresa individuale/i, label: 'Ditta individuale' },
  { pattern: /cooperativ/i, label: 'Cooperativa' },
  { pattern: /impres[ae] agricol/i, label: 'Impresa agricola' }
];

const LEGAL_TYPE_PATTERNS: Array<{ pattern: RegExp; value: string; label: string }> = [
  { pattern: /\bsrls?\b/i, value: 'srl', label: 'SRL / SRLS' },
  { pattern: /\bspa\b/i, value: 'spa', label: 'SPA' },
  { pattern: /\bsnc\b/i, value: 'snc', label: 'SNC' },
  { pattern: /\bsas\b/i, value: 'sas', label: 'SAS' },
  { pattern: /\bimpresa individuale\b|\bditta individuale\b/i, value: 'ditta_individuale', label: 'Ditta individuale' },
  { pattern: /\bliber[oi] professionist/i, value: 'libero_professionista', label: 'Libero professionista' },
  { pattern: /\bcooperativ/i, value: 'cooperativa', label: 'Cooperativa' }
];

const EMPLOYMENT_STATUS_PATTERNS: Array<{ pattern: RegExp; value: string; label: string }> = [
  { pattern: /\bdisoccupat/i, value: 'disoccupato', label: 'Disoccupato' },
  { pattern: /\binoccupat/i, value: 'inoccupato', label: 'Inoccupato' },
  { pattern: /\bgol\b/i, value: 'gol', label: 'Iscritto al programma GOL' },
  { pattern: /working poor|lavoratore svantaggiato|fragilit/i, value: 'working_poor', label: 'Working poor / lavoratore svantaggiato' },
  { pattern: /tempo determinato/i, value: 'tempo_determinato', label: 'Contratto a tempo determinato' },
  { pattern: /tempo indeterminato/i, value: 'tempo_indeterminato', label: 'Contratto a tempo indeterminato' }
];

type BenchmarkPattern = {
  id: string;
  category: QuestionCategory;
  requiredHint?: RegExp;
  forbidHint?: RegExp;
};

const BENCHMARK_PATTERNS: BenchmarkPattern[] = [
  {
    id: 'beneficiary_explicit',
    category: 'beneficiary',
    requiredHint:
      /(persona fisica|cittadin|pmi|impres|startup|libero professionist|ditta individuale|cooperativa|ente pubblico|universita|ente di ricerca|consorz|rete)/i
  },
  {
    id: 'territory_explicit',
    category: 'territory',
    requiredHint: /(regione|provincia|comune|sede operativa|sede legale|residenz)/i
  },
  {
    id: 'business_stage_explicit',
    category: 'business_stage',
    requiredHint: /(impresa|attivita|costituit|avvi|nuova iniziativa)/i
  },
  {
    id: 'employment_explicit',
    category: 'employment_status',
    requiredHint: /(occupaz|disoccup|inoccup|lavoratore|gol|working poor)/i
  },
  {
    id: 'project_type_explicit',
    category: 'project_type',
    requiredHint: /(progetto|intervento|investimento|avvio|ampliamento|innovazione)/i
  },
  {
    id: 'financial_explicit',
    category: 'financial_threshold',
    requiredHint: /(investiment|fatturat|dipendent|ammontare)/i
  }
];

const SINGLE_BANDO_ENGINE_REVISION = 'single_bando_engine_2026_04_05_max_quality_v7';

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTokenBoundaryPattern(token: string) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return /^$/;
  const escaped = escapeRegExp(normalizedToken).replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i');
}

function containsNormalizedToken(text: string, token: string) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return false;
  const pattern = buildTokenBoundaryPattern(token);
  return pattern.test(normalizedText);
}

function normalizeProvinceCandidate(value: string) {
  const compact = normalizeText(value)
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  if (PROVINCE_CANONICAL_BY_NORMALIZED.has(compact)) return compact;
  const aliases: Array<{ pattern: RegExp; canonical: string }> = [
    { pattern: /forli\s*[- ]\s*cesena/, canonical: 'forli cesena' },
    { pattern: /massa\s*[- ]\s*carrara/, canonical: 'massa carrara' },
    { pattern: /verbano\s*[- ]\s*cusio\s*[- ]\s*ossola/, canonical: 'verbano cusio ossola' },
    { pattern: /barletta\s*[- ]\s*andria\s*[- ]\s*trani/, canonical: 'barletta andria trani' },
    { pattern: /monza\s+e\s+brianza/, canonical: 'monza e brianza' },
    { pattern: /reggio\s+calabria/, canonical: 'reggio calabria' }
  ];
  for (const alias of aliases) {
    if (alias.pattern.test(compact)) return alias.canonical;
  }
  return compact;
}

function canonicalizeProvinceName(value: string) {
  const normalized = normalizeProvinceCandidate(value);
  if (!normalized) return null;
  if (PROVINCE_CANONICAL_BY_NORMALIZED.has(normalized)) {
    return PROVINCE_CANONICAL_BY_NORMALIZED.get(normalized)!;
  }
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function regionForProvince(province: string) {
  const normalized = normalizeProvinceCandidate(province);
  return PROVINCE_TO_REGION.get(normalized) ?? null;
}

function slugify(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 90);
}

export function buildQuestionKey(value: string) {
  const base = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!base) return createHash('sha1').update(String(value ?? '')).digest('hex').slice(0, 14);
  if (base.length <= 70) return base;
  const hash = createHash('sha1').update(String(value ?? '')).digest('hex').slice(0, 10);
  return `${base.slice(0, 70)}_${hash}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCurrencyLikeSignal(text: string) {
  return /(€|\b(?:euro|eur|mila|migliaia|milion[ei]?|mln|mld)\b)/i.test(text);
}

function toScaledFinancialNumber(raw: string | undefined, segmentText: string) {
  if (!raw) return null;
  const parsed = toNumber(raw);
  if (parsed === null) return null;
  const text = normalizeText(segmentText);
  const hasMillionSignal = /milion/.test(text);
  const hasThousandSignal = /\bmila\b|migliaia/.test(text);
  if (hasMillionSignal && parsed > 0 && parsed < 10000) return parsed * 1_000_000;
  if (hasThousandSignal && parsed > 0 && parsed < 10000) return parsed * 1_000;
  return parsed;
}

function formatCurrency(value: number): string {
  return `€ ${Math.round(value).toLocaleString('it-IT')}`;
}

function formatRange(min?: number, max?: number): string | null {
  const low = min !== undefined && Number.isFinite(min) && min > 0 ? min : null;
  const high = max !== undefined && Number.isFinite(max) && max > 0 ? max : null;
  if (low !== null && high !== null) {
    const a = Math.min(low, high);
    const b = Math.max(low, high);
    return `Da ${formatCurrency(a)} a ${formatCurrency(b)}`;
  }
  if (high !== null) return `Fino a ${formatCurrency(high)}`;
  if (low !== null) return `Da ${formatCurrency(low)}`;
  return null;
}

function formatCount(value: number): string {
  return `${Math.round(value).toLocaleString('it-IT')}`;
}

function formatThresholdRange(
  metric: FinancialThresholdRequirement['normalizedValue']['metric'],
  min?: number,
  max?: number
) {
  const low = min !== undefined && Number.isFinite(min) && min > 0 ? min : null;
  const high = max !== undefined && Number.isFinite(max) && max > 0 ? max : null;
  if (metric === 'employees') {
    if (low !== null && high !== null) {
      const a = Math.min(low, high);
      const b = Math.max(low, high);
      return `Da ${formatCount(a)} a ${formatCount(b)} dipendenti`;
    }
    if (high !== null) return `Fino a ${formatCount(high)} dipendenti`;
    if (low !== null) return `Almeno ${formatCount(low)} dipendenti`;
    return null;
  }
  return formatRange(min, max);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function flattenObjectToSegments(value: unknown, location: string, out: SourceSegment[]) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) out.push({ location, text, normalized: normalizeText(text) });
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value);
    out.push({ location, text, normalized: normalizeText(text) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenObjectToSegments(entry, `${location}[${index}]`, out));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) =>
      flattenObjectToSegments(nested, `${location}.${key}`, out)
    );
  }
}

function clip(value: string, maxLength = 220) {
  const compact = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(20, maxLength - 1)).trim()}…`;
}

function collectSourceSegments(detail: GrantDetailRecord, explainability: GrantExplainabilityRecord): SourceSegment[] {
  const out: SourceSegment[] = [];
  const push = (location: string, text: string | null | undefined) => {
    const normalized = normalizeText(text);
    if (!normalized) return;
    out.push({ location, text: String(text).trim(), normalized });
  };

  push('title', detail.title);
  push('description', detail.description);
  push('authority', detail.authority);
  push('aidForm', detail.aidForm);
  push('aidIntensity', detail.aidIntensity);
  detail.beneficiaries.forEach((entry, index) => push(`beneficiaries[${index}]`, entry));
  detail.sectors.forEach((entry, index) => push(`sectors[${index}]`, entry));
  flattenObjectToSegments(detail.requisitiHard, 'requisitiHard', out);
  flattenObjectToSegments(detail.requisitiStrutturati, 'requisitiStrutturati', out);
  flattenObjectToSegments(detail.requisitiSoft, 'requisitiSoft', out);
  explainability.satisfiedRequirements.forEach((entry, index) => push(`explainability.satisfied[${index}]`, entry));
  explainability.whyFit.forEach((entry, index) => push(`explainability.whyFit[${index}]`, entry));

  const dedupe = new Map<string, SourceSegment>();
  out.forEach((segment) => {
    const key = `${segment.location}:${segment.normalized}`;
    if (!dedupe.has(key)) dedupe.set(key, segment);
  });
  return Array.from(dedupe.values()).slice(0, 260);
}

export function computeSingleBandoSourceFingerprint(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
) {
  const segments = collectSourceSegments(detail, explainability)
    .map((segment) => `${segment.location}:${segment.normalized}`)
    .sort();
  const payload = JSON.stringify({
    engineRevision: SINGLE_BANDO_ENGINE_REVISION,
    id: detail.id,
    title: detail.title,
    authority: detail.authority,
    beneficiaries: detail.beneficiaries,
    sectors: detail.sectors,
    segments
  });
  return createHash('sha256').update(payload).digest('hex');
}

function buildRequirementId(prefix: string, value: string) {
  return `${prefix}_${slugify(value || prefix) || prefix}`.slice(0, 96);
}

function requirementImportanceFromBlocking(blocking: boolean): RequirementImportance {
  return blocking ? 'critical' : 'high';
}

function firstSegmentContaining(segments: SourceSegment[], pattern: RegExp): SourceSegment | null {
  for (const segment of segments) {
    if (pattern.test(segment.text)) return segment;
  }
  return null;
}

function extractTerritoryRequirement(segments: SourceSegment[]): TerritoryRequirement | null {
  const nationalSignal = segments.some((segment) => NATIONAL_SCOPE_PATTERN.test(segment.text));
  if (nationalSignal) {
    const hasExplicitRestrictedArea = segments.some((segment) =>
      /(solo in|esclusivamente in|regione|provincia|comune|sede operativa)/i.test(segment.text)
    );
    if (!hasExplicitRestrictedArea) return null;
  }

  const territorySegments = segments.filter((segment) => {
    if (segment.location === 'title' || segment.location === 'authority') return true;
    if (segment.location.startsWith('requisitiHard')) return true;
    if (segment.location.startsWith('requisitiStrutturati')) return true;
    if (segment.location.startsWith('requisitiSoft')) return true;
    return TERRITORY_SEGMENT_HINT.test(segment.text);
  });

  const regions = new Set<string>();
  const provinces = new Set<string>();
  const municipalities = new Set<string>();
  let supportingSegment: SourceSegment | null = null;
  let explicitMultiRegion = false;

  const authoritySegment = segments.find((segment) => segment.location === 'authority');
  const titleSegment = segments.find((segment) => segment.location === 'title');
  const authorityTitleText = normalizeText(
    `${authoritySegment?.text ?? ''} ${titleSegment?.text ?? ''}`
  );
  const dominantRegionFromTitle = Array.from(REGION_BY_NORMALIZED.entries())
    .filter(([regionNorm]) => containsNormalizedToken(authorityTitleText, regionNorm))
    .map(([, regionLabel]) => regionLabel);
  const dominantRegion =
    dominantRegionFromTitle.length === 1 ? dominantRegionFromTitle[0] : null;
  const chamberSignal = /(camera di commercio|cciaa)/i.test(authorityTitleText);
  const dominantProvinceFromAuthority = chamberSignal
    ? Array.from(PROVINCE_CANONICAL_BY_NORMALIZED.keys()).find((provinceNorm) =>
        containsNormalizedToken(authorityTitleText, provinceNorm)
      ) ?? null
    : null;
  const dominantProvinceRegion = dominantProvinceFromAuthority
    ? PROVINCE_TO_REGION.get(dominantProvinceFromAuthority) ?? null
    : null;

  for (const segment of territorySegments) {
    const regionMentionsInSegment: string[] = [];
    for (const [regionNorm, regionLabel] of REGION_BY_NORMALIZED.entries()) {
      if (containsNormalizedToken(segment.normalized, regionNorm)) {
        regionMentionsInSegment.push(regionLabel);
      }
    }
    // If a sentence contains an excessive amount of regions, treat it as noisy and skip.
    if (regionMentionsInSegment.length > 4) {
      continue;
    }
    if (regionMentionsInSegment.length >= 2 && MULTI_REGION_HINT.test(segment.text)) {
      explicitMultiRegion = true;
    }
    regionMentionsInSegment.forEach((region) => regions.add(region));
    if (regionMentionsInSegment.length > 0) {
      supportingSegment = supportingSegment ?? segment;
    }

    const provinceMatches = segment.text.matchAll(/provincia di\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})/gi);
    for (const match of provinceMatches) {
      const provinceRaw = String(match[1] ?? '').replace(/\s+/g, ' ').trim();
      const province = canonicalizeProvinceName(provinceRaw);
      if (!province) continue;
      provinces.add(province);
      supportingSegment = supportingSegment ?? segment;
    }

    const municipalityMatches = segment.text.matchAll(/comune di\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})/gi);
    for (const match of municipalityMatches) {
      const city = String(match[1] ?? '').replace(/\s+/g, ' ').trim();
      if (!city) continue;
      municipalities.add(city);
      supportingSegment = supportingSegment ?? segment;
    }
  }

  if (regions.size === 0 && provinces.size === 0 && municipalities.size === 0) {
    return null;
  }

  const inferredRegionsFromProvinceGranularity = new Set<string>();
  for (const province of provinces) {
    const inferred = regionForProvince(province);
    if (inferred) inferredRegionsFromProvinceGranularity.add(inferred);
  }
  for (const municipality of municipalities) {
    const inferred = regionForProvince(municipality);
    if (inferred) inferredRegionsFromProvinceGranularity.add(inferred);
  }

  if (inferredRegionsFromProvinceGranularity.size > 0) {
    if (regions.size === 0) {
      inferredRegionsFromProvinceGranularity.forEach((region) => regions.add(region));
    } else {
      const coherentRegions = new Set(
        Array.from(regions).filter((region) => inferredRegionsFromProvinceGranularity.has(region))
      );
      if (coherentRegions.size > 0) {
        regions.clear();
        coherentRegions.forEach((region) => regions.add(region));
      } else {
        regions.clear();
        inferredRegionsFromProvinceGranularity.forEach((region) => regions.add(region));
      }
    }
  }

  if (chamberSignal && dominantProvinceFromAuthority && !explicitMultiRegion) {
    const dominantProvinceLabel =
      PROVINCE_CANONICAL_BY_NORMALIZED.get(dominantProvinceFromAuthority) ?? dominantProvinceFromAuthority;
    if (provinces.size === 0 || provinces.has(dominantProvinceLabel) || provinces.size > 1) {
      provinces.clear();
      provinces.add(dominantProvinceLabel);
      if (dominantProvinceRegion) {
        regions.clear();
        regions.add(dominantProvinceRegion);
      }
    }
  }

  // Guard: if a single dominant region is clearly signaled by authority/title,
  // avoid accidental multi-region hallucinations unless explicitly stated.
  if (regions.size > 1 && dominantRegion && !explicitMultiRegion) {
    regions.clear();
    regions.add(dominantRegion);
  }

  const territoryText = supportingSegment?.normalized ?? '';
  let rule: TerritoryRule = 'activity_must_be_located_in';
  if (/sede operativ/.test(territoryText)) rule = 'operating_site_must_be_in';
  else if (/sede legale/.test(territoryText)) rule = 'registered_office_must_be_in';
  else if (/residenz/.test(territoryText)) rule = 'applicant_must_reside_in';
  else if (/investiment/.test(territoryText)) rule = 'investment_must_be_located_in';

  return {
    id: buildRequirementId('territory', `${Array.from(regions).join('-')}-${Array.from(provinces).join('-')}`),
    category: 'territory',
    label: 'Localizzazione territoriale ammessa',
    importance: 'critical',
    blocking: true,
    askable: true,
    sourceExcerpt: clip(supportingSegment?.text ?? ''),
    sourceLocation: supportingSegment?.location,
    confidence: supportingSegment ? 0.92 : 0.75,
    normalizedValue: {
      rule,
      regions: Array.from(regions),
      provinces: Array.from(provinces),
      municipalities: Array.from(municipalities)
    }
  };
}

function extractBeneficiaryRequirement(
  detail: GrantDetailRecord,
  segments: SourceSegment[]
): BeneficiaryRequirement | null {
  const allowedSubjects = new Set<string>();
  const excludedSubjects = new Set<string>();
  let supportingSegment: SourceSegment | null = null;

  const safeBeneficiaryToken = (raw: string) => {
    const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return null;
    const normalized = normalizeText(value);
    if (!normalized) return null;
    if (BENEFICIARY_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized))) return null;
    if (value.length < 3) return null;
    return value;
  };

  detail.beneficiaries.forEach((entry) => {
    const cleaned = safeBeneficiaryToken(entry);
    if (cleaned) allowedSubjects.add(cleaned);
  });

  for (const segment of segments) {
    for (const matcher of BENEFICIARY_PATTERNS) {
      if (!matcher.pattern.test(segment.text)) continue;
      if (/non ammess|esclus/i.test(segment.text)) excludedSubjects.add(matcher.label);
      else allowedSubjects.add(matcher.label);
      supportingSegment = supportingSegment ?? segment;
    }
  }

  if (allowedSubjects.size === 0) return null;

  const fallbackExcerpt = `Beneficiari indicati in scheda: ${Array.from(allowedSubjects).join(', ')}.`;
  const supportingExcerpt =
    supportingSegment && normalizeText(supportingSegment.text).length >= 6
      ? supportingSegment.text
      : fallbackExcerpt;

  return {
    id: buildRequirementId('beneficiary', Array.from(allowedSubjects).join('-')),
    category: 'beneficiary',
    label: 'Beneficiari ammessi',
    importance: 'critical',
    blocking: true,
    askable: true,
    sourceExcerpt: clip(supportingExcerpt),
    sourceLocation: supportingSegment?.location ?? 'beneficiaries',
    confidence: detail.beneficiaries.length > 0 ? 0.95 : 0.76,
    normalizedValue: {
      allowedSubjects: Array.from(allowedSubjects),
      excludedSubjects: Array.from(excludedSubjects)
    }
  };
}

function extractLegalSubjectTypeRequirement(
  detail: GrantDetailRecord,
  segments: SourceSegment[]
): LegalSubjectTypeRequirement | null {
  const allowedTypes = new Set<string>();
  let supportingSegment: SourceSegment | null = null;

  detail.beneficiaries.forEach((entry) => {
    const normalized = normalizeText(entry);
    if (/persona fisic|persone fisiche/.test(normalized)) allowedTypes.add('Persona fisica');
    if (/impres[ae]|azienda|startup/.test(normalized)) allowedTypes.add('Impresa');
    if (/liber[oi] professionist|professionist[ai]/.test(normalized)) {
      allowedTypes.add('Libero professionista');
    }
  });

  for (const segment of segments) {
    for (const matcher of LEGAL_TYPE_PATTERNS) {
      if (!matcher.pattern.test(segment.text)) continue;
      if (/non ammess|esclus/i.test(segment.text)) continue;
      allowedTypes.add(matcher.label);
      supportingSegment = supportingSegment ?? segment;
    }
  }

  if (allowedTypes.size === 0) return null;

  return {
    id: buildRequirementId('legal', Array.from(allowedTypes).join('-')),
    category: 'legal_subject_type',
    label: 'Forma giuridica ammessa',
    importance: 'high',
    blocking: true,
    askable: true,
    sourceExcerpt: clip(
      supportingSegment?.text ??
        `Forma giuridica individuata: ${Array.from(allowedTypes).join(', ')}`
    ),
    sourceLocation: supportingSegment?.location,
    confidence: 0.82,
    normalizedValue: {
      allowedTypes: Array.from(allowedTypes),
      excludedTypes: []
    }
  };
}

function extractAgeRequirement(segments: SourceSegment[]): AgeRequirement | null {
  let minAge: number | undefined;
  let maxAge: number | undefined;
  let supportingSegment: SourceSegment | null = null;

  for (const segment of segments) {
    const hasAgeSignal =
      /(eta|età|anagraf|ann[io]|maggiorenn|minoren|giovan|under\s*\d{1,2})/i.test(segment.text);
    if (!hasAgeSignal) continue;

    const between = /tra\s+(\d{1,2})\s*(?:e|-)\s*(\d{1,2})\s*anni/i.exec(segment.text);
    if (between?.[1] && between?.[2]) {
      minAge = Number(between[1]);
      maxAge = Number(between[2]);
      supportingSegment = supportingSegment ?? segment;
      break;
    }

    const minMatch = /(?:eta|età)?[^\d]{0,16}(?:almeno|minim[ao]|over)\s*(\d{1,2})\s*(?:anni?)?/i.exec(segment.text);
    const maxMatch = /(?:eta|età)?[^\d]{0,16}(?:fino a|massim[ao]|non oltre|under)\s*(\d{1,2})\s*(?:anni?)?/i.exec(segment.text);
    if (minMatch?.[1]) {
      minAge = Number(minMatch[1]);
      supportingSegment = supportingSegment ?? segment;
    }
    if (maxMatch?.[1]) {
      maxAge = Number(maxMatch[1]);
      supportingSegment = supportingSegment ?? segment;
    }
  }

  if (minAge === undefined && maxAge === undefined) return null;
  if (minAge !== undefined && (minAge < 14 || minAge > 100)) return null;
  if (maxAge !== undefined && (maxAge < 14 || maxAge > 100)) return null;
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) return null;

  return {
    id: buildRequirementId('age', `${minAge ?? 'na'}_${maxAge ?? 'na'}`),
    category: 'age',
    label: 'Vincolo anagrafico',
    importance: 'high',
    blocking: true,
    askable: true,
    sourceExcerpt: clip(supportingSegment?.text ?? ''),
    sourceLocation: supportingSegment?.location,
    confidence: 0.84,
    normalizedValue: {
      minAge,
      maxAge,
      inclusive: true
    }
  };
}

function extractEmploymentStatusRequirement(
  detail: GrantDetailRecord,
  segments: SourceSegment[]
): EmploymentStatusRequirement | null {
  const allowedStatuses = new Set<string>();
  let supportingSegment: SourceSegment | null = null;

  detail.beneficiaries.forEach((entry) => {
    for (const matcher of EMPLOYMENT_STATUS_PATTERNS) {
      if (matcher.pattern.test(entry)) {
        allowedStatuses.add(matcher.label);
      }
    }
  });

  for (const segment of segments) {
    for (const matcher of EMPLOYMENT_STATUS_PATTERNS) {
      if (!matcher.pattern.test(segment.text)) continue;
      if (/non ammess|esclus/i.test(segment.text)) continue;
      allowedStatuses.add(matcher.label);
      supportingSegment = supportingSegment ?? segment;
    }
  }

  if (allowedStatuses.size === 0) return null;

  return {
    id: buildRequirementId('employment', Array.from(allowedStatuses).join('-')),
    category: 'employment_status',
    label: 'Stato occupazionale richiesto',
    importance: 'high',
    blocking: true,
    askable: true,
    sourceExcerpt: clip(supportingSegment?.text ?? ''),
    sourceLocation: supportingSegment?.location,
    confidence: 0.82,
    normalizedValue: {
      allowedStatuses: Array.from(allowedStatuses)
    }
  };
}

function extractBusinessStageRequirement(
  detail: GrantDetailRecord,
  segments: SourceSegment[]
): BusinessStageRequirement | null {
  let rule: BusinessStageRule | null = null;
  let maxMonths: number | undefined;
  let referenceDate: string | undefined;
  let supportingSegment: SourceSegment | null = null;

  for (const segment of segments) {
    const normalized = segment.normalized;
    if (/da costituire|non ancora costituit|nuova attivita|nuov[ae]\s+imprese?/.test(normalized)) {
      rule = 'not_yet_constituted';
      supportingSegment = supportingSegment ?? segment;
    } else if (/gia costitu|gia attiv|imprese esistent/.test(normalized)) {
      rule = rule ?? 'already_constituted';
      supportingSegment = supportingSegment ?? segment;
    } else if (/costituit[ae] da meno di/.test(normalized)) {
      rule = 'constituted_within_max_months';
      const monthMatch = /meno di\s+(\d{1,3})\s+mesi/.exec(normalized);
      if (monthMatch?.[1]) maxMonths = Number(monthMatch[1]);
      supportingSegment = supportingSegment ?? segment;
    } else if (/costituit[ae] dopo il/.test(normalized)) {
      rule = 'constituted_after_specific_date';
      const dateMatch = /dopo il\s+([0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4})/.exec(normalized);
      if (dateMatch?.[1]) referenceDate = dateMatch[1];
      supportingSegment = supportingSegment ?? segment;
    } else if (/consolidament|rafforzament|scalabilit|crescita d'impresa|imprese esistent/.test(normalized)) {
      rule = rule ?? 'existing_business';
      supportingSegment = supportingSegment ?? segment;
    } else if (/avvio di nuova impresa|nuova iniziativa|costituzione di nuova/.test(normalized)) {
      rule = rule ?? 'new_initiative';
      supportingSegment = supportingSegment ?? segment;
    }
  }

  if (!rule) {
    for (const beneficiary of detail.beneficiaries) {
      const normalized = normalizeText(beneficiary);
      if (/nuov[ae]\s+impres|aspiranti imprenditor|da costituire/.test(normalized)) {
        rule = 'not_yet_constituted';
        break;
      }
      if (/impresa gia attiva|azienda gia attiva|imprese esistent/.test(normalized)) {
        rule = 'already_constituted';
      }
    }
  }

  if (!rule) return null;

  return {
    id: buildRequirementId('stage', `${rule}_${maxMonths ?? 'na'}_${referenceDate ?? 'na'}`),
    category: 'business_stage',
    label: 'Stadio aziendale richiesto',
    importance: 'high',
    blocking: true,
    askable: true,
    sourceExcerpt: clip(supportingSegment?.text ?? ''),
    sourceLocation: supportingSegment?.location,
    confidence: 0.84,
    normalizedValue: {
      rule,
      maxMonthsSinceConstitution: maxMonths,
      referenceDate
    }
  };
}

function extractSectorRequirement(detail: GrantDetailRecord, segments: SourceSegment[]): SectorRequirement | null {
  const sanitizeSectorChunk = (chunk: string) => {
    const compact = String(chunk ?? '')
      .replace(/^[\s"'`“”]+|[\s"'`“”]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!compact) return null;
    const normalized = normalizeText(compact);
    if (!normalized || compact.length > 80) return null;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length > 8) return null;
    if (
      /(camera di commercio|quadro delle competenze|iniziative promozionali|sviluppo del sistema economico|principi di sussidiarieta|nell ambito|nonche|ai sensi|cos e)\b/.test(
        normalized
      )
    ) {
      return null;
    }
    if (!/[a-zà-öø-ÿ]/i.test(compact)) return null;
    return compact.replace(/\b\w/g, (match) => match.toUpperCase());
  };

  const allowedSectors = new Set(detail.sectors.map((entry) => String(entry ?? '').trim()).filter(Boolean));
  const excludedSectors = new Set<string>();
  const allowedAtecoPrefixes = new Set<string>();
  const excludedAtecoPrefixes = new Set<string>();
  let supportingSegment: SourceSegment | null = null;

  for (const segment of segments) {
    const normalized = segment.normalized;
    if (/settor|ateco|comparto|filiera/.test(normalized)) {
      supportingSegment = supportingSegment ?? segment;
    }

    const atecoMatches = segment.text.matchAll(/ateco[^0-9]{0,10}([0-9]{2})/gi);
    for (const match of atecoMatches) {
      const prefix = String(match[1] ?? '').trim();
      if (!prefix) continue;
      if (/non ammess|esclus/i.test(segment.text)) excludedAtecoPrefixes.add(prefix);
      else allowedAtecoPrefixes.add(prefix);
      supportingSegment = supportingSegment ?? segment;
    }

    if (/esclus/i.test(normalized) && /settor/.test(normalized)) {
      const chunks = segment.text
        .split(/,|;|\/| e /i)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length >= 4);
      chunks.forEach((chunk) => {
        if (/settor|esclus|non ammess|attivit/.test(normalizeText(chunk))) return;
        const sanitized = sanitizeSectorChunk(chunk);
        if (!sanitized) return;
        excludedSectors.add(sanitized);
      });
    }
  }

  if (
    allowedSectors.size === 0 &&
    excludedSectors.size === 0 &&
    allowedAtecoPrefixes.size === 0 &&
    excludedAtecoPrefixes.size === 0
  ) {
    return null;
  }

  return {
    id: buildRequirementId('sector', `${Array.from(allowedSectors).join('-')}_${Array.from(allowedAtecoPrefixes).join('-')}`),
    category: 'sector',
    label: 'Settore / ATECO ammesso',
    importance: 'high',
    blocking: true,
    askable: true,
    sourceExcerpt: clip(
      supportingSegment?.text ??
        `Settori indicati in scheda: ${Array.from(allowedSectors).join(', ')}`
    ),
    sourceLocation: supportingSegment?.location,
    confidence: detail.sectors.length > 0 ? 0.92 : 0.78,
    normalizedValue: {
      allowedSectors: Array.from(allowedSectors),
      excludedSectors: Array.from(excludedSectors),
      allowedAtecoPrefixes: Array.from(allowedAtecoPrefixes),
      excludedAtecoPrefixes: Array.from(excludedAtecoPrefixes)
    }
  };
}

function extractProjectTypeRequirement(segments: SourceSegment[]): ProjectTypeRequirement | null {
  const allowedProjectTypes = new Set<string>();
  const excludedProjectTypes = new Set<string>();
  let supportingSegment: SourceSegment | null = null;
  let strongContextFound = false;
  const serviceInnovationPattern =
    /(servizi di innovazione|erogazione di servizi|trasferimento tecnologico|test-before-invest|tecnologie abilitanti|consulenza su temi di innovazione|accesso al mercato|formazione|networking|impresa 4\.?0)/i;

  const isStrongProjectContext = (segment: SourceSegment) => {
    const normalized = segment.normalized;
    if (serviceInnovationPattern.test(segment.text)) return true;
    if (!PROJECT_CONTEXT_PATTERN.test(normalized)) return false;
    if (PROJECT_ELIGIBILITY_PATTERN.test(normalized)) return true;
    const hasSpecificProjectSignal =
      /(sostenibilit|risparmio energetic|efficientamento energetic|riduzion[e]? delle emissioni|economia circolare|museo d'impresa|valorizzazione del patrimonio)/.test(
        normalized
      ) ||
      (/(consolidament|rafforzament|scalabilit)/.test(normalized) &&
        /(startup|innovativ|tecnolog|ricerca)/.test(normalized));
    if (hasSpecificProjectSignal) {
      return true;
    }
    if (segment.location.startsWith('requisiti')) return true;
    if (segment.location.startsWith('explainability')) return true;
    return false;
  };

  for (const segment of segments) {
    const normalized = segment.normalized;
    const strongContext = isStrongProjectContext(segment);
    if (strongContext) {
      strongContextFound = true;
    }
    if (
      strongContext &&
      /avvio|nuova attivita|nuova impresa|start[- ]?up|costituzion[ea]/.test(normalized)
    ) {
      allowedProjectTypes.add('Avvio nuova attività');
      supportingSegment = supportingSegment ?? segment;
    }
    if (
      strongContext &&
      /(ampliament|sviluppo|potenziament|modernament|investimenti produttivi)/.test(normalized) &&
      /(attivit|impres|azienda|unit[aà] produttiva|investiment)/.test(normalized)
    ) {
      allowedProjectTypes.add('Sviluppo o ampliamento attività');
      supportingSegment = supportingSegment ?? segment;
    }
    if (
      strongContext &&
      /(ricerca|innovazion|digitalizzazion|transizion[e]? digitale|transizion[e]? ecologic)/.test(normalized)
    ) {
      allowedProjectTypes.add('Progetto di innovazione/digitalizzazione');
      supportingSegment = supportingSegment ?? segment;
    }
    if (
      strongContext &&
      /(sostenibilit|risparmio energetic|efficientamento energetic|riduzion[e]? delle emissioni|economia circolare)/.test(
        normalized
      )
    ) {
      allowedProjectTypes.add('Intervento di sostenibilità / efficientamento energetico');
      supportingSegment = supportingSegment ?? segment;
    }
    if (
      strongContext &&
      /(consolidament|rafforzament|scalabilit|crescita d'impresa|sviluppo di startup)/.test(normalized) &&
      /(startup|innovativ|tecnolog|ricerca)/.test(normalized)
    ) {
      allowedProjectTypes.add("Consolidamento / crescita d'impresa");
      supportingSegment = supportingSegment ?? segment;
    }
    if (
      strongContext &&
      /(museo d'impresa|valorizzazione del patrimonio|memoria storica industriale)/.test(normalized)
    ) {
      allowedProjectTypes.add("Costituzione o sviluppo di museo d'impresa");
      supportingSegment = supportingSegment ?? segment;
    }
    if (strongContext && serviceInnovationPattern.test(segment.text)) {
      allowedProjectTypes.add('Servizi di innovazione / trasferimento tecnologico');
      supportingSegment = supportingSegment ?? segment;
    }
    if (/non ammess/.test(normalized) && /progett|intervent|spes/.test(normalized)) {
      excludedProjectTypes.add(clip(segment.text, 80));
      supportingSegment = supportingSegment ?? segment;
    }
  }

  if (!strongContextFound) return null;
  if (allowedProjectTypes.size === 0 && excludedProjectTypes.size === 0) return null;

  return {
    id: buildRequirementId('project_type', Array.from(allowedProjectTypes).join('-')),
    category: 'project_type',
    label: 'Tipologia progetto ammissibile',
    importance: 'medium',
    blocking: false,
    askable: allowedProjectTypes.size > 0,
    sourceExcerpt: clip(supportingSegment?.text ?? ''),
    sourceLocation: supportingSegment?.location,
    confidence: strongContextFound ? 0.84 : 0.68,
    normalizedValue: {
      allowedProjectTypes: Array.from(allowedProjectTypes),
      excludedProjectTypes: Array.from(excludedProjectTypes)
    }
  };
}

function extractFinancialThresholdRequirements(segments: SourceSegment[]): FinancialThresholdRequirement[] {
  const requirements: FinancialThresholdRequirement[] = [];

  for (const segment of segments) {
    const normalized = segment.normalized;
    const hasCurrencySignal = hasCurrencyLikeSignal(segment.text);
    const hasTimeOnlySignal = /(mesi|anni|giorni)/i.test(segment.text);
    const hasPercentOnlySignal = /%/.test(segment.text) && !hasCurrencySignal;

    let metric: FinancialThresholdRequirement['normalizedValue']['metric'] =
      /fatturat|ricav/.test(normalized)
        ? 'revenue'
        : /dipendent/.test(normalized)
          ? 'employees'
          : /investiment|spesa|importo/.test(normalized)
            ? 'investment'
            : 'generic';

    if (metric === 'generic') continue;
    if (hasTimeOnlySignal && !hasCurrencySignal && metric !== 'employees') continue;
    if (hasPercentOnlySignal && metric !== 'employees') continue;
    if (metric === 'employees' && hasCurrencySignal) {
      metric = 'investment';
    }

    const betweenMatch = /tra\s+([\d.,]+)\s*(?:e|-)\s*([\d.,]+)/i.exec(segment.text);
    const minMatch = /(?:almeno|minimo|superiore a|oltre)\s*([\d.,]+)/i.exec(segment.text);
    const maxMatch = /(?:fino a|massimo|inferiore a|non oltre)\s*([\d.,]+)/i.exec(segment.text);
    let min = betweenMatch?.[1]
      ? toScaledFinancialNumber(betweenMatch[1], segment.text)
      : minMatch?.[1]
        ? toScaledFinancialNumber(minMatch[1], segment.text)
        : null;
    let max = betweenMatch?.[2]
      ? toScaledFinancialNumber(betweenMatch[2], segment.text)
      : maxMatch?.[1]
        ? toScaledFinancialNumber(maxMatch[1], segment.text)
        : null;
    if (min === null && max === null) continue;

    if (min !== null && max !== null && min > max) {
      [min, max] = [max, min];
    }

    const hasEconomicSignal =
      hasCurrencySignal ||
      /(fatturat|ricav|dipendent|spese ammissibili|investiment|importo del progetto)/i.test(segment.text);
    if (!hasEconomicSignal) continue;

    const hasNormativeOnlySignal = /(articol|comma|dgr|decreto|regolamento\s*\(?.*ue|n\.\s*\d{2,})/i.test(
      segment.text
    );
    const hasStrongMoneySignal =
      hasCurrencySignal || /(fatturat|ricav|dipendent|importo)/i.test(segment.text);
    if (hasNormativeOnlySignal && !hasStrongMoneySignal) continue;

    if (metric !== 'employees') {
      if (
        ((min !== null && min > 0 && min < 1000) || (max !== null && max > 0 && max < 1000)) &&
        !hasCurrencySignal
      ) {
        continue;
      }
    } else if ((min !== null && min > 1000) || (max !== null && max > 1000)) {
      // Very large "employees" values are almost always misparsed monetary thresholds.
      if (hasCurrencySignal) {
        metric = 'investment';
      } else {
        continue;
      }
    }

    requirements.push({
      id: buildRequirementId('financial', `${metric}_${min ?? 'na'}_${max ?? 'na'}`),
      category: 'financial_threshold',
      label: `Soglia ${metric === 'revenue' ? 'fatturato' : metric === 'employees' ? 'dipendenti' : 'investimento'}`,
      importance: 'high',
      blocking: true,
      askable: true,
      sourceExcerpt: clip(segment.text),
      sourceLocation: segment.location,
      confidence: 0.74,
      normalizedValue: {
        metric,
        min: min ?? undefined,
        max: max ?? undefined,
        unit: metric === 'employees' ? 'count' : 'eur'
      }
    });
  }

  return requirements;
}

function extractExclusionRequirements(segments: SourceSegment[]): ExclusionRequirement[] {
  const exclusions: ExclusionRequirement[] = [];
  for (const segment of segments) {
    const normalized = segment.normalized;
    if (!/non ammess|esclus|inammissibil|divieto|non puo/.test(normalized)) continue;
    if (segment.text.length < 24) continue;

    exclusions.push({
      id: buildRequirementId('exclusion', segment.text),
      category: 'exclusion',
      label: 'Condizione di esclusione',
      importance: 'critical',
      blocking: true,
      askable: ASKABLE_EXCLUSION_PATTERN.test(segment.text),
      sourceExcerpt: clip(segment.text),
      sourceLocation: segment.location,
      confidence: 0.72,
      normalizedValue: {
        exclusionType: 'explicit_exclusion',
        description: clip(segment.text, 180)
      }
    });
  }
  return exclusions.slice(0, 4);
}

function extractAdditionalProfileRequirements(
  detail: GrantDetailRecord,
  segments: SourceSegment[]
): OtherRequirement[] {
  const out: OtherRequirement[] = [];
  const dimensions = Array.isArray((detail as any).dimensions) ? ((detail as any).dimensions as string[]) : [];
  const fullText = normalizeText(
    [
      detail.title,
      detail.description,
      detail.authority,
      ...(detail.beneficiaries ?? []),
      ...dimensions
    ]
      .filter(Boolean)
      .join(' ')
  );

  const sizeLabels = uniqueStrings(
    dimensions
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => /micro|piccol|media|grande/i.test(entry))
  );
  if (sizeLabels.length > 0) {
    out.push({
      id: buildRequirementId('company_size', sizeLabels.join('-')),
      category: 'other',
      label: 'Dimensione aziendale ammessa',
      importance: 'high',
      blocking: true,
      askable: true,
      sourceExcerpt: clip(`Dimensioni ammesse in scheda: ${sizeLabels.join(', ')}`),
      sourceLocation: 'dimensions',
      confidence: 0.88,
      normalizedValue: {
        kind: 'company_size',
        allowedSizes: sizeLabels
      }
    });
  }

  if (/imprenditoria femminile|impresa femminile|femminil|donne imprenditrici/.test(fullText)) {
    const supporting = segments.find((segment) => /femminil|donne/.test(segment.normalized));
    out.push({
      id: buildRequirementId('gender', 'female_entrepreneurship'),
      category: 'other',
      label: 'Vincolo imprenditoria femminile',
      importance: 'high',
      blocking: true,
      askable: true,
      sourceExcerpt: clip(
        supporting?.text ?? 'Il bando prevede requisiti legati all’imprenditoria femminile.'
      ),
      sourceLocation: supporting?.location ?? 'description',
      confidence: 0.84,
      normalizedValue: {
        kind: 'gender_composition',
        required: 'female'
      }
    });
  }

  if (/impresa giovanile|imprenditoria giovanile|giovan|under\s*3[05]|under\s*4[05]/.test(fullText)) {
    const supporting = segments.find((segment) =>
      /impresa giovanile|imprenditoria giovanile|giovan|under\s*3[05]|under\s*4[05]/.test(segment.normalized)
    );
    out.push({
      id: buildRequirementId('youth', 'youth_entrepreneurship'),
      category: 'other',
      label: 'Vincolo imprenditoria giovanile',
      importance: 'high',
      blocking: true,
      askable: true,
      sourceExcerpt: clip(
        supporting?.text ?? "Il bando prevede requisiti legati all'imprenditoria giovanile."
      ),
      sourceLocation: supporting?.location ?? 'description',
      confidence: 0.82,
      normalizedValue: {
        kind: 'youth_composition',
        required: 'youth'
      }
    });
  }

  if (/startup innovativ/.test(fullText)) {
    const supporting = segments.find((segment) => /startup innovativ/.test(segment.normalized));
    out.push({
      id: buildRequirementId('startup_status', 'innovativa'),
      category: 'other',
      label: 'Status startup innovativa',
      importance: 'high',
      blocking: true,
      askable: true,
      sourceExcerpt: clip(
        supporting?.text ?? 'Il bando richiede status di startup innovativa.'
      ),
      sourceLocation: supporting?.location ?? 'description',
      confidence: 0.83,
      normalizedValue: {
        kind: 'startup_status',
        requiredStatus: 'startup_innovativa'
      }
    });
  }

  if (/sede operativ|unita locale|unita operativa|sede legale/.test(fullText)) {
    const supporting = segments.find((segment) =>
      /sede operativ|unita locale|unita operativa|sede legale/.test(segment.normalized)
    );
    const asksOperatingSite = /sede operativ|unita locale|unita operativa/.test(fullText);
    const asksRegisteredOffice = /sede legale/.test(fullText);
    if (asksOperatingSite || asksRegisteredOffice) {
      out.push({
        id: buildRequirementId('local_unit', `${asksOperatingSite}_${asksRegisteredOffice}`),
        category: 'other',
        label: 'Vincolo su sede operativa / sede legale',
        importance: 'high',
        blocking: true,
        askable: true,
        sourceExcerpt: clip(
          supporting?.text ??
            'Il bando specifica vincoli su sede operativa, unità locale o sede legale.'
        ),
        sourceLocation: supporting?.location ?? 'description',
        confidence: 0.8,
        normalizedValue: {
          kind: 'local_unit',
          asksOperatingSite,
          asksRegisteredOffice
        }
      });
    }
  }

  return out;
}

export function extractRequirementsFromBando(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): GenericRequirement[] {
  const segments = collectSourceSegments(detail, explainability);
  const requirements: GenericRequirement[] = [];

  const beneficiary = extractBeneficiaryRequirement(detail, segments);
  if (beneficiary) requirements.push(beneficiary);

  const territory = extractTerritoryRequirement(segments);
  if (territory) requirements.push(territory);

  const legal = extractLegalSubjectTypeRequirement(detail, segments);
  if (legal) requirements.push(legal);

  const age = extractAgeRequirement(segments);
  if (age) requirements.push(age);

  const employment = extractEmploymentStatusRequirement(detail, segments);
  if (employment) requirements.push(employment);

  const stage = extractBusinessStageRequirement(detail, segments);
  if (stage) requirements.push(stage);

  const sector = extractSectorRequirement(detail, segments);
  if (sector) requirements.push(sector);

  const projectType = extractProjectTypeRequirement(segments);
  if (projectType) requirements.push(projectType);

  requirements.push(...extractFinancialThresholdRequirements(segments));
  requirements.push(...extractExclusionRequirements(segments));
  requirements.push(...extractAdditionalProfileRequirements(detail, segments));

  return requirements;
}

function requirementFingerprint(requirement: GenericRequirement) {
  const normalizedValue = JSON.stringify((requirement as { normalizedValue?: unknown }).normalizedValue ?? {});
  return `${requirement.category}:${normalizeText(requirement.label)}:${normalizeText(normalizedValue)}`;
}

export function normalizeRequirements(requirements: GenericRequirement[]): GenericRequirement[] {
  const merged = new Map<string, GenericRequirement>();

  for (const requirement of requirements) {
    const key = requirementFingerprint(requirement);
    if (!merged.has(key)) {
      merged.set(key, requirement);
      continue;
    }
    const existing = merged.get(key)!;
    if (requirement.confidence > existing.confidence) {
      merged.set(key, requirement);
    }
  }

  return Array.from(merged.values());
}

type RequirementValidationOutcome = {
  requirements: GenericRequirement[];
  issues: string[];
};

export function validateRequirements(requirements: GenericRequirement[]): RequirementValidationOutcome {
  const issues: string[] = [];
  const validated: GenericRequirement[] = requirements.map((requirement) => {
    const cloned = { ...requirement } as GenericRequirement;
    let askable = cloned.askable;

    if (!cloned.sourceExcerpt || normalizeText(cloned.sourceExcerpt).length < 3) {
      askable = false;
      issues.push(`Requirement ${cloned.id} without source excerpt`);
    }
    if (cloned.confidence < 0.55) {
      askable = false;
      issues.push(`Requirement ${cloned.id} low confidence`);
    }

    if (cloned.category === 'territory') {
      const value = (cloned as TerritoryRequirement).normalizedValue;
      if (value.regions.length === 0 && value.provinces.length === 0 && value.municipalities.length === 0) {
        askable = false;
        issues.push(`Territory requirement ${cloned.id} has no normalized places`);
      }
      const isAlmostNationalRegionList =
        value.regions.length >= ITALIAN_REGIONS.length - 1 &&
        value.provinces.length === 0 &&
        value.municipalities.length === 0 &&
        (value.rule === 'activity_must_be_located_in' ||
          value.rule === 'investment_must_be_located_in' ||
          value.rule === 'unknown');
      if (isAlmostNationalRegionList) {
        askable = false;
        issues.push(`Territory requirement ${cloned.id} too broad for meaningful pre-check`);
      }
    }

    if (cloned.category === 'beneficiary') {
      const value = (cloned as BeneficiaryRequirement).normalizedValue;
      if (!value.allowedSubjects || value.allowedSubjects.length === 0) {
        askable = false;
        issues.push(`Beneficiary requirement ${cloned.id} without explicit beneficiaries`);
      }
    }

    if (cloned.category === 'age') {
      const value = (cloned as AgeRequirement).normalizedValue;
      if (value.minAge === undefined && value.maxAge === undefined) {
        askable = false;
      }
    }

    if (cloned.category === 'employment_status') {
      const value = (cloned as EmploymentStatusRequirement).normalizedValue;
      if (!value.allowedStatuses || value.allowedStatuses.length === 0) {
        askable = false;
      }
    }

    if (cloned.category === 'business_stage') {
      const value = (cloned as BusinessStageRequirement).normalizedValue;
      if (value.rule === 'unknown') askable = false;
    }

    if (cloned.category === 'sector') {
      const value = (cloned as SectorRequirement).normalizedValue;
      if (
        (!value.allowedSectors || value.allowedSectors.length === 0) &&
        (!value.allowedAtecoPrefixes || value.allowedAtecoPrefixes.length === 0) &&
        (!value.excludedSectors || value.excludedSectors.length === 0)
      ) {
        askable = false;
      }
    }

    if (cloned.category === 'financial_threshold') {
      const value = (cloned as FinancialThresholdRequirement).normalizedValue;
      if (value.min === undefined && value.max === undefined) askable = false;
      if (value.metric !== 'employees') {
        const hasCurrencySignal = hasCurrencyLikeSignal(cloned.sourceExcerpt);
        const suspiciousTinyValue =
          (value.min !== undefined && value.min > 0 && value.min < 1000) ||
          (value.max !== undefined && value.max > 0 && value.max < 1000);
        if (suspiciousTinyValue && !hasCurrencySignal) {
          askable = false;
          issues.push(`Financial requirement ${cloned.id} marked non-askable due weak numeric context`);
        }
      }
    }

    cloned.askable = askable;
    return cloned;
  });

  return { requirements: validated, issues };
}

export function deriveIdealApplicantProfile(requirements: GenericRequirement[]): IdealApplicantProfile {
  const beneficiary = requirements.find((item): item is BeneficiaryRequirement => item.category === 'beneficiary');
  const territory = requirements.find((item): item is TerritoryRequirement => item.category === 'territory');
  const stage = requirements.find((item): item is BusinessStageRequirement => item.category === 'business_stage');
  const age = requirements.find((item): item is AgeRequirement => item.category === 'age');
  const employment = requirements.find(
    (item): item is EmploymentStatusRequirement => item.category === 'employment_status'
  );
  const sector = requirements.find((item): item is SectorRequirement => item.category === 'sector');
  const exclusions = requirements.filter((item): item is ExclusionRequirement => item.category === 'exclusion');

  const decisiveFactors = requirements
    .filter((item) => item.askable && item.importance !== 'low')
    .map((item) => item.label)
    .slice(0, 8);

  const immediateDisqualifiers = exclusions
    .map((item) => item.normalizedValue.description)
    .filter(Boolean)
    .slice(0, 6);

  const summaryParts = [
    beneficiary?.normalizedValue.allowedSubjects?.length
      ? `destinato a ${beneficiary.normalizedValue.allowedSubjects.join(', ')}`
      : null,
    territory &&
    (territory.normalizedValue.regions.length > 0 ||
      territory.normalizedValue.provinces.length > 0 ||
      territory.normalizedValue.municipalities.length > 0)
      ? `con localizzazione in ${[
          ...territory.normalizedValue.municipalities,
          ...territory.normalizedValue.provinces,
          ...territory.normalizedValue.regions
        ].join(', ')}`
      : null,
    stage ? `per ${stage.normalizedValue.rule.replace(/_/g, ' ')}` : null
  ].filter((item): item is string => Boolean(item));

  return {
    summary:
      summaryParts.length > 0
        ? `Bando ${summaryParts.join(' ')}.`
        : 'Bando con requisiti specifici da verificare in modo puntuale.',
    targetSubjects: beneficiary?.normalizedValue.allowedSubjects ?? [],
    excludedSubjects: beneficiary?.normalizedValue.excludedSubjects ?? [],
    targetTerritories: {
      regions: territory?.normalizedValue.regions ?? [],
      provinces: territory?.normalizedValue.provinces ?? [],
      municipalities: territory?.normalizedValue.municipalities ?? []
    },
    targetBusinessStage: stage?.normalizedValue.rule,
    targetAge: age
      ? {
          minAge: age.normalizedValue.minAge,
          maxAge: age.normalizedValue.maxAge
        }
      : undefined,
    targetEmploymentStatuses: employment?.normalizedValue.allowedStatuses ?? [],
    targetSectors: sector?.normalizedValue.allowedSectors ?? [],
    decisiveFactors,
    immediateDisqualifiers
  };
}

const REQUIREMENT_PRIORITY: Record<RequirementCategory, number> = {
  territory: 1,
  beneficiary: 2,
  legal_subject_type: 3,
  business_stage: 4,
  age: 5,
  employment_status: 6,
  sector: 7,
  exclusion: 8,
  project_type: 9,
  financial_threshold: 10,
  local_unit: 11,
  time_constraint: 12,
  other: 13
};

const MAX_VERIFICATION_QUESTIONS = 16;
const MIN_VISIBLE_INTERVIEW_DEPTH = 8;

export function selectDecisiveRequirements(
  requirements: GenericRequirement[],
  _idealProfile: IdealApplicantProfile
): GenericRequirement[] {
  return requirements
    .filter((item) => item.askable)
    .sort((a, b) => {
      const byPriority = (REQUIREMENT_PRIORITY[a.category] ?? 99) - (REQUIREMENT_PRIORITY[b.category] ?? 99);
      if (byPriority !== 0) return byPriority;
      const byImportance =
        importanceWeight(b.importance) - importanceWeight(a.importance);
      if (byImportance !== 0) return byImportance;
      return b.confidence - a.confidence;
    })
    .slice(0, 18);
}

function importanceWeight(value: RequirementImportance) {
  switch (value) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function yesNoOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'yes', label: 'Sì' },
    { value: 'no', label: 'No' }
  ];
}

function mapEmploymentLabel(status: string) {
  const normalized = normalizeText(status);
  const found = EMPLOYMENT_STATUS_PATTERNS.find((entry) => normalizeText(entry.label) === normalized);
  return found?.label ?? status;
}

function isPersonaLikeBeneficiary(normalizedSubject: string) {
  const personaSignal =
    /(persona fisic|aspiranti imprenditor|libero professionist|lavoro autonom|nuova impresa|under|giovan|disoccup|inoccup|working poor)/.test(
      normalizedSubject
    );
  if (!personaSignal) return false;
  if (/(impres|azienda|startup)/.test(normalizedSubject) && !/persona fisic/.test(normalizedSubject)) {
    return false;
  }
  return true;
}

function isBusinessLikeBeneficiary(normalizedSubject: string) {
  return /(impres|azienda|pmi|cooperativ|startup|srl|spa|snc|sas|ditta individuale)/.test(
    normalizedSubject
  );
}

type QuestionBuildContext = {
  beneficiary?: BeneficiaryRequirement | null;
  beneficiaryQuestionId?: string | null;
  beneficiaryOptionValues?: string[];
  personaFisicaOption?: string | null;
  personaLikeOptions?: string[];
  businessLikeOptions?: string[];
  femaleLikeOptions?: string[];
  youthLikeOptions?: string[];
  hasMultipleBeneficiaryProfiles?: boolean;
  hasLegalSubjectTypeRequirement?: boolean;
  hasBusinessStageRequirement?: boolean;
  hasGenderRequirement?: boolean;
  hasYouthRequirement?: boolean;
  hasStartupStatusRequirement?: boolean;
  startupInnovativaOptions?: string[];
};

function resolvePersonaFisicaOption(beneficiary: BeneficiaryRequirement | null) {
  if (!beneficiary) return null;
  const normalized = beneficiary.normalizedValue.allowedSubjects.map((subject) => normalizeText(subject));
  const matchIndex = normalized.findIndex((entry) => /persona fisic/.test(entry));
  if (matchIndex === -1) return null;
  const label = beneficiary.normalizedValue.allowedSubjects[matchIndex] ?? 'Persona fisica';
  return slugify(label);
}

function resolveBeneficiaryOptionValues(
  beneficiary: BeneficiaryRequirement | null,
  matcher: (normalizedSubject: string) => boolean
) {
  if (!beneficiary) return [];
  return uniqueStrings(
    beneficiary.normalizedValue.allowedSubjects
      .map((subject) => ({ subject, normalized: normalizeText(subject) }))
      .filter(({ normalized }) => matcher(normalized))
      .map(({ subject }) => slugify(subject))
      .filter(Boolean)
  );
}

function isStartupInnovativaBeneficiary(normalizedSubject: string) {
  return /(startup[\s_-]*innovativ|pmi innovativ|su\/pmi innovativ|impresa[^,;]*innovativ)/.test(normalizedSubject);
}

function isFemaleLikeBeneficiary(normalizedSubject: string) {
  return /(femminil|donn|imprenditric)/.test(normalizedSubject);
}

function isYouthLikeBeneficiary(normalizedSubject: string) {
  return /(giovan|under\s*3[05]|under\s*4[05]|under\s*5[05]|under\s*36)/.test(normalizedSubject);
}

function localUnitTerritoryLabelFromExcerpt(sourceExcerpt: string) {
  const mentions = extractTerritoryMentions(sourceExcerpt);
  if (mentions.length === 0) return 'nel territorio ammesso dal bando';
  const normalized = uniqueStrings(
    mentions.map((mention) => {
      if (mention.type === 'region') return `in ${mention.value}`;
      if (mention.type === 'province') return `nella provincia di ${mention.value}`;
      return `nel comune di ${mention.value}`;
    })
  );
  if (normalized.length === 1) return normalized[0]!;
  if (normalized.length === 2) return `${normalized[0]} o ${normalized[1]}`;
  return `${normalized.slice(0, 2).join(', ')} o altro territorio ammesso`;
}

function detectTerritoryGranularity(territory: TerritoryRequirement['normalizedValue']) {
  if ((territory.municipalities?.length ?? 0) > 0) return 'comune';
  if ((territory.provinces?.length ?? 0) > 0) return 'provincia';
  return 'regione';
}

function territoryQuestionTitle(
  rule: TerritoryRule,
  granularity: 'comune' | 'provincia' | 'regione'
) {
  if (rule === 'registered_office_must_be_in') {
    return `In quale ${granularity} si trova la sede legale del richiedente?`;
  }
  if (rule === 'operating_site_must_be_in') {
    return `In quale ${granularity} si trova la sede operativa del progetto?`;
  }
  if (rule === 'applicant_must_reside_in') {
    return `In quale ${granularity} risiede il richiedente?`;
  }
  if (rule === 'investment_must_be_located_in') {
    return `In quale ${granularity} si realizza l'investimento?`;
  }
  return `In quale ${granularity} si trova l'attività o il progetto?`;
}

function buildQuestionForRequirement(
  requirement: GenericRequirement,
  priority: number,
  context: QuestionBuildContext
): VerificationQuestion[] {
  if (requirement.category === 'beneficiary') {
    const allowed = uniqueStrings(requirement.normalizedValue.allowedSubjects);
    if (allowed.length === 1) {
      return [
        {
          id: buildRequirementId('q_beneficiary', requirement.id),
          requirementIds: [requirement.id],
          category: 'beneficiary',
          priority,
          blocking: true,
          question: `Il bando è rivolto a ${allowed[0]}. Ti candidi con questo profilo?`,
          helpText: `Condizione dal bando: ${clip(requirement.sourceExcerpt, 180)}`,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        }
      ];
    }

    const options = [
      ...allowed.map((subject) => ({ value: slugify(subject), label: subject })),
      { value: 'altro_non_ammesso', label: 'Altro / non in elenco' }
    ];
    const baseId = buildRequirementId('q_beneficiary', requirement.id);
    const out: VerificationQuestion[] = [
      {
        id: baseId,
        requirementIds: [requirement.id],
        category: 'beneficiary',
        priority,
        blocking: true,
        question: 'Quale soggetto presenta la domanda?',
        helpText: `Profili ammessi dal bando: ${allowed.join(', ')}.`,
        answerType: 'single_choice',
        options,
        disqualifyIf: ['altro_non_ammesso'],
        sourceExcerpt: requirement.sourceExcerpt,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];

    const compositeResearchOption = allowed.find((subject) => {
      const normalized = normalizeText(subject);
      return normalized.includes('universita') && normalized.includes('ente di ricerca');
    });
    if (compositeResearchOption) {
      out.push({
        id: `${baseId}_entity_detail`,
        requirementIds: [requirement.id],
        category: 'other',
        priority: priority + 1,
        blocking: true,
        question: 'Il soggetto richiedente è un’Università o un Ente di ricerca?',
        answerType: 'single_choice',
        options: [
          { value: 'universita', label: 'Università' },
          { value: 'ente_di_ricerca', label: 'Ente di ricerca' },
          { value: 'altro_non_ammesso', label: 'Altro / non in elenco' }
        ],
        disqualifyIf: ['altro_non_ammesso'],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf: {
          questionId: baseId,
          anyOf: [slugify(compositeResearchOption)]
        },
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      });
    }

    const personaLike = context.personaLikeOptions ?? [];
    const businessLike = context.businessLikeOptions ?? [];
    const hasPersonaAndBusinessProfiles = personaLike.length > 0 && businessLike.length > 0;
    const requiresApplicantNatureFollowUp = allowed.some((subject) => {
      const normalizedSubject = normalizeText(subject);
      const personaMatch = isPersonaLikeBeneficiary(normalizedSubject);
      const businessMatch = isBusinessLikeBeneficiary(normalizedSubject);
      // If a label is not clearly persona-only or business-only, keep an explicit nature clarification.
      return personaMatch === businessMatch;
    });

    if (hasPersonaAndBusinessProfiles && requiresApplicantNatureFollowUp) {
      out.push({
        id: `${baseId}_applicant_nature`,
        requirementIds: [requirement.id],
        category: 'other',
        priority: priority + 2,
        blocking: false,
        question: 'Stai presentando la domanda come persona fisica o come impresa già costituita?',
        answerType: 'single_choice',
        options: [
          { value: 'persona_fisica', label: 'Persona fisica' },
          { value: 'impresa', label: 'Impresa già costituita' }
        ],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf: { questionId: baseId, anyOf: [...personaLike, ...businessLike] },
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      });
    }

    const hasNewInitiativeHint = allowed.some((subject) =>
      /(nuov[ae]\s+impres|nuova attivit|aspiranti imprenditor|startup)/i.test(subject)
    );
    const hasExistingBusinessHint = allowed.some((subject) =>
      /(impres[ae]\s+gia\s+attiv|azienda\s+gia\s+attiva|imprese?\s+esistent)/i.test(subject)
    );

    if (!context.hasBusinessStageRequirement && (hasNewInitiativeHint || hasExistingBusinessHint)) {
      const showIfValues = [
        ...(hasNewInitiativeHint ? personaLike : []),
        ...(hasExistingBusinessHint ? businessLike : [])
      ];

      if (hasNewInitiativeHint && !hasExistingBusinessHint) {
        out.push({
          id: `${baseId}_initiative_stage`,
          requirementIds: [requirement.id],
          category: 'business_stage',
          priority: priority + 3,
          blocking: true,
          question: 'Ti candidi per avviare una nuova attività (non ancora costituita)?',
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          showIf:
            showIfValues.length > 0
              ? {
                  questionId: baseId,
                  anyOf: showIfValues
                }
              : undefined,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        });
      } else if (hasNewInitiativeHint && hasExistingBusinessHint) {
        out.push({
          id: `${baseId}_initiative_stage`,
          requirementIds: [requirement.id],
          category: 'business_stage',
          priority: priority + 3,
          blocking: false,
          question: 'La candidatura riguarda una nuova attività o un’impresa già attiva?',
          answerType: 'single_choice',
          options: [
            { value: 'nuova_attivita', label: 'Nuova attività / da avviare' },
            { value: 'impresa_gia_attiva', label: 'Impresa già attiva' }
          ],
          sourceExcerpt: requirement.sourceExcerpt,
          showIf:
            showIfValues.length > 0
              ? {
                  questionId: baseId,
                  anyOf: showIfValues
                }
              : undefined,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        });
      }
    }

    const femaleLikeValues = resolveBeneficiaryOptionValues(requirement, isFemaleLikeBeneficiary);
    if (femaleLikeValues.length > 0 && !context.hasGenderRequirement) {
      out.push({
        id: `${baseId}_female_prevalence`,
        requirementIds: [requirement.id],
        category: 'other',
        priority: priority + 4,
        blocking: true,
        question: "L'impresa è a prevalenza femminile?",
        answerType: 'single_choice_yes_no',
        options: yesNoOptions(),
        disqualifyIf: ['no'],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf: {
          questionId: baseId,
          anyOf: femaleLikeValues
        },
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      });
    }

    const youthLikeValues = resolveBeneficiaryOptionValues(requirement, isYouthLikeBeneficiary);
    if (youthLikeValues.length > 0 && !context.hasYouthRequirement) {
      out.push({
        id: `${baseId}_youth_prevalence`,
        requirementIds: [requirement.id],
        category: 'other',
        priority: priority + 5,
        blocking: true,
        question: "L'impresa rispetta il requisito di prevalenza giovanile previsto dal bando?",
        answerType: 'single_choice_yes_no',
        options: yesNoOptions(),
        disqualifyIf: ['no'],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf: {
          questionId: baseId,
          anyOf: youthLikeValues
        },
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      });
    }

    const startupLikeValues = resolveBeneficiaryOptionValues(requirement, isStartupInnovativaBeneficiary);
    if (startupLikeValues.length > 0 && !context.hasStartupStatusRequirement) {
      out.push({
        id: `${baseId}_startup_innovativa_status`,
        requirementIds: [requirement.id],
        category: 'other',
        priority: priority + 6,
        blocking: true,
        question:
          'La tua iniziativa è già iscritta, o verrà costituita e iscritta, come startup innovativa nella sezione speciale?',
        answerType: 'single_choice_yes_no',
        options: yesNoOptions(),
        disqualifyIf: ['no'],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf: {
          questionId: baseId,
          anyOf: startupLikeValues
        },
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      });
    }

    return out;
  }

  if (requirement.category === 'territory') {
    const allPlaces = [
      ...requirement.normalizedValue.municipalities.map((place) => ({ type: 'comune' as const, label: place })),
      ...requirement.normalizedValue.provinces.map((place) => ({ type: 'provincia' as const, label: place })),
      ...requirement.normalizedValue.regions.map((place) => ({ type: 'regione' as const, label: place }))
    ];
    const granularity = detectTerritoryGranularity(requirement.normalizedValue);
    const places = [
      ...(granularity === 'comune'
        ? requirement.normalizedValue.municipalities.map((place) => ({ type: 'comune' as const, label: place }))
        : []),
      ...(granularity === 'provincia'
        ? requirement.normalizedValue.provinces.map((place) => ({ type: 'provincia' as const, label: place }))
        : []),
      ...(granularity === 'regione'
        ? requirement.normalizedValue.regions.map((place) => ({ type: 'regione' as const, label: place }))
        : [])
    ];
    const scopedPlaces = places.length > 0 ? places : allPlaces;

    const rule = requirement.normalizedValue.rule;
    const territoryPrefix =
      rule === 'registered_office_must_be_in'
        ? 'La sede legale'
        : rule === 'operating_site_must_be_in'
          ? 'La sede operativa del progetto'
          : rule === 'applicant_must_reside_in'
            ? 'Il richiedente risiede'
            : rule === 'investment_must_be_located_in'
              ? "L'investimento"
              : "L'attività o il progetto";

    if (scopedPlaces.length === 1) {
      const place = scopedPlaces[0]!;
      const question =
        place.type === 'comune'
          ? `${territoryPrefix} si trova nel comune di ${place.label}?`
          : place.type === 'provincia'
            ? `${territoryPrefix} si trova nella provincia di ${place.label}?`
            : `${territoryPrefix} si trova in ${place.label}?`;
      return [
        {
          id: buildRequirementId('q_territory', requirement.id),
          requirementIds: [requirement.id],
          category: 'territory',
          priority,
          blocking: true,
          question,
          helpText: `Vincolo territoriale del bando: ${clip(requirement.sourceExcerpt, 180)}`,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        }
      ];
    }

    const options = [
      ...scopedPlaces.map((place) => ({
        value: slugify(`${place.type}_${place.label}`),
        label: territoryLabel(place)
      })),
      { value: 'fuori_area_ammessa', label: 'Fuori area ammessa' }
    ];
    const baseId = buildRequirementId('q_territory', requirement.id);
    return [
      {
        id: baseId,
        requirementIds: [requirement.id],
        category: 'territory',
        priority,
        blocking: true,
        question: territoryQuestionTitle(rule, granularity),
        helpText: `Aree ammesse dal bando: ${scopedPlaces
          .map((place) => territoryLabel(place))
          .join(', ')}.`,
        answerType: 'single_choice',
        options,
        disqualifyIf: ['fuori_area_ammessa'],
        sourceExcerpt: requirement.sourceExcerpt,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];
  }

  if (requirement.category === 'age') {
    const { minAge, maxAge } = requirement.normalizedValue;
    const question =
      minAge !== undefined && maxAge !== undefined
        ? `Hai un'età compresa tra ${minAge} e ${maxAge} anni?`
        : minAge !== undefined
          ? `Hai almeno ${minAge} anni?`
          : `Hai al massimo ${maxAge} anni?`;
    return [
      {
        id: buildRequirementId('q_age', requirement.id),
        requirementIds: [requirement.id],
        category: 'age',
        priority,
        blocking: true,
        question,
        helpText: `Vincolo anagrafico estratto dal bando: ${clip(requirement.sourceExcerpt, 180)}`,
        answerType: 'single_choice_yes_no',
        options: yesNoOptions(),
        disqualifyIf: ['no'],
        sourceExcerpt: requirement.sourceExcerpt,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];
  }

  if (requirement.category === 'employment_status') {
    const allowed = uniqueStrings(requirement.normalizedValue.allowedStatuses.map(mapEmploymentLabel));
    if (allowed.length === 1) {
      return [
        {
          id: buildRequirementId('q_employment', requirement.id),
          requirementIds: [requirement.id],
          category: 'employment_status',
          priority,
          blocking: true,
          question: `Il bando richiede stato occupazionale "${allowed[0]}". È il tuo stato attuale?`,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        }
      ];
    }

    return [
      {
        id: buildRequirementId('q_employment', requirement.id),
        requirementIds: [requirement.id],
        category: 'employment_status',
        priority,
        blocking: true,
        question: 'Qual è il tuo stato occupazionale attuale?',
        helpText: `Stati ammessi: ${allowed.join(', ')}.`,
        answerType: 'single_choice',
        options: [
          ...allowed.map((status) => ({ value: slugify(status), label: status })),
          { value: 'altro_stato', label: 'Altro stato' }
        ],
        disqualifyIf: ['altro_stato'],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf:
          context.hasMultipleBeneficiaryProfiles &&
          context.personaLikeOptions &&
          context.personaLikeOptions.length > 0 &&
          context.beneficiaryQuestionId
            ? {
                questionId: context.beneficiaryQuestionId,
                anyOf: context.personaLikeOptions
              }
            : undefined,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];
  }

  if (requirement.category === 'legal_subject_type') {
    const allowed = uniqueStrings(requirement.normalizedValue.allowedTypes);
    const legalTypeShowIf =
      context.hasMultipleBeneficiaryProfiles &&
      context.beneficiaryQuestionId &&
      context.businessLikeOptions &&
      context.businessLikeOptions.length > 0 &&
      context.businessLikeOptions.length < (context.beneficiaryOptionValues?.length ?? 0)
        ? {
            questionId: context.beneficiaryQuestionId,
            anyOf: context.businessLikeOptions
          }
        : undefined;
    return [
      {
        id: buildRequirementId('q_legal_type', requirement.id),
        requirementIds: [requirement.id],
        category: 'legal_subject_type',
        priority,
        blocking: true,
        question: 'Qual è la forma giuridica del richiedente?',
        helpText: `Forme ammesse: ${allowed.join(', ')}.`,
        answerType: 'single_choice',
        options: [
          ...allowed.map((entry) => ({ value: slugify(entry), label: entry })),
          { value: 'altro_non_ammesso', label: 'Altro / non in elenco' }
        ],
        disqualifyIf: ['altro_non_ammesso'],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf: legalTypeShowIf,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];
  }

  if (requirement.category === 'business_stage') {
    const rule = requirement.normalizedValue.rule;
    const hasMixedProfiles =
      Boolean(context.hasMultipleBeneficiaryProfiles) &&
      (context.personaLikeOptions?.length ?? 0) > 0 &&
      (context.businessLikeOptions?.length ?? 0) > 0;
    const labelByRule: Record<BusinessStageRule, string> = {
      not_yet_constituted: hasMixedProfiles
        ? 'L’attività sarà avviata dopo l’ammissione (impresa non ancora costituita)?'
        : 'Ti candidi come persona fisica e avvierai la nuova attività dopo l’ammissione?',
      already_constituted: 'Hai già un’impresa attiva e costituita?',
      existing_business: 'Il progetto è presentato da un’impresa già esistente?',
      new_initiative: 'Il progetto riguarda l’avvio di una nuova iniziativa?',
      constituted_after_specific_date: `L’impresa è stata costituita dopo ${requirement.normalizedValue.referenceDate ?? 'la data richiesta dal bando'}?`,
      constituted_within_max_months: `L’impresa è stata costituita da meno di ${
        requirement.normalizedValue.maxMonthsSinceConstitution ?? '12'
      } mesi?`,
      unknown: ''
    };
    const question = labelByRule[rule];
    if (!question) return [];
    const stageShowIf =
      hasMixedProfiles && context.beneficiaryQuestionId
        ? rule === 'not_yet_constituted' || rule === 'new_initiative'
          ? {
              questionId: context.beneficiaryQuestionId,
              anyOf:
                (context.personaLikeOptions?.length ?? 0) > 0
                  ? context.personaLikeOptions
                  : context.beneficiaryOptionValues
            }
          : rule === 'already_constituted' || rule === 'existing_business'
            ? {
                questionId: context.beneficiaryQuestionId,
                anyOf:
                  (context.businessLikeOptions?.length ?? 0) > 0
                    ? context.businessLikeOptions
                    : context.beneficiaryOptionValues
              }
            : undefined
        : undefined;

    return [
      {
        id: buildRequirementId('q_stage', requirement.id),
        requirementIds: [requirement.id],
        category: 'business_stage',
        priority,
        blocking: true,
        question,
        answerType: 'single_choice_yes_no',
        options: yesNoOptions(),
        disqualifyIf: ['no'],
        sourceExcerpt: requirement.sourceExcerpt,
        showIf: stageShowIf,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];
  }

  if (requirement.category === 'sector') {
    const allowedAteco = uniqueStrings(requirement.normalizedValue.allowedAtecoPrefixes ?? []);
    const excluded = uniqueStrings(requirement.normalizedValue.excludedSectors ?? []);
    const excludedSummary = summarizeEntries(excluded, 4);
    if (allowedAteco.length > 0) {
      const out: VerificationQuestion[] = [
        {
          id: buildRequirementId('q_sector_ateco', requirement.id),
          requirementIds: [requirement.id],
          category: 'sector',
          priority,
          blocking: true,
          question: `Il tuo ATECO primario inizia con uno di questi prefissi: ${allowedAteco.join(', ')}?`,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        }
      ];
      if (excluded.length > 0) {
        out.push({
          id: `${buildRequirementId('q_sector_ateco', requirement.id)}_exclusion`,
          requirementIds: [requirement.id],
          category: 'sector',
          priority: priority + 1,
          blocking: true,
          question: "L'attività rientra in uno dei settori esclusi dal bando?",
          helpText: excludedSummary ? `Settori esclusi nel bando: ${excludedSummary}.` : undefined,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['yes'],
          intent: 'exclusion_check',
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        });
      }
      return out;
    }

    const allowed = uniqueStrings(requirement.normalizedValue.allowedSectors ?? []);
    if (allowed.length === 1) {
      const out: VerificationQuestion[] = [
        {
          id: buildRequirementId('q_sector', requirement.id),
          requirementIds: [requirement.id],
          category: 'sector',
          priority,
          blocking: true,
          question: `L’attività rientra nel settore "${allowed[0]}"?`,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        }
      ];
      if (excluded.length > 0) {
        out.push({
          id: `${buildRequirementId('q_sector', requirement.id)}_exclusion`,
          requirementIds: [requirement.id],
          category: 'sector',
          priority: priority + 1,
          blocking: true,
          question: "L'attività rientra in uno dei settori esclusi dal bando?",
          helpText: excludedSummary ? `Settori esclusi nel bando: ${excludedSummary}.` : undefined,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['yes'],
          intent: 'exclusion_check',
          sourceExcerpt: requirement.sourceExcerpt,
          showIf: { questionId: buildRequirementId('q_sector', requirement.id), anyOf: [slugify(allowed[0])] },
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        });
      }
      return out;
    }

    if (allowed.length > 1) {
      const baseId = buildRequirementId('q_sector', requirement.id);
      const out: VerificationQuestion[] = [
        {
          id: baseId,
          requirementIds: [requirement.id],
          category: 'sector',
          priority,
          blocking: true,
          question: 'Qual è il settore principale della tua attività?',
          helpText: `Settori ammessi: ${allowed.join(', ')}.`,
          answerType: 'single_choice',
          options: [
            ...allowed.map((entry) => ({ value: slugify(entry), label: entry })),
            { value: 'altro_settore', label: 'Altro settore' }
          ],
          disqualifyIf: ['altro_settore'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        },
        {
          id: `${baseId}_clarify`,
          requirementIds: [requirement.id],
          category: 'sector',
          priority: priority + 1,
          blocking: false,
          question: 'Se hai selezionato "Altro settore", indica ATECO e descrizione attività.',
          answerType: 'text',
          validation: { maxLength: 220 },
          intent: 'qualification',
          sourceExcerpt: requirement.sourceExcerpt,
          showIf: { questionId: baseId, anyOf: ['altro_settore'] },
          informativeOnly: true,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        }
      ];
      if (excluded.length > 0) {
        out.push({
          id: `${baseId}_exclusion`,
          requirementIds: [requirement.id],
          category: 'sector',
          priority: priority + 2,
          blocking: true,
          question: "L'attività rientra in uno dei settori esclusi dal bando?",
          helpText: excludedSummary ? `Settori esclusi nel bando: ${excludedSummary}.` : undefined,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['yes'],
          intent: 'exclusion_check',
          sourceExcerpt: requirement.sourceExcerpt,
          showIf: {
            questionId: baseId,
            noneOf: ['altro_settore']
          },
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        });
      }
      return out;
    }

    if (excluded.length > 0) {
      return [
        {
          id: buildRequirementId('q_sector_exclusion', requirement.id),
          requirementIds: [requirement.id],
          category: 'sector',
          priority,
          blocking: true,
          question: "L'attività rientra in uno dei settori esclusi dal bando?",
          helpText: excludedSummary ? `Settori esclusi nel bando: ${excludedSummary}.` : undefined,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['yes'],
          intent: 'exclusion_check',
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        }
      ];
    }
  }

  if (requirement.category === 'project_type') {
    const allowed = uniqueStrings(requirement.normalizedValue.allowedProjectTypes ?? []);
    if (allowed.length > 0) {
      if (allowed.length === 1) {
        const label = allowed[0]!;
        return [
          {
            id: buildRequirementId('q_project_type_single', requirement.id),
            requirementIds: [requirement.id],
            category: 'project_type',
            priority,
            blocking: false,
            question: `Il progetto riguarda "${label}"?`,
            helpText: `Tipologia prevista dal bando: ${clip(requirement.sourceExcerpt, 160)}`,
            answerType: 'single_choice_yes_no',
            options: yesNoOptions(),
            disqualifyIf: ['no'],
            sourceExcerpt: requirement.sourceExcerpt,
            validatorFlags: {
              grounded: false,
              territorySafe: false,
              explicitEnough: false,
              nonGeneric: false,
              nonDuplicate: false,
              askable: false,
          benchmarkDepth: false
            }
          }
        ];
      }
      const baseId = buildRequirementId('q_project_type', requirement.id);
      const options = [
        ...allowed.map((entry) => ({ value: slugify(entry), label: entry })),
        { value: 'altro_tipo', label: 'Altro tipo progetto' }
      ];
      const serviceInnovationValues = options
        .filter((option) => /servizi di innovazione|trasferimento tecnologico/.test(normalizeText(option.label)))
        .map((option) => option.value);
      const serviceQuestionNeeded =
        /servizi di innovazione|trasferimento tecnologico/.test(normalizeText(requirement.sourceExcerpt)) &&
        serviceInnovationValues.length > 0;
      return [
        {
          id: baseId,
          requirementIds: [requirement.id],
          category: 'project_type',
          priority,
          blocking: true,
          question: 'Quale tipo di progetto vuoi presentare?',
          helpText: `Tipologie ammesse: ${allowed.join(', ')}.`,
          answerType: 'single_choice',
          options,
          disqualifyIf: ['altro_tipo'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
          benchmarkDepth: false
          }
        },
        ...(serviceQuestionNeeded
          ? [
              {
                id: `${baseId}_service_target`,
                requirementIds: [requirement.id],
                category: 'project_type' as const,
                priority: priority + 1,
                blocking: true,
                question: 'I servizi del progetto sono rivolti a imprese beneficiarie?',
                answerType: 'single_choice_yes_no' as const,
                options: yesNoOptions(),
                disqualifyIf: ['no'],
                sourceExcerpt: requirement.sourceExcerpt,
                showIf: {
                  questionId: baseId,
                  anyOf: serviceInnovationValues
                },
                validatorFlags: {
                  grounded: false,
                  territorySafe: false,
                  explicitEnough: false,
                  nonGeneric: false,
                  nonDuplicate: false,
                  askable: false,
                  benchmarkDepth: false
                }
              }
            ]
          : [])
      ];
    }
  }

  if (requirement.category === 'financial_threshold') {
    const metricLabel =
      requirement.normalizedValue.metric === 'revenue'
        ? 'fatturato annuo'
        : requirement.normalizedValue.metric === 'employees'
          ? 'numero dipendenti'
          : 'investimento previsto';
    const rangeLabel = formatThresholdRange(
      requirement.normalizedValue.metric,
      requirement.normalizedValue.min,
      requirement.normalizedValue.max
    );
    const thresholdSuffix = rangeLabel ? ` (soglia: ${rangeLabel})` : '';
    return [
      {
        id: buildRequirementId('q_financial', requirement.id),
        requirementIds: [requirement.id],
        category: 'financial_threshold',
        priority,
        blocking: true,
        question:
          requirement.normalizedValue.metric === 'employees'
            ? `Quanti dipendenti ha attualmente la tua impresa${thresholdSuffix}?`
            : requirement.normalizedValue.metric === 'revenue'
              ? `Qual è il tuo fatturato annuo indicativo${thresholdSuffix}?`
              : `Qual è l'ammontare dell'investimento previsto${thresholdSuffix}?`,
        helpText: rangeLabel ? `Soglia del bando (${metricLabel}): ${rangeLabel}` : undefined,
        answerType: 'number',
        validation: {
          min: requirement.normalizedValue.min,
          max: requirement.normalizedValue.max
        },
        sourceExcerpt: requirement.sourceExcerpt,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];
  }

  if (requirement.category === 'exclusion') {
    return [
      {
        id: buildRequirementId('q_exclusion', requirement.id),
        requirementIds: [requirement.id],
        category: 'exclusion',
        priority,
        blocking: true,
        question: `Ti trovi in questa condizione di esclusione: "${clip(
          requirement.normalizedValue.description,
          96
        )}"?`,
        answerType: 'single_choice_yes_no',
        options: yesNoOptions(),
        disqualifyIf: ['yes'],
        sourceExcerpt: requirement.sourceExcerpt,
        validatorFlags: {
          grounded: false,
          territorySafe: false,
          explicitEnough: false,
          nonGeneric: false,
          nonDuplicate: false,
          askable: false,
          benchmarkDepth: false
        }
      }
    ];
  }

  if (requirement.category === 'other') {
    const kind = normalizeText(String((requirement.normalizedValue as Record<string, unknown>)?.kind ?? ''));
    if (kind === 'company_size') {
      const allowedSizes = uniqueStrings(
        ((requirement.normalizedValue as Record<string, unknown>)?.allowedSizes as string[] | undefined) ?? []
      );
      if (allowedSizes.length > 0) {
        return [
          {
            id: buildRequirementId('q_company_size', requirement.id),
            requirementIds: [requirement.id],
            category: 'other',
            priority,
            blocking: true,
            question: 'Qual è la dimensione della tua impresa?',
            helpText: `Dimensioni ammesse: ${allowedSizes.join(', ')}.`,
            answerType: 'single_choice',
            options: [
              ...allowedSizes.map((entry) => ({ value: slugify(entry), label: entry })),
              { value: 'dimensione_non_ammessa', label: 'Dimensione non in elenco' }
            ],
            disqualifyIf: ['dimensione_non_ammessa'],
            sourceExcerpt: requirement.sourceExcerpt,
            validatorFlags: {
              grounded: false,
              territorySafe: false,
              explicitEnough: false,
              nonGeneric: false,
              nonDuplicate: false,
              askable: false,
              benchmarkDepth: false
            }
          }
        ];
      }
    }

    if (kind === 'gender_composition') {
      const impliedOptions = new Set(context.femaleLikeOptions ?? []);
      const followUpOptions = (context.beneficiaryOptionValues ?? []).filter((value) => !impliedOptions.has(value));
      if (context.beneficiaryQuestionId && followUpOptions.length === 0 && (context.beneficiaryOptionValues?.length ?? 0) > 0) {
        return [];
      }
      return [
        {
          id: buildRequirementId('q_gender', requirement.id),
          requirementIds: [requirement.id],
          category: 'other',
          priority,
          blocking: true,
          question: 'La compagine o titolarità dell’impresa rispetta il requisito di imprenditoria femminile?',
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          showIf:
            context.beneficiaryQuestionId && followUpOptions.length > 0
              ? {
                  questionId: context.beneficiaryQuestionId,
                  anyOf: followUpOptions
                }
              : undefined,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        }
      ];
    }

    if (kind === 'youth_composition') {
      const impliedOptions = new Set(context.youthLikeOptions ?? []);
      const followUpOptions = (context.beneficiaryOptionValues ?? []).filter((value) => !impliedOptions.has(value));
      if (context.beneficiaryQuestionId && followUpOptions.length === 0 && (context.beneficiaryOptionValues?.length ?? 0) > 0) {
        return [];
      }
      return [
        {
          id: buildRequirementId('q_youth', requirement.id),
          requirementIds: [requirement.id],
          category: 'other',
          priority,
          blocking: true,
          question:
            "La maggioranza di quote o governance dell'impresa è in capo a giovani come richiesto dal bando?",
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          showIf:
            context.beneficiaryQuestionId && followUpOptions.length > 0
              ? {
                  questionId: context.beneficiaryQuestionId,
                  anyOf: followUpOptions
                }
              : undefined,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        }
      ];
    }

    if (kind === 'startup_status') {
      const impliedOptions = new Set(context.startupInnovativaOptions ?? []);
      const followUpOptions = (context.beneficiaryOptionValues ?? []).filter((value) => !impliedOptions.has(value));
      if (context.beneficiaryQuestionId && followUpOptions.length === 0 && (context.beneficiaryOptionValues?.length ?? 0) > 0) {
        return [];
      }
      return [
        {
          id: buildRequirementId('q_startup_status', requirement.id),
          requirementIds: [requirement.id],
          category: 'other',
          priority,
          blocking: true,
          question:
            'La tua iniziativa è già iscritta, o verrà costituita e iscritta, come startup innovativa nella sezione speciale?',
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          showIf:
            context.beneficiaryQuestionId && followUpOptions.length > 0
              ? {
                  questionId: context.beneficiaryQuestionId,
                  anyOf: followUpOptions
                }
              : undefined,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        }
      ];
    }

    if (kind === 'local_unit') {
      const value = requirement.normalizedValue as Record<string, unknown>;
      const asksOperatingSite = Boolean(value.asksOperatingSite);
      const asksRegisteredOffice = Boolean(value.asksRegisteredOffice);
      const territoryLabel = localUnitTerritoryLabelFromExcerpt(requirement.sourceExcerpt);
      const out: VerificationQuestion[] = [];
      if (asksOperatingSite) {
        out.push({
          id: buildRequirementId('q_local_unit_operativa', requirement.id),
          requirementIds: [requirement.id],
          category: 'other',
          priority,
          blocking: true,
          question: `La sede operativa del progetto è ${territoryLabel}?`,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        });
      }
      if (asksRegisteredOffice) {
        out.push({
          id: buildRequirementId('q_local_unit_legale', requirement.id),
          requirementIds: [requirement.id],
          category: 'other',
          priority: priority + (asksOperatingSite ? 1 : 0),
          blocking: true,
          question: `La sede legale del richiedente è ${territoryLabel}?`,
          answerType: 'single_choice_yes_no',
          options: yesNoOptions(),
          disqualifyIf: ['no'],
          sourceExcerpt: requirement.sourceExcerpt,
          showIf: asksOperatingSite
            ? {
                questionId: buildRequirementId('q_local_unit_operativa', requirement.id),
                anyOf: ['yes']
              }
            : undefined,
          validatorFlags: {
            grounded: false,
            territorySafe: false,
            explicitEnough: false,
            nonGeneric: false,
            nonDuplicate: false,
            askable: false,
            benchmarkDepth: false
          }
        });
      }
      return out;
    }
  }

  return [];
}

export function buildCandidateQuestions(
  requirements: GenericRequirement[],
  _idealProfile: IdealApplicantProfile
): VerificationQuestion[] {
  const out: VerificationQuestion[] = [];
  const beneficiary = requirements.find(
    (item): item is BeneficiaryRequirement => item.category === 'beneficiary'
  );
  const beneficiaryQuestionId = beneficiary ? buildRequirementId('q_beneficiary', beneficiary.id) : null;
  const beneficiaryOptionValues = beneficiary
    ? uniqueStrings(
        beneficiary.normalizedValue.allowedSubjects
          .map((subject) => slugify(subject))
          .filter(Boolean)
      )
    : [];
  const personaFisicaOption = resolvePersonaFisicaOption(beneficiary ?? null);
  const personaLikeOptions = resolveBeneficiaryOptionValues(
    beneficiary ?? null,
    isPersonaLikeBeneficiary
  );
  const businessLikeOptions = resolveBeneficiaryOptionValues(
    beneficiary ?? null,
    isBusinessLikeBeneficiary
  );
  const startupInnovativaOptions = resolveBeneficiaryOptionValues(
    beneficiary ?? null,
    isStartupInnovativaBeneficiary
  );
  const femaleLikeOptions = resolveBeneficiaryOptionValues(
    beneficiary ?? null,
    isFemaleLikeBeneficiary
  );
  const youthLikeOptions = resolveBeneficiaryOptionValues(
    beneficiary ?? null,
    isYouthLikeBeneficiary
  );
  const hasMultipleBeneficiaryProfiles =
    Boolean(beneficiary) && (beneficiary?.normalizedValue.allowedSubjects?.length ?? 0) > 1;
  const hasLegalSubjectTypeRequirement = requirements.some(
    (item) => item.category === 'legal_subject_type'
  );
  const hasBusinessStageRequirement = requirements.some((item) => item.category === 'business_stage');
  const hasGenderRequirement = requirements.some(
    (item) =>
      item.category === 'other' &&
      normalizeText(String((item.normalizedValue as Record<string, unknown>)?.kind ?? '')) === 'gender_composition'
  );
  const hasYouthRequirement = requirements.some(
    (item) =>
      item.category === 'other' &&
      normalizeText(String((item.normalizedValue as Record<string, unknown>)?.kind ?? '')) === 'youth_composition'
  );
  const hasStartupStatusRequirement = requirements.some(
    (item) =>
      item.category === 'other' &&
      normalizeText(String((item.normalizedValue as Record<string, unknown>)?.kind ?? '')) === 'startup_status'
  );
  const context: QuestionBuildContext = {
    beneficiary,
    beneficiaryQuestionId,
    beneficiaryOptionValues,
    personaFisicaOption,
    personaLikeOptions,
    businessLikeOptions,
    femaleLikeOptions,
    youthLikeOptions,
    hasMultipleBeneficiaryProfiles,
    hasLegalSubjectTypeRequirement,
    hasBusinessStageRequirement,
    hasGenderRequirement,
    hasYouthRequirement,
    hasStartupStatusRequirement,
    startupInnovativaOptions
  };

  requirements.forEach((requirement, index) => {
    const questions = buildQuestionForRequirement(requirement, index + 1, context);
    out.push(...questions);
  });
  return out;
}

export function buildQuestionTree(
  requirements: GenericRequirement[],
  idealProfile: IdealApplicantProfile
): VerificationQuestion[] {
  return buildCandidateQuestions(requirements, idealProfile);
}

function cleanupQuestionTitle(question: string) {
  const trimmed = String(question ?? '').trim();
  if (!trimmed) return trimmed;
  if (/^seleziona il tuo profilo/i.test(trimmed)) return 'Seleziona il tuo profilo?';
  const withoutAllowed = trimmed.replace(/\s*\(ammess[ioe]?:[^)]*\)/gi, '');
  const normalized = withoutAllowed.replace(/\s{2,}/g, ' ').trim();
  if (normalized.endsWith('?')) return normalized;
  return `${normalized}?`;
}

function applyQuestionLabelCleanup(questions: VerificationQuestion[]): VerificationQuestion[] {
  return questions.map((question) => ({
    ...question,
    question: cleanupQuestionTitle(question.question)
  }));
}

function applyQuestionIntent(questions: VerificationQuestion[]): VerificationQuestion[] {
  return questions.map((question) => ({
    ...question,
    intent: resolveQuestionIntent(question)
  }));
}

function expectedMinimumDepth(requirements: GenericRequirement[]) {
  const decisiveDimensions = new Set(
    requirements
      .filter((item) => item.askable && (item.importance === 'critical' || item.importance === 'high'))
      .map((item) => item.category)
  );
  const count = decisiveDimensions.size;
  let floor = 2;
  if (count <= 2) floor = 3;
  else if (count === 3) floor = 4;
  else if (count === 4) floor = 4;
  else if (count === 5) floor = 5;
  else if (count === 6) floor = 7;
  else if (count >= 7) floor = 8;
  return Math.max(floor, MIN_VISIBLE_INTERVIEW_DEPTH);
}

function buildDepthExpansionContext(requirements: GenericRequirement[]): QuestionBuildContext {
  const beneficiary = requirements.find((item): item is BeneficiaryRequirement => item.category === 'beneficiary');
  return {
    hasMultipleBeneficiaryProfiles: Boolean(beneficiary) && (beneficiary?.normalizedValue.allowedSubjects?.length ?? 0) > 1,
    beneficiaryQuestionId: beneficiary ? buildRequirementId('q_beneficiary', beneficiary.id) : null,
    beneficiaryOptionValues: beneficiary
      ? uniqueStrings(
          beneficiary.normalizedValue.allowedSubjects
            .map((subject) => slugify(subject))
            .filter(Boolean)
        )
      : [],
    personaFisicaOption: resolvePersonaFisicaOption(beneficiary ?? null),
    personaLikeOptions: resolveBeneficiaryOptionValues(beneficiary ?? null, isPersonaLikeBeneficiary),
    businessLikeOptions: resolveBeneficiaryOptionValues(beneficiary ?? null, isBusinessLikeBeneficiary),
    femaleLikeOptions: resolveBeneficiaryOptionValues(beneficiary ?? null, isFemaleLikeBeneficiary),
    youthLikeOptions: resolveBeneficiaryOptionValues(beneficiary ?? null, isYouthLikeBeneficiary),
    startupInnovativaOptions: resolveBeneficiaryOptionValues(
      beneficiary ?? null,
      isStartupInnovativaBeneficiary
    ),
    hasLegalSubjectTypeRequirement: requirements.some((item) => item.category === 'legal_subject_type'),
    hasBusinessStageRequirement: requirements.some((item) => item.category === 'business_stage'),
    hasGenderRequirement: requirements.some(
      (item) =>
        item.category === 'other' &&
        normalizeText(String((item.normalizedValue as Record<string, unknown>)?.kind ?? '')) === 'gender_composition'
    ),
    hasYouthRequirement: requirements.some(
      (item) =>
        item.category === 'other' &&
        normalizeText(String((item.normalizedValue as Record<string, unknown>)?.kind ?? '')) === 'youth_composition'
    ),
    hasStartupStatusRequirement: requirements.some(
      (item) =>
        item.category === 'other' &&
        normalizeText(String((item.normalizedValue as Record<string, unknown>)?.kind ?? '')) === 'startup_status'
    )
  };
}

function allowedAnswerValuesForFollowUp(parent: VerificationQuestion) {
  const options = parent.options ?? (parent.answerType === 'single_choice_yes_no' ? yesNoOptions() : []);
  if (options.length === 0) return [];
  const disqualify = new Set((parent.disqualifyIf ?? []).map((entry) => normalizeText(entry)));
  return options
    .map((option) => option.value)
    .filter((value) => !disqualify.has(normalizeText(value)))
    .filter(Boolean);
}

function followUpDepthLevel(questionId: string) {
  const normalizedId = String(questionId ?? '');
  const matches = Array.from(normalizedId.matchAll(/_depth(\d+)(?=$|_)/g));
  if (matches.length === 0) return 0;
  const last = matches[matches.length - 1];
  return Number(last?.[1] ?? 0) || 0;
}

function nextFollowUpId(parentId: string) {
  const current = followUpDepthLevel(parentId);
  const next = current + 1;
  return `${parentId}_depth${next}`;
}

function followUpAllowedLabels(parent: VerificationQuestion, max = 6) {
  const options = parent.options ?? [];
  const disqualify = new Set((parent.disqualifyIf ?? []).map((entry) => normalizeText(entry)));
  return options
    .filter((option) => !disqualify.has(normalizeText(option.value)))
    .map((option) => option.label)
    .filter(Boolean)
    .slice(0, max);
}

function followUpAllowedSummary(parent: VerificationQuestion, max = 4) {
  const labels = followUpAllowedLabels(parent, max);
  if (labels.length === 0) return null;
  return labels.join(', ');
}

function findPrimaryRequirement(
  parent: VerificationQuestion,
  requirementsById: Map<string, GenericRequirement>
) {
  for (const id of parent.requirementIds ?? []) {
    const requirement = requirementsById.get(id);
    if (requirement) return requirement;
  }
  return null;
}

function summarizeEntries(values: string[], max = 4) {
  const compact = uniqueStrings(values).filter(Boolean);
  if (compact.length === 0) return null;
  if (compact.length <= max) return compact.join(', ');
  return `${compact.slice(0, max).join(', ')} e altri`;
}

function inlineSafeSummary(summary: string | null, maxLength = 72) {
  if (!summary) return null;
  const compact = summary.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  if (compact.length > maxLength) return null;
  return compact;
}

function buildDepthClarificationQuestion(
  parent: VerificationQuestion,
  _priority: number,
  requirementsById: Map<string, GenericRequirement>
): VerificationQuestion | null {
  const level = followUpDepthLevel(parent.id);
  if (level >= 4) return null;
  const allowedAnswers = allowedAnswerValuesForFollowUp(parent);
  const baseShowIf =
    allowedAnswers.length > 0
      ? {
          questionId: parent.id,
          anyOf: allowedAnswers
        }
      : undefined;

  const sourceExcerpt = parent.sourceExcerpt;
  const followUpHelpText = sourceExcerpt ? `Requisito del bando: ${clip(sourceExcerpt, 170)}` : undefined;
  const primaryRequirement = findPrimaryRequirement(parent, requirementsById);
  const followUpPriority = Number((parent.priority + 0.1 + Math.min(level, 4) * 0.01).toFixed(3));

  if (parent.category === 'territory') {
    const normalizedParent = normalizeText(parent.question);
    const target =
      /sede operativa/.test(normalizedParent)
        ? 'La sede operativa del progetto'
        : /sede legale/.test(normalizedParent)
          ? 'La sede legale del richiedente'
          : /resiede|residenza/.test(normalizedParent)
            ? 'La residenza del richiedente'
            : /investiment/.test(normalizedParent)
            ? "La localizzazione dell'investimento"
            : 'La localizzazione del progetto';
    const territoryRequirement =
      primaryRequirement && primaryRequirement.category === 'territory' ? primaryRequirement : null;
    const allowedTerritories =
      territoryRequirement
        ? summarizeEntries(
            [
              ...territoryRequirement.normalizedValue.municipalities.map((entry) => `Comune di ${entry}`),
              ...territoryRequirement.normalizedValue.provinces.map((entry) => `Provincia di ${entry}`),
              ...territoryRequirement.normalizedValue.regions
            ],
            6
          )
        : followUpAllowedSummary(parent, 6);
    const territoryQuestionByLevel = [
      `${target} coincide con l'area territoriale che hai selezionato?`,
      `${target} è quella su cui verranno imputate le spese ammissibili del progetto?`,
      `${target} sarà disponibile nel territorio ammesso alla data di presentazione della domanda?`,
      `${target} resterà nel territorio ammesso per tutta la fase di ammissibilità del bando?`
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'territory',
      priority: followUpPriority,
      blocking: true,
      question: territoryQuestionByLevel[Math.min(level, territoryQuestionByLevel.length - 1)]!,
      helpText: allowedTerritories
        ? `${followUpHelpText ?? ''}${followUpHelpText ? ' ' : ''}Aree ammesse: ${allowedTerritories}.`
        : followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'beneficiary') {
    const beneficiaryRequirement =
      primaryRequirement && primaryRequirement.category === 'beneficiary' ? primaryRequirement : null;
    const allowedSubjects =
      beneficiaryRequirement
        ? summarizeEntries(beneficiaryRequirement.normalizedValue.allowedSubjects, 6)
        : followUpAllowedSummary(parent, 6);
    const beneficiaryQuestionByLevel = [
      'Il soggetto che hai selezionato sarà anche il beneficiario diretto del contributo e il titolare delle spese?',
      'La domanda sarà presentata formalmente dallo stesso soggetto beneficiario che hai indicato?',
      'Il soggetto beneficiario indicato manterrà questo profilo fino all\'invio della domanda?',
      'Il soggetto beneficiario indicato è quello che sosterrà le spese e riceverà il contributo?'
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'beneficiary',
      priority: followUpPriority,
      blocking: true,
      question: beneficiaryQuestionByLevel[Math.min(level, beneficiaryQuestionByLevel.length - 1)]!,
      helpText: allowedSubjects
        ? `${followUpHelpText ?? ''}${followUpHelpText ? ' ' : ''}Soggetti ammessi: ${allowedSubjects}.`
        : followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'legal_subject_type') {
    const legalRequirement =
      primaryRequirement && primaryRequirement.category === 'legal_subject_type' ? primaryRequirement : null;
    const allowedLegalTypes =
      legalRequirement
        ? summarizeEntries(legalRequirement.normalizedValue.allowedTypes, 6)
        : followUpAllowedSummary(parent, 6);
    const legalQuestionByLevel = [
      'La forma giuridica indicata risulta già registrata nei documenti ufficiali del soggetto richiedente?',
      'La domanda e le spese del progetto saranno intestate alla stessa forma giuridica indicata?',
      'Puoi dimostrare la forma giuridica con visura o atto costitutivo aggiornato?',
      'Non sono previsti cambi di forma giuridica prima della valutazione di ammissibilità?'
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'legal_subject_type',
      priority: followUpPriority,
      blocking: true,
      question: legalQuestionByLevel[Math.min(level, legalQuestionByLevel.length - 1)]!,
      helpText: allowedLegalTypes
        ? `${followUpHelpText ?? ''}${followUpHelpText ? ' ' : ''}Forme ammesse: ${allowedLegalTypes}.`
        : followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'sector') {
    const normalizedParent = normalizeText(parent.question);
    const sectorRequirement =
      primaryRequirement && primaryRequirement.category === 'sector' ? primaryRequirement : null;
    const allowedSectors =
      sectorRequirement
        ? summarizeEntries(
            [
              ...(sectorRequirement.normalizedValue.allowedSectors ?? []),
              ...(sectorRequirement.normalizedValue.allowedAtecoPrefixes ?? []).map(
                (entry) => `ATECO ${entry}`
              )
            ],
            6
          )
        : followUpAllowedSummary(parent, 6);
    const excludedSectors =
      sectorRequirement && (sectorRequirement.normalizedValue.excludedSectors?.length ?? 0) > 0
        ? summarizeEntries(sectorRequirement.normalizedValue.excludedSectors ?? [], 4)
        : null;
    const excludedInline = inlineSafeSummary(excludedSectors);
    const isExclusionParent = /(settori esclusi|cause di esclusione|ostative)/.test(normalizedParent);
    const sectorQuestionByLevel = isExclusionParent
      ? [
          excludedInline
            ? `L'attività non rientra in nessuno dei settori esclusi (${excludedInline})?`
            : "Confermi che l'attività non rientra in nessun settore escluso dal bando?",
          "L'attività prevalente resta fuori dai settori esclusi indicati dal bando?",
          'Il piano operativo evita in modo esplicito attività riconducibili ai settori esclusi?',
          'Puoi documentare che il codice ATECO prevalente non ricade nei settori esclusi?'
        ]
      : [
          'Il codice ATECO prevalente dell’attività corrisponde al settore che hai selezionato?',
          "L'attività prevalente che genera ricavi rientra nel settore selezionato?",
          excludedSectors
            ? `Il progetto evita i settori esclusi indicati dal bando (${excludedSectors})?`
            : 'Il progetto evita linee di attività fuori dal settore selezionato?',
          'Le spese principali del progetto restano coerenti con il settore selezionato?'
        ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'sector',
      priority: followUpPriority,
      blocking: true,
      question: sectorQuestionByLevel[Math.min(level, sectorQuestionByLevel.length - 1)]!,
      helpText: allowedSectors
        ? `${followUpHelpText ?? ''}${followUpHelpText ? ' ' : ''}Settori ammessi: ${allowedSectors}.`
        : followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      intent: isExclusionParent ? 'exclusion_check' : 'evidence',
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'project_type') {
    const projectRequirement =
      primaryRequirement && primaryRequirement.category === 'project_type' ? primaryRequirement : null;
    const allowedProjectTypes =
      projectRequirement
        ? summarizeEntries(projectRequirement.normalizedValue.allowedProjectTypes ?? [], 6)
        : followUpAllowedSummary(parent, 6);
    const excludedProjectTypes =
      projectRequirement && (projectRequirement.normalizedValue.excludedProjectTypes?.length ?? 0) > 0
        ? summarizeEntries(projectRequirement.normalizedValue.excludedProjectTypes ?? [], 4)
        : null;
    const projectQuestionByLevel = [
      'Le spese principali del progetto rientrano nella tipologia ammessa che hai selezionato?',
      'Gli obiettivi del progetto restano coerenti con la tipologia progettuale ammessa?',
      excludedProjectTypes
        ? `Il progetto evita tipologie escluse dal bando (${excludedProjectTypes})?`
        : 'Il progetto evita attività fuori dalla tipologia selezionata?',
      'La candidatura sarà presentata solo con attività coerenti alla tipologia progettuale ammessa?'
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'project_type',
      priority: followUpPriority,
      blocking: true,
      question: projectQuestionByLevel[Math.min(level, projectQuestionByLevel.length - 1)]!,
      helpText: allowedProjectTypes
        ? `${followUpHelpText ?? ''}${followUpHelpText ? ' ' : ''}Tipologie ammesse: ${allowedProjectTypes}.`
        : followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'business_stage') {
    const stageQuestionByLevel = [
      "Alla data di domanda l'impresa sarà già nello stato che hai indicato?",
      "Lo stato dell'impresa sarà documentabile con atto costitutivo o visura alla data di domanda?",
      "La domanda sarà presentata con lo stesso stato d'impresa indicato in precedenza?",
      "Non sono previsti cambi di stato dell'impresa prima della verifica di ammissibilità?"
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'business_stage',
      priority: followUpPriority,
      blocking: true,
      question: stageQuestionByLevel[Math.min(level, stageQuestionByLevel.length - 1)]!,
      helpText: followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'age') {
    const ageQuestionByLevel = [
      "Alla data di domanda l'età del soggetto di riferimento rientrerà nel limite richiesto?",
      "L'età dichiarata sarà la stessa riportata nei documenti anagrafici alla data di invio?",
      "Il soggetto di riferimento manterrà il requisito anagrafico per tutta la fase di ammissibilità?",
      "Puoi confermare che il requisito anagrafico è rispettato senza eccezioni?"
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'age',
      priority: followUpPriority,
      blocking: true,
      question: ageQuestionByLevel[Math.min(level, ageQuestionByLevel.length - 1)]!,
      helpText: followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'employment_status') {
    const employmentRequirement =
      primaryRequirement && primaryRequirement.category === 'employment_status' ? primaryRequirement : null;
    const allowedStatuses =
      employmentRequirement
        ? summarizeEntries(
            (employmentRequirement.normalizedValue.allowedStatuses ?? []).map(mapEmploymentLabel),
            6
          )
        : followUpAllowedSummary(parent, 6);
    const employmentQuestionByLevel = [
      'Alla data di domanda il tuo stato occupazionale corrisponderà a quello richiesto dal bando?',
      'Lo stato occupazionale dichiarato sarà documentabile alla data di presentazione?',
      'Non sono previsti cambi occupazionali che possano rendere non ammissibile la domanda?',
      'Il requisito occupazionale sarà mantenuto fino alla verifica formale della domanda?'
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'employment_status',
      priority: followUpPriority,
      blocking: true,
      question: employmentQuestionByLevel[Math.min(level, employmentQuestionByLevel.length - 1)]!,
      helpText: allowedStatuses
        ? `${followUpHelpText ?? ''}${followUpHelpText ? ' ' : ''}Stati ammessi: ${allowedStatuses}.`
        : followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'financial_threshold') {
    const financialRequirement =
      primaryRequirement && primaryRequirement.category === 'financial_threshold'
        ? primaryRequirement
        : null;
    const min =
      typeof financialRequirement?.normalizedValue.min === 'number'
        ? financialRequirement.normalizedValue.min
        : typeof parent.validation?.min === 'number'
          ? parent.validation.min
          : undefined;
    const max =
      typeof financialRequirement?.normalizedValue.max === 'number'
        ? financialRequirement.normalizedValue.max
        : typeof parent.validation?.max === 'number'
          ? parent.validation.max
          : undefined;
    const normalizedParent = normalizeText(parent.question);
    const metric: FinancialThresholdRequirement['normalizedValue']['metric'] =
      financialRequirement?.normalizedValue.metric ??
      (/dipendent/.test(normalizedParent)
        ? 'employees'
        : /fatturat/.test(normalizedParent)
          ? 'revenue'
          : 'investment');
    const rangeLabel = formatThresholdRange(metric, min, max);
    const metricLabel =
      metric === 'employees' ? 'numero di dipendenti' : metric === 'revenue' ? 'fatturato annuo' : 'importo del progetto';
    const financialQuestion =
      metric === 'employees'
        ? min !== undefined && max !== undefined
          ? `Il numero di dipendenti è compreso tra ${formatCount(min)} e ${formatCount(max)}?`
          : min !== undefined
            ? `Il numero di dipendenti è almeno ${formatCount(min)}?`
            : max !== undefined
              ? `Il numero di dipendenti non supera ${formatCount(max)}?`
              : 'Il numero di dipendenti rientra nella soglia richiesta?'
        : min !== undefined && max !== undefined
          ? `L'importo totale del progetto è compreso tra ${formatCurrency(min)} e ${formatCurrency(max)}?`
          : min !== undefined
            ? `L'importo totale del progetto è almeno ${formatCurrency(min)}?`
          : max !== undefined
              ? `L'importo totale del progetto non supera ${formatCurrency(max)}?`
              : `L'importo totale del progetto rientra nella soglia ${metricLabel} indicata nel bando?`;
    const financialQuestionByLevel = [
      financialQuestion,
      rangeLabel
        ? `Il ${metricLabel} che presenterai in domanda rispetta la soglia ${rangeLabel}?`
        : `Il ${metricLabel} che presenterai in domanda rispetta la soglia indicata nel bando?`,
      rangeLabel
        ? `Le spese principali restano entro la soglia ${rangeLabel} per il ${metricLabel} dichiarato?`
        : `Le spese principali restano entro la soglia del ${metricLabel} indicato nel bando?`,
      rangeLabel
        ? `Confermi che il ${metricLabel} finale resta entro la soglia ${rangeLabel}?`
        : `Confermi che il ${metricLabel} finale resta entro la soglia indicata nel bando?`
    ];
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'financial_threshold',
      priority: followUpPriority,
      blocking: true,
      question: financialQuestionByLevel[Math.min(level, financialQuestionByLevel.length - 1)]!,
      helpText: rangeLabel
        ? `${followUpHelpText ?? ''}${followUpHelpText ? ' ' : ''}Soglia economica: ${rangeLabel}.`
        : followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  if (parent.category === 'other') {
    const normalizedParent = normalizeText(parent.question);
    let question: string | null = null;
    if (/universita|ente di ricerca/.test(normalizedParent)) {
      const options = [
        "La domanda sarà presentata direttamente dall'Università o dall'Ente di ricerca che hai selezionato?",
        "L'Università o l'Ente di ricerca selezionato sosterrà direttamente le spese del progetto?",
        "L'Università o l'Ente di ricerca manterrà questo ruolo per tutta la fase di domanda?",
        "L'Università o l'Ente di ricerca possiede i requisiti amministrativi per firmare la domanda?"
      ];
      question = options[Math.min(level, options.length - 1)]!;
    } else if (/prevalenza femminile|imprenditoria femminile/.test(normalizedParent)) {
      const options = [
        "La composizione societaria mantiene una maggioranza femminile in quote o governance come richiesto dal bando?",
        'La maggioranza femminile risulta confermata nella documentazione societaria aggiornata?',
        "La prevalenza femminile è documentabile con assetto societario o statuto aggiornato?",
        "Non sono previsti cambi societari che possano far perdere la prevalenza femminile?"
      ];
      question = options[Math.min(level, options.length - 1)]!;
    } else if (/prevalenza giovanile|giovani/.test(normalizedParent)) {
      const options = [
        'La composizione societaria mantiene una maggioranza giovanile in quote o governance come richiesto dal bando?',
        'La prevalenza giovanile risulta confermata nella documentazione societaria aggiornata?',
        'La prevalenza giovanile è documentabile con assetto societario o statuto aggiornato?',
        'Non sono previsti cambi societari che possano far perdere la prevalenza giovanile?'
      ];
      question = options[Math.min(level, options.length - 1)]!;
    } else if (/startup innovativ/.test(normalizedParent)) {
      const options = [
        "L'iscrizione nella sezione speciale startup innovativa è già attiva, o sarà completata prima della domanda?",
        "Lo status di startup innovativa risulta già verificabile nella visura aggiornata?",
        "Lo status di startup innovativa è documentabile con visura o attestazione aggiornata?",
        "Non sono previsti cambi societari che possano far decadere lo status di startup innovativa?"
      ];
      question = options[Math.min(level, options.length - 1)]!;
    } else if (/sede operativa|sede legale|residenza|territor/.test(normalizedParent)) {
      const territoryLabel = localUnitTerritoryLabelFromExcerpt(sourceExcerpt);
      const options = [
        `La sede indicata è ${territoryLabel} e sarà quella usata nella domanda?`,
        `La sede indicata ${territoryLabel} coincide con quella su cui saranno imputate le spese?`,
        `La sede indicata ${territoryLabel} sarà attiva prima della presentazione della domanda?`,
        `La sede indicata ${territoryLabel} sarà mantenuta fino alla verifica di ammissibilità?`
      ];
      question = options[Math.min(level, options.length - 1)]!;
    }
    if (!question) return null;
    return {
      id: nextFollowUpId(parent.id),
      requirementIds: parent.requirementIds,
      category: 'other',
      priority: followUpPriority,
      blocking: true,
      question,
      helpText: followUpHelpText,
      answerType: 'single_choice_yes_no',
      options: yesNoOptions(),
      disqualifyIf: ['no'],
      sourceExcerpt,
      showIf: baseShowIf,
      validatorFlags: {
        grounded: false,
        territorySafe: false,
        explicitEnough: false,
        nonGeneric: false,
        nonDuplicate: false,
        askable: false,
        benchmarkDepth: false
      }
    };
  }

  return null;
}

function buildEvidenceFollowUpQuestion(
  parent: VerificationQuestion,
  level: number
): VerificationQuestion | null {
  const allowedAnswers = allowedAnswerValuesForFollowUp(parent);
  const showIf =
    allowedAnswers.length > 0
      ? {
          questionId: parent.id,
          anyOf: allowedAnswers
        }
      : undefined;
  const id = `${parent.id}_evidence${level}`;
  const helpText = parent.sourceExcerpt ? `Fonte bando: ${clip(parent.sourceExcerpt, 170)}` : parent.helpText;

  const byCategory: Record<QuestionCategory, string[]> = {
    territory: [
      'Puoi documentare la localizzazione della sede indicata con visura o titolo di disponibilità?',
      'Le spese del progetto saranno imputate alla sede localizzata nel territorio ammesso?',
      'La documentazione della sede/localizzazione è già pronta per la presentazione della domanda?'
    ],
    beneficiary: [
      'Il soggetto beneficiario selezionato firmerà la domanda e sosterrà le spese ammissibili?',
      'Il soggetto beneficiario indicato è quello formalmente abilitato a presentare la domanda?',
      'Puoi confermare che il beneficiario indicato è quello su cui verrà intestata l’agevolazione?'
    ],
    legal_subject_type: [
      'Puoi documentare con visura o atto costitutivo la forma giuridica selezionata?',
      'La forma giuridica selezionata coincide con quella registrata alla data di domanda?',
      'La forma giuridica selezionata coincide con quella che presenterà la domanda?'
    ],
    business_stage: [
      "Lo stato dell'impresa indicato sarà dimostrabile con documentazione alla data di domanda?",
      "La data di costituzione/stato impresa risulta verificabile con documenti ufficiali aggiornati?",
      "La candidatura sarà presentata mantenendo lo stesso stadio d'impresa indicato?"
    ],
    sector: [
      'Puoi documentare il codice ATECO prevalente coerente con il settore selezionato?',
      'Le attività e le spese principali ricadono nel settore selezionato in base al piano progetto?',
      'Il settore selezionato coincide con l’attività prevalente su cui chiedi il contributo?'
    ],
    project_type: [
      'Il progetto sarà rendicontato solo su attività coerenti con la tipologia selezionata?',
      'La documentazione tecnica del progetto è allineata alla tipologia progettuale scelta?',
      'Il piano operativo mantiene la tipologia progettuale selezionata fino all’invio domanda?'
    ],
    age: [
      'Puoi documentare il requisito anagrafico con i documenti identificativi richiesti?',
      'Il requisito anagrafico risulta rispettato alla data prevista dal bando per la domanda?',
      'Il requisito anagrafico indicato è già verificabile in modo univoco?'
    ],
    employment_status: [
      'Puoi documentare lo stato occupazionale richiesto con evidenze aggiornate?',
      'Lo stato occupazionale indicato risulta coerente anche alla data di presentazione della domanda?',
      'La domanda sarà inviata mantenendo lo stato occupazionale dichiarato?'
    ],
    exclusion: [
      'Puoi confermare che non ricadi in cause di esclusione durante tutta l’istruttoria?',
      'Puoi documentare l’assenza di cause ostative richieste dal bando?',
      'Le condizioni di ammissibilità resteranno prive di esclusioni fino all’esito?'
    ],
    financial_threshold: [
      'Puoi documentare il valore economico dichiarato con piano costi coerente?',
      'Il valore economico indicato rientra nelle soglie anche nel quadro finale dei costi?',
      'Le voci di spesa principali confermano il rispetto della soglia economica richiesta?'
    ],
    other: [
      'Puoi documentare in modo puntuale il requisito specifico selezionato?',
      'Il requisito specifico indicato risulta verificabile con la documentazione richiesta dal bando?',
      'La candidatura sarà presentata rispettando integralmente il requisito specifico selezionato?'
    ]
  };

  const templates = byCategory[parent.category] ?? byCategory.other;
  const question = templates[Math.min(Math.max(level - 1, 0), templates.length - 1)] ?? null;
  if (!question) return null;

  return {
    id,
    requirementIds: parent.requirementIds,
    category: parent.category,
    priority: Number((parent.priority + 0.6 + level * 0.01).toFixed(3)),
    blocking: true,
    question,
    helpText,
    answerType: 'single_choice_yes_no',
    options: yesNoOptions(),
    disqualifyIf: ['no'],
    intent: 'evidence',
    sourceExcerpt: parent.sourceExcerpt,
    showIf,
    validatorFlags: {
      grounded: false,
      territorySafe: false,
      explicitEnough: false,
      nonGeneric: false,
      nonDuplicate: false,
      askable: false,
      benchmarkDepth: false
    }
  };
}

function calibratePlanQuestionDepth(
  questions: VerificationQuestion[],
  requirements: GenericRequirement[]
): VerificationQuestion[] {
  const minDepth = expectedMinimumDepth(requirements);
  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const coveredRequirementIds = new Set(questions.flatMap((item) => item.requirementIds));
  const existingFingerprints = new Set(questions.map((item) => normalizeQuestionFingerprint(item)));
  const existingIds = new Set(questions.map((item) => item.id));
  const expansionContext = buildDepthExpansionContext(requirements);
  const additions: VerificationQuestion[] = [];
  const decisiveCategories = new Set<QuestionCategory>(
    requirements
      .filter((item) => item.askable && (item.importance === 'critical' || item.importance === 'high'))
      .map((item) => mapRequirementCategoryToDecisionDimension(item.category))
  );
  decisiveCategories.add('project_type');
  const ranked = requirements
    .filter((item) => item.askable)
    .slice()
    .sort((a, b) => {
      const impRank = (value: RequirementImportance) =>
        value === 'critical' ? 0 : value === 'high' ? 1 : value === 'medium' ? 2 : 3;
      const diff = impRank(a.importance) - impRank(b.importance);
      if (diff !== 0) return diff;
      if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
      return b.confidence - a.confidence;
    });

  if (questions.length < minDepth) {
    for (const requirement of ranked) {
      if (!requirement.askable) continue;
      if (coveredRequirementIds.has(requirement.id)) continue;
      const generated = buildQuestionForRequirement(
        requirement,
        questions.length + additions.length + 1,
        expansionContext
      );
      for (const candidate of generated) {
        if (existingIds.has(candidate.id)) continue;
        const fingerprint = normalizeQuestionFingerprint(candidate);
        if (existingFingerprints.has(fingerprint)) continue;
        additions.push(candidate);
        existingIds.add(candidate.id);
        existingFingerprints.add(fingerprint);
      }
      if (questions.length + additions.length >= minDepth) break;
    }
  }

  const followUpEligible = new Set<QuestionCategory>([
    'beneficiary',
    'territory',
    'legal_subject_type',
    'business_stage',
    'sector',
    'project_type',
    'age',
    'employment_status',
    'financial_threshold',
    'other'
  ]);

  const appendFollowUpsFrom = (parents: VerificationQuestion[]) => {
    for (const parent of parents) {
      if (!followUpEligible.has(parent.category)) continue;
      if (!decisiveCategories.has(parent.category)) continue;
      const currentPool = [...questions, ...additions];
      const parentScope = questionBranchScope(parent);
      const sameScopeSiblings = currentPool.filter(
        (candidate) =>
          candidate.category === parent.category && questionBranchScope(candidate) === parentScope
      );
      const evidenceLikeCount = sameScopeSiblings.filter(
        (candidate) =>
          resolveQuestionIntent(candidate) === 'evidence' || resolveQuestionIntent(candidate) === 'exclusion_check'
      ).length;
      if (evidenceLikeCount >= 2) continue;
      const parentQuestionNormalized = normalizeText(parent.question);
      if (
        resolveQuestionIntent(parent) === 'evidence' &&
        /(restera valida|sar[aà] valida|conferm|documentabile)/.test(parentQuestionNormalized)
      ) {
        continue;
      }
      const hasDepthChild = [...questions, ...additions].some(
        (candidate) =>
          candidate.showIf?.questionId === parent.id &&
          /_depth\d+(?:$|_)/.test(candidate.id)
      );
      if (hasDepthChild) continue;
      const candidate = buildDepthClarificationQuestion(
        parent,
        questions.length + additions.length + 1,
        requirementsById
      );
      if (!candidate) continue;
      if (existingIds.has(candidate.id)) continue;
      const fingerprint = normalizeQuestionFingerprint(candidate);
      if (existingFingerprints.has(fingerprint)) continue;
      additions.push(candidate);
      existingIds.add(candidate.id);
      existingFingerprints.add(fingerprint);
    }
  };

  appendFollowUpsFrom(questions);

  if (questions.length + additions.length < minDepth) {
    let guard = 0;
    while (questions.length + additions.length < minDepth && guard < 4) {
      const snapshot = [...questions, ...additions].sort((a, b) => a.priority - b.priority);
      let expanded = false;
      for (const parent of snapshot) {
        if (!decisiveCategories.has(parent.category)) continue;
        const parentQuestionNormalized = normalizeText(parent.question);
        if (
          resolveQuestionIntent(parent) === 'evidence' &&
          /(restera valida|sar[aà] valida|conferm|documentabile)/.test(parentQuestionNormalized)
        ) {
          continue;
        }
        const candidate = buildDepthClarificationQuestion(
          parent,
          questions.length + additions.length + 1,
          requirementsById
        );
        if (!candidate) continue;
        if (existingIds.has(candidate.id)) continue;
        const fingerprint = normalizeQuestionFingerprint(candidate);
        if (existingFingerprints.has(fingerprint)) continue;
        additions.push(candidate);
        existingIds.add(candidate.id);
        existingFingerprints.add(fingerprint);
        expanded = true;
        if (questions.length + additions.length >= minDepth) break;
      }
      if (!expanded) break;
      guard += 1;
    }
  }

  return [...questions, ...additions];
}

function collectAllowedTerritoryTokens(requirements: GenericRequirement[]) {
  const tokens = new Set<string>();
  requirements
    .filter((item): item is TerritoryRequirement => item.category === 'territory')
    .forEach((item) => {
      item.normalizedValue.regions.forEach((value) => tokens.add(normalizeText(value)));
      item.normalizedValue.provinces.forEach((value) => tokens.add(normalizeText(value)));
      item.normalizedValue.municipalities.forEach((value) => tokens.add(normalizeText(value)));
    });
  return tokens;
}

function territoryLabel(place: { type: 'regione' | 'provincia' | 'comune'; label: string }) {
  if (place.type === 'regione') return place.label;
  return `${capitalize(place.type)} di ${place.label}`;
}

function extractTerritoryMentions(text: string) {
  const mentions: Array<{ type: 'region' | 'province' | 'municipality'; value: string }> = [];
  const normalized = normalizeText(text);
  ITALIAN_REGIONS.forEach((region) => {
    if (containsNormalizedToken(normalized, normalizeText(region))) {
      mentions.push({ type: 'region', value: region });
    }
  });
  const provinceMatches = text.matchAll(/provincia di\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})(?=[,.;?]|$)/gi);
  for (const match of provinceMatches) {
    const province = String(match[1] ?? '').replace(/\s+/g, ' ').trim();
    if (province) mentions.push({ type: 'province', value: province });
  }
  const municipalityMatches = text.matchAll(/comune di\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})(?=[,.;?]|$)/gi);
  for (const match of municipalityMatches) {
    const municipality = String(match[1] ?? '').replace(/\s+/g, ' ').trim();
    if (municipality) mentions.push({ type: 'municipality', value: municipality });
  }
  return mentions;
}

export function validateGrounding(
  question: VerificationQuestion,
  requirementsById: Map<string, GenericRequirement>
): ValidationResult {
  const reasons: string[] = [];
  if (!Array.isArray(question.requirementIds) || question.requirementIds.length === 0) {
    reasons.push('missing_requirement_ids');
  }
  if (!question.sourceExcerpt || normalizeText(question.sourceExcerpt).length < 6) {
    reasons.push('missing_source_excerpt');
  }
  question.requirementIds.forEach((id) => {
    if (!requirementsById.has(id)) reasons.push(`unknown_requirement:${id}`);
  });
  return { ok: reasons.length === 0, reasons };
}

export function validateTerritorySafety(
  question: VerificationQuestion,
  requirements: GenericRequirement[]
): ValidationResult {
  const reasons: string[] = [];
  const optionText = (question.options ?? []).map((opt) => opt.label).join('; ');
  const userFacingText = normalizeText(`${question.question} ${optionText}`.trim());
  const territorySignalInQuestion =
    /(regione|provincia|comune|sede operativa|sede legale|residenz|territor|localizzazion)/.test(
      userFacingText
    );
  const text =
    question.category === 'territory'
      ? normalizeText(`${question.question} ${question.helpText ?? ''} ${optionText}`.trim())
      : userFacingText;
  const allowedTokens = collectAllowedTerritoryTokens(requirements);
  const mentionedRegions = ITALIAN_REGIONS.filter((region) =>
    containsNormalizedToken(text, normalizeText(region))
  );
  const mentions = extractTerritoryMentions(text);

  // For non-territory questions, ignore incidental location mentions present only in source excerpts/help text.
  if (question.category !== 'territory' && !territorySignalInQuestion) {
    return { ok: true, reasons: [] };
  }

  if (question.category === 'territory' && allowedTokens.size === 0) {
    reasons.push('territory_question_without_allowed_scope');
  }

  for (const region of mentionedRegions) {
    if (!allowedTokens.has(normalizeText(region))) {
      reasons.push(`unknown_territory_mention:${region}`);
    }
  }

  for (const mention of mentions) {
    if (!allowedTokens.has(normalizeText(mention.value))) {
      reasons.push(`unknown_${mention.type}:${mention.value}`);
    }
  }

  if (question.category === 'territory' && allowedTokens.size > 0) {
    const mentionsAllowed = Array.from(allowedTokens).some((token) => containsNormalizedToken(text, token));
    if (!mentionsAllowed) {
      reasons.push('territory_missing_explicit_location');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function validateExplicitness(question: VerificationQuestion): ValidationResult {
  const reasons: string[] = [];
  const text = normalizeText(question.question);
  if (!text || text.length < 12) {
    reasons.push('too_short');
  }
  if (/(requisiti|criteri|condizioni)/.test(text) && !/[0-9]|"|'|:/.test(text)) {
    reasons.push('meta_without_concrete_condition');
  }
  if (!/\?/.test(question.question)) {
    reasons.push('missing_question_mark');
  }
  if (/territorio indicato dal bando/.test(text)) {
    reasons.push('vague_territory_reference');
  }
  if (/area ammessa/.test(text)) {
    const mentions = extractTerritoryMentions(question.question);
    if (mentions.length === 0) {
      reasons.push('vague_territory_reference');
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function containsForbiddenGenericLanguage(text: string) {
  return GENERIC_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateNonGenericLanguage(question: VerificationQuestion): ValidationResult {
  const reasons: string[] = [];
  const text = normalizeText(`${question.question} ${question.helpText ?? ''}`);
  if (containsForbiddenGenericLanguage(text)) {
    reasons.push('forbidden_generic_pattern');
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateBenchmarkDepth(
  question: VerificationQuestion,
  requirementsById: Map<string, GenericRequirement>
): ValidationResult {
  const reasons: string[] = [];
  const requirement = requirementsById.get(question.requirementIds?.[0] ?? '');
  const text = normalizeText(`${question.question} ${question.helpText ?? ''}`);
  const pattern = BENCHMARK_PATTERNS.find((entry) => entry.category === question.category);

  if (pattern?.requiredHint && !pattern.requiredHint.test(text)) {
    // Allow option-based explicitness when text is concise
    const optionText = (question.options ?? []).map((opt) => opt.label).join(' ');
    if (!pattern.requiredHint.test(normalizeText(optionText))) {
      if (question.category !== 'territory') {
        reasons.push('benchmark_depth_missing_hint');
      }
    }
  }

  if (question.category === 'beneficiary' && requirement && requirement.category === 'beneficiary') {
    const allowed = requirement.normalizedValue.allowedSubjects.map((s) => normalizeText(s));
    const optionText = normalizeText((question.options ?? []).map((opt) => opt.label).join(' '));
    const hasAllowed =
      allowed.length === 0 ||
      allowed.some((token) => token && (text.includes(token) || optionText.includes(token)));
    if (!hasAllowed) {
      reasons.push('benchmark_beneficiary_not_explicit');
    }
  }

  if (question.category === 'project_type' && requirement && requirement.category === 'project_type') {
    const allowed = requirement.normalizedValue.allowedProjectTypes ?? [];
    if (allowed.length > 0) {
      const optionText = normalizeText((question.options ?? []).map((opt) => opt.label).join(' '));
      const hasAllowed = allowed.some((token) => {
        const normalizedToken = normalizeText(token);
        return optionText.includes(normalizedToken) || text.includes(normalizedToken);
      });
      if (!hasAllowed) reasons.push('benchmark_project_type_not_explicit');
    }
  }

  if (question.category === 'territory' && requirement && requirement.category === 'territory') {
    const tokens = [
      ...requirement.normalizedValue.regions,
      ...requirement.normalizedValue.provinces,
      ...requirement.normalizedValue.municipalities
    ]
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
    if (tokens.length > 0) {
      const optionText = normalizeText((question.options ?? []).map((opt) => opt.label).join(' '));
      const hasToken = tokens.some((token) => text.includes(token) || optionText.includes(token));
      if (!hasToken) reasons.push('benchmark_territory_not_explicit');
    }
  }

  if (question.category === 'financial_threshold') {
    if (!/(investiment|fatturat|dipendent|ammontare)/i.test(question.question)) {
      reasons.push('benchmark_financial_not_explicit');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function validateAskability(
  question: VerificationQuestion,
  requirementsById: Map<string, GenericRequirement>
): ValidationResult {
  const reasons: string[] = [];
  const linkedRequirements = question.requirementIds
    .map((id) => requirementsById.get(id))
    .filter((item): item is GenericRequirement => Boolean(item));
  if (linkedRequirements.length === 0) {
    reasons.push('no_linked_requirement');
  }
  if (linkedRequirements.some((requirement) => !requirement.askable)) {
    reasons.push('linked_requirement_not_askable');
  }
  if (question.answerType === 'text' && question.blocking) {
    reasons.push('blocking_text_not_self_declarable');
  }
  return { ok: reasons.length === 0, reasons };
}

function resolveQuestionIntent(question: VerificationQuestion): QuestionIntent {
  if (question.intent) return question.intent;
  const normalized = normalizeText(question.question);
  if (
    question.category === 'exclusion' ||
    /settori esclusi|cause di esclusione|ostative|non rientra nelle esclusioni/.test(normalized)
  ) {
    return 'exclusion_check';
  }
  if (/_depth\d+/.test(question.id) || /document|restera valida|sar[aà] valida|conferm/.test(normalized)) {
    return 'evidence';
  }
  if (question.informativeOnly || question.answerType === 'text') {
    return 'qualification';
  }
  return 'gate';
}

function questionBranchScope(question: VerificationQuestion) {
  if (!question.showIf) return 'root';
  const anyOf = (question.showIf.anyOf ?? []).slice().sort().map((value) => normalizeText(value));
  const noneOf = (question.showIf.noneOf ?? []).slice().sort().map((value) => normalizeText(value));
  const equals = question.showIf.equals ? normalizeText(question.showIf.equals) : '';
  return `${question.showIf.questionId}|any:${anyOf.join(',')}|eq:${equals}|none:${noneOf.join(',')}`;
}

function questionTokenSet(question: VerificationQuestion) {
  const raw = normalizeText(`${question.question} ${(question.options ?? []).map((opt) => opt.label).join(' ')}`);
  return new Set(
    raw
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter(
        (token) =>
          ![
            'della',
            'delle',
            'degli',
            'dello',
            'dall',
            'alla',
            'alle',
            'questo',
            'quella',
            'quello',
            'bando',
            'requisito',
            'requisiti',
            'sar',
            'restera',
            'valida',
            'domanda'
          ].includes(token)
      )
  );
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function addsMeaningfulInformation(
  candidate: VerificationQuestion,
  existing: VerificationQuestion
) {
  if (candidate.category !== existing.category) return true;
  const candidateReq = new Set(candidate.requirementIds);
  const existingReq = new Set(existing.requirementIds);
  const candidateHasNewRequirement = Array.from(candidateReq).some((id) => !existingReq.has(id));
  if (candidateHasNewRequirement) return true;

  const candidateOptions = (candidate.options ?? []).length;
  const existingOptions = (existing.options ?? []).length;
  if (candidateOptions > existingOptions + 1) return true;

  const candidateTokens = questionTokenSet(candidate);
  const existingTokens = questionTokenSet(existing);
  const overlap = tokenOverlapRatio(candidateTokens, existingTokens);
  if (overlap < 0.72) return true;

  const normalizedCandidate = normalizeText(candidate.question);
  const normalizedExisting = normalizeText(existing.question);
  const candidateWeak = /(restera valida|sar[aà] valida|conferm|documentabile)/.test(normalizedCandidate);
  const existingWeak = /(restera valida|sar[aà] valida|conferm|documentabile)/.test(normalizedExisting);
  if (candidateWeak && existingWeak) return false;

  return false;
}

export function validateNoDuplicate(
  question: VerificationQuestion,
  acceptedQuestions: VerificationQuestion[]
): ValidationResult {
  const reasons: string[] = [];
  const fingerprint = normalizeText(question.question);
  const overlapRequirementKey = question.requirementIds.slice().sort().join('|');
  const showIfKey = question.showIf
    ? `${question.showIf.questionId}|${(question.showIf.anyOf ?? []).slice().sort().join(',')}|${question.showIf.equals ?? ''}|${(question.showIf.noneOf ?? []).slice().sort().join(',')}`
    : '';
  const optionsKey = (question.options ?? [])
    .map((option) => `${normalizeText(option.value)}:${normalizeText(option.label)}`)
    .sort()
    .join('|');
  for (const existing of acceptedQuestions) {
    const existingFingerprint = normalizeText(existing.question);
    const existingShowIfKey = existing.showIf
      ? `${existing.showIf.questionId}|${(existing.showIf.anyOf ?? []).slice().sort().join(',')}|${existing.showIf.equals ?? ''}|${(existing.showIf.noneOf ?? []).slice().sort().join(',')}`
      : '';
    const existingOptionsKey = (existing.options ?? [])
      .map((option) => `${normalizeText(option.value)}:${normalizeText(option.label)}`)
      .sort()
      .join('|');
    if (
      fingerprint === existingFingerprint &&
      question.category === existing.category &&
      question.answerType === existing.answerType &&
      showIfKey === existingShowIfKey &&
      optionsKey === existingOptionsKey &&
      overlapRequirementKey === existing.requirementIds.slice().sort().join('|')
    ) {
      reasons.push('same_question_text');
    }
    if (
      overlapRequirementKey &&
      overlapRequirementKey === existing.requirementIds.slice().sort().join('|') &&
      question.category === existing.category
    ) {
      const bothUnconditional = !question.showIf && !existing.showIf;
      const sameVisibilityClause = showIfKey === existingShowIfKey;
      if (bothUnconditional || sameVisibilityClause) {
        reasons.push('same_requirement_overlap');
      }
    }
    const sameIntent =
      resolveQuestionIntent(question) === resolveQuestionIntent(existing) &&
      question.category === existing.category &&
      questionBranchScope(question) === questionBranchScope(existing);
    if (sameIntent && !addsMeaningfulInformation(question, existing)) {
      reasons.push('semantic_redundancy_same_intent_scope');
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateQuestions(
  questions: VerificationQuestion[],
  requirements: GenericRequirement[]
): VerificationQuestion[] {
  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const accepted: VerificationQuestion[] = [];

  for (const question of questions) {
    const grounding = validateGrounding(question, requirementsById);
    const territory = validateTerritorySafety(question, requirements);
    const explicitness = validateExplicitness(question);
    const nonGeneric = validateNonGenericLanguage(question);
    const benchmarkDepth = validateBenchmarkDepth(question, requirementsById);
    const askability = validateAskability(question, requirementsById);
    const duplicate = validateNoDuplicate(question, accepted);

    question.validatorFlags = {
      grounded: grounding.ok,
      territorySafe: territory.ok,
      explicitEnough: explicitness.ok,
      nonGeneric: nonGeneric.ok,
      askable: askability.ok,
      nonDuplicate: duplicate.ok,
      benchmarkDepth: benchmarkDepth.ok
    };

    if (
      !grounding.ok ||
      !territory.ok ||
      !explicitness.ok ||
      !nonGeneric.ok ||
      !benchmarkDepth.ok ||
      !askability.ok ||
      !duplicate.ok
    ) {
      continue;
    }

    accepted.push(question);
  }

  return accepted;
}

function normalizeQuestionFingerprint(question: VerificationQuestion) {
  const requirementKey = question.requirementIds.slice().sort().join('|');
  const showIf = question.showIf
    ? `${question.showIf.questionId}|${(question.showIf.anyOf ?? []).slice().sort().join(',')}|${question.showIf.equals ?? ''}|${(question.showIf.noneOf ?? []).slice().sort().join(',')}`
    : '';
  const optionsKey = (question.options ?? [])
    .map((option) => `${normalizeText(option.value)}:${normalizeText(option.label)}`)
    .sort()
    .join('|');
  return `${question.category}:${normalizeText(question.question)}:${question.answerType}:${requirementKey}:${showIf}:${optionsKey}`;
}

export function deduplicateQuestions(questions: VerificationQuestion[]): VerificationQuestion[] {
  const deduped = new Map<string, VerificationQuestion>();
  for (const question of questions) {
    const key = normalizeQuestionFingerprint(question);
    if (!deduped.has(key)) {
      deduped.set(key, question);
    }
  }
  return Array.from(deduped.values());
}

function pruneSemanticRedundantQuestions(questions: VerificationQuestion[]): VerificationQuestion[] {
  const ordered = questions.slice().sort((a, b) => a.priority - b.priority);
  const kept: VerificationQuestion[] = [];
  const byScopeIntent = new Map<string, VerificationQuestion[]>();

  for (const question of ordered) {
    const intent = resolveQuestionIntent(question);
    const scope = questionBranchScope(question);
    const key = `${question.category}:${intent}:${scope}`;
    const existing = byScopeIntent.get(key) ?? [];
    const redundant = existing.some((item) => !addsMeaningfulInformation(question, item));
    if (redundant) continue;
    kept.push(question);
    existing.push(question);
    byScopeIntent.set(key, existing);
  }

  return kept;
}

function isQuestionVisibleByAnswers(question: VerificationQuestion, answers: Record<string, string>) {
  const showIf = question.showIf;
  if (!showIf) return true;
  const parentAnswer = normalizeText(answers[showIf.questionId] ?? '');
  if (!parentAnswer) return false;
  if (showIf.equals && normalizeText(showIf.equals) !== parentAnswer) return false;
  if (showIf.anyOf && showIf.anyOf.length > 0) {
    const any = showIf.anyOf.map((entry) => normalizeText(entry));
    if (!any.includes(parentAnswer)) return false;
  }
  if (showIf.noneOf && showIf.noneOf.length > 0) {
    const none = showIf.noneOf.map((entry) => normalizeText(entry));
    if (none.includes(parentAnswer)) return false;
  }
  return true;
}

export type ActiveBranchState = {
  resolvedRequirementIds: Set<string>;
  answeredCategories: Set<QuestionCategory>;
  resolvedDecisiveDimensions: Set<QuestionCategory>;
  unresolvedDecisiveDimensions: Set<QuestionCategory>;
  inferredTags: Set<string>;
  applicantNature: 'unknown' | 'persona_fisica' | 'impresa' | 'universita_ricerca' | 'rete_consortio' | 'altro';
  inferredBusinessStage: 'unknown' | 'not_yet_constituted' | 'already_constituted';
  startupApplicability: 'unknown' | 'required' | 'excluded';
  territoryMode: 'unknown' | 'residence' | 'operating_site' | 'registered_office' | 'generic';
  legalCompatibility: 'unknown' | 'compatible' | 'incompatible';
  remainingProfiles: Set<string>;
};

function inferBranchState(
  answers: Record<string, string>,
  byId: Map<string, VerificationQuestion>,
  allQuestions: VerificationQuestion[]
): ActiveBranchState {
  const inferredTags = new Set<string>();
  const resolvedRequirementIds = new Set<string>();
  const answeredCategories = new Set<QuestionCategory>();
  let inferredBusinessStage: ActiveBranchState['inferredBusinessStage'] = 'unknown';
  let applicantNature: ActiveBranchState['applicantNature'] = 'unknown';
  let startupApplicability: ActiveBranchState['startupApplicability'] = 'unknown';
  let territoryMode: ActiveBranchState['territoryMode'] = 'unknown';
  let legalCompatibility: ActiveBranchState['legalCompatibility'] = 'unknown';

  for (const [questionId, rawAnswer] of Object.entries(answers)) {
    const question = byId.get(questionId);
    if (!question) continue;
    question.requirementIds.forEach((id) => resolvedRequirementIds.add(id));
    answeredCategories.add(question.category);
    const answer = normalizeText(rawAnswer);

    if (/femminil|donn/.test(answer)) inferredTags.add('gender_composition');
    if (/giovan|under/.test(answer)) inferredTags.add('youth_composition');
    if (/startup[_\s-]*innovativ|innovativ/.test(answer)) inferredTags.add('startup_status');
    if (/universita|ente_di_ricerca|ente di ricerca/.test(answer)) applicantNature = 'universita_ricerca';
    else if (/rete|consorz|ats|ati/.test(answer)) applicantNature = 'rete_consortio';
    else if (/persona_fisica|persona fisica|aspirant|nuova_attivita/.test(answer)) applicantNature = 'persona_fisica';
    else if (/impresa|azienda|pmi|startup/.test(answer)) applicantNature = 'impresa';
    else if (answer) applicantNature = applicantNature === 'unknown' ? 'altro' : applicantNature;
    if (/impresa_da_costituire|nuova_attivita|persona_fisica/.test(answer)) {
      inferredBusinessStage = 'not_yet_constituted';
    }
    if (/impresa_gia_attiva|azienda_gia_attiva/.test(answer)) {
      inferredBusinessStage = 'already_constituted';
    }
    if (question.category === 'business_stage' && answer === 'yes') {
      if (/not_yet_constituted|new_initiative|initiative_stage/.test(question.id)) {
        inferredBusinessStage = 'not_yet_constituted';
      } else if (/already_constituted|existing_business/.test(question.id)) {
        inferredBusinessStage = 'already_constituted';
      }
    }
    if (question.category === 'territory') {
      const text = normalizeText(question.question);
      if (/resiede/.test(text)) territoryMode = 'residence';
      else if (/sede operativa/.test(text)) territoryMode = 'operating_site';
      else if (/sede legale/.test(text)) territoryMode = 'registered_office';
      else territoryMode = 'generic';
    }
    if (/q_startup_status/.test(question.id)) {
      startupApplicability = answer === 'yes' ? 'required' : 'excluded';
    }
    if (question.category === 'legal_subject_type' && answer) {
      legalCompatibility = /altro_non_ammesso|no/.test(answer) ? 'incompatible' : 'compatible';
    }
  }

  const decisiveUniverse = new Set<QuestionCategory>(
    allQuestions
      .filter((question) => question.blocking || question.category === 'project_type')
      .map((question) => question.category)
  );
  const resolvedDecisiveDimensions = new Set<QuestionCategory>(
    Array.from(answeredCategories).filter((category) => decisiveUniverse.has(category))
  );
  const unresolvedDecisiveDimensions = new Set<QuestionCategory>(
    Array.from(decisiveUniverse).filter((category) => !resolvedDecisiveDimensions.has(category))
  );
  const remainingProfiles = new Set<string>();
  const beneficiaryQuestion = allQuestions.find((question) => question.category === 'beneficiary');
  if (beneficiaryQuestion) {
    const answer = normalizeText(answers[beneficiaryQuestion.id] ?? '');
    if (answer) {
      remainingProfiles.add(answer);
    } else {
      (beneficiaryQuestion.options ?? []).forEach((option) => remainingProfiles.add(normalizeText(option.value)));
    }
  }

  return {
    resolvedRequirementIds,
    answeredCategories,
    resolvedDecisiveDimensions,
    unresolvedDecisiveDimensions,
    inferredTags,
    applicantNature,
    inferredBusinessStage,
    startupApplicability,
    territoryMode,
    legalCompatibility,
    remainingProfiles
  };
}

function inferQuestionTag(question: VerificationQuestion) {
  if (/q_gender/.test(question.id)) return 'gender_composition';
  if (/q_youth/.test(question.id)) return 'youth_composition';
  if (/q_startup_status/.test(question.id)) return 'startup_status';
  return null;
}

function isQuestionRedundantForState(
  question: VerificationQuestion,
  state: ActiveBranchState,
  answers: Record<string, string>
) {
  if (answers[question.id] !== undefined) return true;
  const isActiveFollowUp = Boolean(question.showIf?.questionId && answers[question.showIf.questionId] !== undefined);
  if (
    !isActiveFollowUp &&
    question.requirementIds.length > 0 &&
    question.requirementIds.every((id) => state.resolvedRequirementIds.has(id))
  ) {
    return true;
  }
  const tag = inferQuestionTag(question);
  if (tag && state.inferredTags.has(tag)) return true;

  if (question.category === 'business_stage' && state.inferredBusinessStage !== 'unknown') {
    if (state.inferredBusinessStage === 'not_yet_constituted' && /already_constituted|existing_business/.test(question.id)) {
      return true;
    }
    if (state.inferredBusinessStage === 'already_constituted' && /not_yet_constituted|new_initiative/.test(question.id)) {
      return true;
    }
  }

  if (
    question.category === 'legal_subject_type' &&
    (state.applicantNature === 'universita_ricerca' || state.applicantNature === 'rete_consortio')
  ) {
    return true;
  }

  if (question.category === 'other' && /q_startup_status/.test(question.id) && state.startupApplicability === 'excluded') {
    return true;
  }

  if (state.answeredCategories.has(question.category) && !question.blocking) {
    const text = normalizeText(question.question);
    if (/seleziona il tuo profilo|tipo di progetto|qual e il settore/.test(text)) {
      return true;
    }
  }

  if (question.showIf?.questionId && answers[question.showIf.questionId] !== undefined) {
    const answeredIds = Object.keys(answers);
    const latestAnsweredId = answeredIds.length > 0 ? answeredIds[answeredIds.length - 1] : '';
    if (
      question.showIf.questionId !== latestAnsweredId &&
      /(applicant_nature|initiative_stage)/.test(question.id)
    ) {
      return true;
    }
  }

  return false;
}

function branchValidityScore(question: VerificationQuestion, state: ActiveBranchState) {
  let score = 0;
  if (question.category === 'legal_subject_type') {
    if (state.applicantNature === 'universita_ricerca' || state.applicantNature === 'rete_consortio') {
      return -100;
    }
    score += 8;
  }
  if (question.category === 'business_stage') {
    if (state.inferredBusinessStage === 'not_yet_constituted' && /already_constituted|existing_business/.test(question.id)) {
      return -100;
    }
    if (state.inferredBusinessStage === 'already_constituted' && /not_yet_constituted|new_initiative/.test(question.id)) {
      return -100;
    }
    score += 6;
  }
  if (/q_startup_status/.test(question.id)) {
    if (state.startupApplicability === 'excluded') return -100;
    if (state.startupApplicability === 'required') score -= 10;
    else score += 8;
  }
  return score;
}

function informationGainScore(question: VerificationQuestion) {
  const optionsCount = question.options?.length ?? (question.answerType === 'single_choice_yes_no' ? 2 : 0);
  if (optionsCount <= 1) return 2;
  if (optionsCount === 2) return 8;
  if (optionsCount <= 5) return 14;
  if (optionsCount <= 12) return 16;
  return 12;
}

function decisionImpactScore(question: VerificationQuestion) {
  let score = 0;
  if (question.blocking) score += 18;
  if ((question.disqualifyIf?.length ?? 0) > 0) score += 10;
  if (
    question.category === 'territory' ||
    question.category === 'beneficiary' ||
    question.category === 'business_stage' ||
    question.category === 'legal_subject_type'
  ) {
    score += 8;
  }
  return score;
}

function semanticSpecificityScore(question: VerificationQuestion) {
  let score = 0;
  const text = normalizeText(`${question.question} ${question.helpText ?? ''}`);
  const optionText = normalizeText((question.options ?? []).map((option) => option.label).join(' '));
  const nonGenericOptionCount = (question.options ?? []).filter(
    (option) => !/altro|non in elenco|fuori area/.test(normalizeText(option.label))
  ).length;
  if (/sede operativa|sede legale|comune|provincia|regione/.test(text)) score += 10;
  if (/startup innovativ|prevalenza femminile|prevalenza giovanile|universita|ente di ricerca|rete d'impresa/.test(text)) score += 8;
  if (/progetto|servizi di innovazione|trasferimento tecnologico|digitalizzazion|settore/.test(text)) score += 6;
  if (nonGenericOptionCount >= 2 && optionText.length > 12) score += 4;
  if (/quale tipo di sede soddisfa il requisito territoriale del bando/.test(text)) score -= 30;
  if (/requisiti chiave|beneficiari ammessi|confermi/.test(text)) score -= 24;
  if ((question.sourceExcerpt ?? '').length > 20) score += 4;
  return score;
}

function semanticWeaknessPenalty(question: VerificationQuestion) {
  const text = normalizeText(question.question);
  let penalty = 0;
  if (containsForbiddenGenericLanguage(text)) penalty += 24;
  if (/seleziona il tuo profilo/.test(text) && (question.options?.length ?? 0) > 6) penalty += 8;
  if (/restera valida|sar[aà] valida|conferm|documentabile/.test(text)) penalty += 10;
  if (question.informativeOnly) penalty += 12;
  return penalty;
}

function redundancyPenalty(question: VerificationQuestion, state: ActiveBranchState) {
  let penalty = 0;
  if (state.answeredCategories.has(question.category)) {
    penalty += resolveQuestionIntent(question) === 'evidence' ? 18 : 9;
  }
  if (state.resolvedRequirementIds.size > 0 && question.requirementIds.every((id) => state.resolvedRequirementIds.has(id))) {
    penalty += 26;
  }
  if (
    state.answeredCategories.has(question.category) &&
    /restera valida|sar[aà] valida|conferm|documentabile/.test(normalizeText(question.question))
  ) {
    penalty += 18;
  }
  return penalty;
}

function applicableNow(
  question: VerificationQuestion,
  state: ActiveBranchState,
  answers: Record<string, string>
) {
  if (!isQuestionVisibleByAnswers(question, answers)) return false;
  if (isQuestionRedundantForState(question, state, answers)) return false;
  if (branchValidityScore(question, state) <= -100) return false;
  return true;
}

function findBestNextQuestion(
  ordered: VerificationQuestion[],
  answers: Record<string, string>,
  byId: Map<string, VerificationQuestion>,
  currentQuestionId: string,
  indexById: Map<string, number>
) {
  const state = inferBranchState(answers, byId, ordered);
  const currentIndex = indexById.get(currentQuestionId) ?? -1;
  const candidates: Array<{ question: VerificationQuestion; index: number; score: number }> = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const candidate = ordered[index]!;
    if (candidate.id === currentQuestionId) continue;
    if (!applicableNow(candidate, state, answers)) continue;
    const branchScore = branchValidityScore(candidate, state);
    if (branchScore <= -100) continue;
    const indexPenalty = candidate.showIf?.questionId === currentQuestionId ? 0 : Math.max(0, currentIndex - index) * 1.2;
    const unresolvedBonus = state.unresolvedDecisiveDimensions.has(candidate.category) ? 10 : 0;
    const score =
      branchScore +
      decisionImpactScore(candidate) +
      informationGainScore(candidate) +
      semanticSpecificityScore(candidate) +
      unresolvedBonus -
      redundancyPenalty(candidate, state) -
      semanticWeaknessPenalty(candidate) -
      indexPenalty;
    candidates.push({
      question: candidate,
      index,
      score
    });
  }

  if (candidates.length === 0) return null;
  const directChildren = candidates.filter(
    (entry) => entry.question.showIf?.questionId === currentQuestionId
  );
  if (directChildren.length > 0) {
    directChildren.sort((a, b) => {
      const unresolvedA = state.unresolvedDecisiveDimensions.has(a.question.category) ? 0 : 1;
      const unresolvedB = state.unresolvedDecisiveDimensions.has(b.question.category) ? 0 : 1;
      if (unresolvedA !== unresolvedB) return unresolvedA - unresolvedB;
      return b.score - a.score || a.index - b.index;
    });
    return directChildren[0]!.question;
  }
  candidates.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return candidates[0]!.question;
}

function countAnsweredMeaningfulQuestions(
  answers: Record<string, string>,
  byId: Map<string, VerificationQuestion>
) {
  return Object.entries(answers).filter(([questionId, value]) => {
    const question = byId.get(questionId);
    if (!question) return false;
    if (question.informativeOnly) return false;
    return String(value ?? '').trim().length > 0;
  }).length;
}

function estimateBranchSuccessThreshold(
  ordered: VerificationQuestion[],
  answers: Record<string, string>
) {
  const visibleMeaningful = ordered.filter(
    (question) => isQuestionVisibleByAnswers(question, answers) && !question.informativeOnly
  );
  const decisiveCategories = new Set(
    visibleMeaningful
      .filter((question) => question.blocking || question.category === 'project_type')
      .map((question) => question.category)
  );

  let threshold = 2;
  if (decisiveCategories.size <= 2) threshold = 3;
  else if (decisiveCategories.size === 3) threshold = 4;
  else if (decisiveCategories.size === 4) threshold = 4;
  else if (decisiveCategories.size === 5) threshold = 6;
  else if (decisiveCategories.size >= 6) threshold = 7;

  const hasMixedProfile = visibleMeaningful.some(
    (question) => question.category === 'beneficiary' && (question.options?.length ?? 0) >= 3
  );
  const hasStartupDimension = visibleMeaningful.some((question) => /startup/.test(normalizeText(question.id)));
  const hasEntityComplexity = visibleMeaningful.some((question) =>
    /(universita|ente_di_ricerca|consorz|rete_d_impresa)/.test(normalizeText(question.id))
  );
  const hasFemaleYouthDimension = visibleMeaningful.some((question) =>
    /(q_gender|q_youth|femminile|giovanile)/.test(normalizeText(question.id))
  );

  if (hasMixedProfile) threshold = Math.max(threshold, 5);
  if (hasStartupDimension) threshold = Math.max(threshold, 6);
  if (hasEntityComplexity) threshold = Math.max(threshold, 5);
  if (hasFemaleYouthDimension) threshold = Math.max(threshold, 6);
  if (visibleMeaningful.length >= MIN_VISIBLE_INTERVIEW_DEPTH) {
    threshold = Math.max(threshold, MIN_VISIBLE_INTERVIEW_DEPTH);
  }

  return Math.min(threshold, Math.max(2, Math.min(12, visibleMeaningful.length)));
}

function findDepthFallbackQuestion(
  ordered: VerificationQuestion[],
  answers: Record<string, string>,
  byId: Map<string, VerificationQuestion>,
  currentQuestionId: string
) {
  const state = inferBranchState(answers, byId, ordered);
  const unresolved = state.unresolvedDecisiveDimensions;
  const candidates = ordered.filter((question) => {
    if (answers[question.id] !== undefined) return false;
    if (question.informativeOnly) return false;
    if (!isQuestionVisibleByAnswers(question, answers)) return false;
    if (!applicableNow(question, state, answers)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const unresolvedA = unresolved.has(a.category) ? 0 : 1;
    const unresolvedB = unresolved.has(b.category) ? 0 : 1;
    if (unresolvedA !== unresolvedB) return unresolvedA - unresolvedB;
    const directFromCurrentA = a.showIf?.questionId === currentQuestionId ? 0 : 1;
    const directFromCurrentB = b.showIf?.questionId === currentQuestionId ? 0 : 1;
    if (directFromCurrentA !== directFromCurrentB) return directFromCurrentA - directFromCurrentB;
    const rankA = REQUIREMENT_PRIORITY[a.category as RequirementCategory] ?? 99;
    const rankB = REQUIREMENT_PRIORITY[b.category as RequirementCategory] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.priority - b.priority;
  });
  return candidates[0] ?? null;
}

function buildQuizTransitions(questions: VerificationQuestion[]): BandoQuizPlan['transitions'] {
  const ordered = questions.slice().sort((a, b) => a.priority - b.priority);
  const byId = new Map(ordered.map((question) => [question.id, question]));
  const transitions = new Map<string, BandoQuizPlan['transitions'][number]>();
  const contextsByTransition = new Map<string, Array<Record<string, string>>>();
  const indexById = new Map(ordered.map((question, index) => [question.id, index]));
  const first = ordered.find((question) => !question.showIf) ?? ordered[0] ?? null;
  if (!first) return [];

  type State = { questionId: string; answers: Record<string, string> };
  const queue: State[] = [{ questionId: first.id, answers: {} }];
  const visited = new Set<string>();
  const MAX_STATES = 8000;

  while (queue.length > 0 && visited.size < MAX_STATES) {
    const state = queue.shift()!;
    const question = ordered.find((item) => item.id === state.questionId);
    if (!question) continue;
    const stateKey = `${state.questionId}:${Object.entries(state.answers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('|')}`;
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);

    const options = question.options ?? (question.answerType === 'single_choice_yes_no' ? yesNoOptions() : []);
    const disqualifySet = new Set((question.disqualifyIf ?? []).map((value) => normalizeText(value)));

    const targetScore = (target: string, contexts: Array<Record<string, string>>) => {
      if (target === 'blocked') {
        // Keep hard disqualifications deterministic.
        return { compatibleAll: true, compatibleCount: contexts.length, index: -1 };
      }
      if (target === 'success') {
        // Success is always compatible, but should be selected only when no stronger candidate survives.
        return { compatibleAll: true, compatibleCount: contexts.length, index: Number.MAX_SAFE_INTEGER };
      }

      const questionTarget = byId.get(target);
      if (!questionTarget) {
        return { compatibleAll: false, compatibleCount: 0, index: Number.MAX_SAFE_INTEGER };
      }

      let compatibleCount = 0;
      for (const ctx of contexts) {
        if (!isQuestionVisibleByAnswers(questionTarget, ctx)) continue;
        const state = inferBranchState(ctx, byId, ordered);
        if (isQuestionRedundantForState(questionTarget, state, ctx)) continue;
        compatibleCount += 1;
      }
      return {
        compatibleAll: compatibleCount === contexts.length,
        compatibleCount,
        index: indexById.get(target) ?? Number.MAX_SAFE_INTEGER
      };
    };

    const chooseDeterministicTarget = (
      candidates: string[],
      contexts: Array<Record<string, string>>
    ) => {
      const uniqueCandidates = Array.from(new Set([...candidates, 'success']));
      if (uniqueCandidates.length === 1) return uniqueCandidates[0]!;

      if (uniqueCandidates.includes('blocked')) return 'blocked';

      const scored = uniqueCandidates
        .map((candidate) => ({ candidate, ...targetScore(candidate, contexts) }))
        .sort((a, b) => {
          if (a.compatibleAll !== b.compatibleAll) return a.compatibleAll ? -1 : 1;
          if (a.compatibleCount !== b.compatibleCount) return b.compatibleCount - a.compatibleCount;
          return a.index - b.index;
        });

      const currentIndex = indexById.get(question.id) ?? -1;
      const viableForwardNonTerminal = scored.filter(
        (entry) =>
          entry.candidate !== 'success' &&
          entry.compatibleAll &&
          entry.compatibleCount > 0 &&
          entry.index > currentIndex
      );
      if (viableForwardNonTerminal.length > 0) {
        return viableForwardNonTerminal[0]!.candidate;
      }
      return 'success';
    };

    const addTransition = (answerValue: string, to: string, contextAnswers: Record<string, string>) => {
      const key = `${question.id}::${answerValue}`;
      const existing = transitions.get(key);
      const currentContexts = contextsByTransition.get(key) ?? [];
      currentContexts.push({ ...contextAnswers });
      contextsByTransition.set(key, currentContexts);
      if (!existing) {
        transitions.set(key, {
          fromQuestionId: question.id,
          answerValue,
          to
        });
        return;
      }
      existing.to = chooseDeterministicTarget([existing.to, to], currentContexts);
    };

    if (options.length === 0) {
      const nextQuestion = findBestNextQuestion(ordered, state.answers, byId, question.id, indexById);
      let to = nextQuestion?.id ?? 'success';
      if (!nextQuestion) {
        const answeredDepth = countAnsweredMeaningfulQuestions(state.answers, byId);
        const threshold = estimateBranchSuccessThreshold(ordered, state.answers);
        if (answeredDepth < threshold) {
          const fallback = findDepthFallbackQuestion(ordered, state.answers, byId, question.id);
          if (fallback) to = fallback.id;
        }
      }
      addTransition('any', to, state.answers);
      if (nextQuestion && to !== 'success') {
        queue.push({
          questionId: nextQuestion.id,
          answers: { ...state.answers }
        });
      } else if (!nextQuestion && to !== 'success') {
        queue.push({
          questionId: to,
          answers: { ...state.answers }
        });
      }
      continue;
    }

    for (const option of options) {
      const normalizedOption = normalizeText(option.value);
      if (disqualifySet.has(normalizedOption)) {
        addTransition(option.value, 'blocked', state.answers);
        continue;
      }

      const nextAnswers = {
        ...state.answers,
        [question.id]: option.value
      };
      const nextQuestion = findBestNextQuestion(ordered, nextAnswers, byId, question.id, indexById);
      let to = nextQuestion?.id ?? 'success';
      if (!nextQuestion) {
        const answeredDepth = countAnsweredMeaningfulQuestions(nextAnswers, byId);
        const threshold = estimateBranchSuccessThreshold(ordered, nextAnswers);
        if (answeredDepth < threshold) {
          const fallback = findDepthFallbackQuestion(ordered, nextAnswers, byId, question.id);
          if (fallback) to = fallback.id;
        }
      }
      addTransition(option.value, to, nextAnswers);
      if (nextQuestion && to !== 'success') {
        queue.push({
          questionId: nextQuestion.id,
          answers: nextAnswers
        });
      } else if (!nextQuestion && to !== 'success') {
        queue.push({
          questionId: to,
          answers: nextAnswers
        });
      }
    }
  }

  return Array.from(transitions.values());
}

type PlanValidation = {
  ok: boolean;
  reasons: string[];
};

function validateNoAmbiguousTransitions(plan: BandoQuizPlan): PlanValidation {
  const reasons: string[] = [];
  const seen = new Map<string, string>();
  for (const transition of plan.transitions) {
    const key = `${transition.fromQuestionId}::${normalizeText(transition.answerValue)}`;
    const existing = seen.get(key);
    if (existing && existing !== transition.to) {
      reasons.push(`ambiguous_transition:${key}->${existing}|${transition.to}`);
      continue;
    }
    seen.set(key, transition.to);
  }
  return { ok: reasons.length === 0, reasons };
}

function validateReachableQuestions(plan: BandoQuizPlan): PlanValidation {
  const reasons: string[] = [];
  const byId = new Map(plan.questions.map((question) => [question.id, question]));
  const reachable = new Set<string>();
  plan.questions.forEach((question) => {
    if (!question.showIf) reachable.add(question.id);
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const question of plan.questions) {
      if (reachable.has(question.id)) continue;
      if (!question.showIf) {
        reachable.add(question.id);
        changed = true;
        continue;
      }
      if (reachable.has(question.showIf.questionId)) {
        reachable.add(question.id);
        changed = true;
      }
    }
  }
  for (const question of plan.questions) {
    if (question.showIf && !byId.has(question.showIf.questionId)) {
      reasons.push(`invalid_showIf_parent:${question.id}`);
      continue;
    }
    if (!reachable.has(question.id)) {
      reasons.push(`unreachable_question:${question.id}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function validateBranchAwareSemantics(plan: BandoQuizPlan): PlanValidation {
  const reasons: string[] = [];
  const byId = new Map(plan.questions.map((q) => [q.id, q]));
  const norm = (value: string) =>
    String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  for (const question of plan.questions) {
    if (question.id.includes('startup_status') && !question.showIf) {
      const text = norm(question.question);
      const branchSafe = text.includes('gia iscritta') && text.includes('verra costituita');
      if (!branchSafe) reasons.push(`startup_status_not_branch_safe:${question.id}`);
    }
  }

  for (const question of plan.questions) {
    if (!question.showIf) continue;
    if (!byId.has(question.showIf.questionId)) {
      reasons.push(`invalid_showIf_parent:${question.id}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

function validateRepresentativePaths(plan: BandoQuizPlan): PlanValidation {
  const reasons: string[] = [];
  const ordered = plan.questions.slice().sort((a, b) => a.priority - b.priority);
  const first = ordered.find((question) => !question.showIf) ?? ordered[0];
  if (!first) return { ok: false, reasons: ['no_root_question'] };
  const byId = new Map(ordered.map((question) => [question.id, question]));
  const byFrom = new Map<string, Array<{ answerValue: string; to: string }>>();
  for (const transition of plan.transitions) {
    if (!byFrom.has(transition.fromQuestionId)) byFrom.set(transition.fromQuestionId, []);
    byFrom.get(transition.fromQuestionId)!.push({
      answerValue: transition.answerValue,
      to: transition.to
    });
  }

  const traverse = (preferBlocked: boolean) => {
    const answers: Record<string, string> = {};
    let currentId: string | null = first.id;
    let guard = 0;
    while (currentId && guard < 120) {
      guard += 1;
      const question = byId.get(currentId);
      if (!question) {
        reasons.push(`path_missing_question:${currentId}`);
        break;
      }
      const state = inferBranchState(answers, byId, ordered);
      if (!applicableNow(question, state, answers)) {
        reasons.push(`path_branch_invalid_question:${question.id}`);
        break;
      }
      const transitions = byFrom.get(question.id) ?? [];
      if (transitions.length === 0) break;
      const picked =
        (preferBlocked ? transitions.find((transition) => transition.to === 'blocked') : null) ??
        transitions.find((transition) => transition.to !== 'blocked') ??
        transitions[0]!;
      answers[question.id] = picked.answerValue;
      if (picked.to === 'blocked' || picked.to === 'success') break;
      currentId = picked.to;
    }
  };

  traverse(false);
  traverse(true);
  return { ok: reasons.length === 0, reasons };
}

function validateFinalQuizPlan(plan: BandoQuizPlan): PlanValidation {
  const checks = [
    validateNoAmbiguousTransitions(plan),
    validateReachableQuestions(plan),
    validateBranchAwareSemantics(plan),
    validateRepresentativePaths(plan)
  ];
  const reasons = checks.flatMap((check) => check.reasons);
  return { ok: reasons.length === 0, reasons };
}

function pruneUnreachableQuestions(plan: BandoQuizPlan): BandoQuizPlan {
  const ordered = plan.questions.slice().sort((a, b) => a.priority - b.priority);
  const first = ordered.find((question) => !question.showIf) ?? ordered[0];
  if (!first) return plan;
  // Reachability is derived from branch structure (showIf graph) first, then from transitions.
  const reachable = new Set<string>([first.id]);
  for (const question of ordered) {
    if (!question.showIf) {
      reachable.add(question.id);
      continue;
    }
    if (reachable.has(question.showIf.questionId)) {
      reachable.add(question.id);
    }
  }
  const queue = Array.from(reachable);
  while (queue.length > 0) {
    const current = queue.shift()!;
    plan.transitions
      .filter((transition) => transition.fromQuestionId === current && transition.to !== 'blocked' && transition.to !== 'success')
      .forEach((transition) => {
        if (!reachable.has(transition.to)) {
          reachable.add(transition.to);
          queue.push(transition.to);
        }
      });
  }
  const questions = plan.questions.filter((question) => reachable.has(question.id));
  const allowedIds = new Set(questions.map((question) => question.id));
  const transitions = plan.transitions.filter(
    (transition) =>
      allowedIds.has(transition.fromQuestionId) &&
      (transition.to === 'blocked' || transition.to === 'success' || allowedIds.has(transition.to))
  );
  return { ...plan, questions, transitions };
}

function ensureTerminalTransitions(plan: BandoQuizPlan): BandoQuizPlan {
  const transitions = [...plan.transitions];
  const hasOutgoing = new Set(transitions.map((transition) => transition.fromQuestionId));
  for (const question of plan.questions) {
    if (hasOutgoing.has(question.id)) continue;
    const disqualify = new Set((question.disqualifyIf ?? []).map((value) => normalizeText(value)));
    const options = question.options ?? (question.answerType === 'single_choice_yes_no' ? yesNoOptions() : []);
    if (options.length === 0) {
      transitions.push({ fromQuestionId: question.id, answerValue: 'any', to: 'success' });
      continue;
    }
    for (const option of options) {
      transitions.push({
        fromQuestionId: question.id,
        answerValue: option.value,
        to: disqualify.has(normalizeText(option.value)) ? 'blocked' : 'success'
      });
    }
  }
  return { ...plan, transitions };
}

function isItalianQuestionQualitySafe(text: string) {
  const value = String(text ?? '').trim();
  if (!value) return false;
  if (value.length < 12 || value.length > 220) return false;
  const normalized = normalizeText(value);
  if (containsForbiddenGenericLanguage(normalized)) return false;
  if (/^[a-z0-9_\- ,.;:]+$/.test(value)) return false;
  if (/requisiti chiave|beneficiari ammessi|confermi questo requisito|sei in regola con/i.test(value)) return false;
  if (/[:;]\s*$/.test(value)) return false;
  if (!/[?]$/.test(value)) return false;
  return true;
}

function mapRequirementCategoryToDecisionDimension(category: RequirementCategory): QuestionCategory {
  if (category === 'local_unit') return 'territory';
  if (category === 'time_constraint') return 'business_stage';
  if (category === 'beneficiary') return 'beneficiary';
  if (category === 'territory') return 'territory';
  if (category === 'age') return 'age';
  if (category === 'employment_status') return 'employment_status';
  if (category === 'legal_subject_type') return 'legal_subject_type';
  if (category === 'business_stage') return 'business_stage';
  if (category === 'sector') return 'sector';
  if (category === 'project_type') return 'project_type';
  if (category === 'financial_threshold') return 'financial_threshold';
  if (category === 'exclusion') return 'exclusion';
  return 'other';
}

function collectDimensionSets(requirements: GenericRequirement[]) {
  const askableDimensions = new Set<QuestionCategory>();
  const decisiveDimensions = new Set<QuestionCategory>();
  for (const requirement of requirements) {
    if (!requirement.askable) continue;
    const dimension = mapRequirementCategoryToDecisionDimension(requirement.category);
    askableDimensions.add(dimension);
    if (requirement.importance === 'critical' || requirement.importance === 'high') {
      decisiveDimensions.add(dimension);
    }
  }
  return {
    askableDimensions: Array.from(askableDimensions),
    decisiveDimensions: Array.from(decisiveDimensions)
  };
}

function collectBranchTriggerValues(questions: VerificationQuestion[], questionId: string) {
  const values = new Set<string>();
  for (const question of questions) {
    if (question.showIf?.questionId !== questionId) continue;
    if (question.showIf.equals) values.add(normalizeText(question.showIf.equals));
    (question.showIf.anyOf ?? []).forEach((item) => values.add(normalizeText(item)));
    (question.showIf.noneOf ?? []).forEach((item) => values.add(normalizeText(item)));
  }
  return values;
}

function representativeAllowedAnswers(question: VerificationQuestion, questions: VerificationQuestion[]) {
  const options = question.options ?? (question.answerType === 'single_choice_yes_no' ? yesNoOptions() : []);
  if (options.length === 0) return ['any'];

  const disqualify = new Set((question.disqualifyIf ?? []).map((value) => normalizeText(value)));
  const allowed = options.filter((option) => !disqualify.has(normalizeText(option.value)));
  if (allowed.length === 0) return [];

  const branchTriggers = collectBranchTriggerValues(questions, question.id);
  const picked: string[] = [];
  for (const option of allowed) {
    if (branchTriggers.has(normalizeText(option.value))) {
      picked.push(option.value);
    }
  }
  if (picked.length === 0) {
    picked.push(allowed[0]!.value);
  } else if (picked.length < 2 && allowed.length > 1) {
    const fallback = allowed.find((option) => !picked.includes(option.value));
    if (fallback) picked.push(fallback.value);
  }
  return Array.from(new Set(picked)).slice(0, 8);
}

function computeRuntimeSuccessPathSummary(
  plan: BandoQuizPlan,
  decisiveDimensions: Set<QuestionCategory>
) {
  const ordered = plan.questions.slice().sort((a, b) => a.priority - b.priority);
  const byId = new Map(ordered.map((question) => [question.id, question]));
  if (ordered.length === 0) {
    return {
      depth: 0,
      resolvedDimensions: [] as QuestionCategory[],
      applicableDecisiveDimensions: [] as QuestionCategory[]
    };
  }

  type SearchState = { answers: Record<string, string> };
  const stack: SearchState[] = [{ answers: {} }];
  const visited = new Set<string>();
  const MAX_STATES = 20000;
  let explored = 0;
  let best:
    | {
        depth: number;
        resolved: QuestionCategory[];
        applicableDecisive: QuestionCategory[];
      }
    | null = null;

  while (stack.length > 0 && explored < MAX_STATES) {
    explored += 1;
    const current = stack.pop()!;
    const visibleUnanswered = ordered.find(
      (question) => isQuestionVisibleByAnswers(question, current.answers) && current.answers[question.id] === undefined
    );

    if (!visibleUnanswered) {
      const answeredQuestions = Object.keys(current.answers)
        .map((id) => byId.get(id))
        .filter((question): question is VerificationQuestion => Boolean(question));
      const resolvedSet = new Set<QuestionCategory>(answeredQuestions.map((question) => question.category));
      const resolved = Array.from(resolvedSet);
      const applicableDecisive = resolved.filter((dimension) => decisiveDimensions.has(dimension));
      if (
        !best ||
        Object.keys(current.answers).length < best.depth ||
        (Object.keys(current.answers).length === best.depth && applicableDecisive.length > best.applicableDecisive.length)
      ) {
        best = {
          depth: Object.keys(current.answers).length,
          resolved,
          applicableDecisive
        };
      }
      continue;
    }

    const answersKey = `${visibleUnanswered.id}|${Object.entries(current.answers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${normalizeText(value)}`)
      .join('|')}`;
    if (visited.has(answersKey)) continue;
    visited.add(answersKey);

    const candidates = representativeAllowedAnswers(visibleUnanswered, ordered);
    if (candidates.length === 0) continue;

    for (const answer of candidates) {
      stack.push({
        answers: {
          ...current.answers,
          [visibleUnanswered.id]: answer
        }
      });
    }
  }

  return {
    depth: best?.depth ?? 0,
    resolvedDimensions: best?.resolved ?? [],
    applicableDecisiveDimensions: best?.applicableDecisive ?? []
  };
}

function expectedMinimumMeaningfulDepth(
  decisiveDimensionCount: number,
  familyTags: EligibilityFamily[]
) {
  let floor = 2;
  if (decisiveDimensionCount <= 2) floor = 3;
  else if (decisiveDimensionCount === 3) floor = 4;
  else if (decisiveDimensionCount === 4) floor = 4;
  else if (decisiveDimensionCount === 5) floor = 5;
  else if (decisiveDimensionCount === 6) floor = 7;
  else if (decisiveDimensionCount >= 7) floor = 8;

  if (familyTags.includes('startup_innovativa')) floor = Math.max(floor, 5);
  if (familyTags.includes('mixed_beneficiaries')) floor = Math.max(floor, 5);
  if (familyTags.includes('female_entrepreneurship') || familyTags.includes('youth_entrepreneurship')) {
    floor = Math.max(floor, 5);
  }
  if (familyTags.includes('existing_business') && decisiveDimensionCount >= 5) {
    floor = Math.max(floor, 5);
  }
  if (familyTags.includes('university_research_entity')) {
    floor = Math.max(floor, 5);
  }
  return Math.max(Math.min(floor, 12), MIN_VISIBLE_INTERVIEW_DEPTH);
}

function countDiscriminatingQuestions(plan: BandoQuizPlan) {
  return plan.questions.filter((question) => {
    const optionsCount = question.options?.length ?? 0;
    if (question.blocking) return true;
    if ((question.disqualifyIf?.length ?? 0) > 0) return true;
    if (optionsCount >= 3) return true;
    if (
      question.category === 'business_stage' ||
      question.category === 'legal_subject_type' ||
      question.category === 'employment_status' ||
      question.category === 'sector' ||
      question.category === 'project_type'
    ) {
      return true;
    }
    return false;
  }).length;
}

function computeSemanticSpecificityScore(plan: BandoQuizPlan) {
  if (plan.questions.length === 0) return 0;
  const total = plan.questions.reduce((acc, question) => {
    const text = normalizeText(`${question.question} ${question.helpText ?? ''}`);
    const optionText = normalizeText((question.options ?? []).map((option) => option.label).join(' '));
    const nonGenericOptions = (question.options ?? []).filter(
      (option) => !/altro|non in elenco|fuori area/.test(normalizeText(option.label))
    ).length;
    let score = 0.45;
    if (/sede operativa|sede legale|resiede|comune|provincia|regione|territorio/.test(text)) score += 0.2;
    if (/startup innovativ|prevalenza femminile|prevalenza giovanile|universita|ente di ricerca|rete d'impresa/.test(text)) score += 0.18;
    if (
      /progetto|servizi di innovazione|trasferimento tecnologico|digitalizzazion|settore|forma giuridica|stato occupazionale/.test(
        text
      )
    ) {
      score += 0.12;
    }
    if (nonGenericOptions >= 2 && optionText.length > 18) score += 0.08;
    if (question.showIf) score += 0.05;
    if (question.sourceExcerpt.length > 24) score += 0.08;
    if (/requisiti chiave|beneficiari ammessi|confermi/.test(text)) score -= 0.35;
    if (/seleziona il tuo profilo/.test(text) && nonGenericOptions < 3) score -= 0.12;
    if (/quale tipo di sede soddisfa il requisito territoriale/.test(text)) score -= 0.45;
    return acc + Math.max(0, Math.min(1, score));
  }, 0);
  return Number((total / plan.questions.length).toFixed(3));
}

function computeRedundancyScore(plan: BandoQuizPlan) {
  if (plan.questions.length === 0) return 0;
  const uniqueFingerprints = new Set(plan.questions.map((question) => normalizeQuestionFingerprint(question)));
  const categorySpread = new Set(plan.questions.map((question) => question.category)).size;
  const duplicatePenalty = 1 - uniqueFingerprints.size / Math.max(1, plan.questions.length);
  const categoryPenalty = Math.max(0, 1 - categorySpread / Math.max(1, Math.min(6, plan.questions.length)));
  const score = 1 - Math.min(1, duplicatePenalty * 0.7 + categoryPenalty * 0.3);
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

function validateNumericSanity(requirements: GenericRequirement[]) {
  const reasons: string[] = [];
  for (const requirement of requirements) {
    if (!requirement.askable) continue;
    if (requirement.category === 'age') {
      const minAge = requirement.normalizedValue.minAge;
      const maxAge = requirement.normalizedValue.maxAge;
      if (minAge !== undefined && (minAge < 14 || minAge > 100)) reasons.push(`numeric_sanity_age_min:${requirement.id}`);
      if (maxAge !== undefined && (maxAge < 14 || maxAge > 100)) reasons.push(`numeric_sanity_age_max:${requirement.id}`);
      if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
        reasons.push(`numeric_sanity_age_range_inverted:${requirement.id}`);
      }
    }
    if (requirement.category === 'business_stage') {
      const months = requirement.normalizedValue.maxMonthsSinceConstitution;
      if (months !== undefined && (months <= 0 || months > 240)) {
        reasons.push(`numeric_sanity_stage_months:${requirement.id}`);
      }
    }
    if (requirement.category === 'financial_threshold') {
      const min = requirement.normalizedValue.min;
      const max = requirement.normalizedValue.max;
      if (min !== undefined && min < 0) reasons.push(`numeric_sanity_financial_negative_min:${requirement.id}`);
      if (max !== undefined && max < 0) reasons.push(`numeric_sanity_financial_negative_max:${requirement.id}`);
      if (min !== undefined && max !== undefined && min > max) {
        reasons.push(`numeric_sanity_financial_range_inverted:${requirement.id}`);
      }
      if (requirement.normalizedValue.metric === 'employees') {
        if (min !== undefined && min > 200000) reasons.push(`numeric_sanity_employees_outlier_min:${requirement.id}`);
        if (max !== undefined && max > 200000) reasons.push(`numeric_sanity_employees_outlier_max:${requirement.id}`);
      } else {
        if (min !== undefined && min > 1000000000) reasons.push(`numeric_sanity_amount_outlier_min:${requirement.id}`);
        if (max !== undefined && max > 1000000000) reasons.push(`numeric_sanity_amount_outlier_max:${requirement.id}`);
        if ((min !== undefined && min > 0 && min < 1000) || (max !== undefined && max > 0 && max < 1000)) {
          if (!hasCurrencyLikeSignal(requirement.sourceExcerpt)) {
            reasons.push(`numeric_sanity_amount_too_small_without_currency_context:${requirement.id}`);
          }
        }
      }
    }
  }
  return reasons;
}

export function evaluatePublicationGate(args: {
  plan: BandoQuizPlan;
  requirements: GenericRequirement[];
  familyTags: EligibilityFamily[];
}): PublicationGateReport {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const consistency = validateFinalQuizPlan(args.plan);
  reasons.push(...consistency.reasons.map((reason) => `consistency:${reason}`));

  if (args.plan.questions.length > 0 && args.plan.questions.length < MIN_VISIBLE_INTERVIEW_DEPTH) {
    reasons.push(`minimum_visible_questions_not_met:${args.plan.questions.length}<${MIN_VISIBLE_INTERVIEW_DEPTH}`);
    warnings.push(`minimum_depth_not_met:${args.plan.questions.length}<${MIN_VISIBLE_INTERVIEW_DEPTH}`);
  }

  const italianUnsafe = args.plan.questions.filter((question) => !isItalianQuestionQualitySafe(question.question));
  reasons.push(...italianUnsafe.map((question) => `italian_quality:${question.id}`));

  const numericIssues = validateNumericSanity(args.requirements);
  reasons.push(...numericIssues);

  const { askableDimensions, decisiveDimensions } = collectDimensionSets(args.requirements);
  const decisiveDimensionSet = new Set(decisiveDimensions);
  const shortest = computeRuntimeSuccessPathSummary(args.plan, decisiveDimensionSet);
  if (shortest.depth <= 0) {
    reasons.push('no_success_path');
  }

  const applicableDecisive = shortest.applicableDecisiveDimensions;
  const expectedDepth = expectedMinimumMeaningfulDepth(applicableDecisive.length, args.familyTags);
  if (applicableDecisive.length >= 3 && shortest.depth > 0 && shortest.depth < expectedDepth) {
    warnings.push(`minimum_depth_not_met:${shortest.depth}<${expectedDepth}`);
    if (applicableDecisive.length >= 4 && shortest.depth <= Math.max(3, expectedDepth - 3)) {
      reasons.push(`minimum_depth_severely_insufficient:${shortest.depth}<${expectedDepth}`);
    }
  }

  const resolvedDecisive = shortest.resolvedDimensions.filter((dimension) => decisiveDimensionSet.has(dimension));
  const minimumResolved = Math.min(expectedDepth, applicableDecisive.length);
  if (applicableDecisive.length >= 3 && resolvedDecisive.length < minimumResolved) {
    warnings.push(`resolved_decisive_dimensions_too_low:${resolvedDecisive.length}<${minimumResolved}`);
    if (applicableDecisive.length >= 4 && resolvedDecisive.length <= Math.max(2, minimumResolved - 3)) {
      reasons.push(
        `resolved_decisive_dimensions_severely_low:${resolvedDecisive.length}<${minimumResolved}`
      );
    }
  }

  const discriminatingQuestionCount = countDiscriminatingQuestions(args.plan);
  if (applicableDecisive.length >= 4 && discriminatingQuestionCount < Math.max(4, expectedDepth)) {
    warnings.push(`discriminating_questions_too_few:${discriminatingQuestionCount}`);
  }

  if (
    applicableDecisive.length >= 4 &&
    resolvedDecisive.every((dimension) => dimension === 'territory' || dimension === 'beneficiary')
  ) {
    warnings.push('resolved_dimensions_too_generic');
  }

  if (
    applicableDecisive.length >= 3 &&
    shortest.depth > 0 &&
    shortest.depth <= 3 &&
    (args.familyTags.includes('startup_innovativa') ||
      args.familyTags.includes('mixed_beneficiaries') ||
      args.familyTags.includes('female_entrepreneurship') ||
      args.familyTags.includes('youth_entrepreneurship'))
  ) {
    reasons.push(`minimum_depth_severely_insufficient:${shortest.depth}<${expectedDepth}`);
  }

  const semanticSpecificityScore = computeSemanticSpecificityScore(args.plan);
  const redundancyScore = computeRedundancyScore(args.plan);
  const discriminatingScore = Number(
    Math.max(0, Math.min(1, discriminatingQuestionCount / Math.max(1, expectedDepth))).toFixed(3)
  );

  if (semanticSpecificityScore < 0.42) {
    reasons.push(`semantic_specificity_low:${semanticSpecificityScore}`);
  } else if (semanticSpecificityScore < 0.65) {
    warnings.push(`semantic_specificity_warn:${semanticSpecificityScore}`);
  }
  if (redundancyScore < 0.5) reasons.push(`redundancy_too_high:${redundancyScore}`);
  else if (redundancyScore < 0.7) warnings.push(`redundancy_warn:${redundancyScore}`);

  const hardReason = (value: string) =>
    /^(consistency:|italian_quality:|numeric_sanity_|no_success_path|semantic_specificity_low|redundancy_too_high|minimum_depth_severely_insufficient|resolved_decisive_dimensions_severely_low|minimum_visible_questions_not_met)/.test(
      value
    );
  const hardReasons = reasons.filter(hardReason);
  const softReasons = reasons.filter((entry) => !hardReason(entry));
  const allWarnings = uniqueStrings([...warnings, ...softReasons]);
  const status: PublicationGateStatus =
    hardReasons.length > 0 ? 'quarantine' : allWarnings.length > 0 ? 'publish_with_warning' : 'publish';

  return {
    status,
    reasons: hardReasons,
    warnings: allWarnings,
    decisiveDimensions,
    askableDimensions,
    resolvedDimensions: shortest.resolvedDimensions,
    resolvedDimensionsOnShortestSuccessPath: shortest.resolvedDimensions,
    shortestSuccessDepth: shortest.depth,
    discriminatingQuestionCount,
    depthTarget: expectedDepth,
    discriminatingScore,
    semanticSpecificityScore,
    redundancyScore
  };
}

function questionTypeFromAnswerType(answerType: AnswerType): PracticeQuizQuestionType {
  if (answerType === 'single_choice_yes_no') return 'boolean';
  if (answerType === 'number') return 'number';
  if (answerType === 'text' || answerType === 'date') return 'text';
  return 'single_select';
}

function categoryToMetadata(category: QuestionCategory) {
  if (category === 'beneficiary') return 'beneficiari';
  if (category === 'legal_subject_type') return 'forma_giuridica';
  if (category === 'employment_status') return 'occupazionale';
  if (category === 'business_stage') return 'anzianita';
  if (category === 'financial_threshold') return 'economico';
  return category;
}

function buildRuleForQuestion(question: VerificationQuestion): PracticeQuizQuestion['rule'] {
  if (question.answerType === 'number') {
    return { kind: 'investment_range' };
  }
  if (question.answerType === 'single_choice_yes_no' || question.answerType === 'single_choice') {
    const disqualifySet = new Set((question.disqualifyIf ?? []).map((item) => normalizeText(item)));
    const options = question.options ?? [];
    if (options.length > 0 && disqualifySet.size > 0) {
      const allowed = options
        .filter((option) => !disqualifySet.has(normalizeText(option.value)))
        .map((option) => option.value);
      if (allowed.length > 0) {
        return {
          kind: question.answerType === 'single_choice_yes_no' ? 'critical_boolean' : 'choice_in_set',
          expected:
            question.answerType === 'single_choice_yes_no'
              ? normalizeText(allowed[0] ?? '')
              : allowed.join('|')
        };
      }
    }
    if (question.category === 'territory') {
      return { kind: 'geographic_validation', expected: null };
    }
    if (question.category === 'sector') {
      return { kind: 'choice_in_set', expected: null };
    }
    return { kind: 'choice_in_set', expected: null };
  }

  return { kind: question.informativeOnly ? 'informational' : 'none', expected: null };
}

function mapToPracticeQuizQuestions(
  questions: VerificationQuestion[],
  idealProfile: IdealApplicantProfile,
  transitions?: BandoQuizPlan['transitions']
): PracticeQuizQuestion[] {
  const questionKeyById = new Map<string, string>();
  for (const question of questions) {
    questionKeyById.set(question.id, buildQuestionKey(question.id) || buildRequirementId('q', question.question));
  }
  const transitionsByFrom = new Map<string, Array<{ answerValue: string; to: string }>>();
  for (const transition of transitions ?? []) {
    if (!transitionsByFrom.has(transition.fromQuestionId)) transitionsByFrom.set(transition.fromQuestionId, []);
    transitionsByFrom.get(transition.fromQuestionId)!.push({
      answerValue: transition.answerValue,
      to: transition.to
    });
  }
  return questions.map((question) => {
    const options = question.options ?? (question.answerType === 'single_choice_yes_no' ? yesNoOptions() : []);
    const questionType = questionTypeFromAnswerType(question.answerType);
    const rule = buildRuleForQuestion(question);
    const transitionTargets = (transitionsByFrom.get(question.id) ?? []).map((transition) => ({
      answerValue: transition.answerValue,
      to:
        transition.to === 'blocked' || transition.to === 'success'
          ? transition.to
          : questionKeyById.get(transition.to) ?? null
    }));
    return {
      questionKey:
        questionKeyById.get(question.id) ??
        (buildQuestionKey(question.id) || buildRequirementId('q', question.question)),
      label: question.question,
      description: question.helpText ?? null,
      reasoning: question.blocking
        ? `Requisito bloccante del bando: ${clip(question.sourceExcerpt, 170)}`
        : `Requisito da verificare: ${clip(question.sourceExcerpt, 170)}`,
      questionType,
      options,
      isRequired: !question.informativeOnly,
      validation: {
        ...(question.validation ?? {})
      },
      rule,
      metadata: {
        category: categoryToMetadata(question.category),
        ruleStrength: question.blocking ? 'hard' : 'soft',
        requirementIds: question.requirementIds,
        sourceExcerpt: question.sourceExcerpt,
        validatorFlags: question.validatorFlags,
        idealApplicantSummary: idealProfile.summary,
        decisiveFactors: idealProfile.decisiveFactors,
        transitionTargets,
        showIf: question.showIf
          ? {
              questionKey: buildQuestionKey(question.showIf.questionId),
              anyOf: question.showIf.anyOf,
              equals: question.showIf.equals,
              noneOf: question.showIf.noneOf
            }
          : undefined
      }
    };
  });
}

export function executeQuizPlanInUI(
  plan: BandoQuizPlan,
  idealProfile: IdealApplicantProfile
): PracticeQuizQuestion[] {
  return mapToPracticeQuizQuestions(plan.questions, idealProfile, plan.transitions);
}

type PipelineResult = {
  questions: PracticeQuizQuestion[];
  requirements: GenericRequirement[];
  idealApplicant: IdealApplicantProfile;
  diagnostics: string[];
};

export type QuizPlanResult = {
  plan: BandoQuizPlan;
  idealApplicant: IdealApplicantProfile;
  diagnostics: string[];
};

function ensureMinimumValidatedDepth(
  questions: VerificationQuestion[],
  requirements: GenericRequirement[]
) {
  const minDepth = expectedMinimumDepth(requirements);
  const decisiveCategories = new Set<QuestionCategory>(
    requirements
      .filter((item) => item.askable && (item.importance === 'critical' || item.importance === 'high'))
      .map((item) => mapRequirementCategoryToDecisionDimension(item.category))
  );
  decisiveCategories.add('project_type');
  let current = deduplicateQuestions(questions);
  let guard = 0;
  while (current.length < minDepth && guard < 4) {
    const expanded = calibratePlanQuestionDepth(current, requirements);
    const cleaned = applyQuestionLabelCleanup(expanded);
    const intented = applyQuestionIntent(cleaned);
    const validated = validateQuestions(intented, requirements);
    const deduped = deduplicateQuestions(validated);
    if (deduped.length <= current.length) break;
    current = deduped;
    guard += 1;
  }

  // Last-mile depth completion: if we are still below target, add branch-valid evidence checks.
  let evidenceLevel = 1;
  while (current.length < minDepth && evidenceLevel <= 3) {
    const existingIds = new Set(current.map((question) => question.id));
    const evidenceCandidates: VerificationQuestion[] = [];
    for (const parent of current.slice().sort((a, b) => a.priority - b.priority)) {
      if (!decisiveCategories.has(parent.category)) continue;
      if (parent.informativeOnly) continue;
      if (!parent.blocking && parent.category !== 'project_type') continue;
      if (
        resolveQuestionIntent(parent) === 'evidence' &&
        /(restera valida|sar[aà] valida|conferm|documentabile)/.test(normalizeText(parent.question))
      ) {
        continue;
      }
      const candidate = buildEvidenceFollowUpQuestion(parent, evidenceLevel);
      if (!candidate) continue;
      if (existingIds.has(candidate.id)) continue;
      evidenceCandidates.push(candidate);
      existingIds.add(candidate.id);
    }
    if (evidenceCandidates.length === 0) break;
    const merged = [...current, ...evidenceCandidates];
    const cleaned = applyQuestionLabelCleanup(merged);
    const intented = applyQuestionIntent(cleaned);
    const validated = validateQuestions(intented, requirements);
    const deduped = deduplicateQuestions(validated);
    if (deduped.length <= current.length) break;
    current = deduped;
    evidenceLevel += 1;
  }

  return current;
}

export function finalizeQuizPlan(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): QuizPlanResult {
  const extracted = extractRequirementsFromBando(detail, explainability);
  const normalized = normalizeRequirements(extracted);
  const requirementValidation = validateRequirements(normalized);
  const idealApplicant = deriveIdealApplicantProfile(requirementValidation.requirements);
  const decisive = selectDecisiveRequirements(requirementValidation.requirements, idealApplicant);
  const candidates = buildQuestionTree(decisive, idealApplicant);
  const cleanedCandidates = applyQuestionLabelCleanup(candidates);
  const intentCandidates = applyQuestionIntent(cleanedCandidates);
  const validatedQuestions = validateQuestions(intentCandidates, requirementValidation.requirements);
  const depthCalibrated = calibratePlanQuestionDepth(validatedQuestions, requirementValidation.requirements);
  const cleanedDepthCalibrated = applyQuestionLabelCleanup(depthCalibrated);
  const intentDepthCalibrated = applyQuestionIntent(cleanedDepthCalibrated);
  const revalidatedDepthCalibrated = validateQuestions(intentDepthCalibrated, requirementValidation.requirements);
  const depthStabilized = ensureMinimumValidatedDepth(
    revalidatedDepthCalibrated,
    requirementValidation.requirements
  );
  const semanticPruned = pruneSemanticRedundantQuestions(depthStabilized);
  const dedupedQuestions = semanticPruned.slice(0, MAX_VERIFICATION_QUESTIONS);
  const transitions = buildQuizTransitions(dedupedQuestions);
  const draftPlan: BandoQuizPlan = {
    bandoId: detail.id,
    title: detail.title,
    idealApplicantSummary: idealApplicant.summary,
    requirements: requirementValidation.requirements,
    questions: dedupedQuestions,
    transitions
  };
  const prunedPlan = pruneUnreachableQuestions(draftPlan);
  const terminalizedPlan = ensureTerminalTransitions(prunedPlan);
  const planConsistency = validateFinalQuizPlan(terminalizedPlan);
  const safePlan: BandoQuizPlan = planConsistency.ok
    ? terminalizedPlan
    : {
        ...terminalizedPlan,
        questions: [],
        transitions: []
      };

  return {
    plan: safePlan,
    idealApplicant,
    diagnostics: [...requirementValidation.issues, ...planConsistency.reasons]
  };
}

export function finalizeVerificationQuestions(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): PipelineResult {
  const finalized = finalizeQuizPlan(detail, explainability);
  const mappedQuestions = executeQuizPlanInUI(finalized.plan, finalized.idealApplicant);

  return {
    questions: mappedQuestions,
    requirements: finalized.plan.requirements,
    idealApplicant: finalized.idealApplicant,
    diagnostics: finalized.diagnostics
  };
}

function requirementKind(requirement: GenericRequirement) {
  if (requirement.category !== 'other') return '';
  return normalizeText(String((requirement.normalizedValue as Record<string, unknown>)?.kind ?? ''));
}

function uniqueFamilies(families: EligibilityFamily[]) {
  return Array.from(new Set(families));
}

function classifyEligibilityFamilies(
  detail: GrantDetailRecord,
  requirements: GenericRequirement[],
  idealApplicant: IdealApplicantProfile
): { family: EligibilityFamily; familyTags: EligibilityFamily[] } {
  const text = normalizeText(
    [
      detail.title,
      detail.authority ?? '',
      detail.description ?? '',
      ...detail.beneficiaries,
      ...idealApplicant.targetSubjects
    ].join(' ')
  );
  const beneficiary = requirements.find((item): item is BeneficiaryRequirement => item.category === 'beneficiary');
  const businessStage = requirements.find((item): item is BusinessStageRequirement => item.category === 'business_stage');
  const hasPersona = (beneficiary?.normalizedValue.allowedSubjects ?? []).some((subject) =>
    /persona fisic|aspiranti imprenditor|nuova impresa/.test(normalizeText(subject))
  );
  const hasCompany = (beneficiary?.normalizedValue.allowedSubjects ?? []).some((subject) =>
    /impres|azienda|pmi|startup|cooperativ/.test(normalizeText(subject))
  );
  const isMixed = hasPersona && hasCompany;
  const hasStartup = requirements.some((item) => requirementKind(item) === 'startup_status') || /startup innovativ/.test(text);
  const hasFemale =
    requirements.some((item) => requirementKind(item) === 'gender_composition') || /imprenditoria femminile|a prevalenza femminile/.test(text);
  const hasYouth =
    requirements.some((item) => requirementKind(item) === 'youth_composition') ||
    requirements.some((item): item is AgeRequirement => item.category === 'age' && (item.normalizedValue.maxAge ?? 999) <= 36) ||
    /imprenditoria giovanile|under 3[056]/.test(text);
  const isNaturalPersonNewBusiness =
    hasPersona &&
    (businessStage?.normalizedValue.rule === 'not_yet_constituted' ||
      businessStage?.normalizedValue.rule === 'new_initiative' ||
      /da costituire|nuova attivita|avviare una nuova/.test(text));
  const isExistingBusiness =
    businessStage?.normalizedValue.rule === 'already_constituted' ||
    businessStage?.normalizedValue.rule === 'existing_business' ||
    /imprese gia costituite|imprese esistenti|impresa gia attiva/.test(text);
  const isUniversityResearch = /universita|ente di ricerca|organism[oi] di ricerca|spin off universitario/.test(text);
  const isNetworkConsortium = /consorzi|consorzio|rete di imprese|aggregazione|\bats\b|\bati\b/.test(text);
  const isTerritorialChamber =
    /camera di commercio|cciaa/.test(text) &&
    requirements.some((item) => item.category === 'territory');
  const isLocalUnitRequired = requirements.some((item) => requirementKind(item) === 'local_unit');

  const families: EligibilityFamily[] = [];
  if (isMixed) families.push('mixed_beneficiaries');
  if (isUniversityResearch) families.push('university_research_entity');
  if (isNetworkConsortium) families.push('network_consortium');
  if (hasStartup) families.push('startup_innovativa');
  if (hasFemale) families.push('female_entrepreneurship');
  if (hasYouth) families.push('youth_entrepreneurship');
  if (isNaturalPersonNewBusiness) families.push('natural_person_new_business');
  if (isExistingBusiness || !isNaturalPersonNewBusiness) families.push('existing_business');
  if (isTerritorialChamber) families.push('territorial_chamber');
  if (isLocalUnitRequired) families.push('local_unit_required');

  const familyTags = uniqueFamilies(families);
  const family = familyTags[0] ?? 'existing_business';
  return { family, familyTags };
}

function estimateCompileConfidence(
  requirements: GenericRequirement[],
  diagnostics: string[],
  plan: BandoQuizPlan
) {
  const askable = requirements.filter((item) => item.askable);
  const avgConfidence =
    askable.length > 0 ? askable.reduce((sum, item) => sum + item.confidence, 0) / askable.length : 0;
  const decisiveDimensions = new Set(
    askable
      .filter((item) => item.importance === 'critical' || item.importance === 'high')
      .map((item) => item.category)
  ).size;
  const depthScore =
    decisiveDimensions === 0
      ? 0
      : Math.min(1, plan.questions.length / Math.max(2, decisiveDimensions + 1));
  const issuePenalty = Math.min(0.45, diagnostics.length * 0.03);
  const raw = avgConfidence * 0.55 + depthScore * 0.35 + (plan.questions.length > 0 ? 0.1 : 0) - issuePenalty;
  return Math.max(0, Math.min(1, raw));
}

function buildDeterministicReview(
  plan: BandoQuizPlan,
  compileConfidence: number,
  diagnostics: string[]
): EligibilityReviewReport {
  const consistency = validateFinalQuizPlan(plan);
  const deterministicIssues = [...diagnostics, ...consistency.reasons];
  const branchConsistencyRisks = deterministicIssues.filter((item) =>
    /(ambiguous_transition|invalid_showIf_parent|startup_status_not_branch_safe|unreachable_question|path_branch_invalid_question)/.test(item)
  );
  const reliabilityScore = Math.max(0, Math.min(1, compileConfidence - deterministicIssues.length * 0.04));
  const recommendedActions: string[] = [];
  if (plan.questions.length === 0) recommendedActions.push('manual_review_required');
  if (!consistency.ok) recommendedActions.push('fix_plan_consistency');
  if (reliabilityScore < 0.65) recommendedActions.push('review_source_and_recompile');

  return {
    deterministicIssues,
    reviewerIssues: [],
    branchConsistencyRisks,
    reliabilityScore,
    recommendedActions
  };
}

async function callOpenAiJson(args: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0.1,
        max_completion_tokens: args.maxTokens ?? 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: args.systemPrompt },
          { role: 'user', content: args.userPrompt }
        ]
      })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

async function runAiCompilationPass(
  detail: GrantDetailRecord,
  plan: BandoQuizPlan,
  familyTags: EligibilityFamily[]
) {
  const model = process.env.OPENAI_SINGLE_BANDO_COMPILE_MODEL?.trim() || 'gpt-4o-mini';
  const source = plan.requirements
    .map((requirement) => ({
      id: requirement.id,
      category: requirement.category,
      importance: requirement.importance,
      askable: requirement.askable,
      sourceExcerpt: requirement.sourceExcerpt
    }))
    .slice(0, 40);
  const payload = await callOpenAiJson({
    model,
    systemPrompt:
      'Sei un revisore tecnico BNDO. Valuta la qualità di una EligibilitySpec senza inventare requisiti. Rispondi solo JSON.',
    userPrompt: JSON.stringify(
      {
        objective: 'Review compilation coverage and decisive dimensions.',
        bando: { id: detail.id, title: detail.title, authority: detail.authority, beneficiaries: detail.beneficiaries },
        familyTags,
        requirements: source
      },
      null,
      2
    ),
    maxTokens: 900
  });
  if (!payload) return null;
  const confidenceRaw = Number(payload.confidence ?? payload.quality ?? 0.7);
  return {
    model,
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.7,
    decisiveDimensions: parseStringArray(payload.decisiveDimensions),
    missingDecisiveDimensions: parseStringArray(payload.missingDecisiveDimensions),
    notes: parseStringArray(payload.notes)
  };
}

async function runAiReviewerPass(spec: CompiledEligibilitySpec) {
  const baseModel = process.env.OPENAI_SINGLE_BANDO_REVIEW_MODEL?.trim() || 'gpt-4.1-mini';
  const escalationModel = process.env.OPENAI_SINGLE_BANDO_COMPLEX_MODEL?.trim() || 'gpt-4.1';
  const shouldEscalate =
    spec.compileConfidence < 0.7 ||
    spec.familyTags.includes('mixed_beneficiaries') ||
    spec.familyTags.includes('university_research_entity') ||
    spec.review.deterministicIssues.length > 0;
  const model = shouldEscalate ? escalationModel : baseModel;

  const payload = await callOpenAiJson({
    model,
    systemPrompt:
      'Sei il reviewer finale BNDO per quiz di ammissibilità single-bando. Non rigenerare il quiz: valida coerenza, contraddizioni e copertura. Solo JSON.',
    userPrompt: JSON.stringify(
      {
        objective: 'Review eligibility spec consistency and reliability.',
        spec: {
          family: spec.family,
          familyTags: spec.familyTags,
          compileConfidence: spec.compileConfidence,
          requirementCount: spec.requirements.length,
          questionCount: spec.plan.questions.length,
          transitions: spec.plan.transitions,
          questions: spec.plan.questions.map((q) => ({
            id: q.id,
            category: q.category,
            question: q.question,
            showIf: q.showIf,
            disqualifyIf: q.disqualifyIf
          }))
        }
      },
      null,
      2
    ),
    maxTokens: 1000
  });
  if (!payload) return null;
  const reliabilityRaw = Number(payload.reliabilityScore ?? payload.confidence ?? 0.7);
  return {
    model,
    reliabilityScore: Number.isFinite(reliabilityRaw) ? Math.max(0, Math.min(1, reliabilityRaw)) : 0.7,
    issues: parseStringArray(payload.issues),
    contradictions: parseStringArray(payload.contradictions),
    repairSuggestions: parseStringArray(payload.repairSuggestions)
  };
}

function shouldRunAiCompilePass(
  options: CompileEligibilityOptions | undefined,
  compileConfidence: number,
  familyTags: EligibilityFamily[],
  deterministicIssues: string[]
) {
  if (options?.enableAi === false) return false;
  if (!process.env.OPENAI_API_KEY?.trim()) return false;
  if (familyTags.includes('mixed_beneficiaries')) return true;
  if (compileConfidence < 0.8) return true;
  if (deterministicIssues.length > 0) return true;
  return false;
}

export function parseCompiledEligibilitySpec(raw: unknown): CompiledEligibilitySpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 'single_bando_eligibility_spec_v1') return null;
  if (typeof value.bandoId !== 'string' || typeof value.sourceFingerprint !== 'string') return null;
  if (!Array.isArray(value.familyTags) || !value.plan || !value.idealApplicant || !Array.isArray(value.requirements)) {
    return null;
  }
  const plan = value.plan as Record<string, unknown>;
  if (!Array.isArray(plan.questions) || !Array.isArray(plan.transitions)) return null;
  const parsed = raw as CompiledEligibilitySpec;
  if (!parsed.publicationGate) {
    const familyTags = Array.isArray(parsed.familyTags) ? parsed.familyTags : [];
    parsed.publicationGate = evaluatePublicationGate({
      plan: parsed.plan,
      requirements: parsed.requirements,
      familyTags: familyTags as EligibilityFamily[]
    });
    if (parsed.publicationGate.status === 'quarantine' && parsed.compileStatus === 'ready') {
      parsed.compileStatus = 'needs_review';
    }
  }
  if (!Array.isArray(parsed.publicationGate.warnings)) parsed.publicationGate.warnings = [];
  if (!Array.isArray(parsed.publicationGate.resolvedDimensions)) {
    parsed.publicationGate.resolvedDimensions = parsed.publicationGate.resolvedDimensionsOnShortestSuccessPath ?? [];
  }
  if (typeof parsed.publicationGate.depthTarget !== 'number') {
    parsed.publicationGate.depthTarget = expectedMinimumMeaningfulDepth(
      parsed.publicationGate.decisiveDimensions?.length ?? 0,
      (parsed.familyTags ?? []) as EligibilityFamily[]
    );
  }
  if (typeof parsed.publicationGate.discriminatingScore !== 'number') {
    parsed.publicationGate.discriminatingScore = Number(
      Math.max(
        0,
        Math.min(
          1,
          (parsed.publicationGate.discriminatingQuestionCount ?? 0) /
            Math.max(1, parsed.publicationGate.depthTarget ?? 1)
        )
      ).toFixed(3)
    );
  }
  if (typeof parsed.publicationGate.semanticSpecificityScore !== 'number') {
    parsed.publicationGate.semanticSpecificityScore = computeSemanticSpecificityScore(parsed.plan);
  }
  if (typeof parsed.publicationGate.redundancyScore !== 'number') {
    parsed.publicationGate.redundancyScore = computeRedundancyScore(parsed.plan);
  }
  parsed.depthTarget = parsed.depthTarget ?? parsed.publicationGate.depthTarget;
  parsed.resolvedDecisiveByShortestSuccessPath =
    parsed.resolvedDecisiveByShortestSuccessPath ??
    (parsed.publicationGate.resolvedDimensionsOnShortestSuccessPath ?? []);
  parsed.discriminatingScore = parsed.discriminatingScore ?? parsed.publicationGate.discriminatingScore;
  parsed.semanticSpecificityScore =
    parsed.semanticSpecificityScore ?? parsed.publicationGate.semanticSpecificityScore;
  parsed.redundancyScore = parsed.redundancyScore ?? parsed.publicationGate.redundancyScore;
  parsed.publicationWarnings =
    parsed.publicationWarnings ??
    uniqueStrings([
      ...(Array.isArray(parsed.publicationGate.warnings) ? parsed.publicationGate.warnings : []),
      ...(parsed.publicationGate.status === 'publish_with_warning' ? ['publication_warning_status'] : [])
    ]);
  return parsed;
}

export function isCompiledEligibilitySpecReusable(
  spec: CompiledEligibilitySpec | null | undefined,
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
) {
  if (!spec) return false;
  if (spec.compileStatus !== 'ready') return false;
  const fingerprint = computeSingleBandoSourceFingerprint(detail, explainability);
  return spec.sourceFingerprint === fingerprint;
}

export function isCompiledEligibilitySpecPublishable(spec: CompiledEligibilitySpec | null | undefined) {
  if (!spec) return false;
  if (spec.compileStatus !== 'ready') return false;
  if (!spec.publicationGate) return false;
  return spec.publicationGate.status === 'publish' || spec.publicationGate.status === 'publish_with_warning';
}

export async function compileSingleBandoEligibilitySpec(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord,
  options?: CompileEligibilityOptions
): Promise<CompiledEligibilitySpec> {
  const sourceFingerprint = computeSingleBandoSourceFingerprint(detail, explainability);
  const cached = options?.cachedSpec ?? null;
  if (!options?.forceRecompile && cached && cached.sourceFingerprint === sourceFingerprint) {
    return cached;
  }

  const finalized = finalizeQuizPlan(detail, explainability);
  const compileConfidence = estimateCompileConfidence(finalized.plan.requirements, finalized.diagnostics, finalized.plan);
  const familyInfo = classifyEligibilityFamilies(detail, finalized.plan.requirements, finalized.idealApplicant);
  const deterministicReview = buildDeterministicReview(finalized.plan, compileConfidence, finalized.diagnostics);
  const publicationGate = evaluatePublicationGate({
    plan: finalized.plan,
    requirements: finalized.plan.requirements,
    familyTags: familyInfo.familyTags
  });

  const revisionNumber =
    cached && cached.sourceFingerprint !== sourceFingerprint
      ? (cached.revision?.revision ?? 1) + 1
      : cached?.revision?.revision ?? 1;

  let spec: CompiledEligibilitySpec = {
    schemaVersion: 'single_bando_eligibility_spec_v1',
    bandoId: detail.id,
    bandoTitle: detail.title,
    family: familyInfo.family,
    familyTags: familyInfo.familyTags,
    compileStatus:
      finalized.plan.questions.length === 0 || publicationGate.status === 'quarantine'
        ? 'needs_review'
        : 'ready',
    compileConfidence,
    sourceFingerprint,
    requirements: finalized.plan.requirements,
    idealApplicant: finalized.idealApplicant,
    plan: finalized.plan,
    review: deterministicReview,
    publicationGate,
    depthTarget: publicationGate.depthTarget,
    resolvedDecisiveByShortestSuccessPath: publicationGate.resolvedDimensionsOnShortestSuccessPath,
    discriminatingScore: publicationGate.discriminatingScore,
    semanticSpecificityScore: publicationGate.semanticSpecificityScore,
    redundancyScore: publicationGate.redundancyScore,
    publicationWarnings: publicationGate.warnings,
    revision: {
      revision: revisionNumber,
      sourceFingerprint,
      compiledAt: new Date().toISOString(),
      reviewerAt: null,
      reviewerStatus: deterministicReview.deterministicIssues.length > 0 ? 'warning' : 'ok'
    },
    aiCompilation: null,
    aiReview: null
  };

  if (
    shouldRunAiCompilePass(options, spec.compileConfidence, spec.familyTags, spec.review.deterministicIssues)
  ) {
    const aiCompile = await runAiCompilationPass(detail, spec.plan, spec.familyTags);
    if (aiCompile) {
      spec = {
        ...spec,
        compileConfidence: Math.max(spec.compileConfidence, aiCompile.confidence * 0.9),
        aiCompilation: aiCompile
      };
    }
    const aiReview = await runAiReviewerPass(spec);
    if (aiReview) {
      const reviewerIssues = [...aiReview.issues, ...aiReview.contradictions];
      const mergedIssues = uniqueStrings([...spec.review.reviewerIssues, ...reviewerIssues]);
      const deterministicIssues = spec.review.deterministicIssues;
      const mergedBranchRisks = uniqueStrings([
        ...spec.review.branchConsistencyRisks,
        ...reviewerIssues.filter((entry) => /branch|transition|contrad/i.test(normalizeText(entry)))
      ]);
      const reliabilityScore = Math.max(0, Math.min(1, (spec.review.reliabilityScore + aiReview.reliabilityScore) / 2));
      const compileStatus =
        spec.plan.questions.length === 0
          ? 'failed'
          : reliabilityScore < 0.55 ||
              deterministicIssues.length > 0 ||
              spec.publicationGate.status === 'quarantine'
            ? 'needs_review'
            : 'ready';
      spec = {
        ...spec,
        compileStatus,
        aiReview,
        review: {
          ...spec.review,
          reviewerIssues: mergedIssues,
          branchConsistencyRisks: mergedBranchRisks,
          reliabilityScore,
          recommendedActions: uniqueStrings([
            ...spec.review.recommendedActions,
            ...(spec.publicationGate.status === 'quarantine'
              ? ['publication_gate_failed']
              : spec.publicationGate.status === 'publish_with_warning'
                ? ['publication_gate_warning']
                : []),
            ...(compileStatus !== 'ready' ? ['manual_review_required'] : []),
            ...aiReview.repairSuggestions
          ])
        },
        revision: {
          ...spec.revision,
          reviewerAt: new Date().toISOString(),
          reviewerStatus: compileStatus === 'ready' ? 'ok' : compileStatus === 'needs_review' ? 'warning' : 'failed'
        }
      };
    }
  }

  return spec;
}

export function executeCompiledEligibilitySpecInUI(spec: CompiledEligibilitySpec): PracticeQuizQuestion[] {
  if (!isCompiledEligibilitySpecPublishable(spec)) return [];
  return executeQuizPlanInUI(spec.plan, spec.idealApplicant);
}

export type QuestionSetAssessment = {
  ok: boolean;
  reasons: string[];
};

export function assessSingleBandoQuestionSet(questions: PracticeQuizQuestion[]): QuestionSetAssessment {
  const reasons: string[] = [];
  if (!questions || questions.length === 0) reasons.push('no_questions');
  const uniqueKeys = new Set((questions ?? []).map((question) => question.questionKey));
  if (uniqueKeys.size !== (questions ?? []).length) reasons.push('duplicate_question_keys');

  const hasForbidden = questions.some((question) =>
    containsForbiddenGenericLanguage(normalizeText(`${question.label} ${question.description ?? ''}`))
  );
  if (hasForbidden) reasons.push('contains_forbidden_generic_language');

  const ungrounded = questions.some((question) => {
    const metadata =
      question.metadata && typeof question.metadata === 'object'
        ? (question.metadata as Record<string, unknown>)
        : null;
    const requirementIds = Array.isArray(metadata?.requirementIds) ? metadata?.requirementIds : [];
    const sourceExcerpt = typeof metadata?.sourceExcerpt === 'string' ? metadata.sourceExcerpt : '';
    return requirementIds.length === 0 || normalizeText(sourceExcerpt).length < 6;
  });
  if (ungrounded) reasons.push('contains_ungrounded_question');

  const hasBlocking = questions.some((question) => question.rule.kind === 'critical_boolean' || question.rule.kind === 'choice_in_set');
  if (!hasBlocking) reasons.push('missing_blocking_questions');

  const italianUnsafe = questions.some((question) => !isItalianQuestionQualitySafe(question.label));
  if (italianUnsafe) reasons.push('italian_quality_low');

  const categories = new Set(
    questions
      .map((question) =>
        question.metadata && typeof question.metadata.category === 'string'
          ? normalizeText(question.metadata.category)
          : ''
      )
      .filter(Boolean)
  );
  const decisiveFactorCount = Math.max(
    0,
    ...questions.map((question) => {
      const metadata = question.metadata as Record<string, unknown> | undefined;
      const value = metadata?.decisiveFactors;
      return Array.isArray(value) ? value.length : 0;
    })
  );
  if (decisiveFactorCount >= 6 && questions.length < 8) {
    reasons.push('minimum_depth_not_met_for_decisive_factors');
  } else if (decisiveFactorCount >= 5 && questions.length < 6) {
    reasons.push('minimum_depth_not_met_for_decisive_factors');
  } else if (decisiveFactorCount >= 4 && questions.length < 5) {
    reasons.push('minimum_depth_not_met_for_decisive_factors');
  }
  if (decisiveFactorCount >= 4 && categories.size < 4) {
    reasons.push('resolved_dimensions_too_generic');
  }

  return { ok: reasons.length === 0, reasons };
}

export function buildSingleBandoVerificationQuiz(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): PracticeQuizQuestion[] {
  const final = finalizeVerificationQuestions(detail, explainability);
  const assessment = assessSingleBandoQuestionSet(final.questions);
  if (final.questions.length > 0 && assessment.ok) return final.questions;
  return [];
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
