import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { provisionAccountFromCheckout } from '@/lib/services/provisioning';
import {
  ensureBandoApplication,
  getPracticeConfig,
  practiceTitle,
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
  deriveGrantIdentifierFromDashboardInputs,
  resolveCanonicalDashboardApplication
} from '@/lib/onboarding/dashboardApplicationResolver';
import { upsertProgressIntoNotes } from '@/lib/admin/practice-progress';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';
import type { Json } from '@/lib/supabase/database.types';
import crypto from 'crypto';
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

const ApplicationIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const OnboardingModeSchema = z.enum(['legacy', 'dashboard_client']);

const TextSchema = z.object({
  onboardingMode: OnboardingModeSchema.optional().nullable(),
  sessionId: z.string().trim().min(8).optional().nullable(),
  quizSubmissionId: z.string().uuid().optional().nullable(),
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord', 'generic']).optional().nullable(),
  applicationId: ApplicationIdSchema.optional().nullable(),
  grantId: z.string().trim().min(2).max(220).optional().nullable(),
  grantSlug: z.string().trim().min(2).max(220).optional().nullable(),
  sourceChannel: z.enum(['scanner', 'chat', 'direct', 'admin']).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  pec: z.string().trim().min(3).max(160),
  digitalSignature: z.enum(['yes', 'no']),
  quotesText: z.string().trim().max(2000).optional().nullable(),
  projectSummary: z.string().trim().max(2000).optional().nullable(),
  acceptPrivacy: z.enum(['yes']),
  acceptTerms: z.enum(['yes']),
  consentStorage: z.enum(['yes']),
  paymentDeferred: z.enum(['yes', 'no']).optional().nullable(),
  guestCredentialMode: z.enum(['new', 'existing']).optional().nullable(),
  username: z.string().trim().min(3).max(50).optional().nullable(),
  password: z.string().trim().min(8).max(100).optional().nullable()
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

type RequirementRow = {
  requirement_key: string;
  label: string;
  description: string | null;
  is_required: boolean;
  status: 'missing' | 'uploaded' | 'waived';
};

type RequirementUpload = {
  requirementKey: string;
  label: string;
  file: File;
};

type OnboardingAdminNotificationInput = {
  applicationId: string;
  companyId: string;
  userId: string;
  onboardingMode: 'legacy' | 'dashboard_client';
  sourceChannel: PracticeSourceChannel;
  practiceLabel: string;
  uploadedDocumentLabels: string[];
  missingRequiredLabels: string[];
  pec: string;
  digitalSignature: 'yes' | 'no';
  quoteFilesCount: number;
  quotesText: string | null;
  paymentSummary: string;
};

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isDashboardExcludedRequirement(requirementKey: string, label: string) {
  const key = normalizeRequirementToken(requirementKey);
  const normalizedLabel = normalizeRequirementToken(label);
  return (
    key.includes('descrizione_progetto') ||
    normalizedLabel.includes('descrizione_sintetica_del_progetto')
  );
}

function sanitizeDashboardRequirements(requirements: RequirementRow[]) {
  return requirements.filter(
    (requirement) => !isDashboardExcludedRequirement(requirement.requirement_key, requirement.label)
  );
}

function isDidRequirementKey(requirementKey: string, label: string) {
  const token = normalizeRequirementToken(`${requirementKey} ${label}`);
  return token.includes('did') || token.includes('stato_occupazionale');
}

function findRequirementByAliases(requirements: RequirementRow[], aliases: string[]) {
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

function buildFallbackRequirements(configDidRequired: boolean): RequirementRow[] {
  const base: RequirementRow[] = [
    {
      requirement_key: 'documento_identita',
      label: 'Documento di identita',
      description: 'Documento fronte/retro in corso di validita.',
      is_required: true,
      status: 'missing'
    },
    {
      requirement_key: 'codice_fiscale',
      label: 'Codice fiscale',
      description: 'Tessera sanitaria o documento equivalente.',
      is_required: true,
      status: 'missing'
    }
  ];
  if (configDidRequired) {
    base.push({
      requirement_key: 'certificazione_did',
      label: 'Certificazione DID',
      description: 'Documento richiesto per verifica stato occupazionale.',
      is_required: true,
      status: 'missing'
    });
  }
  return base;
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

function normalizeGuestUsername(raw: string) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '.')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 48);
}

function deriveUsernameSeedFromEmail(email: string) {
  const localPart = String(email ?? '').trim().toLowerCase().split('@')[0] ?? '';
  return normalizeGuestUsername(localPart);
}

async function findUniqueUsername(baseUsername: string) {
  const base = normalizeGuestUsername(baseUsername) || `cliente.${Date.now().toString().slice(-6)}`;
  for (let index = 0; index < 8; index += 1) {
    const candidate = index === 0 ? base : `${base}.${Math.floor(1000 + Math.random() * 9000)}`;
    const { data } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base}.${Math.floor(100000 + Math.random() * 900000)}`;
}

async function notifyAdminOnboardingCompleted(input: OnboardingAdminNotificationInput) {
  try {
    const admin = getSupabaseAdmin();
    const [{ data: profile }, { data: company }] = await Promise.all([
      admin
        .from('profiles')
        .select('full_name, username, email')
        .eq('id', input.userId)
        .maybeSingle(),
      admin.from('companies').select('name').eq('id', input.companyId).maybeSingle()
    ]);

    const clientLabel =
      String(profile?.full_name ?? '').trim() ||
      String(profile?.username ?? '').trim() ||
      String(profile?.email ?? '').trim() ||
      input.userId;
    const companyName = String(company?.name ?? '').trim() || input.companyId;
    const uploadedSummary = input.uploadedDocumentLabels.length
      ? Array.from(new Set(input.uploadedDocumentLabels)).join(', ')
      : 'Nessun documento nuovo (gia presenti in pratica)';
    const missingSummary = input.missingRequiredLabels.length ? input.missingRequiredLabels.join(', ') : 'Nessuno';
    const completedAt = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
    const notes = input.quotesText?.trim() ?? '';

    const body = [
      `Cliente: ${clientLabel}`,
      `Azienda: ${companyName}`,
      `Pratica: ${input.practiceLabel}`,
      `Application ID: ${input.applicationId}`,
      `Canale: ${input.sourceChannel}`,
      `Modalita: ${input.onboardingMode === 'dashboard_client' ? 'Dashboard cliente' : 'Legacy checkout'}`,
      `Pagamento: ${input.paymentSummary}`,
      `Documenti caricati: ${uploadedSummary}`,
      `Documenti mancanti: ${missingSummary}`,
      `PEC: ${input.pec}`,
      `Firma digitale: ${input.digitalSignature === 'yes' ? 'Si' : 'No'}`,
      input.quoteFilesCount > 0 ? `Preventivi allegati: ${input.quoteFilesCount}` : null,
      notes ? `Preventivi/Spese (testo): ${notes}` : null,
      `Completato il: ${completedAt}`
    ]
      .filter(Boolean)
      .join('\n');

    const { error } = await admin.from('admin_notifications').insert({
      type: 'system',
      title: 'Onboarding completato',
      body,
      entity_id: `${input.companyId}:${input.applicationId}`
    });
    if (error) {
      console.error('[ONBOARDING_ADMIN_NOTIFICATION_INSERT_ERROR]', error);
    }
  } catch (error) {
    console.error('[ONBOARDING_ADMIN_NOTIFICATION_ERROR]', error);
  }
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

    const parsed = TextSchema.safeParse({
      onboardingMode: formData.get('onboardingMode'),
      sessionId: formData.get('sessionId'),
      quizSubmissionId: formData.get('quizSubmissionId'),
      practiceType: formData.get('practiceType'),
      applicationId: formData.get('applicationId'),
      grantId: formData.get('grantId'),
      grantSlug: formData.get('grantSlug'),
      sourceChannel: formData.get('sourceChannel'),
      email: formData.get('email'),
      pec: formData.get('pec'),
      digitalSignature: formData.get('digitalSignature'),
      quotesText: formData.get('quotesText'),
      projectSummary: formData.get('projectSummary'),
      acceptPrivacy: formData.get('acceptPrivacy'),
      acceptTerms: formData.get('acceptTerms'),
      consentStorage: formData.get('consentStorage'),
      paymentDeferred: formData.get('paymentDeferred'),
      guestCredentialMode: formData.get('guestCredentialMode'),
      username: formData.get('username'),
      password: formData.get('password')
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });
    }

    const requestedApplicationId = parsed.data.applicationId ?? null;
    const onboardingMode = parsed.data.onboardingMode ?? 'legacy';

    const manualOnboardingEnabled = process.env.ALLOW_MANUAL_ONBOARDING === 'true';
    const paymentDeferred = parsed.data.paymentDeferred === 'yes';
    const providedSessionId = safeSessionId(parsed.data.sessionId ?? null) ?? '';
    const providedEmail = (parsed.data.email ?? '').trim();
    const sourceChannel: PracticeSourceChannel = parsed.data.sourceChannel ?? 'direct';
    const guestCredentialMode = parsed.data.guestCredentialMode ?? 'new';
    const isDashboardClientMode =
      onboardingMode === 'dashboard_client' ||
      (!providedSessionId && Boolean(requestedApplicationId) && paymentDeferred);

    if (!isDashboardClientMode && !providedSessionId && !manualOnboardingEnabled && !paymentDeferred) {
      return NextResponse.json({ error: 'Pagamento non verificato. Completa prima il pagamento Stripe.' }, { status: 403 });
    }
    if (!isDashboardClientMode && !providedSessionId && !providedEmail) {
      return NextResponse.json({ error: 'Inserisci la tua email.' }, { status: 422 });
    }

    const requirementFiles = formData.getAll('requirementFiles');
    const requirementFileKeys = formData.getAll('requirementFileKeys');
    const requirementFileLabels = formData.getAll('requirementFileLabels');

    const requirementUploadsByKey = new Map<string, RequirementUpload>();
    for (let index = 0; index < requirementFiles.length; index += 1) {
      const rawFile = requirementFiles[index];
      if (!(rawFile instanceof File)) continue;
      const requirementKeyRaw = String(requirementFileKeys[index] ?? '').trim();
      if (!requirementKeyRaw) continue;
      const requirementKey = requirementKeyRaw;
      const rawLabel = String(requirementFileLabels[index] ?? '').trim();
      const label = rawLabel || requirementKeyRaw;
      requirementUploadsByKey.set(requirementKey, {
        requirementKey,
        label,
        file: rawFile
      });
    }

    const idDocument = formData.get('idDocument');
    const taxCodeDocument = formData.get('taxCodeDocument');
    const didDocument = formData.get('didDocument');
    const quotes = formData.getAll('quotes');
    const quoteFiles = quotes.filter((q) => q instanceof File) as File[];

    // PRE-VALIDATE FILES BEFORE ANY DB MUTATION to prevent orphaned accounts
    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'zip'];
    const filesToValidate = [
      ...Array.from(requirementUploadsByKey.values()).map((upload) => upload.file),
      ...quoteFiles,
      ...(idDocument instanceof File ? [idDocument] : []),
      ...(taxCodeDocument instanceof File ? [taxCodeDocument] : []),
      ...(didDocument instanceof File ? [didDocument] : [])
    ];

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

    if (isDashboardClientMode) {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase
            .from('profiles')
            .select('id, email, role, company_id')
            .eq('id', user.id)
            .maybeSingle()
        : { data: null };

      let userId = profile?.id ?? null;
      let companyId = profile?.company_id ?? null;
      let profileEmail = (profile?.email ?? user?.email ?? '').trim().toLowerCase();

      const isAuthenticatedClient = Boolean(profile && profile.role === 'client_admin' && profile.company_id);
      if (!isAuthenticatedClient) {
        if (guestCredentialMode === 'existing') {
          return NextResponse.json(
            { error: 'Sessione non valida. Effettua l’accesso come utente già registrato e riprova.' },
            { status: 401 }
          );
        }
        const normalizedEmail = providedEmail.trim().toLowerCase();
        const rawPassword = String(parsed.data.password ?? '');

        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          return NextResponse.json({ error: 'Inserisci una email valida per completare la registrazione.' }, { status: 422 });
        }
        if (rawPassword.length < 8) {
          return NextResponse.json({ error: 'La password deve contenere almeno 8 caratteri.' }, { status: 422 });
        }
        const { data: existingEmailProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (existingEmailProfile?.id) {
          return NextResponse.json(
            {
              error: 'Questa email risulta già registrata. Seleziona "Utente già registrato" e inserisci la password del tuo account.',
              code: 'EMAIL_ALREADY_REGISTERED'
            },
            { status: 409 }
          );
        }

        const usernameSeed =
          String(parsed.data.username ?? '').trim() || deriveUsernameSeedFromEmail(normalizedEmail);
        const username = await findUniqueUsername(usernameSeed);
        const companyNameFallback = `Azienda ${username}`;
        const { data: createdCompany, error: companyError } = await supabaseAdmin
          .from('companies')
          .insert({ name: companyNameFallback })
          .select('id')
          .single();
        if (companyError || !createdCompany?.id) {
          return NextResponse.json({ error: companyError?.message ?? 'Impossibile creare l’azienda.' }, { status: 500 });
        }

        const { data: createdUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password: rawPassword,
          email_confirm: true,
          user_metadata: { username }
        });
        if (authError || !createdUser.user?.id) {
          await supabaseAdmin.from('companies').delete().eq('id', createdCompany.id);
          return NextResponse.json({ error: authError?.message ?? 'Impossibile creare l’utente.' }, { status: 500 });
        }

        const createdUserId = createdUser.user.id;
        const { error: createdProfileError } = await supabaseAdmin.from('profiles').insert({
          id: createdUserId,
          company_id: createdCompany.id,
          email: normalizedEmail,
          full_name: '',
          username,
          role: 'client_admin'
        });
        if (createdProfileError) {
          await supabaseAdmin.auth.admin.deleteUser(createdUserId);
          await supabaseAdmin.from('companies').delete().eq('id', createdCompany.id);
          return NextResponse.json({ error: createdProfileError.message }, { status: 500 });
        }

        await supabaseAdmin.from('consultant_threads').upsert(
          { company_id: createdCompany.id },
          { onConflict: 'company_id' }
        );

        userId = createdUserId;
        companyId = createdCompany.id;
        profileEmail = normalizedEmail;
      }

      if (!userId || !companyId) {
        return NextResponse.json({ error: 'Accesso non autorizzato per questo onboarding.' }, { status: 403 });
      }

      const normalizedEmail = (providedEmail || profileEmail).trim().toLowerCase();
      if (!normalizedEmail) {
        return NextResponse.json({ error: 'Email utente non disponibile. Riprova.' }, { status: 422 });
      }

      const requestedPracticeType = (parsed.data.practiceType as PracticeType | null | undefined) ?? null;
      const preferredQuizSubmissionId = parsed.data.quizSubmissionId ?? null;
      const requestedApplicationUuid = UUID_LIKE.test(requestedApplicationId ?? '') ? requestedApplicationId : null;
      const resolvedGrantIdentifier = deriveGrantIdentifierFromDashboardInputs({
        grantId: parsed.data.grantId ?? null,
        grantSlug: parsed.data.grantSlug ?? null,
        requestedApplicationId
      });
      let grantIdentifierForResolver = parsed.data.grantId ?? parsed.data.grantSlug ?? null;
      if (!grantIdentifierForResolver && requestedApplicationUuid) {
        const { data: referencedApplication } = await supabaseAdmin
          .from('tender_applications')
          .select('tender_id')
          .eq('id', requestedApplicationUuid)
          .maybeSingle();
        if (referencedApplication?.tender_id) {
          const { data: referencedTender } = await supabaseAdmin
            .from('tenders')
            .select('id, external_grant_id, grant_slug')
            .eq('id', referencedApplication.tender_id)
            .maybeSingle();
          grantIdentifierForResolver =
            referencedTender?.external_grant_id ?? referencedTender?.grant_slug ?? referencedTender?.id ?? null;
        }
      }
      const requestedApplicationForResolver =
        !isAuthenticatedClient && requestedApplicationUuid ? null : requestedApplicationId;

      let application: { id: string; company_id: string; tender_id: string; notes: string | null };
      try {
        const resolved = await resolveCanonicalDashboardApplication({
          admin: supabaseAdmin,
          companyId,
          userId,
          sourceChannel,
          requestedApplicationId: requestedApplicationForResolver,
          grantId: parsed.data.grantId ?? grantIdentifierForResolver,
          grantSlug: parsed.data.grantSlug ?? null
        });
        application = resolved.application;
      } catch (error) {
        if (error instanceof DashboardApplicationResolverError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
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

      const practiceType: PracticeType =
        requestedPracticeType ??
        practiceTypeFromQuizBandoType(quiz?.bando_type) ??
        'generic';

      const applicationId = application.id;
      const dashboardSessionId = `dashboard_${applicationId}`;

      const { data: tender } = await supabaseAdmin
        .from('tenders')
        .select('id, title, grant_slug, external_grant_id')
        .eq('id', application.tender_id)
        .maybeSingle();

      const { data: loadedRequirements, error: requirementsError } = await supabaseAdmin
        .from('practice_document_requirements')
        .select('requirement_key, label, description, is_required, status')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true });

      if (requirementsError && !isMissingPracticeRequirementsTableError(requirementsError)) {
        return NextResponse.json({ error: `Errore caricamento requisiti pratica: ${requirementsError.message}` }, { status: 500 });
      }

      let onboardingRequirements: RequirementRow[] =
        (loadedRequirements as RequirementRow[] | null)?.length
          ? (loadedRequirements as RequirementRow[]).map((requirement) => ({
              ...requirement,
              status: requirement.status ?? 'missing'
            }))
          : [];

      if (onboardingRequirements.length === 0) {
        const requirementGrantId =
          resolvedGrantIdentifier ??
          tender?.external_grant_id ??
          tender?.grant_slug ??
          tender?.id ??
          null;
        if (requirementGrantId) {
          try {
            const [detail, explainability] = await Promise.all([
              fetchGrantDetail(requirementGrantId),
              fetchGrantExplainability(requirementGrantId)
            ]);
            const derived = derivePracticeRequirementsFromGrant(detail, explainability, sourceChannel).map((requirement) => ({
              requirement_key: requirement.requirementKey,
              label: requirement.label,
              description: requirement.description,
              is_required: requirement.isRequired,
              status: 'missing' as const
            }));
            onboardingRequirements = derived;

            const requirementRows = derived.map((requirement) => ({
              application_id: applicationId,
              tender_id: application.tender_id,
              requirement_key: requirement.requirement_key,
              label: requirement.label,
              description: requirement.description,
              is_required: requirement.is_required,
              status: 'missing' as const,
              source_channel: sourceChannel
            }));
            const { error: upsertRequirementsError } = await supabaseAdmin
              .from('practice_document_requirements')
              .upsert(requirementRows, { onConflict: 'application_id,requirement_key' });
            if (upsertRequirementsError && !isMissingPracticeRequirementsTableError(upsertRequirementsError)) {
              return NextResponse.json(
                { error: `Errore sincronizzazione requisiti pratica: ${upsertRequirementsError.message}` },
                { status: 500 }
              );
            }
          } catch {
            onboardingRequirements = buildFallbackRequirements(getPracticeConfig(practiceType).didRequired);
          }
        } else {
          onboardingRequirements = buildFallbackRequirements(getPracticeConfig(practiceType).didRequired);
        }
      }
      onboardingRequirements = sanitizeDashboardRequirements(onboardingRequirements);
      for (const key of Array.from(requirementUploadsByKey.keys())) {
        const upload = requirementUploadsByKey.get(key);
        if (!upload) continue;
        if (isDashboardExcludedRequirement(key, upload.label)) {
          requirementUploadsByKey.delete(key);
        }
      }

      const idRequirement =
        findRequirementByAliases(onboardingRequirements, [
          'documento_identita',
          'documento_riconoscimento',
          'carta_identita',
          'id_document'
        ]) ?? null;
      const taxRequirement =
        findRequirementByAliases(onboardingRequirements, ['codice_fiscale', 'tessera_sanitaria', 'cf']) ?? null;
      const didRequirement =
        findRequirementByAliases(onboardingRequirements, ['certificazione_did', 'did', 'stato_occupazionale']) ?? null;

      if (idDocument instanceof File) {
        const requirementKey = idRequirement?.requirement_key ?? 'documento_identita';
        if (!requirementUploadsByKey.has(requirementKey)) {
          requirementUploadsByKey.set(requirementKey, {
            requirementKey,
            label: idRequirement?.label ?? 'Documento di riconoscimento',
            file: idDocument
          });
        }
      }

      if (taxCodeDocument instanceof File) {
        const requirementKey = taxRequirement?.requirement_key ?? 'codice_fiscale';
        if (!requirementUploadsByKey.has(requirementKey)) {
          requirementUploadsByKey.set(requirementKey, {
            requirementKey,
            label: taxRequirement?.label ?? 'Codice fiscale',
            file: taxCodeDocument
          });
        }
      }

      if (didDocument instanceof File) {
        const requirementKey = didRequirement?.requirement_key ?? 'certificazione_did';
        if (!requirementUploadsByKey.has(requirementKey)) {
          requirementUploadsByKey.set(requirementKey, {
            requirementKey,
            label: didRequirement?.label ?? 'Certificazione DID',
            file: didDocument
          });
        }
      }

      const didRequired = onboardingRequirements.some(
        (requirement) => requirement.is_required && isDidRequirementKey(requirement.requirement_key, requirement.label)
      );
      const quoteRequirement =
        findRequirementByAliases(onboardingRequirements, [
          'preventivi_spesa',
          'preventivi',
          'preventivo',
          'quotazione'
        ]) ?? null;
      const quoteRequirementKey = quoteRequirement?.requirement_key ?? null;

      const consentSnapshot = {
        privacy_accepted: true,
        terms_accepted: true,
        data_and_documents_storage_authorized: true,
        legal_version: LEGAL_LAST_UPDATED,
        captured_at: new Date().toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent ?? null
      };

      let legalStored = false;
      try {
        const { error: legalErr } = await supabaseAdmin.from('legal_consents').upsert(
          {
            context: 'after_payment_onboarding',
            email: normalizedEmail,
            company_id: companyId,
            user_id: userId,
            application_id: applicationId,
            checkout_session_id: dashboardSessionId,
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
          legalStored = false;
        }
      } catch {
        legalStored = false;
      }

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
          session_id: dashboardSessionId,
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
        certificazione_did: didRequired ? 'si' : 'no',
        preventivi_testo: (parsed.data.quotesText?.trim() ?? '') || (currentFields.preventivi_testo as string | undefined) || '',
        onboarding_completed_at: new Date().toISOString(),
        legal_consents: nextLegalConsents,
        legal: {
          ...(typeof currentFields.legal === 'object' && currentFields.legal && !Array.isArray(currentFields.legal)
            ? (currentFields.legal as Record<string, unknown>)
            : {}),
          dashboard_client_onboarding: consentSnapshot
        }
      };

      const { error: crmErr } = await supabaseAdmin.from('company_crm').upsert(
        {
          company_id: companyId,
          admin_fields: nextFields as unknown as Json,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'company_id' }
      );
      const crmStored = !crmErr;

      if (!legalStored && !crmStored) {
        // Non bloccare il completamento onboarding: in alcuni ambienti le tabelle
        // legali/CRM possono non essere ancora disponibili.
        console.warn('[onboarding.complete][dashboard_client] Consensi legali non persistiti su legal_consents/company_crm; procedo senza bloccare.');
      }

      const uploadedRequirementKeys = new Set<string>();
      const uploadedDocumentLabels: string[] = [];

      const uploadApplicationDocument = async (args: { label: string; file: File; requirementKey: string | null }) => {
        const timestamp = Date.now();
        const safeOriginal = safeFileName(args.file.name);
        const safeLabel = safeFileName(args.label).slice(0, 80);
        const fileName = `${safeLabel}__${safeOriginal}`;
        const storagePath = `${companyId}/${applicationId}/${timestamp}_${crypto.randomUUID()}_${fileName}`;
        const fileBuffer = Buffer.from(await args.file.arrayBuffer());

        const { error: storageError } = await supabaseAdmin.storage
          .from('application-documents')
          .upload(storagePath, fileBuffer, {
            contentType: args.file.type || 'application/octet-stream',
            upsert: false
          });

        if (storageError) {
          return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
        }

        const baseDocumentPayload = {
          application_id: applicationId,
          uploaded_by: userId,
          file_name: fileName,
          storage_path: storagePath,
          file_size: args.file.size,
          mime_type: args.file.type || 'application/octet-stream'
        };

        const payloadWithRequirement =
          args.requirementKey
            ? { ...baseDocumentPayload, requirement_key: args.requirementKey }
            : baseDocumentPayload;

        let { error: docError } = await supabaseAdmin.from('application_documents').insert(payloadWithRequirement);
        if (docError && args.requirementKey && isMissingApplicationDocumentRequirementKeyColumnError(docError)) {
          const retry = await supabaseAdmin.from('application_documents').insert(baseDocumentPayload);
          docError = retry.error;
        }

        if (docError) {
          return NextResponse.json({ error: `Inserimento documento fallito: ${docError.message}` }, { status: 500 });
        }

        if (args.requirementKey) {
          uploadedRequirementKeys.add(args.requirementKey);
        }
        uploadedDocumentLabels.push(args.label);
        return null;
      };

      for (const upload of requirementUploadsByKey.values()) {
        const uploadResult = await uploadApplicationDocument({
          label: upload.label,
          file: upload.file,
          requirementKey: upload.requirementKey
        });
        if (uploadResult) return uploadResult;
      }

      for (const file of quoteFiles) {
        const uploadResult = await uploadApplicationDocument({
          label: 'Preventivo spesa',
          file,
          requirementKey: quoteRequirementKey
        });
        if (uploadResult) return uploadResult;
      }

      const removedRequirementKeys = new Set(formData.getAll('removedRequirementKeys').map(String));

      const { data: existingRequirementDocs, error: existingRequirementDocsError } = await supabaseAdmin
        .from('application_documents')
        .select('requirement_key')
        .eq('application_id', applicationId);

      const existingUploadedRequirementKeys = new Set(
        (isMissingApplicationDocumentRequirementKeyColumnError(existingRequirementDocsError) ? [] : (existingRequirementDocs ?? []))
          .map((row) => (typeof row.requirement_key === 'string' ? row.requirement_key.trim() : ''))
          .filter((key) => key && !removedRequirementKeys.has(key))
      );

      if (removedRequirementKeys.size > 0) {
        await supabaseAdmin
          .from('application_documents')
          .delete()
          .eq('application_id', applicationId)
          .in('requirement_key', Array.from(removedRequirementKeys.values()));
      }
      const mergedUploadedRequirementKeys = new Set([
        ...Array.from(existingUploadedRequirementKeys.values()),
        ...Array.from(uploadedRequirementKeys.values())
      ]);

      const { count: canonicalDocumentsCount, error: canonicalDocumentsCountError } = await supabaseAdmin
        .from('application_documents')
        .select('id', { count: 'exact', head: true })
        .eq('application_id', applicationId);
      if (canonicalDocumentsCountError) {
        console.warn('[onboarding.complete][dashboard_client] document count check failed', {
          applicationId,
          reason: canonicalDocumentsCountError.message
        });
      } else if (uploadedDocumentLabels.length > 0 && (canonicalDocumentsCount ?? 0) === 0) {
        console.warn('[onboarding.complete][dashboard_client] document mismatch detected', {
          applicationId,
          uploadedDocumentLabels
        });
      }

      if (requestedApplicationUuid && requestedApplicationUuid !== applicationId) {
        const { count: requestedDocumentsCount } = await supabaseAdmin
          .from('application_documents')
          .select('id', { count: 'exact', head: true })
          .eq('application_id', requestedApplicationUuid);
        console.warn('[onboarding.complete][dashboard_client] canonical application override', {
          requestedApplicationId: requestedApplicationUuid,
          canonicalApplicationId: applicationId,
          canonicalDocumentsCount: canonicalDocumentsCount ?? 0,
          requestedDocumentsCount: requestedDocumentsCount ?? 0
        });
      }

      const requiredKeys = onboardingRequirements
        .filter((requirement) => requirement.is_required)
        .map((requirement) => requirement.requirement_key);
      const missingRequiredKeys = requiredKeys.filter((key) => !mergedUploadedRequirementKeys.has(key));
      const missingRequiredLabels = onboardingRequirements
        .filter((requirement) => requirement.is_required && missingRequiredKeys.includes(requirement.requirement_key))
        .map((requirement) => requirement.label);

      if (!isMissingPracticeRequirementsTableError(requirementsError)) {
        if (uploadedRequirementKeys.size > 0) {
          const { error: uploadedStatusError } = await supabaseAdmin
            .from('practice_document_requirements')
            .update({ status: 'uploaded' })
            .eq('application_id', applicationId)
            .in('requirement_key', Array.from(uploadedRequirementKeys.values()));
          if (uploadedStatusError && !isMissingPracticeRequirementsTableError(uploadedStatusError)) {
            return NextResponse.json({ error: `Aggiornamento requisiti fallito: ${uploadedStatusError.message}` }, { status: 500 });
          }
        }

        if (missingRequiredKeys.length > 0) {
          const { error: missingStatusError } = await supabaseAdmin
            .from('practice_document_requirements')
            .update({ status: 'missing' })
            .eq('application_id', applicationId)
            .in('requirement_key', missingRequiredKeys);
          if (missingStatusError && !isMissingPracticeRequirementsTableError(missingStatusError)) {
            return NextResponse.json({ error: `Aggiornamento requisiti mancanti fallito: ${missingStatusError.message}` }, { status: 500 });
          }
        }
      }

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

        const uploadedLabelsSummary = uploadedDocumentLabels.length
          ? Array.from(new Set(uploadedDocumentLabels)).join(', ')
          : 'Nessun documento nuovo (gia presenti in pratica)';
        const lines = [
          '[ONBOARDING DASHBOARD]',
          `Pratica: ${tender?.title ?? practiceTitle(practiceType)}`,
          `Documenti caricati: ${uploadedLabelsSummary}`,
          `Documenti mancanti: ${missingRequiredLabels.length ? missingRequiredLabels.join(', ') : 'Nessuno'}`,
          `PEC: ${parsed.data.pec}`,
          `Firma digitale: ${parsed.data.digitalSignature === 'yes' ? 'Si' : 'No'}`,
          parsed.data.quotesText?.trim() ? `Preventivi/Spese (testo):\n${parsed.data.quotesText.trim()}` : null,
          parsed.data.projectSummary ? `Sintesi progetto: ${parsed.data.projectSummary}` : null
        ].filter(Boolean) as string[];

        await supabaseAdmin.from('consultant_messages').insert({
          thread_id: threadId,
          sender_profile_id: userId,
          body: lines.join('\n')
        });

        await ensureOpsAutoReply(threadId);
      }

      const onboardingNote =
        missingRequiredKeys.length > 0
          ? 'Onboarding dashboard completato. Alcuni documenti risultano ancora mancanti.'
          : 'Onboarding dashboard completato. Documentazione principale caricata.';
      const nextNotes = upsertProgressIntoNotes(
        [application.notes ?? '', onboardingNote].filter(Boolean).join('\n'),
        'docs_collection'
      );

      await supabaseAdmin.from('tender_applications').update({ notes: nextNotes }).eq('id', applicationId);

      await notifyAdminOnboardingCompleted({
        applicationId,
        companyId,
        userId,
        onboardingMode: 'dashboard_client',
        sourceChannel,
        practiceLabel: tender?.title ?? practiceTitle(practiceType),
        uploadedDocumentLabels,
        missingRequiredLabels,
        pec: parsed.data.pec,
        digitalSignature: parsed.data.digitalSignature,
        quoteFilesCount: quoteFiles.length,
        quotesText: parsed.data.quotesText ?? null,
        paymentSummary: 'Non richiesto (onboarding dashboard)'
      });

      return NextResponse.json(
        {
          ok: true,
          sessionId: dashboardSessionId,
          companyId,
          userId,
          applicationId,
          practiceType,
          alreadyProvisioned: isAuthenticatedClient,
          requiresAutoLogin: !isAuthenticatedClient
        },
        { status: 200 }
      );
    }

    // Determine practice type early for conditional validation.
    const requestedPracticeType = (parsed.data.practiceType as PracticeType | null | undefined) ?? null;
    let paymentRecord = providedSessionId ? await getPracticePaymentBySession(providedSessionId) : null;
    const paymentPracticeType = resolvePracticeTypeFromAny(paymentRecord?.practice_type ?? null);

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
              fallbackApplicationId: requestedApplicationId ?? paymentRecord?.application_id ?? null,
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
              fallbackApplicationId: requestedApplicationId ?? paymentRecord?.application_id ?? null,
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

    if (!manualOnboardingEnabled && !paymentDeferred && (!paymentRecord || paymentRecord.status !== 'paid')) {
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

    const quotesText = parsed.data.quotesText?.trim() ?? '';
    if (!quoteFiles.length && !quotesText) {
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

    if (requestedApplicationId && paymentRecord?.application_id && requestedApplicationId !== paymentRecord.application_id) {
      return NextResponse.json({ error: 'applicationId non coerente con la sessione di pagamento.' }, { status: 409 });
    }

    let applicationId = requestedApplicationId ?? paymentRecord?.application_id ?? null;
    if (applicationId) {
      const { data: existingApplication } = await supabaseAdmin
        .from('tender_applications')
        .select('id, company_id')
        .eq('id', applicationId)
        .maybeSingle();

      if (!existingApplication?.id) {
        if (requestedApplicationId) {
          return NextResponse.json({ error: 'Pratica non trovata per applicationId indicato.' }, { status: 404 });
        }
        applicationId = null;
      } else if (existingApplication.company_id !== companyId) {
        return NextResponse.json({ error: 'La pratica indicata non appartiene al cliente corrente.' }, { status: 409 });
      }
    }

    if (!applicationId) {
      const ensured = await ensureBandoApplication(supabaseAdmin, companyId, practiceType);
      applicationId = ensured.applicationId;
    }

    const { data: loadedRequirements, error: requirementsError } = await supabaseAdmin
      .from('practice_document_requirements')
      .select('requirement_key, label, description, is_required, status')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });

    if (requirementsError && !isMissingPracticeRequirementsTableError(requirementsError)) {
      return NextResponse.json({ error: `Errore caricamento requisiti pratica: ${requirementsError.message}` }, { status: 500 });
    }

    const onboardingRequirements: RequirementRow[] =
      (loadedRequirements as RequirementRow[] | null)?.length
        ? (loadedRequirements as RequirementRow[]).map((requirement) => ({
            ...requirement,
            status: requirement.status ?? 'missing'
          }))
        : buildFallbackRequirements(getPracticeConfig(practiceType).didRequired);

    const idRequirement =
      findRequirementByAliases(onboardingRequirements, [
        'documento_identita',
        'documento_riconoscimento',
        'carta_identita',
        'id_document'
      ]) ?? null;
    const taxRequirement =
      findRequirementByAliases(onboardingRequirements, ['codice_fiscale', 'tessera_sanitaria', 'cf']) ?? null;
    const didRequirement =
      findRequirementByAliases(onboardingRequirements, ['certificazione_did', 'did', 'stato_occupazionale']) ?? null;

    if (idDocument instanceof File) {
      const requirementKey = idRequirement?.requirement_key ?? 'documento_identita';
      if (!requirementUploadsByKey.has(requirementKey)) {
        requirementUploadsByKey.set(requirementKey, {
          requirementKey,
          label: idRequirement?.label ?? 'Documento di riconoscimento',
          file: idDocument
        });
      }
    }

    if (taxCodeDocument instanceof File) {
      const requirementKey = taxRequirement?.requirement_key ?? 'codice_fiscale';
      if (!requirementUploadsByKey.has(requirementKey)) {
        requirementUploadsByKey.set(requirementKey, {
          requirementKey,
          label: taxRequirement?.label ?? 'Codice fiscale',
          file: taxCodeDocument
        });
      }
    }

    if (didDocument instanceof File) {
      const requirementKey = didRequirement?.requirement_key ?? 'certificazione_did';
      if (!requirementUploadsByKey.has(requirementKey)) {
        requirementUploadsByKey.set(requirementKey, {
          requirementKey,
          label: didRequirement?.label ?? 'Certificazione DID',
          file: didDocument
        });
      }
    }

    const didRequired = onboardingRequirements.some(
      (requirement) => requirement.is_required && isDidRequirementKey(requirement.requirement_key, requirement.label)
    );
    const quoteRequirement =
      findRequirementByAliases(onboardingRequirements, [
        'preventivi_spesa',
        'preventivi',
        'preventivo',
        'quotazione'
      ]) ?? null;
    const quoteRequirementKey = quoteRequirement?.requirement_key ?? null;
    const quoteRequirementSatisfied = Boolean(quoteRequirementKey) && (quoteFiles.length > 0 || Boolean(quotesText));

    const { data: existingRequirementDocs, error: existingRequirementDocsError } = await supabaseAdmin
      .from('application_documents')
      .select('requirement_key')
      .eq('application_id', applicationId);

    const existingUploadedRequirementKeys = new Set(
      (isMissingApplicationDocumentRequirementKeyColumnError(existingRequirementDocsError) ? [] : (existingRequirementDocs ?? []))
        .map((row) => (typeof row.requirement_key === 'string' ? row.requirement_key.trim() : ''))
        .filter(Boolean)
    );

    const missingRequiredRequirements = onboardingRequirements.filter((requirement) => {
      if (!requirement.is_required) return false;
      const key = requirement.requirement_key.trim();
      if (quoteRequirementSatisfied && quoteRequirementKey === key) return false;
      return !requirementUploadsByKey.has(key) && !existingUploadedRequirementKeys.has(key);
    });

    if (missingRequiredRequirements.length > 0) {
      return NextResponse.json(
        {
          error: `Carica i documenti obbligatori mancanti: ${missingRequiredRequirements
            .map((requirement) => requirement.label)
            .join(', ')}.`
        },
        { status: 422 }
      );
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
      certificazione_did: didRequired ? 'si' : 'no',
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

    const { error: crmErr } = await supabaseAdmin.from('company_crm').upsert(
      {
        company_id: companyId,
        admin_fields: nextFields as unknown as Json,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id' }
    );
    const crmStored = !crmErr;

    // Non bloccare il completamento onboarding: in alcuni ambienti le tabelle
    // legali/CRM possono non essere ancora disponibili.
    if (!legalStored && !crmStored) {
      console.warn('[onboarding.complete][legacy] Consensi legali non persistiti su legal_consents/company_crm; procedo senza bloccare.');
    }

    const uploadedRequirementKeys = new Set<string>();
    const uploadedDocumentLabels: string[] = [];

    const uploadApplicationDocument = async (args: { label: string; file: File; requirementKey: string | null }) => {
      const timestamp = Date.now();
      const safeOriginal = safeFileName(args.file.name);
      const safeLabel = safeFileName(args.label).slice(0, 80);
      const fileName = `${safeLabel}__${safeOriginal}`;
      const storagePath = `${companyId}/${applicationId}/${timestamp}_${fileName}`;
      const fileBuffer = Buffer.from(await args.file.arrayBuffer());

      const { error: storageError } = await supabaseAdmin.storage
        .from('application-documents')
        .upload(storagePath, fileBuffer, {
          contentType: args.file.type || 'application/octet-stream',
          upsert: false
        });

      if (storageError) {
        return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
      }

      const baseDocumentPayload = {
        application_id: applicationId,
        uploaded_by: userId,
        file_name: fileName,
        storage_path: storagePath,
        file_size: args.file.size,
        mime_type: args.file.type || 'application/octet-stream'
      };

      const payloadWithRequirement =
        args.requirementKey
          ? { ...baseDocumentPayload, requirement_key: args.requirementKey }
          : baseDocumentPayload;

      let { error: docError } = await supabaseAdmin.from('application_documents').insert(payloadWithRequirement);
      if (docError && args.requirementKey && isMissingApplicationDocumentRequirementKeyColumnError(docError)) {
        const retry = await supabaseAdmin.from('application_documents').insert(baseDocumentPayload);
        docError = retry.error;
      }

      if (docError) {
        return NextResponse.json({ error: `Inserimento documento fallito: ${docError.message}` }, { status: 500 });
      }

      if (args.requirementKey) {
        uploadedRequirementKeys.add(args.requirementKey);
      }
      uploadedDocumentLabels.push(args.label);
      return null;
    };

    for (const upload of requirementUploadsByKey.values()) {
      const uploadResult = await uploadApplicationDocument({
        label: upload.label,
        file: upload.file,
        requirementKey: upload.requirementKey
      });
      if (uploadResult) return uploadResult;
    }

    for (const file of quoteFiles) {
      const uploadResult = await uploadApplicationDocument({
        label: 'Preventivo spesa',
        file,
        requirementKey: quoteRequirementKey
      });
      if (uploadResult) return uploadResult;
    }

    const mergedUploadedRequirementKeys = new Set([
      ...Array.from(existingUploadedRequirementKeys.values()),
      ...Array.from(uploadedRequirementKeys.values())
    ]);
    const requiredKeys = onboardingRequirements
      .filter((requirement) => requirement.is_required)
      .map((requirement) => requirement.requirement_key);
    const missingRequiredKeys = requiredKeys.filter((key) => !mergedUploadedRequirementKeys.has(key));
    const missingRequiredLabels = onboardingRequirements
      .filter((requirement) => requirement.is_required && missingRequiredKeys.includes(requirement.requirement_key))
      .map((requirement) => requirement.label);

    if (!isMissingPracticeRequirementsTableError(requirementsError)) {
      if (uploadedRequirementKeys.size > 0) {
        const { error: uploadedStatusError } = await supabaseAdmin
          .from('practice_document_requirements')
          .update({ status: 'uploaded' })
          .eq('application_id', applicationId)
          .in('requirement_key', Array.from(uploadedRequirementKeys.values()));
        if (uploadedStatusError && !isMissingPracticeRequirementsTableError(uploadedStatusError)) {
          return NextResponse.json({ error: `Aggiornamento requisiti fallito: ${uploadedStatusError.message}` }, { status: 500 });
        }
      }

      if (missingRequiredKeys.length > 0) {
        const { error: missingStatusError } = await supabaseAdmin
          .from('practice_document_requirements')
          .update({ status: 'missing' })
          .eq('application_id', applicationId)
          .in('requirement_key', missingRequiredKeys);
        if (missingStatusError && !isMissingPracticeRequirementsTableError(missingStatusError)) {
          return NextResponse.json({ error: `Aggiornamento requisiti mancanti fallito: ${missingStatusError.message}` }, { status: 500 });
        }
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
      const uploadedLabelsSummary = uploadedDocumentLabels.length
        ? Array.from(new Set(uploadedDocumentLabels)).join(', ')
        : 'Nessun documento nuovo (gia presenti in pratica)';
      const lines = [
        '[AVVIO PRATICA]',
        `Pratica: ${practiceLabel}`,
        `Pagamento anticipo: ${amountPaid ? `${amountPaid} ${String(currency ?? '').toUpperCase()}` : 'OK'}`,
        `Documenti caricati: ${uploadedLabelsSummary}`,
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
    }

    // Ensure practice progress marker (payment/mandate activated).
    const { data: appRow } = await supabaseAdmin
      .from('tender_applications')
      .select('id, notes')
      .eq('id', applicationId)
      .maybeSingle();

    const baseNote = 'Pagamento anticipo completato. Documenti base caricati. In attesa documenti integrativi.';
    const nextNotes = upsertProgressIntoNotes([appRow?.notes ?? '', baseNote].filter(Boolean).join('\n'), 'contract_active');

    await supabaseAdmin.from('tender_applications').update({ notes: nextNotes }).eq('id', applicationId);

    await notifyAdminOnboardingCompleted({
      applicationId,
      companyId,
      userId,
      onboardingMode,
      sourceChannel,
      practiceLabel: practiceTitle(practiceType),
      uploadedDocumentLabels,
      missingRequiredLabels,
      pec: parsed.data.pec,
      digitalSignature: parsed.data.digitalSignature,
      quoteFilesCount: quoteFiles.length,
      quotesText,
      paymentSummary: amountPaid ? `${amountPaid} ${String(currency ?? '').toUpperCase()}` : 'Completato'
    });

    if (providedSessionId) {
      await markPaymentOnboardingCompleted({
        sessionId: providedSessionId,
        companyId,
        userId,
        applicationId,
      });
    }

    // Store a lead entry (useful for ops tracking).
    await supabaseAdmin.from('leads').insert({
      full_name: displayName,
      email: normalizedEmail,
      company_name: displayName,
      phone: quiz?.phone ?? null,
      challenge: `Pagamento anticipo + onboarding base docs | Pratica: ${practiceTitle(practiceType)} | Quiz: ${quiz?.id ?? 'N/D'}`
    });

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
    return NextResponse.json({ error: publicError(error, 'Errore onboarding. Riprova tra qualche secondo.') }, { status: 500 });
  }
}
