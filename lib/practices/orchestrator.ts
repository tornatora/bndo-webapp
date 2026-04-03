import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchGrantDetail, fetchGrantExplainability, type GrantDetailRecord, type GrantExplainabilityRecord } from '@/lib/grants/details';
import { upsertProgressIntoNotes } from '@/lib/admin/practice-progress';
import { buildDeterministicConditionalQuizQuestions, generatePracticeQuizTemplateWithAI } from '@/lib/practices/llmQuizGenerator';
import type { Database } from '@/lib/supabase/database.types';

export type PracticeSourceChannel = 'scanner' | 'chat' | 'direct' | 'admin';
export type PracticeQuizQuestionType = 'single_select' | 'boolean' | 'text' | 'number';
export type PracticeQuizEligibility = 'eligible' | 'not_eligible' | 'needs_review';

type AdminClient = SupabaseClient<Database>;
type JsonValue = Database['public']['Tables']['practice_quiz_templates']['Row']['metadata'];
type TenderInsert = Database['public']['Tables']['tenders']['Insert'];
type TenderUpdate = Database['public']['Tables']['tenders']['Update'];

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
    kind: 'critical_boolean' | 'investment_range' | 'ateco_validation' | 'geographic_validation' | 'choice_in_set' | 'informational' | 'none';
    expected?: string | null;
  };
  metadata: Record<string, unknown>;
};

export type PracticeDocumentRequirement = {
  requirementKey: string;
  label: string;
  description: string | null;
  isRequired: boolean;
  sourceChannel: PracticeSourceChannel;
  metadata: Record<string, unknown>;
};

export type PracticeFlowTemplate = {
  metadata: Record<string, unknown>;
  questions: PracticeQuizQuestion[];
  requirements: PracticeDocumentRequirement[];
};

export type PracticeFlowState = {
  applicationId: string;
  tenderId: string;
  grantExternalId: string;
  grantSlug: string;
  grantTitle: string;
  sourceChannel: PracticeSourceChannel;
  templateId: string;
  metadata: Record<string, unknown>;
  questions: PracticeQuizQuestion[];
  requirements: PracticeDocumentRequirement[];
};

type PracticeQuizAnswerInput = Record<string, string | number | boolean | null | undefined>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRuleToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function booleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const token = normalizeRuleToken(value);
  if (!token) return null;
  if (['yes', 'si', 'true', '1', 'y', 'vero'].includes(token)) return true;
  if (['no', 'false', '0', 'n', 'falso'].includes(token)) return false;
  return null;
}

function normalizeChoiceAnswer(question: PracticeQuizQuestion, value: unknown): string {
  const raw = normalizeRuleToken(value);
  if (!raw) return '';
  if (!Array.isArray(question.options) || question.options.length === 0) return raw;

  for (const option of question.options) {
    const optionValue = normalizeRuleToken(option.value);
    const optionLabel = normalizeRuleToken(option.label);
    if (raw === optionValue || raw === optionLabel) {
      return optionValue || optionLabel || raw;
    }
  }
  return raw;
}

function shouldApplyCriticalBooleanRule(question: PracticeQuizQuestion) {
  if (question.rule.kind !== 'critical_boolean') return false;
  const expectedRaw = normalizeRuleToken(question.rule.expected ?? '');
  if (!expectedRaw) return false;

  if (question.questionType === 'boolean') return true;
  if (question.questionType !== 'single_select') return false;
  if (!Array.isArray(question.options) || question.options.length === 0) return false;

  const optionTokens = question.options
    .flatMap((option) => [normalizeRuleToken(option.value), normalizeRuleToken(option.label)])
    .filter(Boolean);

  const expectedBoolean = booleanLike(expectedRaw);
  const optionsAreBooleanLike = optionTokens.length > 0 && optionTokens.every((token) => booleanLike(token) !== null);
  return expectedBoolean !== null && optionsAreBooleanLike;
}

function parseExpectedChoiceSet(value: string | null | undefined): Set<string> {
  const token = normalizeRuleToken(value ?? '');
  if (!token) return new Set();
  return new Set(
    token
      .split(/[|,]/g)
      .map((item) => normalizeRuleToken(item))
      .filter(Boolean)
  );
}

function readRuleStrength(question: PracticeQuizQuestion): 'hard' | 'soft' {
  const raw =
    question.metadata && typeof question.metadata === 'object'
      ? (question.metadata as Record<string, unknown>).ruleStrength
      : null;
  const token = normalizeRuleToken(raw);
  if (token === 'hard') return 'hard';
  if (token === 'soft') return 'soft';

  if (
    question.rule.kind === 'critical_boolean' ||
    question.rule.kind === 'choice_in_set' ||
    question.rule.kind === 'ateco_validation' ||
    question.rule.kind === 'geographic_validation'
  ) {
    return 'hard';
  }
  return 'soft';
}

type ShowIfRule = {
  questionKey: string;
  anyOf?: string[];
  equals?: string;
  noneOf?: string[];
};

function readShowIfRule(question: PracticeQuizQuestion): ShowIfRule | null {
  if (!question.metadata || typeof question.metadata !== 'object') return null;
  const raw = (question.metadata as Record<string, unknown>).showIf;
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as Record<string, unknown>;
  const questionKey = typeof data.questionKey === 'string' ? data.questionKey.trim() : '';
  if (!questionKey) return null;

  const anyOf = Array.isArray(data.anyOf)
    ? data.anyOf.map((item) => normalizeRuleToken(item)).filter(Boolean)
    : undefined;
  const noneOf = Array.isArray(data.noneOf)
    ? data.noneOf.map((item) => normalizeRuleToken(item)).filter(Boolean)
    : undefined;
  const equals = typeof data.equals === 'string' ? normalizeRuleToken(data.equals) : undefined;

  return {
    questionKey,
    anyOf,
    noneOf,
    equals
  };
}

function isQuestionVisibleForAnswers(
  question: PracticeQuizQuestion,
  answers: Record<string, unknown>,
  questionByKey: Map<string, PracticeQuizQuestion>
) {
  const showIf = readShowIfRule(question);
  if (!showIf) return true;

  const parentQuestion = questionByKey.get(showIf.questionKey);
  if (!parentQuestion) return true;

  const rawAnswer = answers[showIf.questionKey];
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return false;

  const normalizedAnswer = normalizeChoiceAnswer(parentQuestion, rawAnswer);
  const normalizedBoolean = booleanLike(rawAnswer);
  const normalizedToken =
    normalizedAnswer ||
    (normalizedBoolean === null ? '' : normalizedBoolean ? 'yes' : 'no') ||
    normalizeRuleToken(rawAnswer);

  if (!normalizedToken) return false;

  if (showIf.equals && normalizedToken !== showIf.equals) return false;
  if (showIf.anyOf && showIf.anyOf.length > 0 && !showIf.anyOf.includes(normalizedToken)) return false;
  if (showIf.noneOf && showIf.noneOf.length > 0 && showIf.noneOf.includes(normalizedToken)) return false;

  return true;
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
    const text = normalizeQuestionText(`${question.label} ${question.description ?? ''}`);
    return /(il tuo profilo|puoi rispettare|coerente con il bando|requisiti base|confermi di|requisito tecnico più stringente)/.test(
      text
    );
  }).length;
  return genericCount >= Math.ceil(required.length * 0.6);
}

function firstSentence(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const [first] = trimmed.split(/(?<=[.!?])\s+/);
  return first || trimmed;
}

function normalizeQuestionText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryOfQuestion(question: PracticeQuizQuestion): string {
  const direct =
    question.metadata && typeof question.metadata.category === 'string'
      ? normalizeQuestionText(question.metadata.category)
      : '';
  if (direct) return direct;
  const text = normalizeQuestionText(
    `${question.questionKey} ${question.label} ${question.description ?? ''} ${question.reasoning ?? ''}`
  );
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

function isDocumentationQuizQuestion(question: PracticeQuizQuestion) {
  const category =
    question.metadata && typeof question.metadata.category === 'string'
      ? normalizeQuestionText(question.metadata.category)
      : '';
  const haystack = normalizeQuestionText(
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
  if (category.includes('allegat')) return true;
  if (category.includes('doc')) return true;

  return /(document|documentazione|documenti|allegat|visura|bilanc|business plan|piano impresa|preventiv|certificaz|isee|did|atto costitutivo|statuto)/.test(
    haystack
  );
}

function isLowSignalQuizQuestion(question: PracticeQuizQuestion) {
  const text = normalizeQuestionText(
    `${question.label} ${question.description ?? ''} ${question.reasoning ?? ''} ${question.questionKey}`
  );
  if (!text) return true;
  if (
    /(il tuo profilo|coerente con il bando|confermi di soddisfare questo requisito|requisito tecnico piu stringente|requisiti base)/.test(
      text
    )
  ) {
    return true;
  }
  if ((question.label ?? '').trim().length < 10 || (question.label ?? '').trim().length > 150) return true;
  return false;
}

function sanitizePracticeQuizQuestions(questions: PracticeQuizQuestion[]) {
  const filtered = questions
    .filter((question) => !isDocumentationQuizQuestion(question))
    .filter((question) => !isLowSignalQuizQuestion(question))
    .map((question) => ({
      ...question,
      label: String(question.label ?? '').trim(),
      description: firstSentence(question.description),
      reasoning: firstSentence(question.reasoning),
    }));

  const deduped = uniqBy(filtered, (question) => question.questionKey);
  return deduped.slice(0, 8);
}

function uniqBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const details = typeof record.details === 'string' ? record.details : '';
  const hint = typeof record.hint === 'string' ? record.hint : '';
  const normalized = `${message} ${details} ${hint}`.toLowerCase();
  const needle = column.toLowerCase();
  return (
    code === 'PGRST204' ||
    ((normalized.includes(`'${needle}'`) || normalized.includes(`"${needle}"`) || normalized.includes(needle)) &&
      (normalized.includes('could not find') ||
        normalized.includes('schema cache') ||
        normalized.includes('does not exist') ||
        normalized.includes('column')))
  );
}

function isMissingTableError(error: unknown, table: string) {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const details = typeof record.details === 'string' ? record.details : '';
  const hint = typeof record.hint === 'string' ? record.hint : '';
  const normalized = `${message} ${details} ${hint}`.toLowerCase();
  const needle = table.toLowerCase();
  return (
    code === 'PGRST205' ||
    (normalized.includes(needle) &&
      (normalized.includes('could not find') ||
        normalized.includes('schema cache') ||
        normalized.includes('relation') ||
        normalized.includes('table') ||
        normalized.includes('does not exist')))
  );
}

function extractTailIdentifier(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const asUrl = new URL(raw);
    const chunks = asUrl.pathname.split('/').filter(Boolean);
    return chunks[chunks.length - 1] ?? '';
  } catch {
    const chunks = raw.split('/').filter(Boolean);
    return chunks[chunks.length - 1] ?? '';
  }
}

async function resolveGrantFromCandidates(candidates: string[]) {
  const deduped = uniqBy(
    candidates.map((value) => String(value ?? '').trim()).filter(Boolean),
    (value) => value.toLowerCase()
  );

  for (const candidate of deduped) {
    try {
      const [detail, explainability] = await Promise.all([
        fetchGrantDetail(candidate),
        fetchGrantExplainability(candidate)
      ]);
      return { detail, explainability };
    } catch {
      continue;
    }
  }

  return null;
}

async function buildRuntimeFlowFromApplication(client: AdminClient, applicationId: string): Promise<PracticeFlowState | null> {
  const { data: application } = await client
    .from('tender_applications')
    .select('id, tender_id')
    .eq('id', applicationId)
    .maybeSingle();

  if (!application) {
    console.error(`[BUILD_RUNTIME_FLOW] Application ${applicationId} not found`);
    return null;
  }
  if (!application.tender_id) {
    console.error(`[BUILD_RUNTIME_FLOW] Application ${applicationId} has no tender_id`);
    return null;
  }

  let supportsExternalGrantId = true;
  let supportsGrantSlug = true;
  type RuntimeTenderData = {
    id: string;
    title: string;
    dossier_url: string | null;
    external_grant_id?: string | null;
    grant_slug?: string | null;
    metadata?: Record<string, unknown> | null;
    procurement_value?: number | null;
    authority_name?: string | null;
    deadline_at?: string | null;
    summary?: string | null;
  };
  let tenderData: RuntimeTenderData | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const columns = ['id', 'title', 'dossier_url', 'metadata', 'procurement_value', 'authority_name', 'deadline_at', 'summary'];
    if (supportsExternalGrantId) columns.push('external_grant_id');
    if (supportsGrantSlug) columns.push('grant_slug');
    const response = await client
      .from('tenders')
      .select(columns.join(','))
      .eq('id', application.tender_id)
      .maybeSingle();

    if (!response.error) {
      tenderData = (response.data as RuntimeTenderData | null) ?? null;
      break;
    }

    if (supportsExternalGrantId && isMissingColumnError(response.error, 'external_grant_id')) {
      supportsExternalGrantId = false;
      continue;
    }
    if (supportsGrantSlug && isMissingColumnError(response.error, 'grant_slug')) {
      supportsGrantSlug = false;
      continue;
    }
    break;
  }

  if (!tenderData?.id) {
    console.error(`[BUILD_RUNTIME_FLOW] Tender ${application.tender_id} not found for application ${applicationId}`);
    return null;
  }
  if (!tenderData.title) {
    console.error(`[BUILD_RUNTIME_FLOW] Tender ${application.tender_id} has no title`);
    return null;
  }

  let grantCandidate = await resolveGrantFromCandidates([
    tenderData.external_grant_id ?? '',
    tenderData.grant_slug ?? '',
    extractTailIdentifier(tenderData.dossier_url),
    slugify(tenderData.title),
    tenderData.title
  ]);

  if (!grantCandidate) {
    const metadata = (tenderData.metadata as Record<string, unknown> | null) ?? {};
    grantCandidate = {
      detail: {
        id: tenderData.external_grant_id || tenderData.id,
        title: tenderData.title,
        authority: tenderData.authority_name || null,
        openingDate: (metadata.openingDate as string) || null,
        deadlineDate: tenderData.deadline_at ?? null,
        availabilityStatus: (metadata.availabilityStatus as 'open' | 'incoming') || 'open',
        budgetTotal: typeof tenderData.procurement_value === 'number' ? tenderData.procurement_value : null,
        aidForm: tenderData.summary ?? null,
        aidIntensity: (metadata.aidIntensity as string) || null,
        beneficiaries: Array.isArray(metadata.beneficiaries) ? metadata.beneficiaries as string[] : [],
        sectors: Array.isArray(metadata.sectors) ? metadata.sectors as string[] : [],
        officialUrl: tenderData.dossier_url || '',
        officialAttachments: [],
        description: tenderData.summary ?? null,
        requisitiHard: (metadata.requisitiHard as Record<string, unknown>) || {},
        requisitiSoft: (metadata.requisitiSoft as Record<string, unknown>) || {},
        requisitiStrutturati: (metadata.requisitiStrutturati as Record<string, unknown>) || {}
      },
      explainability: {
        hardStatus: 'unknown',
        eligibilityScore: 50,
        completenessScore: 50,
        fitScore: 50,
        probabilityScore: 50,
        whyFit: [],
        satisfiedRequirements: [],
        missingRequirements: ['Documentazione minima richiesta per questo bando.'],
        applySteps: ['Verifica di conformità', 'Preparazione fascicolo']
      }
    };
  }

  let template: PracticeFlowTemplate;

  const cachedTenderMetadata = tenderData?.metadata as Record<string, unknown> | null;
  let cachedQuestions: PracticeQuizQuestion[] | null = null;
  
  if (cachedTenderMetadata && Array.isArray(cachedTenderMetadata.ai_quiz_questions)) {
    cachedQuestions = sanitizePracticeQuizQuestions(cachedTenderMetadata.ai_quiz_questions as PracticeQuizQuestion[]);
  }
  if (cachedQuestions && hasWeakQuizShape(cachedQuestions)) {
    cachedQuestions = null;
  }
  if (cachedQuestions && cachedQuestions.length > 0) {
    // If the DB already has AI generated questions, we construct the template.
    const requirements = derivePracticeRequirementsFromGrant(grantCandidate!.detail, grantCandidate!.explainability, 'direct');
    
    template = {
      metadata: {},
      questions: cachedQuestions,
      requirements
    };
  } else {
    template = buildFallbackPracticeQuizTemplate(grantCandidate!.detail, grantCandidate!.explainability, 'direct');
  }

  return {
    applicationId,
    tenderId: tenderData!.id,
    grantExternalId: grantCandidate!.detail.id,
    grantSlug: slugify(grantCandidate!.detail.title),
    grantTitle: grantCandidate!.detail.title,
    sourceChannel: 'direct',
    templateId: `runtime-${applicationId}`,
    metadata: template.metadata,
    questions: template.questions,
    requirements: template.requirements
  };
}

function extractEconomic(detail: GrantDetailRecord) {
  const structured = detail.requisitiStrutturati && typeof detail.requisitiStrutturati === 'object'
    ? (detail.requisitiStrutturati.economic as Record<string, unknown> | undefined)
    : undefined;

  return {
    costMin: readNumber(structured?.costMin),
    costMax: readNumber(structured?.costMax),
    grantMin: readNumber(structured?.grantMin),
    grantMax: readNumber(structured?.grantMax),
    coverageMin: readNumber(structured?.estimatedCoverageMinPercent),
    coverageMax: readNumber(structured?.estimatedCoverageMaxPercent),
    displayAmountLabel:
      typeof structured?.displayAmountLabel === 'string' ? structured.displayAmountLabel.trim() : null,
    displayProjectAmountLabel:
      typeof structured?.displayProjectAmountLabel === 'string' ? structured.displayProjectAmountLabel.trim() : null,
    displayCoverageLabel:
      typeof structured?.displayCoverageLabel === 'string' ? structured.displayCoverageLabel.trim() : null,
  };
}

function buildTemplateMetadata(detail: GrantDetailRecord, explainability: GrantExplainabilityRecord) {
  const economic = extractEconomic(detail);
  const hasStructuredSignals =
    detail.beneficiaries.length > 0 ||
    detail.sectors.length > 0 ||
    Boolean(economic.costMin || economic.costMax || economic.grantMin || economic.grantMax);

  return {
    availabilityStatus: detail.availabilityStatus,
    openingDate: detail.openingDate,
    deadlineDate: detail.deadlineDate,
    officialUrl: detail.officialUrl,
    authority: detail.authority,
    beneficiaries: detail.beneficiaries,
    sectors: detail.sectors,
    aidForm: detail.aidForm,
    aidIntensity: detail.aidIntensity,
    hardStatus: explainability.hardStatus,
    missingRequirements: explainability.missingRequirements,
    applySteps: explainability.applySteps,
    templateQuality: hasStructuredSignals ? 'structured' : 'fallback',
    templateIncomplete: !hasStructuredSignals,
    economic,
  };
}

function buildFallbackPracticeQuizTemplate(detail: GrantDetailRecord, explainability: GrantExplainabilityRecord, sourceChannel: PracticeSourceChannel): PracticeFlowTemplate {
  const metadata = buildTemplateMetadata(detail, explainability);
  const questions = sanitizePracticeQuizQuestions(
    buildDeterministicConditionalQuizQuestions(detail, explainability)
  );

  const requirements = derivePracticeRequirementsFromGrant(detail, explainability, sourceChannel);

  return {
    metadata,
    questions,
    requirements
  };
}

export function derivePracticeRequirementsFromGrant(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord,
  sourceChannel: PracticeSourceChannel
): PracticeDocumentRequirement[] {
  const beneficiaryHint = detail.beneficiaries.slice(0, 4).join(', ');
  const sectorHint = detail.sectors.slice(0, 4).join(', ');
  
  const lowerText = [
    detail.title,
    detail.aidForm ?? '',
    beneficiaryHint,
    sectorHint,
    explainability.missingRequirements.join(' '),
    explainability.applySteps.join(' ')
  ].join(' ').toLowerCase();

  const requiredDocsFromGrant = (detail.requiredDocuments ?? [])
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .slice(0, 16)
    .map((label) => ({
      requirementKey: `doc_${slugify(label) || 'documento'}`,
      label,
      description: 'Documento richiesto dal bando selezionato.',
      isRequired: true,
      sourceChannel,
      metadata: { category: 'grant_specific', source: 'grant_required_documents' }
    }));

  const isRestoSud20 =
    lowerText.includes('resto al sud 2.0') ||
    lowerText.includes('resto al sud 20') ||
    lowerText.includes('resto_sud_2_0') ||
    lowerText.includes('resto-al-sud-2-0');
  const isAutoimpiegoCentroNord =
    lowerText.includes('autoimpiego centro nord') ||
    lowerText.includes('autoimpiego-centro-nord') ||
    lowerText.includes('autoimpiego_centro_nord') ||
    lowerText.includes('oltre nuove imprese a tasso zero') ||
    lowerText.includes('on - oltre nuove imprese');
  const needsDidRequirement =
    isRestoSud20 ||
    isAutoimpiegoCentroNord ||
    lowerText.includes('did') ||
    lowerText.includes('disoccup') ||
    lowerText.includes('inoccup');

  const requirements: PracticeDocumentRequirement[] = uniqBy([
    {
      requirementKey: 'documento_identita',
      label: 'Documento di identità del richiedente',
      description: 'Documento fronte/retro in corso di validità.',
      isRequired: true,
      sourceChannel,
      metadata: { category: 'identity' }
    },
    {
      requirementKey: 'codice_fiscale',
      label: 'Codice fiscale / tessera sanitaria',
      description: 'Tessera sanitaria o certificazione equivalente.',
      isRequired: true,
      sourceChannel,
      metadata: { category: 'identity' }
    },
    {
      requirementKey: 'preventivi_spesa',
      label: 'Preventivi o quotazioni di spesa',
      description: 'Carica uno o più preventivi coerenti con l’investimento previsto.',
      isRequired: true,
      sourceChannel,
      metadata: { category: 'economic' }
    },
    lowerText.includes('imprese') || lowerText.includes('societ') || lowerText.includes('azienda')
      ? {
          requirementKey: 'visura_camerale',
          label: 'Visura camerale / certificato Partita IVA',
          description: 'Documento aggiornato della società o ditta richiedente.',
          isRequired: true,
          sourceChannel,
          metadata: { category: 'company' }
        }
      : null,
    lowerText.includes('startup') || lowerText.includes('nuova impresa') || lowerText.includes('avvio')
      ? {
          requirementKey: 'business_plan',
          label: 'Business plan o piano di impresa',
          description: 'Sintesi economico-finanziaria e obiettivi del progetto.',
          isRequired: true,
          sourceChannel,
          metadata: { category: 'project' }
        }
      : null,
    needsDidRequirement
      ? {
          requirementKey: 'certificazione_did',
          label: 'Certificazione DID / stato occupazionale',
          description: 'Documento richiesto per la verifica del requisito occupazionale.',
          isRequired: true,
          sourceChannel,
          metadata: { category: 'occupational' }
        }
      : null
    ,
    ...requiredDocsFromGrant
  ].filter(Boolean) as PracticeDocumentRequirement[], (requirement) => requirement.requirementKey);

  return requirements;
}

async function ensureTender(admin: AdminClient, detail: GrantDetailRecord) {
  const normalizedTitle = detail.title.trim();
  const grantSlug = slugify(normalizedTitle);
  const metadata = {
    officialUrl: detail.officialUrl,
    beneficiaries: detail.beneficiaries,
    sectors: detail.sectors,
    aidForm: detail.aidForm,
    aidIntensity: detail.aidIntensity,
    availabilityStatus: detail.availabilityStatus,
    openingDate: detail.openingDate,
    deadlineDate: detail.deadlineDate,
    requisitiHard: detail.requisitiHard,
    requisitiSoft: detail.requisitiSoft,
    requisitiStrutturati: detail.requisitiStrutturati,
  } as JsonValue;

  let supportsExternalGrantId = true;
  let supportsGrantSlug = true;
  let supportsTenderMetadata = true;

  const buildTenderPayload = (): TenderInsert => {
    const payload: TenderInsert = {
      authority_name: detail.authority ?? 'Fonte ufficiale',
      title: normalizedTitle,
      deadline_at: detail.deadlineDate ?? new Date('2099-12-31T23:59:59.000Z').toISOString(),
      summary: detail.aidForm ?? detail.aidIntensity ?? normalizedTitle,
      dossier_url: detail.officialUrl || null,
      supplier_portal_url: detail.officialUrl || null,
      procurement_value: detail.budgetTotal,
    };
    if (supportsTenderMetadata) payload.metadata = metadata;
    if (supportsExternalGrantId) payload.external_grant_id = detail.id;
    if (supportsGrantSlug) payload.grant_slug = grantSlug;
    return payload;
  };

  const executeTenderMutation = async (
    execute: (payload: TenderInsert) => Promise<{ data: { id: string } | null; error: unknown }>
  ) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const payload = buildTenderPayload();
      const result = await execute(payload);
      if (!result.error) return result;

      if (supportsExternalGrantId && isMissingColumnError(result.error, 'external_grant_id')) {
        supportsExternalGrantId = false;
        continue;
      }
      if (supportsGrantSlug && isMissingColumnError(result.error, 'grant_slug')) {
        supportsGrantSlug = false;
        continue;
      }
      if (supportsTenderMetadata && isMissingColumnError(result.error, 'metadata')) {
        supportsTenderMetadata = false;
        continue;
      }
      return result;
    }
    return { data: null, error: { message: 'Impossibile salvare il bando locale.' } as unknown };
  };

  let existingByExternal: { id: string } | null = null;
  if (supportsExternalGrantId) {
    const lookupByExternal = await admin
      .from('tenders')
      .select('id')
      .eq('external_grant_id', detail.id)
      .maybeSingle();
    if (lookupByExternal.error) {
      if (isMissingColumnError(lookupByExternal.error, 'external_grant_id')) {
        supportsExternalGrantId = false;
      } else {
        throw new Error(lookupByExternal.error.message ?? 'Impossibile leggere il bando locale.');
      }
    } else {
      existingByExternal = lookupByExternal.data ?? null;
    }
  }

  if (existingByExternal?.id) {
    const { data: updated, error } = await executeTenderMutation(async (payload) =>
      admin.from('tenders').update(payload as TenderUpdate).eq('id', existingByExternal.id).select('id').single()
    );

    if (error || !updated?.id) {
      throw new Error((error as { message?: string } | null)?.message ?? 'Impossibile aggiornare il bando locale.');
    }

    return { tenderId: updated.id, grantSlug };
  }

  const { data: existingByTitle } = await admin
    .from('tenders')
    .select('id')
    .eq('title', normalizedTitle)
    .limit(1)
    .maybeSingle();

  if (existingByTitle?.id) {
    const { data: updated, error } = await executeTenderMutation(async (payload) =>
      admin.from('tenders').update(payload as TenderUpdate).eq('id', existingByTitle.id).select('id').single()
    );

    if (error || !updated?.id) {
      throw new Error((error as { message?: string } | null)?.message ?? 'Impossibile sincronizzare il bando locale.');
    }

    return { tenderId: updated.id, grantSlug };
  }

  const { data: created, error } = await executeTenderMutation(async (payload) =>
    admin.from('tenders').insert(payload).select('id').single()
  );

  if (error || !created?.id) {
    throw new Error((error as { message?: string } | null)?.message ?? 'Impossibile creare il bando locale.');
  }

  return { tenderId: created.id, grantSlug };
}

async function ensureTemplateRows(
  admin: AdminClient,
  args: {
    applicationId: string;
    tenderId: string;
    detail: GrantDetailRecord;
    sourceChannel: PracticeSourceChannel;
    template: PracticeFlowTemplate;
  }
) {
  const { data: templateRow, error: templateError } = await admin
    .from('practice_quiz_templates')
    .upsert(
      {
        application_id: args.applicationId,
        tender_id: args.tenderId,
        grant_external_id: args.detail.id,
        grant_slug: slugify(args.detail.title),
        grant_title: args.detail.title,
        source_channel: args.sourceChannel,
        status: 'active',
        metadata: args.template.metadata as JsonValue,
      },
      { onConflict: 'application_id' }
    )
    .select('id')
    .single();

  if (templateError || !templateRow?.id) {
    if (isMissingTableError(templateError, 'practice_quiz_templates')) {
      return `legacy-${args.applicationId}`;
    }
    throw new Error(templateError?.message ?? 'Impossibile creare il template quiz pratica.');
  }

  const templateId = templateRow.id;
  const keepQuestionKeys = args.template.questions.map((question) => question.questionKey);

  const { data: existingQuestions } = await admin
    .from('practice_quiz_questions')
    .select('question_key')
    .eq('template_id', templateId);

  if (!existingQuestions) {
    const checkError = await admin
      .from('practice_quiz_questions')
      .select('question_key')
      .eq('template_id', templateId)
      .limit(1);
    if (checkError.error && isMissingTableError(checkError.error, 'practice_quiz_questions')) {
      return templateId;
    }
  }

  const staleKeys = (existingQuestions ?? [])
    .map((question) => question.question_key)
    .filter((key) => !keepQuestionKeys.includes(key));

  if (staleKeys.length > 0) {
    await admin
      .from('practice_quiz_questions')
      .delete()
      .eq('template_id', templateId)
      .in('question_key', staleKeys);
  }

  for (const [index, question] of args.template.questions.entries()) {
    const { error } = await admin.from('practice_quiz_questions').upsert(
      {
        template_id: templateId,
        sort_order: index,
        question_key: question.questionKey,
        label: question.label,
        description: question.description,
        reasoning: question.reasoning,
        question_type: question.questionType,
        options: question.options as JsonValue,
        is_required: question.isRequired,
        validation: question.validation as JsonValue,
        rule: question.rule as JsonValue,
        metadata: question.metadata as JsonValue,
      },
      { onConflict: 'template_id,question_key' }
    );

    if (error) {
      if (isMissingTableError(error, 'practice_quiz_questions')) {
        return templateId;
      }
      throw new Error(error.message);
    }
  }

  return templateId;
}

function buildRequirementsForUpsert(
  applicationId: string,
  tenderId: string,
  sourceChannel: PracticeSourceChannel,
  requirements: PracticeDocumentRequirement[]
) {
  return requirements.map((requirement) => ({
    application_id: applicationId,
    tender_id: tenderId,
    requirement_key: requirement.requirementKey,
    label: requirement.label,
    description: requirement.description,
    is_required: requirement.isRequired,
    status: 'missing' as const,
    source_channel: sourceChannel,
    metadata: requirement.metadata as JsonValue,
  }));
}

export async function ensurePracticeFlow(
  admin: AdminClient,
  args: {
    companyId: string;
    userId: string;
    grantId: string;
    sourceChannel: PracticeSourceChannel;
  }
): Promise<PracticeFlowState> {
  let detail: GrantDetailRecord;
  let explainability: GrantExplainabilityRecord;

  try {
    const [d, e] = await Promise.all([
      fetchGrantDetail(args.grantId),
      fetchGrantExplainability(args.grantId)
    ]);
    detail = d;
    explainability = e;
  } catch (error) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.grantId);
    let tenderQuery = admin.from('tenders').select('*');
    if (isUuid) {
      tenderQuery = tenderQuery.eq('id', args.grantId);
    } else {
      tenderQuery = tenderQuery.or(`external_grant_id.eq."${args.grantId}",grant_slug.eq."${args.grantId}"`);
    }

    const { data: tender } = await tenderQuery.maybeSingle();

    if (!tender) {
      // Ultimate Failsafe: Mock it from the ID so the quiz ALWAYS loads
      const mockTitle = args.grantId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      detail = {
        id: args.grantId,
        title: mockTitle,
        authority: 'Ente Appaltante',
        openingDate: null,
        deadlineDate: null,
        availabilityStatus: 'open',
        budgetTotal: null,
        aidForm: null,
        aidIntensity: null,
        beneficiaries: [],
        sectors: [],
        officialUrl: '',
        officialAttachments: [],
        description: null,
        requisitiHard: {},
        requisitiSoft: {},
        requisitiStrutturati: {}
      };
      explainability = {
        hardStatus: 'unknown',
        eligibilityScore: 50,
        completenessScore: 50,
        fitScore: 50,
        probabilityScore: 50,
        whyFit: [],
        satisfiedRequirements: [],
        missingRequirements: ['Documentazione minima richiesta dal bando.'],
        applySteps: ['Verifica di conformità', 'Preparazione fascicolo']
      };
    } else {
      const metadata = (tender.metadata as Record<string, unknown> | null) ?? {};

      detail = {
        id: tender.external_grant_id || tender.id,
        title: tender.title,
        authority: tender.authority_name || null,
        openingDate: (metadata.openingDate as string) || null,
        deadlineDate: tender.deadline_at,
        availabilityStatus: (metadata.availabilityStatus as 'open' | 'incoming') || 'open',
        budgetTotal: typeof tender.procurement_value === 'number' ? tender.procurement_value : null,
        aidForm: tender.summary ?? null,
        aidIntensity: (metadata.aidIntensity as string) || null,
        beneficiaries: Array.isArray(metadata.beneficiaries) ? metadata.beneficiaries as string[] : [],
        sectors: Array.isArray(metadata.sectors) ? metadata.sectors as string[] : [],
        officialUrl: tender.dossier_url || tender.supplier_portal_url || '',
        officialAttachments: [],
        description: tender.summary ?? null,
        cpvCode: tender.cpv_code,
        requisitiHard: (metadata.requisitiHard as Record<string, unknown>) || {},
        requisitiSoft: (metadata.requisitiSoft as Record<string, unknown>) || {},
        requisitiStrutturati: (metadata.requisitiStrutturati as Record<string, unknown>) || {}
      };

      explainability = {
        hardStatus: 'unknown',
        eligibilityScore: 50,
        completenessScore: 50,
        fitScore: 50,
        probabilityScore: 50,
        whyFit: [],
        satisfiedRequirements: [],
        missingRequirements: ['Documentazione minima richiesta per questo bando.'],
        applySteps: ['Verifica di conformità', 'Preparazione fascicolo']
      };
    }
  }

  const { tenderId, grantSlug } = await ensureTender(admin, detail);

  await admin.from('tender_matches').upsert(
    {
      company_id: args.companyId,
      tender_id: tenderId,
      relevance_score: 1,
      status: 'participating'
    },
    { onConflict: 'company_id,tender_id' }
  );

  const { data: application, error: applicationError } = await admin
    .from('tender_applications')
    .upsert(
      {
        company_id: args.companyId,
        tender_id: tenderId,
        status: 'draft',
        supplier_registry_status: 'pending',
        notes: upsertProgressIntoNotes('Pratica avviata da dashboard.', 'eligible')
      },
      { onConflict: 'company_id,tender_id' }
    )
    .select('id, notes')
    .single();

  if (applicationError || !application?.id) {
    throw new Error(applicationError?.message ?? 'Impossibile creare o recuperare la pratica.');
  }
    
  // Check if the tender has AI questions cached
  const { data: tenderRecord } = await admin
    .from('tenders')
    .select('summary, cpv_code, metadata')
    .eq('id', tenderId)
    .single();

  const tenderMeta = (tenderRecord?.metadata as Record<string, unknown>) || {};
  
  // Fill detail description from tender summary if missing
  if (!detail.description && tenderRecord?.summary) {
    detail.description = tenderRecord.summary;
  }
  if (!detail.cpvCode && tenderRecord?.cpv_code) {
    detail.cpvCode = tenderRecord.cpv_code;
  }

  const forceRefresh = tenderMeta.force_ai_refresh === true;
  const cachedAiQuestions =
    !forceRefresh && Array.isArray(tenderMeta.ai_quiz_questions)
      ? sanitizePracticeQuizQuestions(tenderMeta.ai_quiz_questions as PracticeQuizQuestion[])
      : [];
  const shouldIgnoreCachedQuestions = cachedAiQuestions.length > 0 && hasWeakQuizShape(cachedAiQuestions);

  let questionsForTemplate: PracticeQuizQuestion[] = [];
  
  if (!forceRefresh && !shouldIgnoreCachedQuestions && cachedAiQuestions.length > 0) {
    questionsForTemplate = cachedAiQuestions;
  } else {
    try {
      // Fetch specifically created AI questions with OpenAI
      const generatedQuestions = await generatePracticeQuizTemplateWithAI(detail, explainability);
      const sanitizedGeneratedQuestions = sanitizePracticeQuizQuestions(generatedQuestions ?? []);
      if (sanitizedGeneratedQuestions.length > 0) {
        questionsForTemplate = sanitizedGeneratedQuestions;
        // Cache the newly generated questions back to the DB so future applications for this tender skip OpenAI
        tenderMeta.ai_quiz_questions = sanitizedGeneratedQuestions;
        // Clear the refresh flag after success
        if (forceRefresh) {
          delete tenderMeta.force_ai_refresh;
        }
        await admin.from('tenders').update({ metadata: tenderMeta as any }).eq('id', tenderId);
      } else {
        // Ultimate fallback if OpenAI returns empty
        questionsForTemplate = buildFallbackPracticeQuizTemplate(detail, explainability, args.sourceChannel).questions;
      }
    } catch {
      // Ultimate fallback if OpenAI fails or times out
      questionsForTemplate = buildFallbackPracticeQuizTemplate(detail, explainability, args.sourceChannel).questions;
    }
  }

  if (questionsForTemplate.length === 0) {
    questionsForTemplate = buildFallbackPracticeQuizTemplate(detail, explainability, args.sourceChannel).questions;
  }

  const requirements = derivePracticeRequirementsFromGrant(detail, explainability, args.sourceChannel);
  const template: PracticeFlowTemplate = {
    metadata: {},
    questions: questionsForTemplate,
    requirements
  };

  const templateId = await ensureTemplateRows(admin, {
    applicationId: application.id,
    tenderId,
    detail,
    sourceChannel: args.sourceChannel,
    template
  });

  return {
    applicationId: application.id,
    tenderId,
    grantExternalId: detail.id,
    grantSlug,
    grantTitle: detail.title,
    sourceChannel: args.sourceChannel,
    templateId,
    metadata: template.metadata,
    questions: template.questions,
    requirements: template.requirements
  };
}

export function evaluatePracticeQuiz(
  template: PracticeFlowState,
  answers: PracticeQuizAnswerInput
): { eligibility: PracticeQuizEligibility; notes: string[] } {
  const normalizedAnswers = Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
  );
  const questionByKey = new Map(template.questions.map((question) => [question.questionKey, question]));

  const notes: string[] = [];
  let criticalFailure = false;
  let needsReview = false;

  for (const question of template.questions) {
    const isVisible = isQuestionVisibleForAnswers(question, normalizedAnswers, questionByKey);
    if (!isVisible) {
      continue;
    }
    const ruleStrength = readRuleStrength(question);
    const answer = normalizedAnswers[question.questionKey];
    if (question.isRequired && (answer === undefined || answer === null || answer === '')) {
      notes.push(`Risposta obbligatoria mancante: ${question.label}`);
      needsReview = true;
      continue;
    }

    if (question.rule.kind === 'critical_boolean') {
      if (!shouldApplyCriticalBooleanRule(question)) {
        continue;
      }

      if (question.questionType === 'boolean') {
        const answerBool = booleanLike(answer);
        const expectedBool = booleanLike(question.rule.expected ?? null);
        if (answerBool !== null && expectedBool !== null) {
          if (answerBool !== expectedBool) {
            if (ruleStrength === 'hard') {
              criticalFailure = true;
            } else {
              needsReview = true;
            }
            notes.push(`Requisito ${ruleStrength === 'hard' ? 'non soddisfatto' : 'da approfondire'}: ${question.label}`);
          }
          continue;
        }
      }

      const normalizedAnswer = normalizeChoiceAnswer(question, answer);
      const normalizedExpected = normalizeChoiceAnswer(question, question.rule.expected ?? '');
      if (!normalizedAnswer || !normalizedExpected) {
        continue;
      }
      if (normalizedAnswer !== normalizedExpected) {
        if (ruleStrength === 'hard') {
          criticalFailure = true;
        } else {
          needsReview = true;
        }
        notes.push(`Requisito ${ruleStrength === 'hard' ? 'non soddisfatto' : 'da verificare'}: ${question.label}`);
      }
    }

    if (question.rule.kind === 'choice_in_set') {
      const normalizedAnswer = normalizeChoiceAnswer(question, answer);
      const allowedSet = parseExpectedChoiceSet(question.rule.expected ?? null);
      if (!normalizedAnswer || allowedSet.size === 0) {
        continue;
      }
      if (!allowedSet.has(normalizedAnswer)) {
        if (ruleStrength === 'hard') {
          criticalFailure = true;
        } else {
          needsReview = true;
        }
        notes.push(`Requisito ${ruleStrength === 'hard' ? 'non soddisfatto' : 'da approfondire'}: ${question.label}`);
      }
    }

    if (question.rule.kind === 'investment_range') {
      const numeric = typeof answer === 'number' ? answer : readNumber(answer);
      const min = readNumber(question.validation.min);
      const max = readNumber(question.validation.max);
      if (numeric === null) {
        needsReview = true;
        notes.push(`Importo da verificare: ${question.label}`);
        continue;
      }
      if (min !== null && numeric < min) {
        if (ruleStrength === 'hard') {
          criticalFailure = true;
        } else {
          needsReview = true;
        }
        notes.push(`Importo inferiore al minimo richiesto (${min}) su: ${question.label}.`);
      }
      if (max !== null && numeric > max) {
        if (ruleStrength === 'hard') {
          criticalFailure = true;
        } else {
          needsReview = true;
        }
        notes.push(`Importo superiore al massimale consentito (${max}) su: ${question.label}.`);
      }
    }
  }

  if (criticalFailure) {
    return { eligibility: 'not_eligible', notes };
  }
  if (needsReview) {
    return { eligibility: 'needs_review', notes };
  }
  return { eligibility: 'eligible', notes };
}

export async function completePracticeQuiz(
  admin: AdminClient,
  args: {
    applicationId: string;
    userId: string;
    companyId: string;
    sourceChannel: PracticeSourceChannel;
    template: PracticeFlowState;
    answers: PracticeQuizAnswerInput;
  }
) {
  const evaluation = evaluatePracticeQuiz(args.template, args.answers);

  const nowIso = new Date().toISOString();
  let submissionId = `legacy-${args.applicationId}-${Date.now()}`;
  let completedAt = nowIso;
  const submissionTemplateId =
    args.template.templateId.startsWith('legacy-') || args.template.templateId.startsWith('runtime-')
      ? `legacy-template-${args.applicationId}`
      : args.template.templateId;

  const { data: submission, error: submissionError } = await admin
    .from('practice_quiz_submissions')
    .insert({
      template_id: submissionTemplateId,
      application_id: args.applicationId,
      tender_id: args.template.tenderId,
      company_id: args.companyId,
      user_id: args.userId,
      source_channel: args.sourceChannel,
      eligibility: evaluation.eligibility,
      answers: args.answers as JsonValue,
      completed_at: nowIso,
    })
    .select('id, completed_at')
    .single();

  if (submissionError || !submission?.id) {
    if (!isMissingTableError(submissionError, 'practice_quiz_submissions')) {
      throw new Error(submissionError?.message ?? 'Impossibile salvare il quiz pratica.');
    }
  } else {
    submissionId = submission.id;
    completedAt = submission.completed_at;
  }

  const requirementRows = buildRequirementsForUpsert(
    args.applicationId,
    args.template.tenderId,
    args.sourceChannel,
    args.template.requirements
  );

  if (requirementRows.length > 0) {
    const { error: requirementsError } = await admin
      .from('practice_document_requirements')
      .upsert(requirementRows, { onConflict: 'application_id,requirement_key' });

    if (requirementsError) {
      if (isMissingTableError(requirementsError, 'practice_document_requirements')) {
        // fallback mode su ambienti non migrati
      } else {
        throw new Error(requirementsError.message);
      }
    }
  }

  const noteLines = [
    `Quiz requisiti completato il ${new Date().toLocaleString('it-IT')}.`,
    evaluation.notes[0] ?? null
  ].filter(Boolean);

  const { error: updateApplicationError } = await admin
    .from('tender_applications')
    .update({
      notes: upsertProgressIntoNotes(noteLines.join(' '), 'docs_collection')
    })
    .eq('id', args.applicationId);

  if (updateApplicationError) {
    throw new Error(updateApplicationError.message);
  }

  return {
    submissionId,
    completedAt,
    eligibility: evaluation.eligibility,
    requirements: args.template.requirements,
    reviewNotes: evaluation.notes
  };
}

export async function loadPracticeFlowForApplication(
  client: AdminClient,
  applicationId: string
): Promise<PracticeFlowState | null> {
  const { data: template, error: templateError } = await client
    .from('practice_quiz_templates')
    .select('id, application_id, tender_id, grant_external_id, grant_slug, grant_title, source_channel, metadata')
    .eq('application_id', applicationId)
    .maybeSingle();

  if (templateError && isMissingTableError(templateError, 'practice_quiz_templates')) {
    return buildRuntimeFlowFromApplication(client, applicationId);
  }

  if (!template) {
    const runtime = await buildRuntimeFlowFromApplication(client, applicationId);
    if (!runtime) {
      console.error(`[LOAD_FLOW] Template record missing and runtime reconstruction failed for ${applicationId}`);
    }
    return runtime;
  }

  const { data: questions, error: questionsError } = await client
    .from('practice_quiz_questions')
    .select('question_key, label, description, question_type, options, is_required, validation, rule, metadata')
    .eq('template_id', template.id)
    .order('sort_order', { ascending: true });

  const { data: requirements, error: requirementsError } = await client
    .from('practice_document_requirements')
    .select('requirement_key, label, description, is_required, source_channel, metadata')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });

  const needsRuntimeFallback =
    (questionsError && isMissingTableError(questionsError, 'practice_quiz_questions')) ||
    (requirementsError && isMissingTableError(requirementsError, 'practice_document_requirements')) ||
    !questions ||
    questions.length === 0;

  if (needsRuntimeFallback) {
    const runtimeFlow = await buildRuntimeFlowFromApplication(client, applicationId);
    if (runtimeFlow) return runtimeFlow;
  }

  const mappedQuestions = (questions ?? []).map((question) => ({
    questionKey: question.question_key,
    label: question.label,
    description: question.description,
    reasoning: (question as any).reasoning ?? null,
    questionType: question.question_type as PracticeQuizQuestionType,
    options: ((question.options as PracticeQuizOption[] | null) ?? []),
    isRequired: question.is_required,
    validation: (question.validation as Record<string, unknown> | null) ?? {},
    rule: (question.rule as any) ?? {},
    metadata: (question.metadata as Record<string, unknown> | null) ?? {},
  }));
  const sanitizedQuestions = sanitizePracticeQuizQuestions(mappedQuestions);

  if (mappedQuestions.length > 0 && sanitizedQuestions.length === 0) {
    const runtimeFlow = await buildRuntimeFlowFromApplication(client, applicationId);
    if (runtimeFlow) return runtimeFlow;
  }

  return {
    applicationId: template.application_id,
    tenderId: template.tender_id,
    grantExternalId: template.grant_external_id ?? '',
    grantSlug: template.grant_slug ?? '',
    grantTitle: template.grant_title,
    sourceChannel: template.source_channel as PracticeSourceChannel,
    templateId: template.id,
    metadata: (template.metadata as Record<string, unknown> | null) ?? {},
    questions: sanitizedQuestions,
    requirements: (requirements ?? []).map((requirement) => ({
      requirementKey: requirement.requirement_key,
      label: requirement.label,
      description: requirement.description,
      isRequired: requirement.is_required,
      sourceChannel: requirement.source_channel as PracticeSourceChannel,
      metadata: (requirement.metadata as Record<string, unknown> | null) ?? {},
    }))
  };
}

export type ApplicationRequirementStatus = {
  key: string;
  label: string;
  description: string | null;
  uploaded: boolean;
};

export async function loadApplicationRequirementStatus(
  client: AdminClient,
  applicationId: string
): Promise<ApplicationRequirementStatus[]> {
  const { data: requirements, error: requirementsError } = await client
    .from('practice_document_requirements')
    .select('requirement_key, label, description')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });

  if (requirementsError && isMissingTableError(requirementsError, 'practice_document_requirements')) {
    return [];
  }

  if (!requirements || requirements.length === 0) return [];

  const { data: documents } = await client
    .from('application_documents')
    .select('requirement_key')
    .eq('application_id', applicationId);

  const uploadedKeys = new Set((documents ?? []).map((document) => document.requirement_key).filter(Boolean));

  return requirements.map((requirement) => ({
    key: requirement.requirement_key,
    label: requirement.label,
    description: requirement.description,
    uploaded: uploadedKeys.has(requirement.requirement_key)
  }));
}
