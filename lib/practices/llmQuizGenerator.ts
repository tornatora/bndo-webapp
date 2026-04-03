import { OpenAI } from 'openai';
import { z } from 'zod';
import type { GrantDetailRecord, GrantExplainabilityRecord } from '@/lib/grants/details';
import type { PracticeQuizQuestion, PracticeQuizOption } from './orchestrator';

let cachedOpenAiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (cachedOpenAiClient) return cachedOpenAiClient;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  cachedOpenAiClient = new OpenAI({ apiKey });
  return cachedOpenAiClient;
}

// Schema definition for the expected JSON structured output from the LLM
const PracticeQuizOptionSchema = z.object({
  value: z.string(),
  label: z.string()
});

const PracticeQuizQuestionSchema = z.object({
  questionKey: z.string().describe("Identificativo univoco della domanda in inglese snake_case (es. age_check, region_check)"),
  label: z.string().describe("La domanda cruda e diretta posta all'utente (es. 'Hai un'eta compresa tra 18 e 35 anni?', 'Sei disoccupato?', 'Aprirai l'attivita nel Mezzogiorno?')"),
  description: z.string().nullable().describe("Spiegazione aggiuntiva breve. Può essere null."),
  reasoning: z.string().describe("Spiegazione tecnica del PERCHÉ questa domanda è fondamentale per questo bando specifico, citando se possibile la soglia o il requisito normativo."),
  questionType: z.enum(['single_select', 'boolean', 'text', 'number']),
  options: z.array(PracticeQuizOptionSchema).describe("Per 'boolean', fornisci sempre: [{value: 'yes', label: 'Si'}, {value: 'no', label: 'No'}]"),
  isRequired: z.boolean().describe("Imposta sempre a true per le domande fondamentali."),
  validation: z.object({
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    maxLength: z.number().nullable().optional()
  }).describe("Regole sui campi input testuali o numerici, default { }"),
  rule: z.object({
    kind: z.enum(['critical_boolean', 'investment_range', 'ateco_validation', 'geographic_validation', 'choice_in_set', 'informational', 'none']),
    expected: z.string().nullable().optional()
  }).describe("CRITICO: Per i requisiti bloccanti usa 'critical_boolean'. Per ATECO usa 'ateco_validation'. Per Sede usa 'geographic_validation'."),
  metadata: z.object({
    category: z.string().nullable().optional(),
    ruleStrength: z.enum(['hard', 'soft']).nullable().optional(),
    showIf: z
      .object({
        questionKey: z.string().min(1),
        anyOf: z.array(z.string()).optional(),
        equals: z.string().optional(),
        noneOf: z.array(z.string()).optional()
      })
      .nullable()
      .optional()
  }).describe("Categoria (es. { category: 'age' })")
});

const QuizTemplateSchema = z.object({
  questions: z.array(PracticeQuizQuestionSchema).describe("Lista di domande CRITICHE (max 10). Più sono specifiche e 'hard', meglio è.")
});

function normalizeQuizText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDocumentationQuestion(question: PracticeQuizQuestion) {
  const category =
    question.metadata && typeof question.metadata.category === 'string'
      ? normalizeQuizText(question.metadata.category)
      : '';

  const haystack = normalizeQuizText(
    [
      question.questionKey,
      question.label,
      question.description ?? '',
      question.reasoning ?? '',
      category
    ].join(' ')
  );

  if (!haystack) return false;
  if (category.includes('document')) return true;
  if (category.includes('doc')) return true;

  return /(document|documentazione|documenti|allegat|visura|bilanc|business plan|piano impresa|preventiv|certificaz|isee|did|atto costitutivo|statuto)/.test(
    haystack
  );
}

const ITALY_REGIONS = [
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

type RequirementSignals = {
  textNorm: string;
  allowedRegions: string[];
  ageMin: number | null;
  ageMax: number | null;
  companyYearsMin: number | null;
  companyYearsMax: number | null;
  needsEmploymentStatus: boolean;
  allowedEmploymentValues: string[];
  likelyStartupOnly: boolean;
  likelyExistingOnly: boolean;
};

type RuleStrength = 'hard' | 'soft';

function normalizeRuleStrength(value: unknown, fallback: RuleStrength = 'soft'): RuleStrength {
  const token = normalizeQuizText(String(value ?? ''));
  if (token === 'hard') return 'hard';
  if (token === 'soft') return 'soft';
  return fallback;
}

function slugifyKey(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64);
}

function normalizeList(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNumberFromRegex(text: string, regex: RegExp): number | null {
  const match = regex.exec(text);
  if (!match?.[1]) return null;
  return toNumber(match[1]);
}

function uniqueOptions(options: PracticeQuizOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = normalizeQuizText(option.value || option.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractRegionsFromText(textNorm: string) {
  const found = new Set<string>();
  for (const region of ITALY_REGIONS) {
    const regionNorm = normalizeQuizText(region);
    if (regionNorm && textNorm.includes(regionNorm)) {
      found.add(region);
    }
  }
  return Array.from(found);
}

function computeAgeBounds(textNorm: string) {
  let ageMin = firstNumberFromRegex(textNorm, /(?:eta|età)[^\d]{0,16}(?:minim[ao]|almeno)\s*(\d{1,2})/i);
  let ageMax = firstNumberFromRegex(textNorm, /(?:eta|età)[^\d]{0,16}(?:massim[ao]|fino a|non oltre|under)\s*(\d{1,2})/i);

  const under = firstNumberFromRegex(textNorm, /under\s*(\d{1,2})/i);
  if (under !== null) {
    ageMax = under;
  }

  const betweenMatch = /tra\s*(\d{1,2})\s*(?:e|-)\s*(\d{1,2})/.exec(textNorm);
  if (betweenMatch?.[1] && betweenMatch?.[2]) {
    ageMin = toNumber(betweenMatch[1]);
    ageMax = toNumber(betweenMatch[2]);
  }

  return {
    ageMin: ageMin !== null && ageMin > 0 ? ageMin : null,
    ageMax: ageMax !== null && ageMax > 0 ? ageMax : null
  };
}

function computeCompanyAgeBounds(textNorm: string) {
  const min = firstNumberFromRegex(textNorm, /(?:almeno|minimo)\s*(\d{1,2})\s*anni/i);
  const max = firstNumberFromRegex(textNorm, /(?:meno di|massimo|entro)\s*(\d{1,2})\s*anni/i);
  return {
    companyYearsMin: min !== null && min >= 0 ? min : null,
    companyYearsMax: max !== null && max >= 0 ? max : null
  };
}

function extractRequirementSignals(detail: GrantDetailRecord, explainability: GrantExplainabilityRecord): RequirementSignals {
  const textNorm = normalizeQuizText(
    [
      detail.title,
      detail.description ?? '',
      detail.aidForm ?? '',
      detail.aidIntensity ?? '',
      detail.beneficiaries.join(' '),
      detail.sectors.join(' '),
      JSON.stringify(detail.requisitiHard ?? {}),
      JSON.stringify(detail.requisitiSoft ?? {}),
      JSON.stringify(detail.requisitiStrutturati ?? {}),
      explainability.missingRequirements.join(' ')
    ].join(' ')
  );

  const allowedRegions = extractRegionsFromText(textNorm);
  const { ageMin, ageMax } = computeAgeBounds(textNorm);
  const { companyYearsMin, companyYearsMax } = computeCompanyAgeBounds(textNorm);

  const employmentCandidates = [
    { value: 'disoccupato', regex: /(disoccup)/ },
    { value: 'inoccupato', regex: /(inoccup)/ },
    { value: 'gol', regex: /(\bgol\b)/ },
    { value: 'working_poor', regex: /(working poor|lavoratore svantaggiato|fragilit)/ },
    { value: 'libero_professionista', regex: /(libero professionista|partita iva|lavoro autonomo)/ },
    { value: 'tempo_determinato', regex: /(tempo determinato)/ },
    { value: 'tempo_indeterminato', regex: /(tempo indeterminato)/ }
  ] as const;

  const allowedEmploymentValues = employmentCandidates
    .filter((candidate) => candidate.regex.test(textNorm))
    .map((candidate) => candidate.value);

  const needsEmploymentStatus =
    /(did|stato occupazionale|disoccup|inoccup|gol|working poor|tempo determinato|tempo indeterminato)/.test(textNorm);

  const likelyStartupOnly =
    /(nuove imprese|startup|aspiranti imprenditori|da costituire|non ancora avviata)/.test(textNorm);
  const likelyExistingOnly =
    /(imprese gia|gia costituite|gia attive|iscritte al registro imprese da almeno)/.test(textNorm);

  return {
    textNorm,
    allowedRegions,
    ageMin,
    ageMax,
    companyYearsMin,
    companyYearsMax,
    needsEmploymentStatus,
    allowedEmploymentValues,
    likelyStartupOnly,
    likelyExistingOnly
  };
}

function readEconomicBounds(detail: GrantDetailRecord) {
  const structured =
    detail.requisitiStrutturati && typeof detail.requisitiStrutturati === 'object'
      ? ((detail.requisitiStrutturati.economic as Record<string, unknown> | undefined) ?? {})
      : {};

  const min = toNumber(structured.costMin);
  const max = toNumber(structured.costMax) ?? detail.budgetTotal ?? null;
  return {
    min: min && min > 0 ? min : null,
    max: max && max > 0 ? max : null,
    label:
      typeof structured.displayProjectAmountLabel === 'string' && structured.displayProjectAmountLabel.trim()
        ? structured.displayProjectAmountLabel.trim()
        : null
  };
}

function buildChoiceInSetExpected(values: string[]) {
  return values.join('|');
}

function detectRuleStrength(text: string, fallback: RuleStrength = 'soft'): RuleStrength {
  const normalized = normalizeQuizText(text);
  if (!normalized) return fallback;
  if (
    /(deve|devono|obbligatori|obbligatorio|esclusivamente|solo|non ammess|inammissibil|pena esclusione|requisito bloccante|vincolo formale|ammissibilita)/.test(
      normalized
    )
  ) {
    return 'hard';
  }
  if (/(potrebbe|indicativ|preferibil|consigliat|di norma|tipic|in genere|opportunita)/.test(normalized)) {
    return 'soft';
  }
  return fallback;
}

function normalizeRequirementBullet(value: string) {
  return String(value ?? '')
    .replace(/^[\-\*\d\.\)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericRequirementPlaceholder(value: string) {
  const text = normalizeQuizText(value);
  if (!text) return true;
  return (
    /(verificare requisiti specifici|testo ufficiale|confermare documentazione|finestra temporale|analisi generale disponibile|compatibilita personalizzata|requisiti base|coerenza del profilo)/.test(
      text
    ) ||
    text.length < 12
  );
}

function clipText(value: string, maxLength = 120) {
  const clean = normalizeRequirementBullet(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(10, maxLength - 1)).trim()}…`;
}

function isDocumentationRequirementText(value: string) {
  const text = normalizeQuizText(value);
  if (!text) return true;
  return /(document|documentazione|documenti|allegat|visura|bilanc|business plan|piano impresa|preventiv|certificaz|isee|did|atto costitutivo|statuto|firma digitale|pec|carta identita|codice fiscale)/.test(
    text
  );
}

function categoryFromRequirementText(value: string) {
  const text = normalizeQuizText(value);
  if (/(region|territor|sede|comune|provincia)/.test(text)) return 'territorio';
  if (/(ateco|settor|filiera|comparto)/.test(text)) return 'settore';
  if (/(beneficiar|impres|soggetto|richiedente|pmi|startup|microimpresa|professionista)/.test(text)) return 'beneficiari';
  if (/(eta|under|over|giovan)/.test(text)) return 'eta';
  if (/(occupaz|disoccup|inoccup|gol|contratto)/.test(text)) return 'occupazionale';
  if (/(anni|anzianit|costituit)/.test(text)) return 'anzianita';
  if (/(importo|investimento|spesa|budget|fatturato|ricavi)/.test(text)) return 'economico';
  if (/(scadenz|termine|finestra|timeline)/.test(text)) return 'timeline';
  return 'requisiti';
}

function extractNumericBoundsFromRequirement(value: string) {
  const normalized = normalizeQuizText(value);
  if (!normalized) return { min: null as number | null, max: null as number | null };

  const betweenMatch = /tra\s*([\d\.\,]+)\s*(?:e|-)\s*([\d\.\,]+)/.exec(normalized);
  if (betweenMatch?.[1] && betweenMatch?.[2]) {
    return {
      min: toNumber(betweenMatch[1]),
      max: toNumber(betweenMatch[2])
    };
  }

  const minMatch = /(?:almeno|minimo|superiore a|oltre)\s*([\d\.\,]+)/.exec(normalized);
  const maxMatch = /(?:massimo|inferiore a|fino a|non oltre)\s*([\d\.\,]+)/.exec(normalized);
  return {
    min: minMatch?.[1] ? toNumber(minMatch[1]) : null,
    max: maxMatch?.[1] ? toNumber(maxMatch[1]) : null
  };
}

function flattenRequirementTexts(input: unknown, acc: string[]) {
  if (input === null || input === undefined) return;
  if (Array.isArray(input)) {
    for (const item of input) flattenRequirementTexts(item, acc);
    return;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      flattenRequirementTexts(value, acc);
    }
    return;
  }
  if (typeof input === 'string') {
    const normalized = normalizeRequirementBullet(input);
    if (normalized) acc.push(normalized);
  }
}

function collectRequirementCandidates(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
) {
  const highSignalCandidates: string[] = [];
  const lowSignalCandidates: string[] = [];

  // Priorità ai campi strutturati del bando (meno rumore, più requisiti reali)
  flattenRequirementTexts(detail.requisitiHard ?? {}, highSignalCandidates);
  flattenRequirementTexts(detail.requisitiStrutturati ?? {}, highSignalCandidates);
  flattenRequirementTexts(detail.requisitiSoft ?? {}, lowSignalCandidates);
  flattenRequirementTexts(explainability.missingRequirements ?? [], lowSignalCandidates);

  const candidates = [...highSignalCandidates, ...lowSignalCandidates];

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (isGenericRequirementPlaceholder(candidate)) continue;
    const normalized = normalizeQuizText(candidate);
    if (!normalized) continue;
    if (isDocumentationRequirementText(candidate)) continue;
    if (normalized.length < 8) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(candidate);
    if (deduped.length >= 12) break;
  }
  return deduped;
}

function extractLegalFormCandidates(value: string) {
  const normalized = normalizeQuizText(value);
  if (!normalized) return [] as Array<{ value: string; label: string }>;
  const candidates: Array<{ value: string; label: string }> = [];
  const map: Array<{ test: RegExp; value: string; label: string }> = [
    { test: /\bsrls?\b/, value: 'srl', label: 'SRL / SRLS' },
    { test: /\bspa\b/, value: 'spa', label: 'SPA' },
    { test: /\bsnc\b/, value: 'snc', label: 'SNC' },
    { test: /\bsas\b/, value: 'sas', label: 'SAS' },
    { test: /(cooperativ)/, value: 'cooperativa', label: 'Cooperativa' },
    { test: /(ditta individuale|impresa individuale)/, value: 'ditta_individuale', label: 'Ditta individuale' },
    { test: /(libero professionista|partita iva|p iva|lavoro autonomo)/, value: 'libero_professionista', label: 'Libero professionista / Partita IVA' },
    { test: /(startup innovativ)/, value: 'startup_innovativa', label: 'Startup innovativa' },
    { test: /\bpmi\b/, value: 'pmi', label: 'PMI' },
    { test: /(microimpres|micro impresa)/, value: 'micro_impresa', label: 'Micro impresa' }
  ];
  for (const entry of map) {
    if (entry.test.test(normalized)) {
      candidates.push({ value: entry.value, label: entry.label });
    }
  }
  return uniqueOptions(candidates);
}

function isExclusionRequirement(value: string) {
  const normalized = normalizeQuizText(value);
  return /(non deve|non devono|assenza di|non avere|non essere|esclu)/.test(normalized);
}

function buildRequirementSpecificQuestions(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord,
  occupiedQuestionKeys: Set<string>
): PracticeQuizQuestion[] {
  const requirements = collectRequirementCandidates(detail, explainability).slice(0, 6);

  const questions: PracticeQuizQuestion[] = [];
  const takenKeys = new Set(Array.from(occupiedQuestionKeys));
  for (const requirement of requirements) {
    const requirementNorm = normalizeQuizText(requirement);
    if (!requirementNorm) continue;
    if (requirementNorm.length > 220 || isGenericRequirementPlaceholder(requirement)) {
      continue;
    }

    const keyBase = slugifyKey(`req_${requirement}`) || 'requisito_specifico';
    let key = keyBase;
    let suffix = 1;
    while (takenKeys.has(key)) {
      suffix += 1;
      key = `${keyBase}_${suffix}`;
    }
    takenKeys.add(key);
    const category = categoryFromRequirementText(requirement);
    const ruleStrength = detectRuleStrength(requirement, 'soft');
    const numeric = extractNumericBoundsFromRequirement(requirement);
    const legalForms = extractLegalFormCandidates(requirement);
    const lower = requirementNorm;

    if ((numeric.min !== null || numeric.max !== null) && /(fatturat|ricav|import|investiment|spesa|dipendent)/.test(lower)) {
      const isEmployees = /dipendent/.test(lower);
      questions.push({
        questionKey: key,
        label: isEmployees
          ? 'Quanti dipendenti ha attualmente l’impresa?'
          : /(fatturat|ricav)/.test(lower)
            ? 'Qual è il fatturato annuo più recente dell’impresa (EUR)?'
            : 'Qual è l’importo previsto relativo a questo requisito (EUR)?',
        description: `Requisito del bando: ${clipText(requirement, 150)}`,
        reasoning: 'Serve a verificare una soglia numerica prevista dal bando.',
        questionType: 'number',
        options: [],
        isRequired: true,
        validation: {
          min: numeric.min,
          max: numeric.max
        },
        rule: { kind: 'investment_range' },
        metadata: { category, decisive: true, ruleStrength, requirementSource: requirement }
      });
      continue;
    }

    if (legalForms.length > 0) {
      const options = uniqueOptions([
        ...legalForms,
        { value: 'altro_non_ammesso', label: 'Altro / non in elenco' }
      ]);
      questions.push({
        questionKey: key,
        label: 'Qual è la forma giuridica del soggetto che presenta la domanda?',
        description: `Requisito del bando: ${clipText(requirement, 150)}`,
        reasoning: 'Serve a verificare se la forma giuridica è tra quelle ammesse.',
        questionType: 'single_select',
        options,
        isRequired: true,
        validation: {},
        rule: {
          kind: 'choice_in_set',
          expected: buildChoiceInSetExpected(options.filter((option) => option.value !== 'altro_non_ammesso').map((option) => option.value))
        },
        metadata: { category: 'beneficiari', decisive: true, ruleStrength, requirementSource: requirement }
      });
      continue;
    }

    if (/(ateco|codice attivit)/.test(lower)) {
      questions.push({
        questionKey: key,
        label: 'Il tuo codice ATECO primario rientra tra quelli ammessi dal bando?',
        description: `Requisito del bando: ${clipText(requirement, 150)}`,
        reasoning: 'Serve a verificare la compatibilità del settore/ATECO.',
        questionType: 'boolean',
        options: [
          { value: 'yes', label: 'Sì' },
          { value: 'no', label: 'No' }
        ],
        isRequired: true,
        validation: {},
        rule: { kind: 'critical_boolean', expected: 'yes' },
        metadata: { category: 'settore', decisive: true, ruleStrength, requirementSource: requirement }
      });
      continue;
    }

    const exclusion = isExclusionRequirement(requirement);
    const hasReliableBooleanSignal =
      exclusion &&
      /(falliment|liquidaz|procedur|condann|durc|irregolarita|antimafia|aiuti illegali|revoca)/.test(lower);

    if (hasReliableBooleanSignal) {
      questions.push({
        questionKey: key,
        label: `È presente questa condizione di esclusione: ${clipText(requirement, 96)}?`,
        description: 'Se la risposta è sì, la domanda non è ammissibile.',
        reasoning: 'Serve a verificare una causa di esclusione prevista dal bando.',
        questionType: 'boolean',
        options: [
          { value: 'yes', label: 'Sì' },
          { value: 'no', label: 'No' }
        ],
        isRequired: true,
        validation: {},
        rule: { kind: 'critical_boolean', expected: 'no' },
        metadata: { category, decisive: true, ruleStrength: 'hard', requirementSource: requirement }
      });
      continue;
    }

    if (ruleStrength === 'hard' || /(deve|obbligator|solo|ammess|esclus)/.test(lower)) {
      questions.push({
        questionKey: key,
        label: `Confermi questo requisito del bando: ${clipText(requirement, 90)}?`,
        description: null,
        reasoning: 'Serve a verificare un requisito vincolante del bando.',
        questionType: 'boolean',
        options: [
          { value: 'yes', label: 'Sì' },
          { value: 'no', label: 'No' }
        ],
        isRequired: true,
        validation: {},
        rule: { kind: 'critical_boolean', expected: 'yes' },
        metadata: { category, decisive: true, ruleStrength, requirementSource: requirement }
      });
    }
  }

  return questions.slice(0, 4);
}

function categoryOfQuestion(question: PracticeQuizQuestion): string {
  const direct = question.metadata && typeof question.metadata.category === 'string'
    ? normalizeQuizText(question.metadata.category)
    : '';
  if (direct) return direct;
  const text = normalizeQuizText(`${question.questionKey} ${question.label} ${question.description ?? ''} ${question.reasoning ?? ''}`);
  if (/(beneficiar|richiedent|soggetto)/.test(text)) return 'beneficiari';
  if (/(settor|ateco)/.test(text)) return 'settore';
  if (/(region|territor|sede)/.test(text)) return 'territorio';
  if (/(importo|investimento|budget|spesa)/.test(text)) return 'economico';
  if (/(eta|under|over|giovan)/.test(text)) return 'eta';
  if (/(occupaz|disoccup|inoccup|gol|contratto)/.test(text)) return 'occupazionale';
  if (/(anni|anzianit|costituit)/.test(text)) return 'anzianita';
  if (/(timeline|scadenz|termine)/.test(text)) return 'timeline';
  return 'other';
}

function hasWeakQuizShape(questions: PracticeQuizQuestion[]) {
  if (questions.length < 5) return true;
  const required = questions.filter((question) => question.isRequired);
  const nonBooleanCount = required.filter((question) => question.questionType !== 'boolean').length;
  if (nonBooleanCount < 2) return true;

  const decisiveCount = required.filter((question) =>
    ['critical_boolean', 'choice_in_set', 'investment_range', 'ateco_validation', 'geographic_validation'].includes(
      question.rule.kind
    )
  ).length;
  if (decisiveCount < 3) return true;

  const distinctCategories = new Set(required.map((question) => categoryOfQuestion(question)));
  if (distinctCategories.size < 3) return true;

  const genericCount = required.filter((question) => {
    const text = normalizeQuizText(`${question.label} ${question.description ?? ''}`);
    return /(il tuo profilo|puoi rispettare|coerente con il bando|requisiti base|confermi di|requisito tecnico più stringente)/.test(
      text
    );
  }).length;
  return genericCount >= Math.ceil(required.length * 0.6);
}

export function buildDeterministicConditionalQuizQuestions(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): PracticeQuizQuestion[] {
  const signals = extractRequirementSignals(detail, explainability);
  const economic = readEconomicBounds(detail);
  const requirementCandidates = collectRequirementCandidates(detail, explainability);
  const keyRequirement = requirementCandidates[0] ?? '';

  const beneficiaryOptions = uniqueOptions([
    ...normalizeList(detail.beneficiaries).slice(0, 6).map((beneficiary) => ({
      value: slugifyKey(beneficiary),
      label: beneficiary
    })),
    { value: 'altro_non_ammesso', label: 'Altro / non in elenco' }
  ]);

  const sectorOptions = uniqueOptions([
    ...normalizeList(detail.sectors).slice(0, 7).map((sector) => ({
      value: slugifyKey(sector),
      label: sector
    })),
    { value: 'altro_settore', label: 'Altro settore' }
  ]);

  const regionOptions = uniqueOptions([
    ...signals.allowedRegions.slice(0, 10).map((region) => ({
      value: slugifyKey(region),
      label: region
    })),
    { value: 'fuori_area', label: 'Fuori area bando' }
  ]);

  const ageBandOptions: PracticeQuizOption[] = [
    { value: '18_25', label: '18 - 25 anni' },
    { value: '26_35', label: '26 - 35 anni' },
    { value: '36_50', label: '36 - 50 anni' },
    { value: 'over_50', label: 'Oltre 50 anni' }
  ];

  const allowedAgeBands = ageBandOptions
    .filter((option) => {
      const [rawMin, rawMax] = option.value.split('_').map((chunk) => toNumber(chunk));
      const bandMin = rawMin ?? 0;
      const bandMax = rawMax ?? 120;
      if (signals.ageMin !== null && bandMax < signals.ageMin) return false;
      if (signals.ageMax !== null && bandMin > signals.ageMax) return false;
      return true;
    })
    .map((option) => option.value);

  const companyAgeOptions: PracticeQuizOption[] = [
    { value: 'da_costituire', label: 'Da costituire' },
    { value: 'meno_12_mesi', label: 'Costituita da meno di 12 mesi' },
    { value: '1_3_anni', label: 'Costituita da 1 a 3 anni' },
    { value: 'oltre_3_anni', label: 'Costituita da oltre 3 anni' }
  ];

  const allowedCompanyAgeValues = companyAgeOptions
    .filter((option) => {
      if (option.value === 'da_costituire') return !signals.likelyExistingOnly;
      if (signals.companyYearsMin !== null) {
        if (signals.companyYearsMin >= 3 && option.value !== 'oltre_3_anni') return false;
        if (signals.companyYearsMin >= 1 && option.value === 'meno_12_mesi') return false;
      }
      if (signals.companyYearsMax !== null) {
        if (signals.companyYearsMax <= 1 && option.value === 'oltre_3_anni') return false;
      }
      return true;
    })
    .map((option) => option.value);

  const employmentOptions: PracticeQuizOption[] = [
    { value: 'disoccupato', label: 'Disoccupato' },
    { value: 'inoccupato', label: 'Inoccupato' },
    { value: 'gol', label: 'Iscritto programma GOL' },
    { value: 'working_poor', label: 'Working poor / lavoratore svantaggiato' },
    { value: 'tempo_determinato', label: 'Contratto a tempo determinato' },
    { value: 'tempo_indeterminato', label: 'Contratto a tempo indeterminato' },
    { value: 'libero_professionista', label: 'Libero professionista / P.IVA' },
    { value: 'altro', label: 'Altro' }
  ];

  const allowedEmploymentValues =
    signals.allowedEmploymentValues.length > 0
      ? Array.from(new Set(signals.allowedEmploymentValues))
      : ['disoccupato', 'inoccupato', 'gol', 'working_poor'];

  const questions: PracticeQuizQuestion[] = [];
  const questionKeys = new Set<string>();

  const pushQuestion = (question: PracticeQuizQuestion) => {
    const key = slugifyKey(question.questionKey || question.label);
    if (!key || questionKeys.has(key)) return;
    questionKeys.add(key);
    const metadata =
      question.metadata && typeof question.metadata === 'object'
        ? { ...question.metadata }
        : {};
    const normalizedStrength = normalizeRuleStrength(
      (metadata as Record<string, unknown>).ruleStrength,
      question.isRequired ? 'hard' : 'soft'
    );
    (metadata as Record<string, unknown>).ruleStrength = normalizedStrength;
    questions.push({ ...question, questionKey: key, metadata });
  };

  const beneficiaryRuleStrength: RuleStrength =
    detail.beneficiaries.length >= 2 && /beneficiar|ammess|solo/.test(signals.textNorm) ? 'hard' : 'soft';
  const sectorRuleStrength: RuleStrength =
    detail.sectors.length >= 3 && /settor|ammess|solo|esclusiv/.test(signals.textNorm) ? 'hard' : 'soft';
  const territoryRuleStrength: RuleStrength = signals.allowedRegions.length >= 1 ? 'hard' : 'soft';
  const ageRuleStrength: RuleStrength = signals.ageMin !== null || signals.ageMax !== null ? 'hard' : 'soft';
  const employmentRuleStrength: RuleStrength = signals.needsEmploymentStatus ? 'hard' : 'soft';
  const companyAgeRuleStrength: RuleStrength =
    signals.companyYearsMin !== null || signals.companyYearsMax !== null ? 'hard' : 'soft';

  if (beneficiaryOptions.length >= 2) {
    pushQuestion({
      questionKey: 'beneficiary_scope_match',
      label: 'Chi presenta la domanda?',
      description:
        beneficiaryOptions.length > 2
          ? `Profili ammessi: ${beneficiaryOptions
              .filter((option) => option.value !== 'altro_non_ammesso')
              .map((option) => option.label)
              .join(', ')}.`
          : 'Seleziona il profilo del richiedente.',
      reasoning: 'Serve a verificare se il richiedente rientra tra i beneficiari ammessi.',
      questionType: 'single_select',
      options: beneficiaryOptions,
      isRequired: true,
      validation: {},
      rule: {
        kind: 'choice_in_set',
        expected: buildChoiceInSetExpected(
          beneficiaryOptions.filter((option) => option.value !== 'altro_non_ammesso').map((option) => option.value)
        )
      },
      metadata: { category: 'beneficiari', decisive: true, ruleStrength: beneficiaryRuleStrength }
    });
  }

  if (sectorOptions.length >= 2) {
    pushQuestion({
      questionKey: 'sector_scope_match',
      label: 'Qual è il settore principale della tua attività?',
      description: 'Seleziona il settore più vicino alla tua attività.',
      reasoning: 'Serve a verificare se il settore rientra tra quelli ammessi.',
      questionType: 'single_select',
      options: sectorOptions,
      isRequired: true,
      validation: {},
      rule: {
        kind: 'choice_in_set',
        expected: buildChoiceInSetExpected(
          sectorOptions.filter((option) => option.value !== 'altro_settore').map((option) => option.value)
        )
      },
      metadata: { category: 'settore', decisive: true, ruleStrength: sectorRuleStrength }
    });

    pushQuestion({
      questionKey: 'sector_scope_clarify',
      label: 'Se hai selezionato "Altro", indica settore e ATECO primario.',
      description: null,
      reasoning: null,
      questionType: 'text',
      options: [],
      isRequired: false,
      validation: { maxLength: 220 },
      rule: { kind: 'informational' },
      metadata: {
        category: 'settore',
        ruleStrength: 'soft',
        showIf: { questionKey: 'sector_scope_match', anyOf: ['altro_settore'] }
      }
    });
  }

  if (regionOptions.length >= 2 && !signals.textNorm.includes('nazionale')) {
    pushQuestion({
      questionKey: 'territory_scope_match',
      label: 'In quale territorio verrà realizzato il progetto?',
      description: `Il bando sembra limitato territorialmente (${signals.allowedRegions.join(', ')}).`,
      reasoning: 'Serve a verificare il requisito territoriale previsto dal bando.',
      questionType: 'single_select',
      options: regionOptions,
      isRequired: true,
      validation: {},
      rule: {
        kind: 'choice_in_set',
        expected: buildChoiceInSetExpected(
          regionOptions.filter((option) => option.value !== 'fuori_area').map((option) => option.value)
        )
      },
      metadata: { category: 'territorio', decisive: true, ruleStrength: territoryRuleStrength }
    });

    pushQuestion({
      questionKey: 'territory_scope_clarify',
      label: 'Se hai selezionato "Fuori area", prevedi una sede operativa in area ammessa?',
      description: null,
      reasoning: null,
      questionType: 'single_select',
      options: [
        { value: 'si_prevista', label: 'Sì' },
        { value: 'no_prevista', label: 'No' }
      ],
      isRequired: false,
      validation: {},
      rule: { kind: 'choice_in_set', expected: 'si_prevista' },
      metadata: {
        category: 'territorio',
        ruleStrength: 'soft',
        showIf: { questionKey: 'territory_scope_match', anyOf: ['fuori_area'] }
      }
    });
  }

  if (signals.ageMin !== null || signals.ageMax !== null) {
    const descriptionParts: string[] = [];
    if (signals.ageMin !== null) descriptionParts.push(`età minima ${signals.ageMin}`);
    if (signals.ageMax !== null) descriptionParts.push(`età massima ${signals.ageMax}`);
    pushQuestion({
      questionKey: 'age_band_match',
      label: 'Qual è la fascia di età del titolare/socio prevalente?',
      description: descriptionParts.length > 0 ? `Vincolo rilevato: ${descriptionParts.join(', ')}.` : null,
      reasoning: 'Serve a verificare il requisito anagrafico previsto dal bando.',
      questionType: 'single_select',
      options: ageBandOptions,
      isRequired: true,
      validation: {},
      rule: {
        kind: 'choice_in_set',
        expected: buildChoiceInSetExpected(allowedAgeBands.length > 0 ? allowedAgeBands : ageBandOptions.map((option) => option.value))
      },
      metadata: { category: 'eta', decisive: true, ruleStrength: ageRuleStrength }
    });
  }

  if (signals.needsEmploymentStatus && allowedEmploymentValues.length > 0) {
    pushQuestion({
      questionKey: 'employment_status_match',
      label: 'Qual è il tuo stato occupazionale attuale?',
      description: 'Seleziona lo stato occupazionale attuale.',
      reasoning: 'Serve a verificare se lo stato occupazionale è compatibile con il bando.',
      questionType: 'single_select',
      options: employmentOptions,
      isRequired: true,
      validation: {},
      rule: {
        kind: 'choice_in_set',
        expected: buildChoiceInSetExpected(allowedEmploymentValues)
      },
      metadata: { category: 'occupazionale', decisive: true, ruleStrength: employmentRuleStrength }
    });
  }

  if (signals.companyYearsMin !== null || signals.companyYearsMax !== null || signals.likelyStartupOnly || signals.likelyExistingOnly) {
    pushQuestion({
      questionKey: 'company_age_match',
      label: "Da quanto tempo esiste l'impresa (o in che fase è)?",
      description: 'Serve per verificare requisiti di anzianità o nuova costituzione.',
      reasoning: 'Serve a verificare il requisito di anzianità previsto dal bando.',
      questionType: 'single_select',
      options: companyAgeOptions,
      isRequired: true,
      validation: {},
      rule: {
        kind: 'choice_in_set',
        expected: buildChoiceInSetExpected(
          allowedCompanyAgeValues.length > 0
            ? allowedCompanyAgeValues
            : companyAgeOptions.map((option) => option.value)
        )
      },
      metadata: { category: 'anzianita', decisive: true, ruleStrength: companyAgeRuleStrength }
    });
  }

  const specificRequirementQuestions = buildRequirementSpecificQuestions(detail, explainability, questionKeys);
  specificRequirementQuestions.forEach((question) => {
    pushQuestion(question);
  });

  pushQuestion({
    questionKey: 'investment_amount',
      label: "Qual è l'investimento complessivo previsto per il progetto?",
    description:
      economic.label ||
      (economic.min || economic.max
        ? `Range economico rilevato: ${economic.min ? `da €${economic.min.toLocaleString('it-IT')}` : ''}${economic.min && economic.max ? ' ' : ''}${economic.max ? `a €${economic.max.toLocaleString('it-IT')}` : ''}.`
        : 'Inserisci una stima realistica dell’investimento totale.'),
    reasoning: 'Serve a verificare la coerenza dell’investimento con i limiti della misura.',
    questionType: 'number',
    options: [],
    isRequired: true,
    validation: {
      min: economic.min,
      max: economic.max
    },
    rule: { kind: 'investment_range' },
    metadata: { category: 'economico', decisive: true, ruleStrength: 'soft' }
  });

  if (specificRequirementQuestions.length === 0) {
    pushQuestion({
      questionKey: 'key_requirement_fit',
      label: keyRequirement
        ? `Confermi questo requisito chiave: ${clipText(keyRequirement, 92)}?`
        : 'Confermi di rispettare i requisiti chiave indicati dal bando?',
      description: keyRequirement ? `Requisito del bando: ${clipText(keyRequirement, 150)}` : null,
      reasoning: keyRequirement
        ? 'Serve a verificare il requisito più vincolante emerso dall’analisi del bando.'
        : 'Serve a verificare i requisiti tecnici prima dell’avvio pratica.',
      questionType: 'boolean',
      options: [
        { value: 'yes', label: 'Sì' },
        { value: 'no', label: 'No' }
      ],
      isRequired: true,
      validation: {},
      rule: { kind: 'critical_boolean', expected: 'yes' },
      metadata: { category: 'requisiti', decisive: true, ruleStrength: detectRuleStrength(keyRequirement ?? '', 'soft') }
    });
  }

  return questions.slice(0, 8);
}

function mergeWithDeterministicQuestions(
  aiQuestions: PracticeQuizQuestion[],
  deterministicQuestions: PracticeQuizQuestion[]
) {
  if (aiQuestions.length === 0) return deterministicQuestions;
  if (hasWeakQuizShape(aiQuestions)) return deterministicQuestions;

  const merged: PracticeQuizQuestion[] = [...deterministicQuestions];
  const mergedKeys = new Set(merged.map((question) => question.questionKey));
  const mergedCategories = new Set(merged.map((question) => categoryOfQuestion(question)));

  for (const question of aiQuestions) {
    const key = slugifyKey(question.questionKey || question.label);
    if (!key || mergedKeys.has(key)) continue;
    if (isDocumentationQuestion(question)) continue;
    if (!question.label || question.label.trim().length < 12 || question.label.trim().length > 140) continue;
    if (question.reasoning && question.reasoning.trim().length > 260) continue;

    const category = categoryOfQuestion(question);
    const text = normalizeQuizText(`${question.label} ${question.description ?? ''}`);
    const tooGeneric = /(il tuo profilo|puoi rispettare|coerente con il bando|requisiti base|confermi di)/.test(text);
    if (tooGeneric && mergedCategories.has(category)) continue;
    if (question.isRequired && ['none', 'informational'].includes(question.rule.kind)) continue;

    merged.push({
      ...question,
      questionKey: key,
      description: question.description ? question.description.trim().slice(0, 180) : null,
      reasoning: question.reasoning ? question.reasoning.trim().slice(0, 220) : null
    });
    mergedKeys.add(key);
    mergedCategories.add(category);
    if (merged.length >= 8) break;
  }

  return merged.slice(0, 8);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export async function generatePracticeQuizTemplateWithAI(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): Promise<PracticeQuizQuestion[]> {
  const deterministicQuestions = buildDeterministicConditionalQuizQuestions(detail, explainability);
  const openai = getOpenAIClient();
  if (!openai) {
    console.warn('[generatePracticeQuizTemplateWithAI] OPENAI_API_KEY non configurata: fallback a quiz deterministico');
    return deterministicQuestions;
  }

  const systemPrompt = `Sei l'intelligenza artificiale di BNDO, un esperto seniore di finanza agevolata italiana.
Il tuo compito è creare un quiz di pre-fattibilità "Level MAX" per un bando specifico.
L'obiettivo è ESSERE SPIETATI: devi escludere immediatamente chiunque non abbia i requisiti minimi, evitando domande "soft" o generiche.

Esempi di domande LIVELLO MAX:
- "Il tuo fatturato 2023 è superiore a 500.000€?" (Invece di "Hai un buon fatturato?")
- "La tua azienda è iscritta al Registro Imprese da almeno 24 mesi?" (Invece di "L'azienda è operativa?")
- "Il 51% della compagine sociale è composta da donne o giovani under 35?" (Invece di "Sei un'impresa femminile/giovanile?")
- "Qual è il tuo codice ATECO primario?" (Indispensabile se il bando ha restrizioni settoriali).

Regole TASSATIVE:
1. **Reasoning**: Per ogni domanda, spiega il PERCHÉ normativo (es: "Il bando richiede l'iscrizione al registro imprese da almeno 2 anni ai sensi dell'Art. 4").
2. **Fast-Fail**: Usa 'critical_boolean' per ogni requisito bloccante.
3. **Specificità numerica**: Se il bando cita soglie numeriche (euro, anni, dipendenti), USALE sempre nella domanda.
4. **Logica condizionale**: Per requisiti a scelta (settore, forma giuridica, territorio, fascia età, stato occupazionale) usa questionType "single_select" e rule.kind "choice_in_set" con rule.expected valorizzato come lista opzioni consentite separata da "|" (es: "pmi|micro_impresa|startup").
5. **No Documentazione**: NON generare domande su documenti/allegati/checklist (es. business plan, visura, bilanci, preventivi, DID). La documentazione viene gestita solo nell'onboarding successivo.
6. **Niente banalità**: Evita domande generiche tipo "Il tuo profilo è coerente?". Fai domande verificabili e decisive.
7. **Chiarezza assoluta**: Ogni domanda deve essere breve e comprensibile (max 110 caratteri), senza linguaggio burocratico.
8. **Zero rumore**: Evita descrizioni lunghe; reasoning massimo una frase breve e concreta.

Usa un tono professionale ma diretto (dai del tu all'utente).`;

  const bandoInfo = `
Titolo: ${detail.title}
Tipo Agevolazione: ${detail.aidForm}
CPV Code: ${detail.cpvCode || 'Non specificato'}
Beneficiari: ${detail.beneficiaries.join(', ')}
Settori ammessi: ${detail.sectors.join(', ')}

Documentazione Minima Richiesta:
${detail.requiredDocuments?.length ? detail.requiredDocuments.join(', ') : 'Non specificata esplicitamente (estrai dalla descrizione se presente)'}

Descrizione Testuale del Bando (Normativa):
${detail.description || 'Nessuna descrizione disponibile.'}

Requisiti da estrarre e verificare (hard/soft):
${JSON.stringify({
  requisitiDuri: detail.requisitiHard,
  requisitiSoft: detail.requisitiSoft,
  coseMancantiSpessoInGere: explainability.missingRequirements
}, null, 2)}
`;

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Genera le domande fondamentali (massimo 10) per verificare i requisiti bloccanti di questo bando:\n\n${bandoInfo}\n\nRISPONDI ESATTAMENTE CON UN OGGETTO JSON CHE RISPETTI QUESTO SCHEMA:\n{"questions": [{"questionKey": "string", "label": "string", "description": "string|null", "reasoning": "string", "questionType": "single_select|boolean|text|number", "options": [{"value": "string", "label": "string"}], "isRequired": true, "validation": {"min": 0, "max": 0, "maxLength": 0}, "rule": {"kind": "critical_boolean|investment_range|ateco_validation|geographic_validation|choice_in_set|informational|none", "expected": "string|null"}, "metadata": {"category": "string"}}]}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      }),
      8_500,
      'Timeout generazione quiz AI'
    );

    const rawContent = completion.choices[0]?.message.content;
    if (!rawContent) return [];
    const parsedData = JSON.parse(rawContent);
    const parsed = QuizTemplateSchema.parse(parsedData);

    if (!parsed || !parsed.questions) {
      console.warn('[generatePracticeQuizTemplateWithAI] OpenAI failed to parse questions');
      return [];
    }

    // Convert the parsed zod objects back into the exact expected type (Record<string, unknown>)
    const mappedQuestions = parsed.questions.map((q: any) => {
      // Clean up nulls
      const validationObj: Record<string, unknown> = {};
      if (q.validation?.min != null) validationObj.min = q.validation.min;
      if (q.validation?.max != null) validationObj.max = q.validation.max;
      if (q.validation?.maxLength != null) validationObj.maxLength = q.validation.maxLength;

      const ruleObj: any = {
        kind: q.rule.kind
      };
      if (q.rule.expected != null) {
        ruleObj.expected = q.rule.expected;
      }

      const metaObj: Record<string, unknown> = {};
      if (q.metadata?.category != null) {
        metaObj.category = q.metadata.category;
      }
      if (q.metadata?.ruleStrength != null) {
        metaObj.ruleStrength = normalizeRuleStrength(q.metadata.ruleStrength, q.isRequired ? 'hard' : 'soft');
      } else {
        metaObj.ruleStrength = detectRuleStrength(`${q.label ?? ''} ${q.reasoning ?? ''}`, q.isRequired ? 'hard' : 'soft');
      }
      if (q.metadata?.showIf && typeof q.metadata.showIf === 'object') {
        metaObj.showIf = q.metadata.showIf;
      }

      return {
        questionKey: q.questionKey,
        label: q.label,
        description: q.description,
        reasoning: q.reasoning,
        questionType: q.questionType,
        options: q.options as PracticeQuizOption[],
        isRequired: q.isRequired,
        validation: validationObj,
        rule: ruleObj,
        metadata: metaObj
      } as PracticeQuizQuestion;
    });

    const filteredQuestions = mappedQuestions.filter((question) => !isDocumentationQuestion(question));
    return mergeWithDeterministicQuestions(filteredQuestions, deterministicQuestions);
  } catch (error) {
    console.error('[generatePracticeQuizTemplateWithAI] OpenAI Error:', error);
    return deterministicQuestions;
  }
}
