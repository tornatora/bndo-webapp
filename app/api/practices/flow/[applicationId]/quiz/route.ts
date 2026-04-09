import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  completePracticeQuiz,
  evaluatePracticeQuiz,
  ensurePracticeFlow,
  loadApplicationRequirementStatus,
  loadPracticeFlowForApplication,
  type PracticeFlowState,
  type PracticeQuizQuestion,
  type PracticeSourceChannel
} from '@/lib/practices/orchestrator';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { dispatchPracticeQuizNotifications } from '@/lib/services/quizNotifications';

export const runtime = 'nodejs';

const ParamsSchema = z.object({
  applicationId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/)
});

const QuestionSnapshotSchema = z.object({
  questionKey: z.string().min(1),
  label: z.string().min(1),
  isRequired: z.boolean(),
  questionType: z.enum(['single_select', 'boolean', 'text', 'number']).optional(),
  options: z
    .array(
      z.object({
        value: z.string().min(1),
        label: z.string().min(1)
      })
    )
    .optional(),
  validation: z.record(z.unknown()).optional(),
  rule: z
    .object({
      kind: z.enum(['critical_boolean', 'investment_range', 'ateco_validation', 'geographic_validation', 'choice_in_set', 'informational', 'none']).optional(),
      expected: z.string().nullable().optional()
    })
    .optional(),
  metadata: z.record(z.unknown()).optional()
});

const PayloadSchema = z.object({
  answers: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  questionKeys: z.array(z.string().min(1)).optional(),
  questionSnapshot: z.array(QuestionSnapshotSchema).max(80).optional()
});

function isPublicFlowApplicationId(value: string) {
  return value.startsWith('public-');
}

function isMissingRequiredAnswer(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function normalizeToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeChoiceValue(
  value: unknown,
  options: Array<{ value: string; label: string }>
) {
  const token = normalizeToken(value);
  if (!token) return '';
  for (const option of options) {
    const optionValue = normalizeToken(option.value);
    const optionLabel = normalizeToken(option.label);
    if (token === optionValue || token === optionLabel) {
      return optionValue || optionLabel || token;
    }
  }
  return token;
}

function formatAnswerForNotification(question: PracticeQuizQuestion | undefined, value: unknown) {
  if (value === null || value === undefined || value === '') return 'N/D';
  if (!question) return String(value);

  if (question.questionType === 'boolean') {
    const boolValue = normalizeChoiceValue(value, question.options ?? []);
    if (['yes', 'si', 'true', '1'].includes(boolValue)) return 'Sì';
    if (['no', 'false', '0'].includes(boolValue)) return 'No';
  }

  if (Array.isArray(question.options) && question.options.length > 0) {
    const normalized = normalizeChoiceValue(value, question.options);
    const match = question.options.find(
      (option) => normalizeToken(option.value) === normalized || normalizeToken(option.label) === normalized
    );
    if (match?.label) return match.label;
  }

  return String(value);
}

function isQuestionVisible(
  question: PracticeQuizQuestion,
  answers: Record<string, string | number | boolean | null>,
  questionMap: Map<string, PracticeQuizQuestion>
) {
  const metadata =
    question.metadata && typeof question.metadata === 'object'
      ? (question.metadata as Record<string, unknown>)
      : null;
  const rawShowIf = metadata?.showIf;
  if (!rawShowIf || typeof rawShowIf !== 'object') return true;

  const showIf = rawShowIf as Record<string, unknown>;
  const questionKey = typeof showIf.questionKey === 'string' ? showIf.questionKey.trim() : '';
  if (!questionKey) return true;

  const parent = questionMap.get(questionKey);
  if (!parent) return true;

  const rawAnswer = answers[questionKey];
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return false;
  const normalized = normalizeChoiceValue(rawAnswer, parent.options ?? []);
  const equals = typeof showIf.equals === 'string' ? normalizeToken(showIf.equals) : '';
  const anyOf = Array.isArray(showIf.anyOf) ? showIf.anyOf.map((item) => normalizeToken(item)).filter(Boolean) : [];
  const noneOf = Array.isArray(showIf.noneOf) ? showIf.noneOf.map((item) => normalizeToken(item)).filter(Boolean) : [];

  if (equals && normalized !== equals) return false;
  if (anyOf.length > 0 && !anyOf.includes(normalized)) return false;
  if (noneOf.length > 0 && noneOf.includes(normalized)) return false;
  return true;
}

function buildQuestionsFromSnapshot(
  snapshot: Array<z.infer<typeof QuestionSnapshotSchema>>
): PracticeQuizQuestion[] {
  return snapshot.map((item) => {
    const questionType = item.questionType ?? 'single_select';
    return {
      questionKey: item.questionKey,
      label: item.label,
      description: null,
      reasoning: null,
      questionType,
      options:
        Array.isArray(item.options) && item.options.length > 0
          ? item.options
          : questionType === 'boolean'
          ? [
              { value: 'yes', label: 'Sì' },
              { value: 'no', label: 'No' }
            ]
          : [],
      isRequired: item.isRequired,
      validation: (item.validation as Record<string, unknown>) ?? {},
      rule: {
        kind: item.rule?.kind ?? 'none',
        expected: item.rule?.expected ?? null
      },
      metadata: {
        source: 'client_snapshot',
        ...((item.metadata as Record<string, unknown> | undefined) ?? {})
      }
    };
  });
}

function buildFallbackFlow(args: {
  applicationId: string;
  tenderId: string;
  grantTitle: string;
  sourceChannel: PracticeSourceChannel;
}): PracticeFlowState {
  return {
    applicationId: args.applicationId,
    tenderId: args.tenderId,
    grantExternalId: args.tenderId,
    grantSlug: 'fallback-pratica',
    grantTitle: args.grantTitle,
    sourceChannel: args.sourceChannel,
    templateId: `fallback-${args.applicationId}`,
    metadata: { fallback: true },
    questions: [
      {
        questionKey: 'requisiti_base',
        label: 'Il progetto sarà realizzato nel territorio indicato dal bando?',
        description: 'Questa è una verifica preliminare bloccante.',
        reasoning: 'La localizzazione del progetto è uno dei criteri principali di ammissibilità.',
        questionType: 'boolean',
        options: [
          { value: 'yes', label: 'Sì' },
          { value: 'no', label: 'No' }
        ],
        isRequired: true,
        validation: {},
        rule: { kind: 'critical_boolean', expected: 'yes' },
        metadata: {}
      },
      {
        questionKey: 'investimento_previsto',
        label: 'Qual è l’investimento previsto (EUR)?',
        description: 'Inserisci una stima dell’investimento totale.',
        reasoning: 'Serve per verificare la coerenza dell’importo rispetto ai limiti del bando.',
        questionType: 'number',
        options: [],
        isRequired: true,
        validation: { min: 1000, max: 200000 },
        rule: { kind: 'investment_range' },
        metadata: {}
      },
      {
        questionKey: 'note_progetto',
        label: 'Aggiungi una nota utile per il consulente',
        description: 'Facoltativa ma consigliata.',
        reasoning: 'Le note aiutano a velocizzare la verifica umana.',
        questionType: 'text',
        options: [],
        isRequired: false,
        validation: { maxLength: 800 },
        rule: { kind: 'informational' },
        metadata: {}
      }
    ],
    requirements: [
      {
        requirementKey: 'documento_identita',
        label: 'Documento di identità',
        description: 'Documento fronte/retro in corso di validità.',
        isRequired: true,
        sourceChannel: args.sourceChannel,
        metadata: { category: 'identity' }
      },
      {
        requirementKey: 'codice_fiscale',
        label: 'Codice fiscale',
        description: 'Tessera sanitaria o documento equivalente.',
        isRequired: true,
        sourceChannel: args.sourceChannel,
        metadata: { category: 'identity' }
      },
      {
        requirementKey: 'preventivi_spesa',
        label: 'Preventivi di spesa',
        description: 'Uno o più preventivi o quotazioni coerenti con l’investimento.',
        isRequired: true,
        sourceChannel: args.sourceChannel,
        metadata: { category: 'economic' }
      }
    ]
  };
}

export async function POST(request: Request, context: { params: { applicationId: string } }) {
  try {
    const params = ParamsSchema.parse(context.params);
    const payload = PayloadSchema.parse(await request.json());
    const isPublicFlow = isPublicFlowApplicationId(params.applicationId);

    if (isPublicFlow) {
      const snapshotQuestions = buildQuestionsFromSnapshot(payload.questionSnapshot ?? []);
      const submittedQuestionKeys = new Set(
        (
          payload.questionKeys?.length
            ? payload.questionKeys
            : snapshotQuestions.length > 0
              ? snapshotQuestions.map((question) => question.questionKey)
              : Object.keys(payload.answers)
        )
          .map((key) => String(key ?? '').trim())
          .filter(Boolean)
      );

      let scopedQuestions =
        submittedQuestionKeys.size > 0
          ? snapshotQuestions.filter((question) => submittedQuestionKeys.has(question.questionKey))
          : snapshotQuestions;

      if (scopedQuestions.length === 0 && snapshotQuestions.length > 0) {
        scopedQuestions = snapshotQuestions;
      }

      if (scopedQuestions.length === 0) {
        return NextResponse.json(
          { error: 'Impossibile verificare: quiz non disponibile. Riapri la verifica requisiti e riprova.' },
          { status: 422 }
        );
      }

      const scopedQuestionMap = new Map(scopedQuestions.map((question) => [question.questionKey, question]));
      const visibleScopedQuestions = scopedQuestions.filter((question) =>
        isQuestionVisible(question, payload.answers, scopedQuestionMap)
      );

      const missingRequiredQuestions = visibleScopedQuestions
        .filter((question) => question.isRequired)
        .filter((question) => isMissingRequiredAnswer(payload.answers[question.questionKey]))
        .map((question) => question.label);

      if (missingRequiredQuestions.length > 0) {
        return NextResponse.json(
          {
            error: 'Completa tutte le domande obbligatorie prima della verifica requisiti.',
            missingQuestions: missingRequiredQuestions
          },
          { status: 422 }
        );
      }

      const publicTemplate: PracticeFlowState = {
        applicationId: params.applicationId,
        tenderId: `public-${params.applicationId}`,
        grantExternalId: params.applicationId,
        grantSlug: params.applicationId.replace(/^public-/, ''),
        grantTitle: 'Bando selezionato',
        sourceChannel: 'direct',
        templateId: `public-template-${params.applicationId}`,
        metadata: { publicFlow: true },
        questions: scopedQuestions,
        requirements: []
      };
      const evaluation = evaluatePracticeQuiz(publicTemplate, payload.answers);

      return NextResponse.json({
        ok: true,
        eligibility: evaluation.eligibility,
        submissionId: `public-${Date.now()}`,
        completedAt: new Date().toISOString(),
        reviewReasons: evaluation.notes,
        requirementStatus: null,
        nextPath: null
      });
    }

    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Sessione non valida.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, company_id, full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'client_admin' || !profile.company_id) {
      return NextResponse.json({ error: 'Operazione non consentita.' }, { status: 403 });
    }

    const { data: application } = await supabase
      .from('tender_applications')
      .select('id, tender_id')
      .eq('id', params.applicationId)
      .eq('company_id', profile.company_id)
      .maybeSingle();

    if (!application) {
      return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
    }

    const admin = getSupabaseAdmin();
    let flow = await loadPracticeFlowForApplication(admin, params.applicationId);
    if (!flow) {
      try {
        const rebuiltFlow = await ensurePracticeFlow(admin, {
          companyId: profile.company_id,
          userId: profile.id,
          grantId: application.tender_id ?? params.applicationId,
          sourceChannel: 'direct'
        });

        flow =
          rebuiltFlow.applicationId === params.applicationId
            ? rebuiltFlow
            : {
                ...rebuiltFlow,
                applicationId: params.applicationId,
                tenderId: application.tender_id ?? rebuiltFlow.tenderId
              };
      } catch (rebuildError) {
        console.error('[PRACTICE_FLOW_REBUILD_ERROR]', rebuildError);
      }
    }

    if (!flow) {
      const { data: tender } = await supabase
        .from('tenders')
        .select('title')
        .eq('id', application.tender_id)
        .maybeSingle();
      flow = buildFallbackFlow({
        applicationId: params.applicationId,
        tenderId: application.tender_id ?? params.applicationId,
        grantTitle: tender?.title ?? 'Pratica BNDO',
        sourceChannel: 'direct'
      });
    }

    const snapshotQuestions = buildQuestionsFromSnapshot(payload.questionSnapshot ?? []);

    const submittedQuestionKeys = new Set(
      (
        payload.questionKeys?.length
          ? payload.questionKeys
          : snapshotQuestions.length > 0
            ? snapshotQuestions.map((question) => question.questionKey)
            : Object.keys(payload.answers)
      )
        .map((key) => String(key ?? '').trim())
        .filter(Boolean)
    );

    let scopedQuestions =
      submittedQuestionKeys.size > 0
        ? flow.questions.filter((question) => submittedQuestionKeys.has(question.questionKey))
        : flow.questions;

    const needsSnapshotFallback =
      submittedQuestionKeys.size > 0 && (scopedQuestions.length === 0 || scopedQuestions.length < submittedQuestionKeys.size);

    if (needsSnapshotFallback && snapshotQuestions.length > 0) {
      const snapshotByKey = new Map(snapshotQuestions.map((question) => [question.questionKey, question]));
      const snapshotScoped = [...submittedQuestionKeys]
        .map((key) => snapshotByKey.get(key))
        .filter((question): question is PracticeQuizQuestion => Boolean(question));

      if (snapshotScoped.length > 0) {
        scopedQuestions = snapshotScoped;
      }
    }

    if (scopedQuestions.length === 0 && snapshotQuestions.length > 0) {
      scopedQuestions = snapshotQuestions;
    }

    if (scopedQuestions.length === 0) {
      scopedQuestions = flow.questions;
    }

    const scopedQuestionMap = new Map(scopedQuestions.map((question) => [question.questionKey, question]));
    const visibleScopedQuestions = scopedQuestions.filter((question) =>
      isQuestionVisible(question, payload.answers, scopedQuestionMap)
    );

    const questionsForValidation = visibleScopedQuestions.length > 0 ? visibleScopedQuestions : scopedQuestions;

    const missingRequiredQuestions = questionsForValidation
      .filter((question) => question.isRequired)
      .filter((question) => isMissingRequiredAnswer(payload.answers[question.questionKey]))
      .map((question) => question.label);

    if (missingRequiredQuestions.length > 0) {
      return NextResponse.json(
        {
          error: 'Completa tutte le domande obbligatorie prima della verifica requisiti.',
          missingQuestions: missingRequiredQuestions
        },
        { status: 422 }
      );
    }

    const result = await completePracticeQuiz(admin, {
      applicationId: params.applicationId,
      userId: profile.id,
      companyId: profile.company_id,
      sourceChannel: flow.sourceChannel,
      template: {
        ...flow,
        questions: questionsForValidation
      },
      answers: payload.answers
    });

    const [{ data: tender }, requirementStatus] = await Promise.all([
      admin
        .from('tenders')
        .select('title')
        .eq('id', application.tender_id)
        .maybeSingle(),
      loadApplicationRequirementStatus(admin, params.applicationId)
    ]);

    const questionLookup = new Map(
      [...flow.questions, ...snapshotQuestions, ...questionsForValidation].map((question) => [question.questionKey, question])
    );
    const answersForNotification = Object.fromEntries(
      Object.entries(payload.answers).map(([questionKey, rawValue]) => {
        const question = questionLookup.get(questionKey);
        const questionLabel = question?.label ?? questionKey;
        return [questionLabel, formatAnswerForNotification(question, rawValue)];
      })
    );

    try {
      await dispatchPracticeQuizNotifications({
        submissionId: result.submissionId,
        applicationId: params.applicationId,
        fullName: profile.full_name,
        email: profile.email.toLowerCase(),
        practiceTitle: tender?.title ?? flow.grantTitle,
        grantTitle: flow.grantTitle,
        sourceChannel: flow.sourceChannel,
        eligibility: result.eligibility,
        createdAtIso: result.completedAt,
        answers: answersForNotification
      });
    } catch (notificationError) {
      console.error('[PRACTICE_QUIZ_NOTIFY_ERROR]', notificationError);
    }

    void emitNotificationEvent({
      eventType: 'quiz_completed',
      actorProfileId: profile.id,
      actorRole: 'client_admin',
      companyId: profile.company_id,
      applicationId: params.applicationId,
      customerName: profile.full_name,
      practiceTitle: tender?.title ?? flow.grantTitle,
      metadata: {
        submissionId: result.submissionId,
        eligibility: result.eligibility,
        sourceChannel: flow.sourceChannel
      }
    }).catch(() => undefined);

    if (result.eligibility !== 'not_eligible') {
      void emitNotificationEvent({
        eventType: 'quiz_passed',
        actorProfileId: profile.id,
        actorRole: 'client_admin',
        companyId: profile.company_id,
        applicationId: params.applicationId,
        customerName: profile.full_name,
        practiceTitle: tender?.title ?? flow.grantTitle,
        metadata: {
          submissionId: result.submissionId,
          eligibility: result.eligibility,
          sourceChannel: flow.sourceChannel
        }
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      eligibility: result.eligibility,
      submissionId: result.submissionId,
      completedAt: result.completedAt,
      reviewReasons: result.reviewNotes ?? [],
      requirementStatus,
      nextPath:
        result.eligibility !== 'not_eligible'
          ? `/dashboard/practices/${params.applicationId}?docs=missing`
          : null
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossibile completare il quiz pratica.' },
      { status: 500 }
    );
  }
}
