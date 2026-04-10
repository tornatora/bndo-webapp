import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getStripeClient } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { provisionAccountFromCheckout } from '@/lib/services/provisioning';
import {
  ensureBandoApplication,
  getPracticeConfig,
  practiceTitle,
  practiceTypeFromQuizBandoType,
  type PracticeType,
} from '@/lib/bandi';
import { upsertProgressIntoNotes } from '@/lib/admin/practice-progress';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';
import type { Json } from '@/lib/supabase/database.types';
import * as crypto from 'crypto';
import { resolveCanonicalDashboardApplication, DashboardApplicationResolverError } from '@/lib/onboarding/dashboardApplicationResolver';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { PracticeSourceChannel } from '@/lib/practices/orchestrator';
import { AUTO_REPLY_BODY } from '@/lib/chat/constants';
import {
  getPracticePaymentBySession,
  markPaymentOnboardingCompleted,
  resolvePracticeTypeFromAny,
  upsertPracticePaymentFromIntent,
  upsertPracticePaymentFromSession,
} from '@/lib/services/practicePayments';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation,
  safeSessionId
} from '@/lib/security/http';

export const runtime = 'nodejs';

const TextSchema = z.object({
  sessionId: z.string().trim().min(8).optional().nullable(),
  quizSubmissionId: z.string().uuid().optional().nullable(),
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord', 'generic']).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  pec: z.string().trim().min(3).max(160),
  digitalSignature: z.enum(['yes', 'no']),
  quotesText: z.string().trim().max(2000).optional().nullable(),
  projectSummary: z.string().trim().max(2000).optional().nullable(),
  acceptPrivacy: z.enum(['yes']),
  acceptTerms: z.enum(['yes']),
  consentStorage: z.enum(['yes']),
  paymentDeferred: z.enum(['yes', 'no']).optional().nullable(),
  onboardingMode: z.enum(['legacy', 'dashboard_client']).optional().nullable(),
  username: z.string().trim().min(3).max(50).optional().nullable(),
  password: z.string().trim().min(8).max(100).optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  grantId: z.string().trim().min(1).optional().nullable(),
  grantSlug: z.string().trim().min(1).optional().nullable(),
  sourceChannel: z.string().optional().nullable(),
  guestCredentialMode: z.enum(['new', 'existing']).optional().nullable()
});

type QuizSubmissionLite = {
  id: string;
  full_name: string;
  phone: string;
  region: string | null;
  bando_type: string | null;
  eligibility: 'eligible' | 'not_eligible';
  created_at: string;
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeRequirementToken(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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

function isMissingApplicationDocumentRequirementKeyColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
  const code = (candidate.code ?? '').toUpperCase();
  if (code === '42703' || code === 'PGRST204') return true;

  const blob = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
  return (
    blob.includes('application_documents') &&
    blob.includes('requirement_key') &&
    (blob.includes('schema cache') || blob.includes('could not find') || blob.includes('column'))
  );
}

function findRequirementByAliases(
  requirements: Array<{ requirement_key: string; label: string }>,
  aliases: string[]
) {
  const normalizedAliases = aliases.map((alias) => normalizeRequirementToken(alias));
  return (
    requirements.find((requirement) => {
      const keyToken = normalizeRequirementToken(requirement.requirement_key);
      if (normalizedAliases.includes(keyToken)) return true;
      const labelToken = normalizeRequirementToken(requirement.label);
      return normalizedAliases.some((alias) => labelToken.includes(alias));
    }) ?? null
  );
}

function moneyFromStripe(amountTotal: number | null | undefined, currency: string | null | undefined) {
  if (!amountTotal || !currency) return null;
  const isZeroDecimal = new Set(['jpy', 'krw', 'vnd']).has(currency.toLowerCase());
  return isZeroDecimal ? amountTotal : amountTotal / 100;
}

async function ensureOpsAutoReply(threadId: string) {
  const admin = getSupabaseAdmin();
  const { data: opsProfile } = await admin
    .from('profiles')
    .select('id, role')
    .in('role', ['consultant', 'ops_admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!opsProfile?.id) return;

  await admin.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: opsProfile.id,
      participant_role: opsProfile.role,
      // Do not mark messages as read just because we add an ops participant or send an auto-reply.
      last_read_at: new Date(0).toISOString()
    },
    { onConflict: 'thread_id,profile_id', ignoreDuplicates: true }
  );

  await admin.from('consultant_messages').insert({
    thread_id: threadId,
    sender_profile_id: opsProfile.id,
    body: AUTO_REPLY_BODY
  });
}

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'onboarding-complete',
      key: getClientIp(request),
      limit: 18,
      windowMs: 10 * 60_000
    });
    if (rateLimit) return rateLimit;

    const supabaseAdmin = getSupabaseAdmin();
    // Stripe is optional for manual onboarding flows.

    const formData = await request.formData();
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    const requestUrl = new URL(request.url);
    const queryOrNull = (key: string) => {
      const value = requestUrl.searchParams.get(key);
      return value && value.trim().length > 0 ? value.trim() : null;
    };

    const parsed = TextSchema.safeParse({
      sessionId: formData.get('sessionId'),
      quizSubmissionId: formData.get('quizSubmissionId'),
      practiceType: formData.get('practiceType'),
      email: formData.get('email'),
      pec: formData.get('pec'),
      digitalSignature: formData.get('digitalSignature'),
      quotesText: formData.get('quotesText'),
      projectSummary: formData.get('projectSummary'),
      acceptPrivacy: formData.get('acceptPrivacy'),
      acceptTerms: formData.get('acceptTerms'),
      consentStorage: formData.get('consentStorage'),
      paymentDeferred: formData.get('paymentDeferred'),
      onboardingMode: formData.get('onboardingMode') ?? queryOrNull('onboarding_mode'),
      username: formData.get('username'),
      password: formData.get('password'),
      applicationId: formData.get('applicationId') ?? queryOrNull('applicationId'),
      grantId: formData.get('grantId') ?? queryOrNull('grantId'),
      grantSlug: formData.get('grantSlug') ?? queryOrNull('grantSlug'),
      sourceChannel: formData.get('sourceChannel') ?? queryOrNull('source'),
      guestCredentialMode: formData.get('guestCredentialMode')
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });
    }

    const requestedOnboardingMode = parsed.data.onboardingMode ?? null;
    const inferredDashboardMode = Boolean(parsed.data.applicationId || parsed.data.grantId || parsed.data.grantSlug);
    const onboardingMode =
      requestedOnboardingMode ??
      (inferredDashboardMode ? 'dashboard_client' : 'legacy');
    const paymentDeferred = parsed.data.paymentDeferred === 'yes' || onboardingMode === 'dashboard_client';
    const manualOnboardingEnabled =
      process.env.ALLOW_MANUAL_ONBOARDING === 'true' || onboardingMode === 'dashboard_client';
    const providedSessionId = safeSessionId(parsed.data.sessionId ?? null) ?? '';
    const providedEmail = (parsed.data.email ?? '').trim();
    const requestedApplicationId = parsed.data.applicationId ?? null;
    const sourceChannel: PracticeSourceChannel = (parsed.data.sourceChannel as PracticeSourceChannel) ?? 'direct';
    const guestCredentialMode = parsed.data.guestCredentialMode ?? 'new';

    const supabase = createClient();
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    const authenticatedEmail = sessionUser?.email ?? null;
    let finalEmail = providedEmail || authenticatedEmail;

    const skipPaymentParam = requestUrl.searchParams.get('skip_payment') === '1';
    const skipPaymentCheckForDashboard = inferredDashboardMode || onboardingMode === 'dashboard_client' || skipPaymentParam;
    if (!providedSessionId && !manualOnboardingEnabled && !paymentDeferred && !skipPaymentCheckForDashboard) {
      return NextResponse.json({ error: 'Pagamento non verificato. Completa prima il pagamento Stripe.' }, { status: 403 });
    }
    if (!providedSessionId && !finalEmail) {
      return NextResponse.json({ error: 'Inserisci la tua email.' }, { status: 422 });
    }

    const idDocument = formData.get('idDocument');
    const taxCodeDocument = formData.get('taxCodeDocument');
    const didDocument = formData.get('didDocument');
    const quotes = formData.getAll('quotes');

    const isDashboardFlow = onboardingMode === 'dashboard_client';
    // Se loggati o in modalita dashboard, i documenti base possono essere omessi se gia presenti nel profilo
    if (!isDashboardFlow && !sessionUser && (!(idDocument instanceof File) || !(taxCodeDocument instanceof File))) {
      return NextResponse.json({ error: 'Carica documento identita e codice fiscale.' }, { status: 422 });
    }

    // Determine practice type early for conditional validation.
    const requestedPracticeType = (parsed.data.practiceType as PracticeType | null | undefined) ?? null;
    let paymentRecord = providedSessionId ? await getPracticePaymentBySession(providedSessionId) : null;
    const paymentPracticeType = resolvePracticeTypeFromAny(paymentRecord?.practice_type ?? null);

    // Initial practice type guess for DID validation.
    const practiceCandidate: PracticeType = requestedPracticeType ?? paymentPracticeType ?? 'resto_sud_2_0';
    const config = getPracticeConfig(practiceCandidate);

    if (!isDashboardFlow && config.didRequired && !(didDocument instanceof File)) {
      return NextResponse.json({ error: 'Carica la certificazione DID.' }, { status: 422 });
    }

    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'zip'];
    const filesToValidate = [
      ...(idDocument instanceof File ? [idDocument] : []),
      ...(taxCodeDocument instanceof File ? [taxCodeDocument] : []),
      ...(didDocument instanceof File ? [didDocument] : []),
      ...quotes.filter((q) => q instanceof File)
    ] as File[];

    for (const file of filesToValidate) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) {
        return NextResponse.json(
          { error: `Formato file "${file.name}" non consentito. Ammessi PDF, PNG, JPG, JPEG, ZIP.` },
          { status: 422 }
        );
      }
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: `Il file "${file.name}" è troppo grande. Dimensione massima 25MB.` }, { status: 422 });
      }
    }

    // Determine email and payment metadata.
    let normalizedEmail = providedEmail ? providedEmail.toLowerCase() : '';
    let checkoutSessionId: string | null = providedSessionId || null;
    let stripeCustomerId: string | null = null;
    let stripePaymentIntentId: string | null = null;
    let currency: string | null = null;
    let amountPaid = 0;
    // paymentRecord is already fetched above.

    if (requestedPracticeType && paymentPracticeType && requestedPracticeType !== paymentPracticeType) {
      return NextResponse.json({ error: 'La sessione di pagamento non corrisponde alla pratica selezionata.' }, { status: 409 });
    }


    if (providedSessionId) {
      if (paymentRecord?.status === 'paid') {
        amountPaid = Math.max(amountPaid, paymentRecord.amount_cents / 100);
        currency = paymentRecord.currency ?? currency;
        if (!normalizedEmail && paymentRecord.customer_email) {
          normalizedEmail = paymentRecord.customer_email.toLowerCase();
        }
      } else {
        try {
          const stripe = getStripeClient();
          if (providedSessionId.startsWith('pi_')) {
            const intent = await stripe.paymentIntents.retrieve(providedSessionId);
            if (intent.status !== 'succeeded') {
              return NextResponse.json({ error: 'Pagamento non completato.' }, { status: 403 });
            }

            checkoutSessionId = intent.id;
            stripeCustomerId = typeof intent.customer === 'string' ? intent.customer : null;
            stripePaymentIntentId = intent.id;
            currency = intent.currency ?? null;
            amountPaid = moneyFromStripe(intent.amount, intent.currency) ?? 0;

            if (intent.receipt_email) {
              normalizedEmail = intent.receipt_email.toLowerCase();
            }

            paymentRecord = await upsertPracticePaymentFromIntent({
              intent,
              fallbackPracticeType: requestedPracticeType ?? paymentPracticeType,
              fallbackQuizSubmissionId: parsed.data.quizSubmissionId ?? paymentRecord?.quiz_submission_id ?? null,
              forceStatus: 'paid',
            });
          } else {
            const session = await stripe.checkout.sessions.retrieve(providedSessionId);
            if (session.payment_status && session.payment_status !== 'paid') {
              return NextResponse.json({ error: 'Pagamento non completato.' }, { status: 403 });
            }
            checkoutSessionId = session.id;
            stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;
            stripePaymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
            currency = session.currency ?? null;
            amountPaid = moneyFromStripe(session.amount_total, session.currency) ?? 0;

            const stripeEmail = session.customer_details?.email ?? session.customer_email ?? null;
            if (stripeEmail) normalizedEmail = stripeEmail.toLowerCase();

            paymentRecord = await upsertPracticePaymentFromSession({
              session,
              fallbackPracticeType: requestedPracticeType ?? paymentPracticeType,
              fallbackQuizSubmissionId: parsed.data.quizSubmissionId ?? paymentRecord?.quiz_submission_id ?? null,
              forceStatus: 'paid',
            });
          }

          if (paymentRecord) {
            amountPaid = Math.max(amountPaid, paymentRecord.amount_cents / 100);
            currency = paymentRecord.currency ?? currency;
            if (!normalizedEmail && paymentRecord.customer_email) {
              normalizedEmail = paymentRecord.customer_email.toLowerCase();
            }
          }
        } catch {
          if (!paymentRecord || paymentRecord.status !== 'paid') {
            return NextResponse.json(
              { error: 'Pagamento non ancora verificato. Attendi qualche secondo e riprova.' },
              { status: 503 }
            );
          }
        }
      }
    }

    const canSkipPaymentVerification = manualOnboardingEnabled || paymentDeferred || skipPaymentCheckForDashboard;
    if (!canSkipPaymentVerification && (!paymentRecord || paymentRecord.status !== 'paid')) {
      return NextResponse.json({ error: 'Pagamento non verificato. Completa prima il pagamento Stripe.' }, { status: 403 });
    }

    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Inserisci una email valida.' }, { status: 422 });
    }
    const preferredQuizSubmissionId = parsed.data.quizSubmissionId ?? paymentRecord?.quiz_submission_id ?? null;
    let quiz: QuizSubmissionLite | null = null;

    if (preferredQuizSubmissionId) {
      const { data: quizById } = await supabaseAdmin
        .from('quiz_submissions')
        .select('id, full_name, phone, region, bando_type, eligibility, created_at')
        .eq('id', preferredQuizSubmissionId)
        .maybeSingle();
      quiz = (quizById as QuizSubmissionLite | null) ?? null;
    }

    if (!quiz) {
      const { data: latestQuiz } = await supabaseAdmin
        .from('quiz_submissions')
        .select('id, full_name, phone, region, bando_type, eligibility, created_at')
        .eq('email', normalizedEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      quiz = (latestQuiz as QuizSubmissionLite | null) ?? null;
    }

    const practiceTypeFromPayment = resolvePracticeTypeFromAny(paymentRecord?.practice_type ?? null);
    const practiceType: PracticeType =
      requestedPracticeType ??
      practiceTypeFromPayment ??
      practiceTypeFromQuizBandoType(quiz?.bando_type) ??
      'resto_sud_2_0';
    if (practiceTypeFromPayment && practiceType !== practiceTypeFromPayment) {
      return NextResponse.json({ error: 'La sessione di pagamento non appartiene a questa pratica.' }, { status: 409 });
    }
    const displayName =
      quiz?.full_name?.trim() ||
      normalizedEmail.split('@')[0]?.replace(/[._-]+/g, ' ')?.trim() ||
      'Cliente BNDO';

    const effectiveCheckoutSessionId =
      checkoutSessionId ?? (manualOnboardingEnabled || paymentDeferred ? `manual_${crypto.randomUUID()}` : null);
    if (!effectiveCheckoutSessionId) {
      return NextResponse.json({ error: 'Pagamento non verificato. Completa prima il pagamento Stripe.' }, { status: 403 });
    }

    const quoteFiles = quotes.filter((q) => q instanceof File) as File[];
    const quotesText = parsed.data.quotesText?.trim() ?? '';
    if (!isDashboardFlow && !quoteFiles.length && !quotesText) {
      return NextResponse.json(
        { error: 'Carica almeno un preventivo oppure inserisci bene/servizio + prezzo + IVA.' },
        { status: 422 }
      );
    }

    const provision = await provisionAccountFromCheckout({
      checkoutSessionId: effectiveCheckoutSessionId,
      customerEmail: normalizedEmail,
      companyName: displayName,
      contactName: displayName,
      stripeCustomerId,
      stripePaymentIntentId,
      desiredUsername: parsed.data.username,
      desiredPassword: parsed.data.password
    });

    const companyId = provision.companyId;
    let userId = provision.userId;

    if (!companyId) {
      return NextResponse.json({ error: 'Provisioning incompleto (companyId mancante).' }, { status: 500 });
    }

    if (!userId) {
      const { data: profileByEmail } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      userId = profileByEmail?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Provisioning incompleto (userId mancante).' }, { status: 500 });
    }

    let applicationId: string | null = null;

    // DETERMINISTIC APPLICATION RESOLUTION
    try {
      const resolved = await resolveCanonicalDashboardApplication({
        admin: supabaseAdmin,
        companyId,
        userId: userId!,
        sourceChannel,
        requestedApplicationId,
        grantId: parsed.data.grantId ?? null,
        grantSlug: parsed.data.grantSlug ?? null
      });
      applicationId = resolved.application.id;
    } catch (error) {
      if (error instanceof DashboardApplicationResolverError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    if (!applicationId) {
      const { applicationId: ensuredId } = await ensureBandoApplication(supabaseAdmin, companyId, practiceType);
      applicationId = ensuredId;
    }

    const consentSnapshot = {
      privacy_accepted: true,
      terms_accepted: true,
      data_and_documents_storage_authorized: true,
      legal_version: LEGAL_LAST_UPDATED,
      captured_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent ?? null
    };

    // Persist legal consent evidence (best-effort fallback when table isn't deployed yet).
    let legalStored = false;
    try {
      const { error: legalErr } = await supabaseAdmin.from('legal_consents').upsert(
        {
          context: 'after_payment_onboarding',
          email: normalizedEmail,
          company_id: companyId,
          user_id: userId,
          application_id: applicationId,
          checkout_session_id: effectiveCheckoutSessionId,
          quiz_submission_id: quiz?.id ?? null,
          consents: consentSnapshot as unknown as Json,
          ip_address: ipAddress,
          user_agent: userAgent ?? null
        },
        { onConflict: 'context,checkout_session_id' }
      );
      if (!legalErr) {
        legalStored = true;
      } else if ((legalErr as { code?: string })?.code !== '42P01') {
        // Unexpected error: keep going only if we can store a consent fallback in CRM.
        legalStored = false;
      }
    } catch {
      legalStored = false;
    }

    // Update CRM fields (used in Admin "Scheda cliente").
    const { data: existingCrm } = await supabaseAdmin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', companyId)
      .maybeSingle();

    const currentFields = (existingCrm?.admin_fields ?? {}) as Record<string, unknown>;
    const currentLegalConsents = Array.isArray(currentFields.legal_consents) ? (currentFields.legal_consents as unknown[]) : [];
    const nextLegalConsents = [
      {
        context: 'after_payment_onboarding',
        session_id: effectiveCheckoutSessionId,
        quiz_id: quiz?.id ?? null,
        legal_version: LEGAL_LAST_UPDATED,
        captured_at: new Date().toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent ?? null
      },
      ...currentLegalConsents
    ].slice(0, 20);
    const nextFields: Record<string, unknown> = {
      ...currentFields,
      phone: quiz?.phone ?? currentFields.phone ?? '',
      pec: parsed.data.pec.trim(),
      project_summary: parsed.data.projectSummary?.trim() || (currentFields.project_summary as string | undefined) || '',
      firma_digitale:
        parsed.data.digitalSignature === 'yes'
          ? 'si'
          : parsed.data.digitalSignature === 'no'
            ? 'no'
            : (currentFields.firma_digitale as string | undefined) || '',
      certificazione_did: config.didRequired ? 'si' : 'no',
      preventivi_testo: quotesText || (currentFields.preventivi_testo as string | undefined) || '',
      onboarding_completed_at: new Date().toISOString(),
      legal_consents: nextLegalConsents,
      legal: {
        ...(typeof currentFields.legal === 'object' && currentFields.legal && !Array.isArray(currentFields.legal) ? (currentFields.legal as Record<string, unknown>) : {}),
        after_payment_onboarding: consentSnapshot
      }
    };

    const startFeeEur = getPracticeConfig(practiceType).startFeeCents / 100;
    const normalizedPaidAmount = Number.isFinite(amountPaid) && amountPaid > 0 ? amountPaid : startFeeEur;

    // Initialize billing state for this practice (totale = start fee pratica).
    const currentBilling = (nextFields.billing as Record<string, unknown> | undefined) ?? null;
    const currentPayments =
      currentBilling && typeof currentBilling === 'object' && !Array.isArray(currentBilling)
        ? ((currentBilling.payments as Record<string, { total: number; paid: number }> | undefined) ?? {})
        : {};
    const currentInvoices =
      currentBilling && typeof currentBilling === 'object' && !Array.isArray(currentBilling)
        ? (((currentBilling.invoices as Array<unknown> | undefined) ?? []) as Array<unknown>)
        : [];

    const nextPayments = {
      ...currentPayments,
      [applicationId]: {
        total: startFeeEur,
        paid: Math.max(0, Math.min(startFeeEur, normalizedPaidAmount))
      }
    };

    nextFields.billing = {
      payments: nextPayments,
      invoices: currentInvoices
    };

    try {
      await supabaseAdmin.from('company_crm').upsert(
        {
          company_id: companyId,
          admin_fields: nextFields as unknown as Json,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'company_id' }
      );
    } catch (e) {
      console.error('[ONBOARDING_STABILITY] CRM upsert failed, continuing anyway:', e);
    }

    // Handle removals (Skip deletion by requirement_key if the column is missing from DB to prevent 500 errors)
    /*
    const removedKeys = new Set(formData.getAll('removedRequirementKeys').map(String));
    if (removedKeys.size > 0) {
      await supabaseAdmin.from('application_documents').delete().eq('application_id', applicationId!).in('requirement_key', Array.from(removedKeys));
    }
    */

    // If the dedicated table isn't available, we already attempted CRM fallback.
    if (!legalStored) {
      // Non bloccare il completamento onboarding per errori di persistenza consensi in ambienti parzialmente migrati.
      console.error('[ONBOARDING_COMPLETE] legal consent persistence degraded: legal_consents write failed');
    }

    // Upload base documents and create DB records.
    const requirementFiles = formData.getAll('requirementFiles') as File[];
    const requirementFileKeys = formData.getAll('requirementFileKeys').map(String);
    const requirementFileLabels = formData.getAll('requirementFileLabels').map(String);

    const uploadsReady: Array<{ key: string; label: string; file: File }> = [];
    const uploadedRequirementKeys = new Set<string>();

    const { data: requirementRows, error: requirementRowsError } = await supabaseAdmin
      .from('practice_document_requirements')
      .select('requirement_key, label')
      .eq('application_id', applicationId);
    const requirementsSafe =
      requirementRowsError && isMissingPracticeRequirementsTableError(requirementRowsError)
        ? []
        : (requirementRows ?? []);
    const quoteRequirement = findRequirementByAliases(requirementsSafe, [
      'preventivi_spesa',
      'preventivi',
      'quote',
      'quotazioni'
    ]);

    const { data: existingDocsRaw } = await supabaseAdmin
      .from('application_documents')
      .select('requirement_key, file_name')
      .eq('application_id', applicationId);
    const existingRequirementKeys = new Set(
      (existingDocsRaw ?? [])
        .map((row) => (typeof row.requirement_key === 'string' ? row.requirement_key.trim() : ''))
        .filter(Boolean)
    );
    const existingFileNames = new Set(
      (existingDocsRaw ?? []).map((row) => String(row.file_name ?? '').toLowerCase()).filter(Boolean)
    );

    // Map base documents to canonical keys if they were provided directly
    if (idDocument instanceof File) {
      uploadsReady.push({ key: 'documento_identita', label: 'Documento di riconoscimento', file: idDocument });
    }
    if (taxCodeDocument instanceof File) {
      uploadsReady.push({ key: 'codice_fiscale', label: 'Codice fiscale', file: taxCodeDocument });
    }
    if (config.didRequired && didDocument instanceof File) {
      uploadsReady.push({ key: 'certificazione_did', label: 'Certificazione DID', file: didDocument });
    }

    // Handle dynamic requirements from the wizard (if any overlaps, dynamic wins)
    for (let i = 0; i < requirementFiles.length; i++) {
      const file = requirementFiles[i];
      const key = requirementFileKeys[i];
      const label = requirementFileLabels[i];
      if (file instanceof File && key && label) {
        // If we already have this key (e.g. idDocument also sent as generic), replace it with the generic one
        const existingIdx = uploadsReady.findIndex((u) => u.key === key);
        if (existingIdx !== -1) {
          uploadsReady[existingIdx] = { key, label, file };
        } else {
          uploadsReady.push({ key, label, file });
        }
      }
    }

    for (const doc of uploadsReady) {
      const timestamp = Date.now();
      const safeOriginal = safeFileName(doc.file.name);
      const safeLabel = safeFileName(doc.label).slice(0, 80);
      const fileName = `${safeLabel}__${safeOriginal}`;

      if ((doc.key && existingRequirementKeys.has(doc.key)) || existingFileNames.has(fileName.toLowerCase())) {
        if (doc.key) uploadedRequirementKeys.add(doc.key);
        continue;
      }

      const storagePath = `${companyId}/${applicationId}/${timestamp}_${fileName}`;
      const fileBuffer = Buffer.from(await doc.file.arrayBuffer());

      const { error: storageError } = await supabaseAdmin.storage
        .from('application-documents')
        .upload(storagePath, fileBuffer, {
          contentType: doc.file.type || 'application/octet-stream',
          upsert: false
        });

      if (storageError) {
        return NextResponse.json({ error: `Upload storage fallito per "${doc.label}": ${storageError.message}` }, { status: 500 });
      }

      const basePayload = {
        application_id: applicationId,
        uploaded_by: userId,
        file_name: fileName,
        storage_path: storagePath,
        file_size: doc.file.size,
        mime_type: doc.file.type || 'application/octet-stream'
      };
      const payloadWithRequirement = { ...basePayload, requirement_key: doc.key };
      let { error: docError } = await supabaseAdmin.from('application_documents').insert(payloadWithRequirement);
      if (docError && isMissingApplicationDocumentRequirementKeyColumnError(docError)) {
        const retry = await supabaseAdmin.from('application_documents').insert(basePayload);
        docError = retry.error;
      }

      if (docError) {
        return NextResponse.json({ error: `Inserimento documento "${doc.label}" fallito: ${docError.message}` }, { status: 500 });
      }
      uploadedRequirementKeys.add(doc.key);
    }

    for (const file of quoteFiles) {
      const timestamp = Date.now();
      const safeOriginal = safeFileName(file.name);
      const fileName = `Preventivo_spesa__${safeOriginal}`;

      if (quoteRequirement?.requirement_key && existingRequirementKeys.has(quoteRequirement.requirement_key)) {
        uploadedRequirementKeys.add(quoteRequirement.requirement_key);
        continue;
      }
      if (existingFileNames.has(fileName.toLowerCase())) {
        if (quoteRequirement?.requirement_key) uploadedRequirementKeys.add(quoteRequirement.requirement_key);
        continue;
      }

      const storagePath = `${companyId}/${applicationId}/${timestamp}_${fileName}`;
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      const { error: storageError } = await supabaseAdmin.storage
        .from('application-documents')
        .upload(storagePath, fileBuffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false
        });

      if (storageError) {
        return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
      }

      const basePayload = {
        application_id: applicationId,
        uploaded_by: userId,
        file_name: fileName,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream'
      };
      const payloadWithRequirement =
        quoteRequirement?.requirement_key ? { ...basePayload, requirement_key: quoteRequirement.requirement_key } : basePayload;
      let { error: docError } = await supabaseAdmin.from('application_documents').insert(payloadWithRequirement);
      if (docError && quoteRequirement?.requirement_key && isMissingApplicationDocumentRequirementKeyColumnError(docError)) {
        const retry = await supabaseAdmin.from('application_documents').insert(basePayload);
        docError = retry.error;
      }

      if (docError) {
        return NextResponse.json({ error: `Inserimento documento fallito: ${docError.message}` }, { status: 500 });
      }
      if (quoteRequirement?.requirement_key) {
        uploadedRequirementKeys.add(quoteRequirement.requirement_key);
      }
    }

    if (uploadedRequirementKeys.size > 0) {
      try {
        await supabaseAdmin
          .from('practice_document_requirements')
          .update({ status: 'uploaded' })
          .eq('application_id', applicationId)
          .in('requirement_key', Array.from(uploadedRequirementKeys.values()));
      } catch (e) {
        console.error('[ONBOARDING_STABILITY] Reqs status update failed, continuing anyway:', e);
      }
    }

    // Create chat thread and notify admin via message.
    const { data: ensuredThread } = await supabaseAdmin
      .from('consultant_threads')
      .upsert({ company_id: companyId }, { onConflict: 'company_id' })
      .select('id')
      .single();

    const threadId = ensuredThread?.id ?? null;
    if (threadId) {
      await supabaseAdmin.from('consultant_thread_participants').upsert(
        {
          thread_id: threadId,
          profile_id: userId,
          participant_role: 'client_admin',
          last_read_at: new Date().toISOString()
        },
        { onConflict: 'thread_id,profile_id' }
      );

      const practiceLabel = practiceTitle(practiceType);
      const lines = [
        '[AVVIO PRATICA]',
        `Pratica: ${practiceLabel}`,
        `Pagamento anticipo: ${amountPaid ? `${amountPaid} ${String(currency ?? '').toUpperCase()}` : 'OK'}`,
        `Documenti caricati: ${uploadsReady.length + quoteFiles.length}`,
        `PEC: ${parsed.data.pec}`,


        `Firma digitale: ${parsed.data.digitalSignature === 'yes' ? 'Si' : 'No'}`,
        quotesText ? `Preventivi (testo):\n${quotesText}` : null,
        parsed.data.projectSummary ? `Sintesi progetto: ${parsed.data.projectSummary}` : null
      ].filter(Boolean) as string[];

      await supabaseAdmin.from('consultant_messages').insert({
        thread_id: threadId,
        sender_profile_id: userId,
        body: lines.join('\n')
      });

      // Ensure at least one ops user is in the thread and sends an auto-reply.
      await ensureOpsAutoReply(threadId);

      try {
        await emitNotificationEvent({
          eventType: 'payment_received',
          actorProfileId: userId,
          actorRole: 'client_admin',
          companyId,
          applicationId,
          threadId,
          amountCents: Number.isFinite(amountPaid) && amountPaid > 0 ? Math.round(amountPaid * 100) : null,
          currency: typeof currency === 'string' ? currency : 'EUR',
          customerName: displayName,
          practiceTitle: practiceLabel,
          metadata: {
            paymentDeferred: parsed.data.paymentDeferred ?? null,
            source: 'onboarding_after_payment_complete'
          }
        });
      } catch (e) {
        console.error('[ONBOARDING_STABILITY] Notification event failed, continuing anyway:', e);
      }
    }

    // Ensure practice progress marker (payment/mandate activated).
    const { data: appRow } = await supabaseAdmin
      .from('tender_applications')
      .select('id, notes')
      .eq('id', applicationId)
      .maybeSingle();

    const baseNote = `Onboarding completato. Documenti caricati: ${uploadsReady.length + quoteFiles.length}.`;
    const nextNotes = upsertProgressIntoNotes([appRow?.notes ?? '', baseNote].filter(Boolean).join('\n'), 'contract_active');

    await supabaseAdmin.from('tender_applications').update({ notes: nextNotes }).eq('id', applicationId);

    if (providedSessionId) {
      await markPaymentOnboardingCompleted({
        sessionId: providedSessionId,
        companyId,
        userId,
        applicationId,
      });
    }

    // Store a lead entry (useful for ops tracking).
    try {
      await supabaseAdmin.from('leads').insert({
        full_name: displayName,
        email: normalizedEmail,
        company_name: displayName,
        phone: quiz?.phone ?? null,
        challenge: `Pagamento anticipo + onboarding base docs | Pratica: ${practiceTitle(practiceType)} | Quiz: ${quiz?.id ?? 'N/D'}`
      });
    } catch (e) {
      console.error('[ONBOARDING_STABILITY] Lead tracking failed, continuing anyway:', e);
    }

    return NextResponse.json(
      {
        ok: true,
        sessionId: effectiveCheckoutSessionId,
        companyId,
        userId,
        applicationId,
        practiceType,
        alreadyProvisioned: provision.alreadyProvisioned
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[ONBOARDING_CRITICAL_ERROR]', error);
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    return NextResponse.json(
      { 
        error: `Errore durante il completamento dell'onboarding: ${message}. Per favore contatta il supporto se il problema persiste.`
      }, 
      { status: 500 }
    );
  }
}
