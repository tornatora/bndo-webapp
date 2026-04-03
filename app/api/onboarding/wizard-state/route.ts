import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getStripeClient } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import {
  getPracticeConfig,
  practiceTypeFromGrantSlug,
  practiceTypeFromQuizBandoType,
  type PracticeType,
} from '@/lib/bandi';
import {
  derivePracticeRequirementsFromGrant,
  type PracticeSourceChannel
} from '@/lib/practices/orchestrator';
import { fetchGrantDetail, fetchGrantExplainability } from '@/lib/grants/details';
import {
  DashboardApplicationResolverError,
  resolveCanonicalDashboardApplication
} from '@/lib/onboarding/dashboardApplicationResolver';
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

const ApplicationIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const GetSchema = z.object({
  onboardingMode: z.enum(['legacy', 'dashboard_client']).optional(),
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord', 'generic']).optional(),
  grantId: z.string().trim().min(2).optional(),
  grantSlug: z.string().trim().min(2).optional(),
  sourceChannel: z.enum(['scanner', 'chat', 'direct', 'admin']).optional(),
  bando: z.string().trim().min(2).optional(),
  practice: z.string().trim().min(2).optional(),
  session_id: z.string().trim().min(8).optional(),
  quizSubmissionId: z.string().uuid().optional(),
  applicationId: ApplicationIdSchema.optional(),
});

const PostSchema = z.object({
  onboardingMode: z.enum(['legacy', 'dashboard_client']).optional().nullable(),
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord', 'generic']).optional(),
  grantId: z.string().trim().min(2).optional(),
  grantSlug: z.string().trim().min(2).optional(),
  sourceChannel: z.enum(['scanner', 'chat', 'direct', 'admin']).optional(),
  session_id: z.string().trim().min(8).optional().nullable(),
  quizSubmissionId: z.string().uuid().optional().nullable(),
  applicationId: ApplicationIdSchema.optional().nullable(),
  currentStep: z.number().int().min(1).max(7),
  completedSteps: z.array(z.number().int().min(1).max(7)).default([]),
});

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PracticePaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

type WizardState = {
  ok: true;
  paymentStatus: PracticePaymentStatus;
  onboardingStatus: OnboardingStatus;
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  completedSteps: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
  sessionId: string | null;
  applicationId: string | null;
  grantSlug: string;
  grantTitle: string;
  documentRequirements: Array<{
    requirementKey: string;
    label: string;
    description: string | null;
    isRequired: boolean;
    status: 'missing' | 'uploaded' | 'waived';
  }>;
  amountCents: number;
  currency: string;
  paymentCtaLabel: string;
  customerEmail: string | null;
  didRequired: boolean;
  nextUrl: string | null;
  authenticated?: boolean;
};

function isMissingPracticeRequirementsTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
  const code = (candidate.code ?? '').toUpperCase();
  if (code === '42P01' || code === 'PGRST205') return true;

  const blob = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
  return (
    blob.includes('practice_document_requirements') &&
    (blob.includes('schema cache') || blob.includes('could not find the table') || blob.includes('does not exist'))
  );
}

function normalizeRequirementToken(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isDashboardExcludedRequirement(requirementKey: string, label: string) {
  const key = normalizeRequirementToken(requirementKey);
  const normalizedLabel = normalizeRequirementToken(label);
  return (
    key.includes('descrizione_progetto') ||
    normalizedLabel.includes('descrizione_sintetica_del_progetto')
  );
}

function sanitizeDashboardRequirements(requirements: WizardState['documentRequirements']) {
  return requirements.filter(
    (requirement) => !isDashboardExcludedRequirement(requirement.requirementKey, requirement.label)
  );
}



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
  applicationId: string | null;
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
        fallbackApplicationId: args.applicationId,
      });
    } else {
      const session = await stripe.checkout.sessions.retrieve(args.sessionId);
      record = await upsertPracticePaymentFromSession({
        session,
        fallbackPracticeType: args.fallbackPracticeType,
        fallbackQuizSubmissionId: args.quizSubmissionId,
        fallbackApplicationId: args.applicationId,
      });
    }
  } catch {
    // Continue with latest db snapshot.
  }
  return record;
}

async function loadDocumentRequirements(applicationId: string | null) {
  if (!applicationId) return [] as WizardState['documentRequirements'];
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('practice_document_requirements')
    .select('requirement_key, label, description, is_required, status')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingPracticeRequirementsTableError(error)) {
      return [] as WizardState['documentRequirements'];
    }
    throw new Error(`Errore caricamento requisiti pratica: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    requirementKey: row.requirement_key,
    label: row.label,
    description: row.description,
    isRequired: row.is_required,
    status: row.status
  }));
}

function toRequirementPayload(
  requirements: ReturnType<typeof derivePracticeRequirementsFromGrant>
): WizardState['documentRequirements'] {
  return requirements.map((requirement) => ({
    requirementKey: requirement.requirementKey,
    label: requirement.label,
    description: requirement.description,
    isRequired: requirement.isRequired,
    status: 'missing' as const
  }));
}

async function loadDocumentRequirementsFromGrant(
  grantIdentifier: string | null,
  sourceChannel: PracticeSourceChannel
) {
  if (!grantIdentifier) return [] as WizardState['documentRequirements'];
  try {
    const [detail, explainability] = await Promise.all([
      fetchGrantDetail(grantIdentifier),
      fetchGrantExplainability(grantIdentifier)
    ]);
    return toRequirementPayload(derivePracticeRequirementsFromGrant(detail, explainability, sourceChannel));
  } catch {
    return [] as WizardState['documentRequirements'];
  }
}

async function ensureApplicationRequirementsIfMissing(applicationId: string, sourceChannel: PracticeSourceChannel) {
  const admin = getSupabaseAdmin();
  const current = await loadDocumentRequirements(applicationId);
  if (current.length > 0) return current;

  const { data: application } = await admin
    .from('tender_applications')
    .select('id, tender_id, company_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (!application?.id) return current;

  const { data: tender } = await admin
    .from('tenders')
    .select('id, title, grant_slug, external_grant_id')
    .eq('id', application.tender_id)
    .maybeSingle();

  const grantIdentifier =
    tender?.external_grant_id ??
    tender?.grant_slug ??
    tender?.id ??
    application.tender_id;
  const derived = await loadDocumentRequirementsFromGrant(grantIdentifier ?? null, sourceChannel);
  if (derived.length === 0) return current;

  const rows = derived.map((requirement) => ({
    application_id: application.id,
    tender_id: application.tender_id,
    requirement_key: requirement.requirementKey,
    label: requirement.label,
    description: requirement.description,
    is_required: requirement.isRequired,
    status: 'missing' as const,
    source_channel: sourceChannel
  }));

  const { error: upsertError } = await admin
    .from('practice_document_requirements')
    .upsert(rows, { onConflict: 'application_id,requirement_key' });
  if (upsertError && !isMissingPracticeRequirementsTableError(upsertError)) {
    throw new Error(`Errore sincronizzazione requisiti pratica: ${upsertError.message}`);
  }

  if (upsertError) return current;
  return loadDocumentRequirements(applicationId);
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
    applicationId: null,
    grantSlug: config.slug,
    grantTitle: config.title,
    documentRequirements: [],
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
      onboardingMode: url.searchParams.get('onboardingMode') ?? undefined,
      practiceType: url.searchParams.get('practiceType') ?? undefined,
      grantId: url.searchParams.get('grantId') ?? undefined,
      grantSlug: url.searchParams.get('grantSlug') ?? undefined,
      sourceChannel: url.searchParams.get('sourceChannel') ?? undefined,
      bando: url.searchParams.get('bando') ?? undefined,
      practice: url.searchParams.get('practice') ?? undefined,
      session_id: url.searchParams.get('session_id') ?? undefined,
      quizSubmissionId: url.searchParams.get('quizSubmissionId') ?? undefined,
      applicationId: url.searchParams.get('applicationId') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
    }

    const isDashboardMode = parsed.data.onboardingMode === 'dashboard_client';
    const safeSession = safeSessionId(parsed.data.session_id ?? null) ?? undefined;
    const requestedApplicationId = parsed.data.applicationId ?? null;
    const sourceChannel: PracticeSourceChannel = parsed.data.sourceChannel ?? 'direct';
    const grantIdentifier = parsed.data.grantId ?? parsed.data.grantSlug ?? null;
    const practiceType = await resolvePracticeType({
      providedPracticeType: parsed.data.practiceType,
      grantSlug: parsed.data.grantSlug ?? parsed.data.grantId,
      bando: parsed.data.bando,
      practice: parsed.data.practice,
      sessionId: safeSession,
      quizSubmissionId: parsed.data.quizSubmissionId,
    });

    if (!practiceType) {
      return NextResponse.json({ error: 'Pratica non riconosciuta.' }, { status: 422 });
    }

    const base = buildBaseState(practiceType);
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    const { data: profile } = user
      ? await supabase
          .from('profiles')
          .select('id, role, company_id')
          .eq('id', user.id)
          .maybeSingle()
      : { data: null };

    const canResolveOwnedApplication = Boolean(profile?.id && profile.role === 'client_admin' && profile.company_id);
    const requestedApplicationUuid = UUID_LIKE.test(requestedApplicationId ?? '') ? requestedApplicationId : null;
    let resolvedApplicationId = requestedApplicationId;

    if (parsed.data.onboardingMode === 'dashboard_client' && canResolveOwnedApplication) {
      try {
        const resolved = await resolveCanonicalDashboardApplication({
          admin: getSupabaseAdmin(),
          companyId: profile!.company_id!,
          userId: profile!.id,
          sourceChannel,
          requestedApplicationId: resolvedApplicationId,
          grantId: parsed.data.grantId ?? null,
          grantSlug: parsed.data.grantSlug ?? null
        });
        resolvedApplicationId = resolved.canonicalApplicationId;
      } catch (error) {
        if (error instanceof DashboardApplicationResolverError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    }

    let record = null as Awaited<ReturnType<typeof getPracticePaymentBySession>>;

    if (safeSession) {
      record = await syncRecordFromStripeIfNeeded({
        sessionId: safeSession,
        fallbackPracticeType: practiceType,
        quizSubmissionId: parsed.data.quizSubmissionId ?? null,
        applicationId: resolvedApplicationId,
      });
    } else if (parsed.data.quizSubmissionId) {
      record = await getLatestPaidPaymentByQuiz({
        quizSubmissionId: parsed.data.quizSubmissionId,
        practiceType,
      });
    }

    if (!record) {
      const requirementsFromApplicationRaw = resolvedApplicationId
        ? await ensureApplicationRequirementsIfMissing(resolvedApplicationId, sourceChannel)
        : [];
      const requirementsRaw =
        requirementsFromApplicationRaw.length > 0
          ? requirementsFromApplicationRaw
          : await loadDocumentRequirementsFromGrant(grantIdentifier, sourceChannel);
      const requirements = isDashboardMode
        ? sanitizeDashboardRequirements(requirementsRaw)
        : requirementsRaw;
      return NextResponse.json({
        ...base,
        applicationId: resolvedApplicationId,
        documentRequirements: requirements,
        didRequired:
          requirements.some((requirement) => requirement.isRequired && requirement.requirementKey.toLowerCase().includes('did')) ||
          base.didRequired,
        authenticated: Boolean(user)
      });
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
    const paymentApplicationId = resolvedApplicationId ?? record.application_id;
    const documentRequirementsRaw = paymentApplicationId
      ? await ensureApplicationRequirementsIfMissing(paymentApplicationId, sourceChannel)
      : await loadDocumentRequirementsFromGrant(grantIdentifier, sourceChannel);
    const documentRequirements = isDashboardMode
      ? sanitizeDashboardRequirements(documentRequirementsRaw)
      : documentRequirementsRaw;
    const didRequiredFromRequirements = documentRequirements.some(
      (requirement) => requirement.isRequired && requirement.requirementKey.toLowerCase().includes('did')
    );

    const nextUrl =
      record.onboarding_status === 'completed'
        ? '/dashboard/pratiche'
        : null;

    return NextResponse.json({
      ok: true,
      paymentStatus,
      onboardingStatus: record.onboarding_status,
      currentStep,
      completedSteps,
      sessionId: record.stripe_checkout_session_id ?? safeSession ?? null,
      applicationId: paymentApplicationId,
      grantSlug: config.slug,
      grantTitle: config.title,
      documentRequirements,
      amountCents: config.startFeeCents,
      currency: config.currency,
      paymentCtaLabel: config.paymentCtaLabel,
      customerEmail: record.customer_email ?? null,
      didRequired: didRequiredFromRequirements || config.didRequired,
      nextUrl,
      authenticated: Boolean(user)
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
    const requestedApplicationId = body.data.applicationId ?? null;
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
    if (requestedApplicationId && record.application_id && record.application_id !== requestedApplicationId) {
      return NextResponse.json({ error: 'applicationId non coerente con la sessione pagamento.' }, { status: 409 });
    }
    const resolvedApplicationId = record.application_id ?? requestedApplicationId;

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
        application_id: resolvedApplicationId ?? undefined,
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
    const documentRequirements = await loadDocumentRequirements(resolvedApplicationId);
    const didRequiredFromRequirements = documentRequirements.some(
      (requirement) => requirement.isRequired && requirement.requirementKey.toLowerCase().includes('did')
    );
    return NextResponse.json({
      ok: true,
      paymentStatus: updated.status,
      onboardingStatus: updated.onboarding_status,
      currentStep,
      completedSteps: completed,
      sessionId: updated.stripe_checkout_session_id,
      applicationId: resolvedApplicationId,
      grantSlug: config.slug,
      grantTitle: config.title,
      documentRequirements,
      amountCents: config.startFeeCents,
      currency: config.currency,
      paymentCtaLabel: config.paymentCtaLabel,
      customerEmail: updated.customer_email ?? null,
      didRequired: didRequiredFromRequirements || config.didRequired,
      nextUrl: null,
    } satisfies WizardState);

  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore salvataggio progresso onboarding.') }, { status: 500 });
  }
}
