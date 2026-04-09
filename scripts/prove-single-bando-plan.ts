import { buildFallbackGrantDetail, buildFallbackGrantExplainability } from '@/lib/grantDetailFallback';
import {
  executeQuizPlanInUI,
  finalizeQuizPlan,
  type BandoQuizPlan,
  type VerificationQuestion
} from '@/lib/practices/singleBandoVerificationEngine';

type ProofCase = {
  id: string;
  label: string;
  expectation: string;
  oldBadQuestions: string[];
};

const CASES: ProofCase[] = [
  {
    id: '7747',
    label: 'Strong Territorial Constraints',
    expectation: 'Territory vincolato a Calabria / provincia di Cosenza, imprese gia attive',
    oldBadQuestions: [
      'Il progetto sara realizzato nel territorio indicato dal bando?',
      'Confermi questo requisito del bando?'
    ]
  },
  {
    id: '7875',
    label: 'Existing Businesses',
    expectation: 'Startup innovative gia costituite (Veneto), consolidamento',
    oldBadQuestions: [
      'Rientri tra i beneficiari ammessi?',
      'Rispetti i requisiti chiave indicati dal bando?'
    ]
  },
  {
    id: 'strategic-autoimpiego-centro-nord',
    label: 'Natural Persons Starting New Activity',
    expectation: 'Aspiranti imprenditori / nuova attivita / stato occupazionale',
    oldBadQuestions: [
      'Sei in possesso dei requisiti previsti?',
      'Confermi di rispettare i requisiti chiave indicati dal bando?'
    ]
  }
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function questionIndexMap(plan: BandoQuizPlan) {
  const ordered = plan.questions.slice().sort((a, b) => a.priority - b.priority);
  return new Map(ordered.map((question, index) => [question.id, index + 1]));
}

function optionsMap(question: VerificationQuestion) {
  const entries = question.options ?? [];
  return new Map(entries.map((entry) => [normalizeText(entry.value), entry.label]));
}

function classifyBranching(plan: BandoQuizPlan) {
  const transitionsByFrom = new Map<string, Set<string>>();
  for (const transition of plan.transitions) {
    if (!transitionsByFrom.has(transition.fromQuestionId)) {
      transitionsByFrom.set(transition.fromQuestionId, new Set<string>());
    }
    transitionsByFrom.get(transition.fromQuestionId)!.add(transition.to);
  }

  const branchingNodes = Array.from(transitionsByFrom.entries())
    .filter(([, targets]) => targets.size > 1)
    .map(([id]) => id);
  const hasConditionalQuestions = plan.questions.some((question) => Boolean(question.showIf));
  const hasBlockedPath = plan.transitions.some((transition) => transition.to === 'blocked');
  const hasSkip = plan.transitions.some((transition) => {
    if (transition.to === 'blocked' || transition.to === 'success') return false;
    const from = plan.questions.find((question) => question.id === transition.fromQuestionId);
    const to = plan.questions.find((question) => question.id === transition.to);
    if (!from || !to) return false;
    return to.priority > from.priority + 1;
  });

  const classification =
    branchingNodes.length > 0 && (hasConditionalQuestions || hasBlockedPath || hasSkip)
      ? 'real multi-step branching quiz'
      : 'shallow flat questionnaire';

  return {
    classification,
    branchingNodes,
    hasConditionalQuestions,
    hasBlockedPath,
    hasSkip
  };
}

function summarizeBlockedConditions(plan: BandoQuizPlan) {
  const blocked = plan.transitions.filter((transition) => transition.to === 'blocked');
  return blocked.map((transition) => {
    const question = plan.questions.find((entry) => entry.id === transition.fromQuestionId);
    const optionLabel = question ? optionsMap(question).get(normalizeText(transition.answerValue)) : null;
    return {
      fromQuestionId: transition.fromQuestionId,
      question: question?.question ?? null,
      answerValue: transition.answerValue,
      answerLabel: optionLabel ?? transition.answerValue
    };
  });
}

function summarizeSuccessCondition(plan: BandoQuizPlan) {
  const successTransitions = plan.transitions.filter((transition) => transition.to === 'success');
  return {
    successReachable: successTransitions.length > 0,
    transitionsIntoSuccess: successTransitions
  };
}

async function runCase(input: ProofCase) {
  const [detail, explainability] = await Promise.all([
    buildFallbackGrantDetail(input.id),
    buildFallbackGrantExplainability(input.id)
  ]);

  const finalized = finalizeQuizPlan(detail, explainability);
  const plan = finalized.plan;
  const uiQuestions = executeQuizPlanInUI(plan, finalized.idealApplicant);
  const ordered = plan.questions.slice().sort((a, b) => a.priority - b.priority);
  const orderMap = questionIndexMap(plan);
  const branching = classifyBranching(plan);

  const transitions = plan.transitions.map((transition) => ({
    ...transition,
    fromOrder: orderMap.get(transition.fromQuestionId) ?? null,
    toOrder:
      transition.to === 'blocked' || transition.to === 'success'
        ? transition.to
        : (orderMap.get(transition.to) ?? null)
  }));

  return {
    caseId: input.id,
    label: input.label,
    expectation: input.expectation,
    grant: {
      id: detail.id,
      title: detail.title,
      authority: detail.authority
    },
    before: {
      oldBadQuestions: input.oldBadQuestions
    },
    after: {
      extractedStructuredRequirements: plan.requirements.map((requirement) => ({
        id: requirement.id,
        category: requirement.category,
        blocking: requirement.blocking,
        askable: requirement.askable,
        importance: requirement.importance,
        sourceExcerpt: requirement.sourceExcerpt,
        normalizedValue: (requirement as { normalizedValue?: unknown }).normalizedValue ?? null
      })),
      idealApplicantProfile: finalized.idealApplicant,
      finalOrderedQuestions: ordered.map((question, index) => ({
        order: index + 1,
        id: question.id,
        category: question.category,
        priority: question.priority,
        blocking: question.blocking,
        question: question.question,
        helpText: question.helpText ?? null,
        answerType: question.answerType,
        options: question.options ?? [],
        disqualifyIf: question.disqualifyIf ?? [],
        showIf: question.showIf ?? null,
        requirementIds: question.requirementIds,
        sourceExcerpt: question.sourceExcerpt
      })),
      transitions,
      blockedConditions: summarizeBlockedConditions(plan),
      successCondition: summarizeSuccessCondition(plan),
      uiBehavior: {
        rendering: 'Sequenziale con visibilita condizionale via metadata.showIf',
        immediateBlock: 'Sui nodi hard (critical_boolean / choice_in_set) il click su risposta disqualify porta subito a not_eligible',
        progress: 'Progress calcolato su domande visibili',
        terminalStates: ['eligible', 'not_eligible', 'needs_review'],
        safeFail: 'Se non esistono domande grounded, il client imposta outcome=needs_review'
      }
    },
    classification: branching,
    counters: {
      requirements: plan.requirements.length,
      questions: plan.questions.length,
      transitions: plan.transitions.length,
      uiQuestions: uiQuestions.length
    }
  };
}

async function main() {
  const results = [];
  for (const item of CASES) {
    results.push(await runCase(item));
  }
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cases: results
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
