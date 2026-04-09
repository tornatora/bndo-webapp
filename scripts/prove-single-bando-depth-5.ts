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

async function run() {
  const out: unknown[] = [];
  for (const item of CASES) {
    const [detail, explainability] = await Promise.all([
      buildFallbackGrantDetail(item.id),
      buildFallbackGrantExplainability(item.id)
    ]);
    const finalized = finalizeQuizPlan(detail, explainability);
    const compiled = await compileSingleBandoEligibilitySpec(detail, explainability, { enableAi: false });
    const uiQuestions = executeQuizPlanInUI(finalized.plan, finalized.idealApplicant);

    const blockedConditions = finalized.plan.transitions
      .filter((t) => t.to === 'blocked')
      .map((t) => ({ fromQuestionId: t.fromQuestionId, answerValue: t.answerValue }));
    const successCondition = finalized.plan.transitions
      .filter((t) => t.to === 'success')
      .map((t) => ({ fromQuestionId: t.fromQuestionId, answerValue: t.answerValue }));

    out.push({
      id: item.id,
      family: item.family,
      grant: {
        title: detail.title,
        authority: detail.authority
      },
      extractedRequirements: finalized.plan.requirements.map((r) => ({
        id: r.id,
        category: r.category,
        importance: r.importance,
        blocking: r.blocking,
        askable: r.askable,
        sourceExcerpt: r.sourceExcerpt,
        normalizedValue: (r as { normalizedValue?: unknown }).normalizedValue ?? null
      })),
      askableRequirements: finalized.plan.requirements.filter((r) => r.askable).map((r) => r.id),
      nonAskableRequirements: finalized.plan.requirements.filter((r) => !r.askable).map((r) => r.id),
      finalVisibleQuestions: uiQuestions.map((q, idx) => ({
        order: idx + 1,
        key: q.questionKey,
        label: q.label,
        options: (q.options ?? []).map((o) => ({ value: o.value, label: o.label })),
        showIf: ((q.metadata as Record<string, unknown>)?.showIf ?? null)
      })),
      transitions: finalized.plan.transitions,
      blockedConditions,
      successCondition,
      counters: {
        requirements: finalized.plan.requirements.length,
        questions: finalized.plan.questions.length,
        transitions: finalized.plan.transitions.length,
        askableRequirements: finalized.plan.requirements.filter((r) => r.askable).length
      },
      publication: {
        status: compiled.publicationGate.status,
        publishable: isCompiledEligibilitySpecPublishable(compiled),
        reasons: compiled.publicationGate.reasons,
        warnings: compiled.publicationGate.warnings
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cases: out
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
