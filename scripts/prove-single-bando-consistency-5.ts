import { buildFallbackGrantDetail, buildFallbackGrantExplainability } from '@/lib/grantDetailFallback';
import {
  compileSingleBandoEligibilitySpec,
  executeQuizPlanInUI,
  finalizeQuizPlan,
  isCompiledEligibilitySpecPublishable
} from '@/lib/practices/singleBandoVerificationEngine';

const CASES = [
  { id: '7747', family: 'chamber_of_commerce_territorial' },
  { id: '7875', family: 'startup_innovativa' },
  { id: '7941', family: 'existing_business' },
  { id: '83', family: 'natural_person_new_business_and_female' },
  { id: '796', family: 'mixed_beneficiaries_university_research' }
] as const;

function norm(v: unknown) {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function compatibilityNotes(requirements: Array<{ category: string; normalizedValue?: unknown }>) {
  const notes: string[] = [];
  const stage = requirements.find((r) => r.category === 'business_stage') as
    | { normalizedValue?: { rule?: string } }
    | undefined;
  const startup = requirements.find((r) => r.category === 'other' && norm((r.normalizedValue as any)?.kind) === 'startup_status');
  const legal = requirements.find((r) => r.category === 'legal_subject_type') as
    | { normalizedValue?: { allowedTypes?: string[] } }
    | undefined;

  if (stage?.normalizedValue?.rule === 'not_yet_constituted' && startup) {
    notes.push('startup_status constrained to compatible beneficiary branch (no global contradiction)');
  }
  if (stage?.normalizedValue?.rule === 'already_constituted') {
    notes.push('business_stage requires existing constituted business');
  }
  if ((legal?.normalizedValue?.allowedTypes?.length ?? 0) > 0) {
    notes.push(`legal_subject_type constrained to: ${(legal?.normalizedValue?.allowedTypes ?? []).join(', ')}`);
  }
  if (notes.length === 0) notes.push('no critical normalized conflicts detected');
  return notes;
}

type Step = { questionId: string; answerValue: string; to: string };

function pickPath(plan: ReturnType<typeof finalizeQuizPlan>['plan'], kind: 'success' | 'blocked') {
  const ordered = plan.questions.slice().sort((a, b) => a.priority - b.priority);
  const first = ordered.find((q) => !q.showIf) ?? ordered[0];
  if (!first) return [] as Step[];

  const transitionsBy = new Map<string, Array<{ answerValue: string; to: string }>>();
  for (const t of plan.transitions) {
    const key = `${t.fromQuestionId}`;
    if (!transitionsBy.has(key)) transitionsBy.set(key, []);
    transitionsBy.get(key)!.push({ answerValue: t.answerValue, to: t.to });
  }

  const out: Step[] = [];
  const visited = new Set<string>();
  let current = first.id;
  while (current && !visited.has(current)) {
    visited.add(current);
    const opts = transitionsBy.get(current) ?? [];
    if (opts.length === 0) break;
    const pick =
      kind === 'blocked'
        ? opts.find((o) => o.to === 'blocked') ?? opts[0]!
        : opts.find((o) => o.to !== 'blocked') ?? opts[0]!;
    out.push({ questionId: current, answerValue: pick.answerValue, to: pick.to });
    if (pick.to === 'blocked' || pick.to === 'success') break;
    current = pick.to;
  }
  return out;
}

function countResolvedDecisiveDimensions(
  plan: ReturnType<typeof finalizeQuizPlan>['plan'],
  path: Step[]
) {
  const byId = new Map(plan.questions.map((q) => [q.id, q]));
  const categories = new Set<string>();
  for (const step of path) {
    const question = byId.get(step.questionId);
    if (!question) continue;
    categories.add(question.category);
  }
  return Array.from(categories);
}

function validatePathSemantics(plan: ReturnType<typeof finalizeQuizPlan>['plan'], path: Step[]) {
  const byId = new Map(plan.questions.map((q) => [q.id, q]));
  const reasons: string[] = [];
  const answers = new Map<string, string>();

  for (const step of path) {
    const q = byId.get(step.questionId);
    if (!q) continue;

    if (q.showIf) {
      const parent = answers.get(q.showIf.questionId);
      if (!parent) reasons.push(`missing_parent_answer:${q.id}`);
      const parentNorm = norm(parent);
      if (q.showIf.anyOf && q.showIf.anyOf.length > 0 && !q.showIf.anyOf.map(norm).includes(parentNorm)) {
        reasons.push(`showIf_anyOf_violation:${q.id}`);
      }
      if (q.showIf.noneOf && q.showIf.noneOf.length > 0 && q.showIf.noneOf.map(norm).includes(parentNorm)) {
        reasons.push(`showIf_noneOf_violation:${q.id}`);
      }
      if (q.showIf.equals && norm(q.showIf.equals) !== parentNorm) {
        reasons.push(`showIf_equals_violation:${q.id}`);
      }
    }

    // basic semantic guard: avoid asking constituted-company assumption after explicit non-constituted answer
    if (/gia un.?impresa attiva e costituita/.test(norm(q.question))) {
      const prevStageNo = Array.from(answers.entries()).some(([qid, val]) => {
        const prev = byId.get(qid);
        return prev?.category === 'business_stage' && norm(val) === 'no';
      });
      if (prevStageNo) reasons.push(`stage_contradiction:${q.id}`);
    }

    answers.set(q.id, step.answerValue);
  }

  return { ok: reasons.length === 0, reasons };
}

async function run() {
  const cases: unknown[] = [];

  for (const item of CASES) {
    const [detail, explainability] = await Promise.all([
      buildFallbackGrantDetail(item.id),
      buildFallbackGrantExplainability(item.id)
    ]);
    const finalized = finalizeQuizPlan(detail, explainability);
    const compiled = await compileSingleBandoEligibilitySpec(detail, explainability, { enableAi: false });
    const uiQuestions = executeQuizPlanInUI(finalized.plan, finalized.idealApplicant);

    const successPath = pickPath(finalized.plan, 'success');
    const blockedPath = pickPath(finalized.plan, 'blocked');

    cases.push({
      id: item.id,
      family: item.family,
      grant: { title: detail.title, authority: detail.authority },
      extractedRequirements: finalized.plan.requirements.map((r) => ({
        id: r.id,
        category: r.category,
        askable: r.askable,
        importance: r.importance,
        normalizedValue: (r as any).normalizedValue ?? null
      })),
      askableRequirements: finalized.plan.requirements
        .filter((r) => r.askable)
        .map((r) => ({ id: r.id, category: r.category, importance: r.importance })),
      nonAskableRequirements: finalized.plan.requirements
        .filter((r) => !r.askable)
        .map((r) => ({ id: r.id, category: r.category, importance: r.importance })),
      normalizedCompatibilityNotes: compatibilityNotes(finalized.plan.requirements as any),
      finalVisibleQuestions: uiQuestions.map((q) => ({
        key: q.questionKey,
        label: q.label,
        helpText: q.description,
        options: (q.options ?? []).map((o) => ({ value: o.value, label: o.label })),
        showIf: ((q.metadata as Record<string, unknown>)?.showIf ?? null)
      })),
      transitions: finalized.plan.transitions,
      validSuccessPath: successPath,
      validBlockedPath: blockedPath,
      successPathResolvedDimensions: countResolvedDecisiveDimensions(finalized.plan, successPath),
      depthAssessment: {
        totalQuestions: uiQuestions.length,
        decisiveDimensions: Array.from(
          new Set(
            finalized.plan.requirements
              .filter((r) => r.askable && (r.importance === 'critical' || r.importance === 'high'))
              .map((r) => r.category)
          )
        ),
        shortestSuccessDepth: successPath.length,
        notShallow:
          successPath.length >= 3 ||
          new Set(
            finalized.plan.requirements
              .filter((r) => r.askable && (r.importance === 'critical' || r.importance === 'high'))
              .map((r) => r.category)
          ).size <= 2
      },
      firstQuestionAudit: {
        label: uiQuestions[0]?.label ?? null,
        cleanTitle: Boolean(uiQuestions[0]?.label) && !/ammessi:\s*/i.test(uiQuestions[0]!.label)
      },
      successPathSemanticValidation: validatePathSemantics(finalized.plan, successPath),
      blockedPathSemanticValidation: validatePathSemantics(finalized.plan, blockedPath)
      ,
      publication: {
        status: compiled.publicationGate.status,
        publishable: isCompiledEligibilitySpecPublishable(compiled),
        reasons: compiled.publicationGate.reasons,
        warnings: compiled.publicationGate.warnings,
        shortestSuccessDepth: compiled.publicationGate.shortestSuccessDepth,
        decisiveDimensions: compiled.publicationGate.decisiveDimensions,
        resolvedDimensionsOnShortestSuccessPath: compiled.publicationGate.resolvedDimensionsOnShortestSuccessPath
      }
    });
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
