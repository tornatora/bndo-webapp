import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getStripeClient } from '@/lib/stripe';
import {
  getPracticeConfig,
  practiceTypeFromGrantSlug,
  practiceTypeFromQuizBandoType,
  type PracticeType,
} from '@/lib/bandi';
import {
  getLatestPaidPaymentByQuiz,
  getPracticePaymentBySession,
  resolvePracticeTypeFromAny,
  upsertPracticePaymentFromIntent,
  upsertPracticePaymentFromSession,
} from '@/lib/services/practicePayments';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation,
  safeSessionId,
} from '@/lib/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GetSchema = z.object({
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord', 'generic']).optional(),
  grantSlug: z.string().trim().min(2).optional(),
  bando: z.string().trim().min(2).optional(),
  practice: z.string().trim().min(2).optional(),
  session_id: z.string().trim().min(8).optional(),
  quizSubmissionId: z.string().uuid().optional(),
});

const PostSchema = z.object({
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord']).optional(),
  grantSlug: z.string().trim().min(2).optional(),
  session_id: z.string().trim().min(8).optional().nullable(),
  quizSubmissionId: z.string().uuid().optional().nullable(),
  currentStep: z.number().int().min(1).max(7),
  completedSteps: z.array(z.number().int().min(1).max(7)).default([]),
});

type PracticePaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

type WizardState = {
  ok: true;
  paymentStatus: PracticePaymentStatus;
  onboardingStatus: OnboardingStatus;
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  completedSteps: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
  sessionId: string | null;
  grantSlug: string;
  grantTitle: string;
  amountCents: number;
  currency: string;
  paymentCtaLabel: string;
  customerEmail: string | null;
  didRequired: boolean;
  nextUrl: string | null;
};



function normalizeSteps(steps: number[]) {
  const unique = new Set<number>();
  for (const step of steps) {
    if (step >= 1 && step <= 7) unique.add(step);
  }
  return Array.from(unique).sort((a, b) => a - b) as WizardState['completedSteps'];
}

function parseWizardFromMetadata(metadata: Json) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { currentStep: null as number | null, completedSteps: [] as number[] };
  }
  const root = metadata as Record<string, unknown>;
  const wizard = root.onboarding_wizard;
  if (!wizard || typeof wizard !== 'object' || Array.isArray(wizard)) {
    return { currentStep: null as number | null, completedSteps: [] as number[] };
  }
  const node = wizard as Record<string, unknown>;
  const currentStepRaw = Number(node.current_step);
  const currentStep = Number.isInteger(currentStepRaw) ? currentStepRaw : null;
  const completedRaw = Array.isArray(node.completed_steps) ? node.completed_steps : [];
  const completedSteps = completedRaw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7) as number[];
  return { currentStep, completedSteps };
}

function resolveCurrentStepFromProgress(args: {
  paymentStatus: PracticePaymentStatus;
  metadataCurrentStep: number | null;
  completedSteps: number[];
}) {
  if (args.paymentStatus !== 'paid') return 1 as const;
  const completed = normalizeSteps([1, ...args.completedSteps]);
  const firstMissing = ([1, 2, 3, 4, 5, 6, 7] as const).find((step) => !completed.includes(step)) ?? 7;
  const fallback = firstMissing === 1 ? 2 : firstMissing;
  const candidate = args.metadataCurrentStep ?? fallback;
  const bounded = Math.max(2, Math.min(candidate, fallback));
  return bounded as WizardState['currentStep'];
}

async function resolvePracticeType(args: {
  providedPracticeType?: PracticeType;
  grantSlug?: string;
  bando?: string;
  practice?: string;
  sessionId?: string;
  quizSubmissionId?: string;
}) {
  if (args.providedPracticeType) return args.providedPracticeType;

  const candidates = [args.grantSlug, args.bando, args.practice];
  for (const candidate of candidates) {
    const fromSlug = practiceTypeFromGrantSlug(candidate ?? null);
    if (fromSlug) return fromSlug;
    const fromAny = resolvePracticeTypeFromAny(candidate ?? null);
    if (fromAny) return fromAny;
  }

  if (args.sessionId) {
    const record = await getPracticePaymentBySession(args.sessionId);
    const fromRecord = resolvePracticeTypeFromAny(record?.practice_type ?? null);
    if (fromRecord) return fromRecord;
  }

  if (args.quizSubmissionId) {
    const admin = getSupabaseAdmin();
    const { data: quiz } = await admin
      .from('quiz_submissions')
      .select('bando_type')
      .eq('id', args.quizSubmissionId)
      .maybeSingle();
    const fromQuiz = practiceTypeFromQuizBandoType(quiz?.bando_type ?? null);
    if (fromQuiz) return fromQuiz;
  }

  return null;
}

async function syncRecordFromStripeIfNeeded(args: {
  sessionId: string;
  fallbackPracticeType: PracticeType | null;
  quizSubmissionId: string | null;
}) {
  let record = await getPracticePaymentBySession(args.sessionId);
  if (record?.status === 'paid') return record;
  try {
    const stripe = getStripeClient();
    if (args.sessionId.startsWith('pi_')) {
      const intent = await stripe.paymentIntents.retrieve(args.sessionId);
      record = await upsertPracticePaymentFromIntent({
        intent,
        fallbackPracticeType: args.fallbackPracticeType,
        fallbackQuizSubmissionId: args.quizSubmissionId,
      });
    } else {
      const session = await stripe.checkout.sessions.retrieve(args.sessionId);
      record = await upsertPracticePaymentFromSession({
        session,
        fallbackPracticeType: args.fallbackPracticeType,
        fallbackQuizSubmissionId: args.quizSubmissionId,
      });
    }
  } catch {
    // Continue with latest db snapshot.
  }
  return record;
}

function buildBaseState(practiceType: PracticeType): WizardState {
  const config = getPracticeConfig(practiceType);
  return {
    ok: true,
    paymentStatus: 'unpaid',
    onboardingStatus: 'not_started',
    currentStep: 1,
    completedSteps: [],
    sessionId: null,
    grantSlug: config.slug,
    grantTitle: config.title,
    amountCents: config.startFeeCents,
    currency: config.currency,
    paymentCtaLabel: config.paymentCtaLabel,
    customerEmail: null,
    didRequired: config.didRequired,
    nextUrl: null,
  };
}


export async function GET(request: Request) {
  try {
    const rateLimit = enforceRateLimit({
      namespace: 'onboarding-wizard-state-get',
      key: getClientIp(request),
      limit: 80,
      windowMs: 60_000,
    });
    if (rateLimit) return rateLimit;

    const url = new URL(request.url);
    const parsed = GetSchema.safeParse({
      practiceType: url.searchParams.get('practiceType') ?? undefined,
      grantSlug: url.searchParams.get('grantSlug') ?? undefined,
      bando: url.searchParams.get('bando') ?? undefined,
      practice: url.searchParams.get('practice') ?? undefined,
      session_id: url.searchParams.get('session_id') ?? undefined,
      quizSubmissionId: url.searchParams.get('quizSubmissionId') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
    }

    const safeSession = safeSessionId(parsed.data.session_id ?? null) ?? undefined;
    const practiceType = await resolvePracticeType({
      providedPracticeType: parsed.data.practiceType,
      grantSlug: parsed.data.grantSlug,
      bando: parsed.data.bando,
      practice: parsed.data.practice,
      sessionId: safeSession,
      quizSubmissionId: parsed.data.quizSubmissionId,
    });

    if (!practiceType) {
      return NextResponse.json({ error: 'Pratica non riconosciuta.' }, { status: 422 });
    }

    const base = buildBaseState(practiceType);
    let record = null as Awaited<ReturnType<typeof getPracticePaymentBySession>>;

    if (safeSession) {
      record = await syncRecordFromStripeIfNeeded({
        sessionId: safeSession,
        fallbackPracticeType: practiceType,
        quizSubmissionId: parsed.data.quizSubmissionId ?? null,
      });
    } else if (parsed.data.quizSubmissionId) {
      record = await getLatestPaidPaymentByQuiz({
        quizSubmissionId: parsed.data.quizSubmissionId,
        practiceType,
      });
    }

    if (!record) {
      return NextResponse.json(base);
    }

    const config = getPracticeConfig(practiceType);
    const { currentStep: metadataCurrentStep, completedSteps: metadataCompletedSteps } = parseWizardFromMetadata(record.metadata);
    const paymentStatus = (record.status as PracticePaymentStatus) ?? 'pending';
    const completedSteps =
      paymentStatus === 'paid'
        ? normalizeSteps([1, ...metadataCompletedSteps])
        : normalizeSteps(metadataCompletedSteps);
    const currentStep = resolveCurrentStepFromProgress({
      paymentStatus,
      metadataCurrentStep,
      completedSteps,
    });

    const nextUrl =
      record.onboarding_status === 'completed' && record.application_id
        ? `/dashboard/practices/${record.application_id}`
        : null;

    return NextResponse.json({
      ok: true,
      paymentStatus,
      onboardingStatus: record.onboarding_status,
      currentStep,
      completedSteps,
      sessionId: record.stripe_checkout_session_id ?? safeSession ?? null,
      grantSlug: config.slug,
      grantTitle: config.title,
      amountCents: config.startFeeCents,
      currency: config.currency,
      paymentCtaLabel: config.paymentCtaLabel,
      customerEmail: record.customer_email ?? null,
      didRequired: config.didRequired,
      nextUrl,
    } satisfies WizardState);

  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore caricamento stato onboarding.') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'onboarding-wizard-state-post',
      key: getClientIp(request),
      limit: 40,
      windowMs: 60_000,
    });
    if (rateLimit) return rateLimit;

    const body = PostSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });
    }

    const safeSession = safeSessionId(body.data.session_id ?? null) ?? undefined;
    const practiceType = await resolvePracticeType({
      providedPracticeType: body.data.practiceType,
      grantSlug: body.data.grantSlug,
      sessionId: safeSession,
      quizSubmissionId: body.data.quizSubmissionId ?? undefined,
    });
    if (!practiceType) {
      return NextResponse.json({ error: 'Pratica non riconosciuta.' }, { status: 422 });
    }

    let record = null as Awaited<ReturnType<typeof getPracticePaymentBySession>>;
    if (safeSession) {
      record = await getPracticePaymentBySession(safeSession);
    } else if (body.data.quizSubmissionId) {
      record = await getLatestPaidPaymentByQuiz({
        quizSubmissionId: body.data.quizSubmissionId,
        practiceType,
      });
    }

    if (!record || record.status !== 'paid') {
      return NextResponse.json({ error: 'Pagamento non verificato: progresso non persistibile.' }, { status: 409 });
    }

    const completed = normalizeSteps([1, ...body.data.completedSteps]);
    const firstMissing = ([1, 2, 3, 4, 5, 6, 7] as const).find((step) => !completed.includes(step)) ?? 7;
    const maxAllowedCurrent = firstMissing === 1 ? 2 : firstMissing;
    const currentStep = Math.max(2, Math.min(body.data.currentStep, maxAllowedCurrent)) as WizardState['currentStep'];

    const baseMetadata =
      record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, unknown>)
        : {};
    const nowIso = new Date().toISOString();
    const nextMetadata: Json = {
      ...baseMetadata,
      onboarding_wizard: {
        current_step: currentStep,
        completed_steps: completed,
        updated_at: nowIso,
      },
    };

    const admin = getSupabaseAdmin();
    const { data: updated, error } = await admin
      .from('practice_payments')
      .update({
        metadata: nextMetadata,
        onboarding_status: record.onboarding_status === 'completed' ? 'completed' : 'in_progress',
        updated_at: nowIso,
      })
      .eq('id', record.id)
      .select('*')
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? 'Impossibile salvare lo stato onboarding.' }, { status: 500 });
    }

    const config = getPracticeConfig(practiceType);
    return NextResponse.json({
      ok: true,
      paymentStatus: updated.status,
      onboardingStatus: updated.onboarding_status,
      currentStep,
      completedSteps: completed,
      sessionId: updated.stripe_checkout_session_id,
      grantSlug: config.slug,
      grantTitle: config.title,
      amountCents: config.startFeeCents,
      currency: config.currency,
      paymentCtaLabel: config.paymentCtaLabel,
      customerEmail: updated.customer_email ?? null,
      didRequired: config.didRequired,
      nextUrl: null,
    } satisfies WizardState);

  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore salvataggio progresso onboarding.') }, { status: 500 });
  }
}
