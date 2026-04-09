import type { GrantDetailRecord, GrantExplainabilityRecord } from '@/lib/grants/details';
import {
  assessSingleBandoQuestionSet,
  buildSingleBandoVerificationQuiz,
  compileSingleBandoEligibilitySpec,
  computeSingleBandoSourceFingerprint,
  executeCompiledEligibilitySpecInUI,
  parseCompiledEligibilitySpec,
  type CompiledEligibilitySpec,
  type PracticeQuizQuestion
} from '@/lib/practices/singleBandoVerificationEngine';

const inMemoryCompiledSpecCache = new Map<string, CompiledEligibilitySpec>();

function compiledSpecCacheKey(detail: GrantDetailRecord, explainability: GrantExplainabilityRecord) {
  return `${detail.id}:${computeSingleBandoSourceFingerprint(detail, explainability)}`;
}

export async function generateCompiledSingleBandoSpec(args: {
  detail: GrantDetailRecord;
  explainability: GrantExplainabilityRecord;
  cachedSpecRaw?: unknown;
  forceRecompile?: boolean;
}): Promise<CompiledEligibilitySpec> {
  const parsedCached = parseCompiledEligibilitySpec(args.cachedSpecRaw ?? null);
  const cacheKey = compiledSpecCacheKey(args.detail, args.explainability);
  const inMemoryCached = inMemoryCompiledSpecCache.get(cacheKey) ?? null;
  const cachedSpec = inMemoryCached ?? parsedCached;

  const spec = await compileSingleBandoEligibilitySpec(args.detail, args.explainability, {
    cachedSpec,
    forceRecompile: args.forceRecompile
  });

  inMemoryCompiledSpecCache.set(cacheKey, spec);
  return spec;
}

/**
 * Legacy-compatible export used by scanner/chat/detail routes.
 * This now delegates to the deterministic single-bando verification engine.
 */
export function buildDeterministicConditionalQuizQuestions(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): PracticeQuizQuestion[] {
  return buildSingleBandoVerificationQuiz(detail, explainability);
}

/**
 * Kept for backward compatibility with existing orchestrator/start-route calls.
 * We intentionally return deterministic grounded questions to avoid hallucinations
 * and vague meta-compliance prompts in single-bando verification.
 */
export async function generatePracticeQuizTemplateWithAI(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): Promise<PracticeQuizQuestion[]> {
  let questions: PracticeQuizQuestion[] = [];
  try {
    const spec = await generateCompiledSingleBandoSpec({
      detail,
      explainability
    });
    questions = executeCompiledEligibilitySpecInUI(spec);
  } catch {
    questions = buildSingleBandoVerificationQuiz(detail, explainability);
  }
  const assessment = assessSingleBandoQuestionSet(questions);

  if (assessment.ok) {
    return questions;
  }

  // Fail-closed: weak quizzes must not be published to runtime.
  return [];
}
