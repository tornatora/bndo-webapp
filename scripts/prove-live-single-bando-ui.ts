import { buildFallbackGrantDetail, buildFallbackGrantExplainability } from '@/lib/grantDetailFallback';
import { evaluatePracticeQuiz, type PracticeFlowState, type PracticeQuizQuestion } from '@/lib/practices/orchestrator';
import {
  buildQuestionKey,
  compileSingleBandoEligibilitySpec,
  executeQuizPlanInUI,
  finalizeQuizPlan,
  isCompiledEligibilitySpecPublishable
} from '@/lib/practices/singleBandoVerificationEngine';

type CaseConfig = {
  id: string;
  label: string;
  expectedType:
    | 'territorial'
    | 'existing_business'
    | 'natural_person_new_activity'
    | 'mixed_beneficiaries';
  successOverrides?: Array<{
    questionIncludes: string;
    answerValue: string;
  }>;
};

type ShowIfRule = {
  questionKey: string;
  anyOf?: string[];
  equals?: string;
  noneOf?: string[];
};

const CASES: CaseConfig[] = [
  { id: '7747', label: 'CCIAA Cosenza - risparmio energetico', expectedType: 'territorial' },
  { id: '7875', label: 'Regione Veneto - consolidamento startup innovative', expectedType: 'existing_business' },
  { id: '7941', label: 'Bando imprese esistenti - local unit', expectedType: 'existing_business' },
  { id: '83', label: 'ON - Oltre Nuove imprese a tasso zero', expectedType: 'natural_person_new_activity' },
  {
    id: '796',
    label: 'ARTES 4.0 - mixed beneficiaries',
    expectedType: 'mixed_beneficiaries',
    successOverrides: [{ questionIncludes: 'Seleziona il tuo profilo', answerValue: 'universita_ente_di_ricerca' }]
  }
];

function normalizeToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function readShowIf(question: PracticeQuizQuestion): ShowIfRule | null {
  if (!question.metadata || typeof question.metadata !== 'object') return null;
  const raw = (question.metadata as Record<string, unknown>).showIf;
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const questionKey = typeof data.questionKey === 'string' ? data.questionKey : '';
  if (!questionKey) return null;
  return {
    questionKey,
    anyOf: Array.isArray(data.anyOf) ? data.anyOf.map(normalizeToken).filter(Boolean) : undefined,
    equals: typeof data.equals === 'string' ? normalizeToken(data.equals) : undefined,
    noneOf: Array.isArray(data.noneOf) ? data.noneOf.map(normalizeToken).filter(Boolean) : undefined
  };
}

function isVisible(question: PracticeQuizQuestion, answers: Record<string, string>) {
  const rule = readShowIf(question);
  if (!rule) return true;
  const got = normalizeToken(answers[rule.questionKey]);
  if (!got) return false;
  if (rule.equals && got !== rule.equals) return false;
  if (rule.anyOf && rule.anyOf.length > 0 && !rule.anyOf.includes(got)) return false;
  if (rule.noneOf && rule.noneOf.length > 0 && rule.noneOf.includes(got)) return false;
  return true;
}

function pickSuccessAnswer(question: PracticeQuizQuestion, cfg: CaseConfig): string {
  const override = cfg.successOverrides?.find((entry) =>
    normalizeToken(question.label).includes(normalizeToken(entry.questionIncludes))
  );
  if (override && (question.options ?? []).some((option) => normalizeToken(option.value) === normalizeToken(override.answerValue))) {
    return override.answerValue;
  }
  const options = question.options ?? [];
  if (options.length === 0) return 'yes';
  const dis = new Set(
    String((question.rule.expected ?? '') || '')
      .split(/[|,]/g)
      .map(normalizeToken)
      .filter(Boolean)
  );
  // For critical boolean, expected is usually yes; for choice_in_set expected lists allowed.
  if (question.rule.kind === 'critical_boolean') {
    const yes = options.find((o) => normalizeToken(o.value) === 'yes');
    if (yes) return yes.value;
  }
  if (question.rule.kind === 'choice_in_set' && dis.size > 0) {
    const allowed = options.find((o) => dis.has(normalizeToken(o.value)) || dis.has(normalizeToken(o.label)));
    if (allowed) return allowed.value;
  }
  const nonAlt = options.find((o) => !normalizeToken(o.value).includes('altro') && !normalizeToken(o.label).includes('altro'));
  return (nonAlt ?? options[0]).value;
}

function pickBlockedAnswer(question: PracticeQuizQuestion): string {
  const options = question.options ?? [];
  const bad = options.find((o) => {
    const token = normalizeToken(o.value + ' ' + o.label);
    return token.includes('altro') || token === 'no' || token.includes('fuori area');
  });
  return (bad ?? options[options.length - 1] ?? { value: 'no' }).value;
}

function resolveTransition(
  transitions: Array<{ fromQuestionId: string; answerValue: string; to: string }>,
  fromQuestionId: string,
  answer: string
) {
  const token = normalizeToken(answer);
  return transitions.find((t) => t.fromQuestionId === fromQuestionId && normalizeToken(t.answerValue) === token) ?? null;
}

function buildFlowState(questions: PracticeQuizQuestion[]): PracticeFlowState {
  return {
    applicationId: 'proof-app',
    tenderId: 'proof-tender',
    grantExternalId: 'proof-grant',
    grantSlug: 'proof-grant',
    grantTitle: 'proof-grant',
    sourceChannel: 'direct',
    templateId: 'proof-template',
    metadata: {},
    questions,
    requirements: []
  };
}

async function runCase(cfg: CaseConfig) {
  const [detail, explainability] = await Promise.all([
    buildFallbackGrantDetail(cfg.id),
    buildFallbackGrantExplainability(cfg.id)
  ]);

  const finalized = finalizeQuizPlan(detail, explainability);
  const compiled = await compileSingleBandoEligibilitySpec(detail, explainability, { enableAi: false });
  const plan = finalized.plan;
  const uiQuestions = executeQuizPlanInUI(plan, finalized.idealApplicant);

  const qById = new Map(plan.questions.map((q) => [q.id, q]));
  const idByKey = new Map(plan.questions.map((q) => [normalizeToken(q.id), q.id]));
  const uiByKey = new Map(uiQuestions.map((q) => [q.questionKey, q]));

  const orderedQuestionView = uiQuestions.map((q, idx) => ({
    order: idx + 1,
    questionKey: q.questionKey,
    question: q.label,
    options: (q.options ?? []).map((o) => ({ value: o.value, label: o.label })),
    showIf: readShowIf(q)
  }));

  function simulate(pathType: 'blocked' | 'success') {
    const answers: Record<string, string> = {};
    const steps: Array<{
      visibleOrder: number;
      questionKey: string;
      question: string;
      optionsShown: Array<{ value: string; label: string }>;
      chosen: string;
      branchTo: string;
    }> = [];

    for (let i = 0; i < uiQuestions.length; i++) {
      const uiQ = uiQuestions[i]!;
      if (!isVisible(uiQ, answers)) continue;

      const matchingId = plan.questions.find((q) => buildQuestionKey(q.id) === uiQ.questionKey)?.id;
      if (!matchingId) {
        const fallbackChoice = pathType === 'blocked' ? pickBlockedAnswer(uiQ) : pickSuccessAnswer(uiQ, cfg);
        answers[uiQ.questionKey] = fallbackChoice;
        steps.push({
          visibleOrder: steps.length + 1,
          questionKey: uiQ.questionKey,
          question: uiQ.label,
          optionsShown: (uiQ.options ?? []).map((o) => ({ value: o.value, label: o.label })),
          chosen: fallbackChoice,
          branchTo: 'next_visible'
        });
        continue;
      }

      const planQ = qById.get(matchingId)!;
      let chosen =
        pathType === 'blocked'
          ? (planQ.disqualifyIf?.[0] ?? pickBlockedAnswer(uiQ))
          : pickSuccessAnswer(uiQ, cfg);
      const available = new Set((uiQ.options ?? []).map((o) => normalizeToken(o.value)));
      if (available.size > 0 && !available.has(normalizeToken(chosen))) {
        chosen = pathType === 'blocked' ? pickBlockedAnswer(uiQ) : pickSuccessAnswer(uiQ, cfg);
      }

      answers[uiQ.questionKey] = chosen;
      const transition = resolveTransition(plan.transitions, matchingId, chosen);
      let branchTo = transition?.to ?? 'next_visible';
      if (pathType === 'success' && branchTo === 'success') {
        const hasFurtherVisible = uiQuestions
          .slice(i + 1)
          .some((candidate) => isVisible(candidate, answers));
        if (hasFurtherVisible) {
          branchTo = 'next_visible';
        }
      }
      steps.push({
        visibleOrder: steps.length + 1,
        questionKey: uiQ.questionKey,
        question: uiQ.label,
        optionsShown: (uiQ.options ?? []).map((o) => ({ value: o.value, label: o.label })),
        chosen,
        branchTo
      });

      if (branchTo === 'blocked') break;
      if (pathType === 'blocked' && branchTo === 'success') break;
    }

    const flowState = buildFlowState(uiQuestions);
    const evaluated = evaluatePracticeQuiz(flowState, answers);

    return {
      pathType,
      steps,
      answers,
      evaluatorOutcome: evaluated.eligibility,
      evaluatorNotes: evaluated.notes
    };
  }

  return {
    caseId: cfg.id,
    label: cfg.label,
    expectedType: cfg.expectedType,
    grant: {
      id: detail.id,
      title: detail.title,
      authority: detail.authority
    },
    visibleQuestionsInOrder: orderedQuestionView,
    runBlocked: simulate('blocked'),
    runSuccess: simulate('success'),
    publication: {
      status: compiled.publicationGate.status,
      publishable: isCompiledEligibilitySpecPublishable(compiled),
      reasons: compiled.publicationGate.reasons,
      warnings: compiled.publicationGate.warnings
    }
  };
}

async function main() {
  const outputs = [];
  for (const cfg of CASES) {
    outputs.push(await runCase(cfg));
  }
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: 'live-ui-behavior-simulation-from-finalized-quiz-plan',
        cases: outputs
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
