import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFallbackGrantDetail, buildFallbackGrantExplainability } from '@/lib/grantDetailFallback';
import {
  compileSingleBandoEligibilitySpec,
  executeCompiledEligibilitySpecInUI,
  isCompiledEligibilitySpecPublishable,
  type BandoQuizPlan,
  type GenericRequirement,
  type VerificationQuestion,
  validateNoDuplicate,
  validateTerritorySafety
} from '@/lib/practices/singleBandoVerificationEngine';
import { computeMonotonicQuizProgress } from '@/lib/practices/quizProgress';

type SeedDoc = {
  id?: string | number;
  title?: string;
  openDate?: string;
  closeDate?: string;
};

type CaseResult = {
  id: string;
  title: string;
  catalogStatus: 'open' | 'incoming';
  compileStatus: string;
  publicationStatus: string;
  publishable: boolean;
  runtimeQuestions: number;
  planQuestions: number;
  shortestSuccessDepth: number;
  depthTarget: number;
  reasons: string[];
  warnings: string[];
};

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isVisible(question: VerificationQuestion, answers: Record<string, string>) {
  if (!question.showIf) return true;
  const parentValue = normalize(answers[question.showIf.questionId] ?? '');
  if (!parentValue) return false;
  if (question.showIf.equals && normalize(question.showIf.equals) !== parentValue) return false;
  if (question.showIf.anyOf && question.showIf.anyOf.length > 0) {
    const anyOf = question.showIf.anyOf.map((entry) => normalize(entry));
    if (!anyOf.includes(parentValue)) return false;
  }
  if (question.showIf.noneOf && question.showIf.noneOf.length > 0) {
    const noneOf = question.showIf.noneOf.map((entry) => normalize(entry));
    if (noneOf.includes(parentValue)) return false;
  }
  return true;
}

function pickPath(plan: BandoQuizPlan, target: 'success' | 'blocked') {
  const ordered = plan.questions.slice().sort((a, b) => a.priority - b.priority);
  const first = ordered.find((q) => !q.showIf) ?? ordered[0];
  if (!first) return [] as Array<{ id: string; answerValue: string; to: string }>;
  const byFrom = new Map<string, Array<{ answerValue: string; to: string }>>();
  for (const transition of plan.transitions) {
    if (!byFrom.has(transition.fromQuestionId)) byFrom.set(transition.fromQuestionId, []);
    byFrom.get(transition.fromQuestionId)!.push({
      answerValue: transition.answerValue,
      to: transition.to
    });
  }
  const out: Array<{ id: string; answerValue: string; to: string }> = [];
  let current = first.id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const transitions = byFrom.get(current) ?? [];
    if (transitions.length === 0) break;
    const chosen =
      target === 'blocked'
        ? transitions.find((item) => item.to === 'blocked') ?? transitions[0]!
        : transitions.find((item) => item.to !== 'blocked') ?? transitions[0]!;
    out.push({ id: current, answerValue: chosen.answerValue, to: chosen.to });
    if (chosen.to === 'blocked' || chosen.to === 'success') break;
    current = chosen.to;
  }
  return out;
}

function countProgressRegressions(plan: BandoQuizPlan) {
  let regressions = 0;
  const simulate = (path: Array<{ id: string; answerValue: string }>) => {
    const answers: Record<string, string> = {};
    let prev = 0;
    for (let index = 0; index < path.length; index += 1) {
      const visibleCount = plan.questions.filter((question) => isVisible(question, answers)).length;
      const progress = computeMonotonicQuizProgress({
        currentStep: index,
        visibleQuestionsCount: Math.max(1, visibleCount),
        previousMaxProgress: prev
      });
      if (progress < prev) regressions += 1;
      prev = progress;
      const step = path[index]!;
      answers[step.id] = step.answerValue;
    }
  };
  simulate(pickPath(plan, 'success'));
  simulate(pickPath(plan, 'blocked'));
  return regressions;
}

function countSemanticDuplicates(questions: VerificationQuestion[]) {
  const ordered = questions.slice().sort((a, b) => a.priority - b.priority);
  const accepted: VerificationQuestion[] = [];
  let duplicates = 0;
  for (const question of ordered) {
    const duplicate = validateNoDuplicate(question, accepted);
    if (!duplicate.ok) {
      if (
        duplicate.reasons.some((reason) =>
          ['same_question_text', 'same_requirement_overlap', 'semantic_redundancy_same_intent_scope'].includes(reason)
        )
      ) {
        duplicates += 1;
      }
      continue;
    }
    accepted.push(question);
  }
  return duplicates;
}

function countTerritoryHallucinations(questions: VerificationQuestion[], requirements: GenericRequirement[]) {
  return questions.reduce((count, question) => {
    const result = validateTerritorySafety(question, requirements);
    return result.ok ? count : count + 1;
  }, 0);
}

function asDate(value: unknown) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCatalogStatus(doc: SeedDoc, nowMs: number): 'open' | 'incoming' | 'closed' {
  const openDate = asDate(doc.openDate);
  const closeDate = asDate(doc.closeDate);
  if (closeDate !== null && closeDate < nowMs) return 'closed';
  if (openDate !== null && openDate > nowMs) return 'incoming';
  return 'open';
}

async function loadVisibleSeedDocs(nowMs: number) {
  const seedPath = path.resolve(process.cwd(), 'data', 'bndo-bandi-cache.seed.json');
  const raw = await fs.readFile(seedPath, 'utf8');
  const parsed = JSON.parse(raw) as { docs?: SeedDoc[] };
  const docs = Array.isArray(parsed.docs) ? parsed.docs : [];
  const visible = docs
    .map((doc) => ({
      id: String(doc.id ?? '').trim(),
      title: String(doc.title ?? '').trim() || 'Bando senza titolo',
      status: resolveCatalogStatus(doc, nowMs)
    }))
    .filter((doc) => doc.id.length > 0 && doc.status !== 'closed');

  const deduped = new Map<string, { id: string; title: string; status: 'open' | 'incoming' }>();
  for (const doc of visible) {
    if (doc.status === 'closed') continue;
    if (!deduped.has(doc.id)) {
      deduped.set(doc.id, {
        id: doc.id,
        title: doc.title,
        status: doc.status
      });
    }
  }
  return Array.from(deduped.values());
}

async function run() {
  const now = new Date();
  const nowMs = now.getTime();
  const allVisible = await loadVisibleSeedDocs(nowMs);
  const limit = Number(process.env.SINGLE_BANDO_MASS_LIMIT ?? '');
  const targets =
    Number.isFinite(limit) && limit > 0 ? allVisible.slice(0, Math.floor(limit)) : allVisible;

  const results: CaseResult[] = [];
  const failures: Array<{ id: string; title: string; error: string }> = [];
  let territoryHallucinationCount = 0;
  let duplicateSemanticQuestionCount = 0;
  let progressRegressionEvents = 0;

  let processed = 0;
  for (const item of targets) {
    processed += 1;
    try {
      const [detail, explainability] = await Promise.all([
        buildFallbackGrantDetail(item.id),
        buildFallbackGrantExplainability(item.id)
      ]);
      const compiled = await compileSingleBandoEligibilitySpec(detail, explainability, { enableAi: false });
      const runtimeQuestions = executeCompiledEligibilitySpecInUI(compiled);
      territoryHallucinationCount += countTerritoryHallucinations(
        compiled.plan.questions,
        compiled.plan.requirements
      );
      duplicateSemanticQuestionCount += countSemanticDuplicates(compiled.plan.questions);
      progressRegressionEvents += countProgressRegressions(compiled.plan);

      results.push({
        id: item.id,
        title: item.title,
        catalogStatus: item.status,
        compileStatus: compiled.compileStatus,
        publicationStatus: compiled.publicationGate.status,
        publishable: isCompiledEligibilitySpecPublishable(compiled),
        runtimeQuestions: runtimeQuestions.length,
        planQuestions: compiled.plan.questions.length,
        shortestSuccessDepth: compiled.publicationGate.shortestSuccessDepth,
        depthTarget: compiled.publicationGate.depthTarget,
        reasons: compiled.publicationGate.reasons,
        warnings: compiled.publicationGate.warnings
      });
    } catch (error) {
      failures.push({
        id: item.id,
        title: item.title,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (processed % 50 === 0 || processed === targets.length) {
      console.error(`Processed ${processed}/${targets.length}...`);
    }
  }

  const publish = results.filter((item) => item.publicationStatus === 'publish');
  const publishWithWarning = results.filter((item) => item.publicationStatus === 'publish_with_warning');
  const quarantine = results.filter((item) => item.publicationStatus === 'quarantine');
  const runtimeAtLeast8 = results.filter((item) => item.runtimeQuestions >= 8);
  const runtimeBelow8 = results.filter((item) => item.runtimeQuestions > 0 && item.runtimeQuestions < 8);
  const runtimeZero = results.filter((item) => item.runtimeQuestions === 0);

  const reasonCount = new Map<string, number>();
  for (const item of [...quarantine, ...publishWithWarning]) {
    for (const reason of [...item.reasons, ...item.warnings]) {
      const key = String(reason || '').trim();
      if (!key) continue;
      reasonCount.set(key, (reasonCount.get(key) ?? 0) + 1);
    }
  }

  const topReasons = Array.from(reasonCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([reason, count]) => ({ reason, count }));

  const output = {
    generatedAt: new Date().toISOString(),
    nowReference: now.toISOString(),
    totalVisibleCatalogBandi: allVisible.length,
    evaluated: targets.length,
    failures: failures.length,
    summary: {
      publish: publish.length,
      publishWithWarning: publishWithWarning.length,
      quarantine: quarantine.length,
      runtimeAtLeast8: runtimeAtLeast8.length,
      runtimeBelow8: runtimeBelow8.length,
      runtimeZero: runtimeZero.length,
      territoryHallucinationCount,
      duplicateSemanticQuestionCount,
      progressRegressionEvents
    },
    topReasons,
    failuresById: failures,
    lowDepthExamples: runtimeBelow8
      .sort((a, b) => a.runtimeQuestions - b.runtimeQuestions || a.shortestSuccessDepth - b.shortestSuccessDepth)
      .slice(0, 30),
    quarantineExamples: quarantine.slice(0, 30),
    publishWithWarningExamples: publishWithWarning.slice(0, 30),
    allResults: results
  };

  console.log(JSON.stringify(output, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
