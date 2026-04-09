/**
 * Single-bando verification engine regression suite (A-L).
 * Run with: npx tsx scripts/test-single-bando-verification-unit.ts
 */
import type { GrantDetailRecord, GrantExplainabilityRecord } from '@/lib/grants/details';
import {
  assessSingleBandoQuestionSet,
  buildSingleBandoVerificationQuiz,
  compileSingleBandoEligibilitySpec,
  computeSingleBandoSourceFingerprint,
  evaluatePublicationGate,
  executeCompiledEligibilitySpecInUI,
  finalizeQuizPlan,
  finalizeVerificationQuestions,
  isCompiledEligibilitySpecPublishable,
  isCompiledEligibilitySpecReusable,
  parseCompiledEligibilitySpec
} from '@/lib/practices/singleBandoVerificationEngine';
import { getQuizQuestions } from '@/lib/quiz/quiz-map';
import { buildFallbackGrantDetail, buildFallbackGrantExplainability } from '@/lib/grantDetailFallback';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function mkDetail(overrides: Partial<GrantDetailRecord> = {}): GrantDetailRecord {
  return {
    id: overrides.id ?? 'bando-test',
    title: overrides.title ?? 'Bando test finanza agevolata',
    authority: overrides.authority ?? 'Regione Calabria',
    openingDate: overrides.openingDate ?? '2026-01-01',
    deadlineDate: overrides.deadlineDate ?? '2026-12-31',
    availabilityStatus: overrides.availabilityStatus ?? 'open',
    budgetTotal: overrides.budgetTotal ?? 5000000,
    aidForm: overrides.aidForm ?? 'Contributo a fondo perduto',
    aidIntensity: overrides.aidIntensity ?? '60%',
    beneficiaries: overrides.beneficiaries ?? ['PMI'],
    sectors: overrides.sectors ?? ['Turismo'],
    officialUrl: overrides.officialUrl ?? 'https://example.org/bando',
    officialAttachments: overrides.officialAttachments ?? [],
    description: overrides.description ?? 'Descrizione bando',
    cpvCode: overrides.cpvCode ?? null,
    requisitiHard: overrides.requisitiHard ?? {},
    requisitiSoft: overrides.requisitiSoft ?? {},
    requisitiStrutturati: overrides.requisitiStrutturati ?? {},
    requiredDocuments: overrides.requiredDocuments ?? []
  };
}

function mkExplainability(
  overrides: Partial<GrantExplainabilityRecord> = {}
): GrantExplainabilityRecord {
  return {
    hardStatus: overrides.hardStatus ?? 'unknown',
    eligibilityScore: overrides.eligibilityScore ?? 50,
    completenessScore: overrides.completenessScore ?? 50,
    fitScore: overrides.fitScore ?? 50,
    probabilityScore: overrides.probabilityScore ?? 50,
    whyFit: overrides.whyFit ?? [],
    satisfiedRequirements: overrides.satisfiedRequirements ?? [],
    missingRequirements: overrides.missingRequirements ?? [],
    applySteps: overrides.applySteps ?? []
  };
}

function normalize(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsToken(text: string, token: string) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
}

const IT_REGIONS = [
  'abruzzo',
  'basilicata',
  'calabria',
  'campania',
  'emilia-romagna',
  'friuli-venezia giulia',
  'lazio',
  'liguria',
  'lombardia',
  'marche',
  'molise',
  'piemonte',
  'puglia',
  'sardegna',
  'sicilia',
  'toscana',
  'trentino-alto adige',
  'umbria',
  "valle d'aosta",
  'veneto'
];

function extractMentionedRegions(text: string) {
  const t = normalize(text);
  return IT_REGIONS.filter((r) => containsToken(t, r));
}

function shortestSuccessDepth(plan: ReturnType<typeof finalizeQuizPlan>['plan']) {
  const first = plan.questions.find((q) => !q.showIf) ?? plan.questions[0];
  if (!first) return 0;
  const byFrom = new Map<string, Array<{ to: string }>>();
  for (const t of plan.transitions) {
    if (!byFrom.has(t.fromQuestionId)) byFrom.set(t.fromQuestionId, []);
    byFrom.get(t.fromQuestionId)!.push({ to: t.to });
  }
  const queue: Array<{ id: string; depth: number; seen: string[] }> = [{ id: first.id, depth: 1, seen: [first.id] }];
  let best: number | null = null;
  while (queue.length > 0) {
    const current = queue.shift()!;
    const edges = byFrom.get(current.id) ?? [];
    for (const edge of edges) {
      if (edge.to === 'blocked') continue;
      if (edge.to === 'success') {
        best = best === null ? current.depth : Math.min(best, current.depth);
        continue;
      }
      if (current.seen.includes(edge.to)) continue;
      queue.push({ id: edge.to, depth: current.depth + 1, seen: [...current.seen, edge.to] });
    }
  }
  return best ?? 0;
}

let passed = 0;

async function main() {
  // A) territory precision Calabria/Cosenza, no Lazio
  {
    const detail = mkDetail({
      title: 'Bando Cosenza Innovazione',
      authority: 'Comune di Cosenza',
      description:
        'Interventi ammessi esclusivamente nel Comune di Cosenza. Sede operativa in Calabria.',
      requisitiHard: {
        territorio: 'L’iniziativa deve essere localizzata nel Comune di Cosenza (Calabria).'
      }
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const territoryQuestions = final.questions.filter(
      (q) =>
        /comune|provincia|regione|sede operativa|territorio/i.test(q.label) ||
        /territorio|territory/i.test(String(q.metadata?.category ?? ''))
    );
    assert(territoryQuestions.length >= 1, 'A: expected at least one territory question');
    const joined = territoryQuestions
      .map((q) => `${q.label} ${q.description ?? ''}`)
      .join(' ');
    assert(!/lazio/i.test(joined), 'A: territory question must not mention Lazio');
    assert(/cosenza|calabria/i.test(joined), 'A: territory question must mention Cosenza/Calabria');
    passed++;
  }

  // B) beneficiary explicitness
  {
    const detail = mkDetail({
      beneficiaries: ['PMI'],
      description: 'Il bando è rivolto esclusivamente a PMI.'
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const text = final.questions.map((q) => q.label).join(' ');
    assert(/pmi/i.test(text), 'B: question should explicitly mention beneficiary type');
    assert(!/beneficiari ammessi/i.test(text), 'B: no generic beneficiary meta language');
    passed++;
  }

  // C) persona fisica da costituire
  {
    const detail = mkDetail({
      beneficiaries: ['Persone fisiche'],
      description:
        'Destinato a persone fisiche che avviano una nuova attività. Impresa da costituire dopo ammissione.'
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const text = final.questions.map((q) => normalize(q.label)).join(' | ');
    assert(
      text.includes('persona fisica') || text.includes('nuova attivita'),
      'C: should ask explicitly about persona fisica / nuova attività'
    );
    passed++;
  }

  // D) impresa già costituita
  {
    const detail = mkDetail({
      beneficiaries: ['Imprese'],
      description: 'Bando riservato a imprese già costituite e attive da almeno 24 mesi.'
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const text = final.questions.map((q) => normalize(q.label)).join(' | ');
    assert(
      text.includes('impresa') && (text.includes('attiva') || text.includes('costituit')),
      'D: should ask explicitly for already constituted/active company'
    );
    passed++;
  }

  // E) multi-requirement decomposition
  {
    const detail = mkDetail({
      beneficiaries: ['PMI'],
      description:
        'Destinato a PMI con sede operativa in Calabria, età 18-35 del titolare, impresa costituita da meno di 24 mesi.',
      requisitiHard: {
        territorio: 'Sede operativa in Calabria',
        eta: 'Età tra 18 e 35 anni',
        stadio: 'Impresa costituita da meno di 24 mesi'
      }
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    assert(final.questions.length >= 4, 'E: expected multi requirement decomposition (>=4 questions)');
    assert(
      final.questions.every((q) => !/requisiti chiave/i.test(q.label)),
      'E: must not contain generic "requisiti chiave" wording'
    );
    passed++;
  }

  // F) non-askable technical requirement should not become fake yes/no
  {
    const detail = mkDetail({
      description:
        'Sono escluse le domande non conformi ai sensi dell’art. 107 TFUE e del principio DNSH.',
      requisitiHard: {
        tecnica:
          'Ai sensi dell’art. 107 TFUE, il richiedente deve rispettare il quadro europeo sugli aiuti di Stato.'
      }
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const combined = normalize(final.questions.map((q) => `${q.label} ${q.description ?? ''}`).join(' '));
    assert(!combined.includes('107 tfue'), 'F: technical non-askable requirement should not become direct question');
    assert(!combined.includes('dnsh'), 'F: DNSH technical requirement should not become fake yes/no');
    passed++;
  }

  // G) duplicate prevention
  {
    const detail = mkDetail({
      description:
        'PMI con sede operativa in Calabria. PMI con sede operativa in Calabria.',
      requisitiHard: {
        one: 'PMI con sede operativa in Calabria',
        two: 'PMI con sede operativa in Calabria'
      }
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const normalizedLabels = final.questions.map((q) => normalize(q.label));
    const uniq = new Set(normalizedLabels);
    assert(uniq.size === normalizedLabels.length, 'G: duplicate questions should be removed');
    passed++;
  }

  // H) grounding guarantee
  {
    const detail = mkDetail({
      description: 'PMI in Calabria con età 18-35.'
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    assert(
      final.questions.every((q) => {
        const metadata = (q.metadata ?? {}) as Record<string, unknown>;
        const reqIds = metadata.requirementIds;
        const source = metadata.sourceExcerpt;
        const flags = metadata.validatorFlags as Record<string, unknown> | undefined;
        return (
          Array.isArray(reqIds) &&
          reqIds.length > 0 &&
          typeof source === 'string' &&
          normalize(source).length > 4 &&
          Boolean(flags?.grounded) &&
          Boolean(flags?.territorySafe) &&
          Boolean(flags?.explicitEnough) &&
          Boolean(flags?.nonGeneric) &&
          Boolean(flags?.nonDuplicate) &&
          Boolean(flags?.askable)
        );
      }),
      'H: every question must keep requirementIds and sourceExcerpt'
    );
    passed++;
  }

  // I) adversarial vague input should not surface
  {
    const detail = mkDetail({
      description: 'Bando per PMI.'
    });
    const explainability = mkExplainability({
      missingRequirements: ['Verificare se il soggetto richiedente rientra tra i beneficiari ammessi dal bando']
    });
    const final = finalizeVerificationQuestions(detail, explainability);
    const combined = normalize(final.questions.map((q) => `${q.label} ${q.description ?? ''}`).join(' '));
    assert(
      !/rientra tra i beneficiari ammessi|verificare se il soggetto|requisiti chiave/.test(combined),
      'I: vague beneficiary placeholder must never appear in user questions'
    );
    passed++;
  }

  // J) territorial ambiguity with multiple alternatives (source-backed only)
  {
    const detail = mkDetail({
      description:
        'Il progetto è ammesso se localizzato in Calabria oppure in Sicilia.',
      requisitiHard: {
        territorio: 'Sede operativa in Calabria o Sicilia'
      }
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const territoryJoined = final.questions
      .filter((q) => /territorio|sede operativa|regione|provincia|comune/i.test(q.label))
      .map((q) => `${q.label} ${q.description ?? ''}`)
      .join(' ');
    const regions = extractMentionedRegions(territoryJoined);
    assert(regions.every((r) => r === 'calabria' || r === 'sicilia'), 'J: only source-backed regions allowed');
    passed++;
  }

  // K) incomplete source should fail safely (grounded fallback)
  {
    const detail = mkDetail({
      title: 'Misura incompleta',
      authority: '',
      beneficiaries: [],
      sectors: [],
      description: null,
      requisitiHard: {},
      requisitiSoft: {},
      requisitiStrutturati: {}
    });
    const questions = buildSingleBandoVerificationQuiz(detail, mkExplainability());
    assert(questions.length === 0, 'K: incomplete source should return no questions');
    const assessment = assessSingleBandoQuestionSet(questions);
    assert(!assessment.ok, 'K: empty question set should be flagged for manual review');
    passed++;
  }

  // L) regression protection quiz/autoimpiego untouched
  {
    const sud = getQuizQuestions('sud');
    const cn = getQuizQuestions('centro_nord');
    assert(sud.length >= 10 && cn.length >= 10, 'L: autoimpiego quiz length unchanged');
    assert(Boolean(sud.find((q) => q.id === 'q1')), 'L: sud keeps q1');
    assert(Boolean(cn.find((q) => q.id === 'q1b')), 'L: centro nord keeps q1b');
    const sudQ10 = sud.find((q) => q.id === 'q10');
    const cnQ10 = cn.find((q) => q.id === 'q10');
    assert(
      sudQ10?.options?.[0]?.label !== cnQ10?.options?.[0]?.label,
      'L: q10 options remain differentiated between sud and centro_nord'
    );
    passed++;
  }

  // M) project type should not be generated from generic "supporto investimenti" text
  {
    const detail = mkDetail({
      description:
        'Con la misura la Regione intende supportare gli investimenti per lo sviluppo e il consolidamento aziendale.'
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const hasProjectQuestion = final.questions.some((q) => normalize(q.label).includes('tipo di progetto'));
    assert(!hasProjectQuestion, 'M: generic descriptions must not trigger project type question');
    passed++;
  }

  // N) financial threshold help text should be a clean range
  {
    const detail = mkDetail({
      description:
        'Sono ammissibili investimenti tra 50.000 e 200.000 euro per progetti di innovazione.'
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const financial = final.questions.find((q) => normalize(q.label).includes('investimento'));
    if (financial?.description) {
      assert(
        normalize(financial.description).includes('soglia del bando'),
        'N: financial help text should include "Soglia del bando"'
      );
      assert(
        /50.000|200.000|50000|200000/.test(financial.description),
        'N: financial help text should show numeric range'
      );
    }
    passed++;
  }

  // O) benchmark depth validator should pass for all questions
  {
    const detail = mkDetail({
      description:
        'Destinato a PMI con sede operativa in Calabria, età tra 18 e 35 anni, impresa costituita da meno di 24 mesi.',
      requisitiHard: {
        territorio: 'Sede operativa in Calabria',
        eta: 'Età tra 18 e 35 anni',
        stadio: 'Impresa costituita da meno di 24 mesi'
      }
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    const benchmarkOk = final.questions.every((q) => Boolean((q.metadata as any)?.validatorFlags?.benchmarkDepth));
    assert(benchmarkOk, 'O: benchmark depth validator should pass on all questions');
    passed++;
  }

  // P) safe-but-too-shallow prevention on multi-dimensional beneficiary bandi
  {
    const detail = mkDetail({
      title: 'Nuove imprese e startup giovanili',
      beneficiaries: ['Nuova impresa', 'Impresa giovanile', 'Startup', 'Persona fisica'],
      sectors: ['Turismo', 'Commercio', 'Servizi'],
      description:
        'Bando per nuove imprese e startup. Beneficiari: persone fisiche, impresa giovanile, startup.',
      requisitiHard: {
        beneficiari: 'Nuova impresa, startup e persona fisica',
        settore: 'Settori ammessi: turismo, commercio, servizi'
      }
    });
    const final = finalizeVerificationQuestions(detail, mkExplainability());
    assert(final.questions.length > 2, 'P: multi-dimensional profiles should not collapse to 2-question checklist');
    const hasConditional = final.questions.some((q) => {
      const showIf = (q.metadata as Record<string, unknown> | undefined)?.showIf;
      return Boolean(showIf && typeof showIf === 'object');
    });
    assert(hasConditional, 'P: expected conditional follow-up branch after broad profile gate');
    passed++;
  }

  // Q) global depth regression on real single bandi families
  {
    const realCases = [
      { id: '7747', family: 'chamber_territorial', minQuestions: 4 },
      { id: '7875', family: 'startup_innovativa', minQuestions: 4 },
      { id: '7941', family: 'existing_business', minQuestions: 4 },
      { id: '83', family: 'natural_person_new_business', minQuestions: 3 },
      { id: '81', family: 'startup_family', minQuestions: 3 }
    ] as const;

    for (const item of realCases) {
      const detail = await buildFallbackGrantDetail(item.id);
      const explainability = await buildFallbackGrantExplainability(item.id);
      const finalized = finalizeQuizPlan(detail, explainability);
      const askableRequirements = finalized.plan.requirements.filter((req) => req.askable);
      const decisiveDimensions = new Set(
        askableRequirements
          .filter((req) => req.importance === 'critical' || req.importance === 'high')
          .map((req) => req.category)
      );
      if (decisiveDimensions.size >= 3) {
        assert(
          finalized.plan.questions.length >= item.minQuestions,
          `Q:${item.family} expected depth >= ${item.minQuestions} with ${decisiveDimensions.size} decisive dimensions`
        );
      }
      const hasBranching = finalized.plan.transitions.some((t) => t.to === 'blocked' || t.to === 'success');
      assert(hasBranching, `Q:${item.family} should expose branching terminal transitions`);
      assert(
        finalized.plan.questions.every((q) => !/ammessi:\s*/i.test(q.question)),
        `Q:${item.family} titles must stay clean (no inline ammissibili list)`
      );
      const first = finalized.plan.questions[0];
      if (first) {
        assert(
          /seleziona il tuo profilo\?|quale soggetto presenta la domanda\?|dove si trova|in quale|la .* si trova|qual e la forma giuridica|hai gia|l'attivita/i.test(
            normalize(first.question)
          ),
          `Q:${item.family} first question should be user-facing and clean`
        );
      }
      assert(
        finalized.plan.questions.every((q) => !/requisiti chiave|beneficiari ammessi\?/i.test(q.question)),
        `Q:${item.family} must not regress to vague wording`
      );
    }
    passed++;
  }

  // R) branch consistency regression on real single bandi
  {
    const ids = ['7747', '7875', '7941', '83', '81'] as const;
    for (const id of ids) {
      const detail = await buildFallbackGrantDetail(id);
      const explainability = await buildFallbackGrantExplainability(id);
      const finalized = finalizeQuizPlan(detail, explainability);
      const plan = finalized.plan;

      // deterministic transitions: one target per question+answer
      const byFromAnswer = new Map<string, string>();
      for (const t of plan.transitions) {
        const key = `${t.fromQuestionId}::${normalize(t.answerValue)}`;
        const existing = byFromAnswer.get(key);
        assert(
          !existing || existing === t.to,
          `R:${id} conflicting transition for ${key}: ${existing} vs ${t.to}`
        );
        byFromAnswer.set(key, t.to);
      }

      // startup status question must be branch-safe (guarded or branch-safe phrasing)
      const beneficiary = plan.questions.find((q) => q.category === 'beneficiary');
      const startupQuestion = plan.questions.find((q) => q.id.includes('startup_status'));
      if (startupQuestion && beneficiary) {
        const text = normalize(startupQuestion.question);
        const branchGuarded = Boolean(startupQuestion.showIf?.questionId === beneficiary.id);
        const branchSafeWording = text.includes('gia iscritta') && text.includes('verra costituita');
        assert(branchGuarded || branchSafeWording, `R:${id} startup status question should be branch-safe`);
      }

      // no contradictory stage wording on mixed profile flows
      const hasMixedBeneficiary = (beneficiary?.options?.length ?? 0) > 3;
      const stageQuestion = plan.questions.find((q) => q.category === 'business_stage');
      if (hasMixedBeneficiary && stageQuestion) {
        const stageText = normalize(stageQuestion.question);
        assert(
          !stageText.includes('persona fisica') || Boolean(stageQuestion.showIf),
          `R:${id} mixed profile stage question must be branch-aware if persona-specific`
        );
      }
    }
    passed++;
  }

  // S) step-by-step intelligence: avoid weaker/redundant questions once implied by prior answers
  {
    const ids = ['83', '81'] as const;
    for (const id of ids) {
      const detail = await buildFallbackGrantDetail(id);
      const explainability = await buildFallbackGrantExplainability(id);
      const finalized = finalizeQuizPlan(detail, explainability);
      const plan = finalized.plan;
      const beneficiary = plan.questions.find((q) => q.category === 'beneficiary');
      if (!beneficiary) continue;

      const femaleOption = (beneficiary.options ?? []).find((opt) => normalize(opt.value).includes('femminile'));
      if (femaleOption) {
        const genderQuestion = plan.questions.find((q) => q.id.includes('q_gender'));
        if (genderQuestion?.showIf?.anyOf && genderQuestion.showIf.questionId === beneficiary.id) {
          const anyOf = genderQuestion.showIf.anyOf.map((entry) => normalize(entry));
          assert(!anyOf.includes(normalize(femaleOption.value)), `S:${id} gender should be excluded for femminile branch`);
        }
      }

      const youthOption = (beneficiary.options ?? []).find((opt) => normalize(opt.value).includes('giovanile'));
      if (youthOption) {
        const youthQuestion = plan.questions.find((q) => q.id.includes('q_youth'));
        if (youthQuestion?.showIf?.anyOf && youthQuestion.showIf.questionId === beneficiary.id) {
          const anyOf = youthQuestion.showIf.anyOf.map((entry) => normalize(entry));
          assert(!anyOf.includes(normalize(youthOption.value)), `S:${id} youth should be excluded for giovanile branch`);
        }
      }

      const startupOption = (beneficiary.options ?? []).find((opt) => normalize(opt.value).includes('innovativa'));
      if (startupOption) {
        const startupQuestion = plan.questions.find((q) => q.id.includes('q_startup_status'));
        if (startupQuestion?.showIf?.anyOf && startupQuestion.showIf.questionId === beneficiary.id) {
          const anyOf = startupQuestion.showIf.anyOf.map((entry) => normalize(entry));
          assert(
            !anyOf.includes(normalize(startupOption.value)),
            `S:${id} startup status should be excluded when branch already implies innovativa`
          );
        }
      }
    }
    passed++;
  }

  // T) compiled EligibilitySpec reuse: expensive reasoning once per bando (no force refresh)
  {
    const detail = await buildFallbackGrantDetail('7747');
    const explainability = await buildFallbackGrantExplainability('7747');
    const first = await compileSingleBandoEligibilitySpec(detail, explainability, { enableAi: false });
    const second = await compileSingleBandoEligibilitySpec(detail, explainability, {
      cachedSpec: first,
      enableAi: false
    });

    const fingerprint = computeSingleBandoSourceFingerprint(detail, explainability);
    assert(first.sourceFingerprint === fingerprint, 'T: first compile should store source fingerprint');
    assert(second.sourceFingerprint === fingerprint, 'T: cached compile should keep source fingerprint');
    assert(
      second.revision.revision === first.revision.revision,
      'T: cached compile should reuse revision without increment'
    );
    assert(
      isCompiledEligibilitySpecReusable(second, detail, explainability),
      'T: compiled spec should be reusable when source fingerprint matches'
    );
    assert(isCompiledEligibilitySpecPublishable(second), 'T: reusable compiled spec should be publishable');
    const parsed = parseCompiledEligibilitySpec(JSON.parse(JSON.stringify(second)));
    assert(Boolean(parsed), 'T: persisted compiled spec should be parseable');
    const uiQuestions = executeCompiledEligibilitySpecInUI(second);
    assert(uiQuestions.length >= 1, 'T: compiled spec should execute deterministic UI questions');
    passed++;
  }

  // U) ARTES branch validity: "Università/Ente di ricerca" must not fall into impresa-only legal path
  {
    const detail = await buildFallbackGrantDetail('796');
    const explainability = await buildFallbackGrantExplainability('796');
    const finalized = finalizeQuizPlan(detail, explainability);
    const beneficiary = finalized.plan.questions.find((q) => q.category === 'beneficiary');
    assert(Boolean(beneficiary), 'U: expected beneficiary question for ARTES');
    const universityOption = (beneficiary?.options ?? []).find(
      (opt) =>
        normalize(opt.value).includes('universita') ||
        normalize(opt.label).includes('universita') ||
        normalize(opt.label).includes('ente di ricerca')
    );
    assert(Boolean(universityOption), 'U: expected Università/Ente di ricerca option in ARTES beneficiary question');
    const legalType = finalized.plan.questions.find((q) => q.category === 'legal_subject_type');
    if (legalType?.showIf?.anyOf && legalType.showIf.questionId === beneficiary?.id && universityOption) {
      const anyOf = legalType.showIf.anyOf.map((entry) => normalize(entry));
      assert(
        !anyOf.includes(normalize(universityOption.value)),
        'U: legal type question must not be shown on Università/Ente di ricerca branch'
      );
    }
    if (beneficiary && universityOption) {
      const branchTransition = finalized.plan.transitions.find(
        (t) => t.fromQuestionId === beneficiary.id && t.answerValue === universityOption.value
      );
      assert(Boolean(branchTransition), 'U: expected transition for Università/Ente di ricerca option');
      assert(
        branchTransition?.to !== legalType?.id,
        'U: Università/Ente di ricerca transition must not route to impresa-only legal-type step'
      );
    }
    passed++;
  }

  // V) runtime key stability: no duplicate questionKey collisions on real cases
  {
    const ids = ['7747', '7875', '7941', '83', '81', '796'] as const;
    for (const id of ids) {
      const detail = await buildFallbackGrantDetail(id);
      const explainability = await buildFallbackGrantExplainability(id);
      const final = finalizeVerificationQuestions(detail, explainability);
      const keys = final.questions.map((q) => q.questionKey);
      assert(
        new Set(keys).size === keys.length,
        `V:${id} duplicate questionKey collision detected`
      );
    }
    passed++;
  }

  // W) no premature success on multi-dimensional plans
  {
    const ids = ['7875', '83', '81', '796'] as const;
    for (const id of ids) {
      const detail = await buildFallbackGrantDetail(id);
      const explainability = await buildFallbackGrantExplainability(id);
      const finalized = finalizeQuizPlan(detail, explainability);
      const decisiveDimensions = new Set(
        finalized.plan.requirements
          .filter((req) => req.askable && (req.importance === 'critical' || req.importance === 'high'))
          .map((req) => req.category)
      );
      const shortestDepth = shortestSuccessDepth(finalized.plan);
      if (decisiveDimensions.size >= 3) {
        assert(
          shortestDepth >= 3,
          `W:${id} premature success path detected (depth=${shortestDepth}) with ${decisiveDimensions.size} decisive dimensions`
        );
      }
    }
    passed++;
  }

  // X) hard publication gate: shallow rich plan must be quarantined
  {
    const detail = await buildFallbackGrantDetail('81');
    const explainability = await buildFallbackGrantExplainability('81');
    const finalized = finalizeQuizPlan(detail, explainability);
    const ordered = finalized.plan.questions.slice().sort((a, b) => a.priority - b.priority);
    const q1 = ordered[0];
    const q2 = ordered[1];
    const q3 = ordered[2];
    assert(Boolean(q1 && q2 && q3), 'X: expected at least 3 questions in rich plan');
    const shallowPlan = {
      ...finalized.plan,
      questions: [q1!, q2!, q3!],
      transitions: [
        { fromQuestionId: q1!.id, answerValue: q1!.options?.[0]?.value ?? 'yes', to: q2!.id },
        { fromQuestionId: q1!.id, answerValue: q1!.options?.[1]?.value ?? 'no', to: 'blocked' },
        { fromQuestionId: q2!.id, answerValue: q2!.options?.[0]?.value ?? 'yes', to: q3!.id },
        { fromQuestionId: q2!.id, answerValue: q2!.options?.[1]?.value ?? 'no', to: 'blocked' },
        { fromQuestionId: q3!.id, answerValue: q3!.options?.[0]?.value ?? 'yes', to: 'success' },
        { fromQuestionId: q3!.id, answerValue: q3!.options?.[1]?.value ?? 'no', to: 'blocked' }
      ]
    };
    const gate = evaluatePublicationGate({
      plan: shallowPlan,
      requirements: finalized.plan.requirements,
      familyTags: ['startup_innovativa', 'existing_business']
    });
    assert(gate.status === 'quarantine', 'X: shallow rich plan must be quarantined');
    const gateSignals = [...gate.reasons, ...(gate.warnings ?? [])];
    assert(
      gateSignals.some(
        (reason) =>
          reason.includes('minimum_depth') || reason.includes('resolved_decisive_dimensions')
      ),
      'X: quarantine reason should include depth insufficiency'
    );
    passed++;
  }

  // Y) numeric sanity gate: absurd thresholds must quarantine publication
  {
    const plan = {
      bandoId: 'numeric-test',
      title: 'Numeric sanity test',
      idealApplicantSummary: 'Test',
      requirements: [] as any[],
      questions: [
        {
          id: 'q_financial_test',
          requirementIds: ['financial_test'],
          category: 'financial_threshold',
          priority: 1,
          blocking: true,
          question: "Qual è l'ammontare dell'investimento previsto?",
          answerType: 'number',
          sourceExcerpt: 'Valore minimo estratto da OCR non affidabile',
          validatorFlags: {
            grounded: true,
            territorySafe: true,
            explicitEnough: true,
            nonGeneric: true,
            nonDuplicate: true,
            askable: true,
            benchmarkDepth: true
          }
        }
      ],
      transitions: [{ fromQuestionId: 'q_financial_test', answerValue: 'any', to: 'success' }]
    };
    const requirements = [
      {
        id: 'financial_test',
        category: 'financial_threshold',
        label: 'Soglia investimento',
        importance: 'high',
        blocking: true,
        askable: true,
        sourceExcerpt: 'soglia estratta automaticamente',
        confidence: 0.9,
        normalizedValue: {
          metric: 'investment',
          min: 6,
          max: 20,
          unit: 'eur'
        }
      }
    ] as any[];
    const gate = evaluatePublicationGate({
      plan: { ...plan, requirements } as any,
      requirements: requirements as any,
      familyTags: ['existing_business']
    });
    assert(gate.status === 'quarantine', 'Y: absurd numeric thresholds must quarantine plan');
    assert(
      gate.reasons.some((reason) => reason.includes('numeric_sanity')),
      'Y: numeric sanity reason should be reported'
    );
    passed++;
  }

  // Z) publishability integration: only publishable specs can render runtime questions
  {
    const detail = await buildFallbackGrantDetail('7747');
    const explainability = await buildFallbackGrantExplainability('7747');
    const spec = await compileSingleBandoEligibilitySpec(detail, explainability, { enableAi: false });
    assert(isCompiledEligibilitySpecPublishable(spec), 'Z: expected real territorial case to be publishable');
    const rendered = executeCompiledEligibilitySpecInUI(spec);
    assert(rendered.length > 0, 'Z: publishable spec should render runtime questions');

    const quarantined = { ...spec, compileStatus: 'needs_review' as const };
    const quarantinedRendered = executeCompiledEligibilitySpecInUI(quarantined);
    assert(quarantinedRendered.length === 0, 'Z: non-ready spec must fail-closed (no published quiz)');
    passed++;
  }

  // AA) local unit wording must be explicit, never generic
  {
    const detail = mkDetail({
      description:
        'Il bando richiede sede operativa in Lombardia e sede legale in Lombardia.',
      requisitiHard: {
        territorio: 'Sede operativa e sede legale in Lombardia'
      }
    });
    const finalized = finalizeQuizPlan(detail, mkExplainability());
    const localUnitQuestions = finalized.plan.questions.filter((q) => q.id.includes('local_unit'));
    assert(
      finalized.plan.questions.every(
        (q) => !/quale tipo di sede soddisfa il requisito territoriale del bando/i.test(q.question)
      ),
      'AA: generic local unit wording should never be generated'
    );
    if (localUnitQuestions.length > 0) {
      assert(
        localUnitQuestions.some((q) => /sede operativa|sede legale/i.test(q.question)),
        'AA: local unit wording must explicitly mention the required seat'
      );
    }
    passed++;
  }

  // AB) territory safety must not reject non-territory questions because source excerpt mentions regions
  {
    const detail = mkDetail({
      beneficiaries: ['Cooperativa'],
      description:
        'Agevolazione nazionale per cooperative operanti in più regioni (Lazio, Campania, Calabria).',
      requisitiHard: {
        beneficiari: 'Possono partecipare le cooperative ammesse dal bando.'
      }
    });
    const finalized = finalizeQuizPlan(detail, mkExplainability());
    const hasBeneficiaryQuestion = finalized.plan.questions.some((q) => q.category === 'beneficiary');
    assert(
      hasBeneficiaryQuestion,
      'AB: beneficiary question should survive even when source excerpt contains incidental region names'
    );
    passed++;
  }

  // AC) beneficiary benchmark should accept citizen/public-entity profiles
  {
    const detail = mkDetail({
      beneficiaries: ['Cittadino', 'Ente Pubblico', 'Università/Ente di Ricerca'],
      description:
        'Beneficiari: cittadini, enti pubblici, università ed enti di ricerca.',
      requisitiHard: {
        beneficiari:
          'Soggetti ammessi: Cittadino, Ente Pubblico, Università/Ente di Ricerca.'
      }
    });
    const finalized = finalizeVerificationQuestions(detail, mkExplainability());
    const labels = normalize(finalized.questions.map((q) => q.label).join(' | '));
    assert(
      labels.includes('quale soggetto presenta la domanda') ||
        labels.includes('cittadino') ||
        labels.includes('ente pubblico'),
      'AC: citizen/public-entity beneficiary profiles should generate an explicit beneficiary question'
    );
    passed++;
  }

  // AD) territory extraction must be token-safe: "relazione/realizzazione" must NOT trigger Lazio
  {
    const detail = mkDetail({
      title: 'Bando territoriale Vicenza',
      authority: 'Camera di Commercio di Vicenza',
      description:
        'La relazione tecnica deve descrivere la realizzazione del progetto nella provincia di Vicenza.',
      requisitiHard: {
        territorio: "Interventi ammessi nella provincia di Vicenza; relazione obbligatoria del progetto."
      }
    });
    const finalized = finalizeQuizPlan(detail, mkExplainability());
    const territoryReq = finalized.plan.requirements.find((req) => req.category === 'territory') as
      | { normalizedValue?: { regions?: string[]; provinces?: string[] } }
      | undefined;
    const regions = territoryReq?.normalizedValue?.regions?.map((entry) => normalize(entry)) ?? [];
    const provinces = territoryReq?.normalizedValue?.provinces?.map((entry) => normalize(entry)) ?? [];
    assert(!regions.includes('lazio'), 'AD: lexical noise must not extract Lazio');
    assert(provinces.includes('vicenza'), 'AD: expected Vicenza province to be extracted');
    passed++;
  }

  // AE) real CCIAA Vicenza case must not include Lazio and must keep coherent territory wording/options
  {
    const detail = await buildFallbackGrantDetail('7933');
    const explainability = await buildFallbackGrantExplainability('7933');
    const finalized = finalizeQuizPlan(detail, explainability);
    const territoryQuestions = finalized.plan.questions.filter((q) => q.category === 'territory');
    const territoryText = normalize(
      territoryQuestions
        .map((q) => `${q.question} ${q.helpText ?? ''} ${(q.options ?? []).map((opt) => opt.label).join(' ')}`)
        .join(' ')
    );
    assert(!territoryText.includes('lazio'), 'AE: CCIAA Vicenza flow must never mention Lazio');
    assert(
      territoryText.includes('vicenza') || territoryText.includes('veneto'),
      'AE: CCIAA Vicenza flow must mention coherent territory (Vicenza/Veneto)'
    );
    assert(
      territoryQuestions.every((q) => !/in quale provincia/i.test(normalize(q.question)) || !(q.options ?? []).some((opt) => normalize(opt.label) === 'veneto')),
      'AE: province-level question must not show plain region-only option'
    );
    passed++;
  }

  console.log(`PASS single-bando verification unit tests: ${passed} checks`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
