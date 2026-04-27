import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getOnboardingApplicationState,
  readOnboardingApplicationMap,
  readLegacyOnboardingDraft,
  upsertOnboardingApplicationState
} from '@/lib/onboarding/practiceOnboardingState';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation
} from '@/lib/security/http';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { practiceTypeFromGrantSlug } from '@/lib/bandi';

export const runtime = 'nodejs';

const PatchSchema = z
  .object({
    pec: z.string().trim().max(160).optional(),
    digitalSignature: z.enum(['yes', 'no', '']).optional(),
    quotesText: z.string().trim().max(2500).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nessun campo da aggiornare.' });

async function resolveAccess(args: { applicationId: string; userId: string }) {
  const admin = getSupabaseAdmin();
  const [{ data: profile }, { data: applicationRow }] = await Promise.all([
    admin.from('profiles').select('id, role, company_id').eq('id', args.userId).maybeSingle(),
    admin
      .from('tender_applications')
      .select('id, company_id, tender_id')
      .eq('id', args.applicationId)
      .maybeSingle()
  ]);

  if (!profile?.id || !profile.role) {
    return { ok: false as const, status: 403, error: 'Profilo non autorizzato.' };
  }
  if (!applicationRow?.id || !applicationRow.company_id) {
    return { ok: false as const, status: 404, error: 'Pratica non trovata.' };
  }

  let tenderGrantSlug: string | null = null;
  if (applicationRow.tender_id) {
    const { data: tender } = await admin
      .from('tenders')
      .select('grant_slug, external_grant_id')
      .eq('id', applicationRow.tender_id)
      .maybeSingle();
    tenderGrantSlug = tender?.grant_slug ?? tender?.external_grant_id ?? null;
  }

  const isOps = profile.role === 'ops_admin';
  const isClientOwner = profile.role === 'client_admin' && profile.company_id === applicationRow.company_id;

  let isAssignedConsultant = false;
  if (profile.role === 'consultant') {
    const assignment = await (admin as any)
      .from('consultant_practice_assignments')
      .select('application_id')
      .eq('application_id', applicationRow.id)
      .eq('consultant_profile_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();
    if (assignment.error && isMissingTable(assignment.error, 'consultant_practice_assignments')) {
      const thread = await admin
        .from('consultant_threads')
        .select('id')
        .eq('company_id', applicationRow.company_id)
        .maybeSingle();
      if (thread.data?.id) {
        const participant = await admin
          .from('consultant_thread_participants')
          .select('profile_id')
          .eq('thread_id', thread.data.id)
          .eq('profile_id', profile.id)
          .eq('participant_role', 'consultant')
          .maybeSingle();
        isAssignedConsultant = Boolean(participant.data?.profile_id);
      }
    } else {
      isAssignedConsultant = Boolean((assignment.data as { application_id?: string } | null)?.application_id);
    }
  }

  if (!isOps && !isClientOwner && !isAssignedConsultant) {
    return { ok: false as const, status: 403, error: 'Non hai i permessi per visualizzare questa pratica.' };
  }

  return {
    ok: true as const,
    profile,
    application: {
      id: applicationRow.id,
      companyId: applicationRow.company_id,
      grantSlug: tenderGrantSlug
    }
  };
}

function buildResponsePayload(args: {
  applicationId: string;
  adminFields: Record<string, unknown>;
  isAdminViewer: boolean;
  applicationGrantSlug?: string | null;
}) {
  const onboardingMap = readOnboardingApplicationMap(args.adminFields);
  let state = getOnboardingApplicationState({
    adminFields: args.adminFields,
    applicationId: args.applicationId
  });
  if (!state) {
    const targetPracticeType = practiceTypeFromGrantSlug(args.applicationGrantSlug ?? null);
    if (targetPracticeType) {
      const samePracticeStates = Object.values(onboardingMap).filter(
        (candidate) =>
          candidate.practiceType === targetPracticeType ||
          practiceTypeFromGrantSlug(candidate.grantSlug ?? null) === targetPracticeType
      );
      if (samePracticeStates.length === 1) {
        state = samePracticeStates[0];
      }
    }
  }
  if (!state) {
    const allStates = Object.values(onboardingMap);
    if (allStates.length === 1) {
      state = allStates[0];
    }
  }
  const legacyDraft = state
    ? null
    : readLegacyOnboardingDraft({
        adminFields: args.adminFields,
        applicationId: args.applicationId
      });

  const fallbackPec =
    typeof args.adminFields.pec === 'string' && args.adminFields.pec.trim()
      ? args.adminFields.pec.trim()
      : '';
  const fallbackSignatureToken = String(args.adminFields.firma_digitale ?? '').trim().toLowerCase();
  const fallbackDigitalSignature: 'yes' | 'no' | '' =
    fallbackSignatureToken === 'si' || fallbackSignatureToken === 'yes'
      ? 'yes'
      : fallbackSignatureToken === 'no'
        ? 'no'
        : '';
  const fallbackQuotesText =
    typeof args.adminFields.preventivi_testo === 'string' && args.adminFields.preventivi_testo.trim()
      ? args.adminFields.preventivi_testo.trim()
      : '';

  const firstNonEmpty = (...values: Array<string | undefined | null>) => {
    for (const value of values) {
      if (typeof value !== 'string') continue;
      const normalized = value.trim();
      if (normalized) return normalized;
    }
    return '';
  };

  const firstSignature = (...values: Array<'yes' | 'no' | '' | undefined | null>): 'yes' | 'no' | '' => {
    for (const value of values) {
      if (value === 'yes' || value === 'no') return value;
    }
    return '';
  };

  return {
    ok: true,
    applicationId: args.applicationId,
    fields: {
      pec: firstNonEmpty(state?.fields.pec, legacyDraft?.pec, fallbackPec),
      digitalSignature: firstSignature(
        state?.fields.digitalSignature,
        legacyDraft?.digitalSignature,
        fallbackDigitalSignature
      ),
      quotesText: firstNonEmpty(state?.fields.quotesText, legacyDraft?.quotesText, fallbackQuotesText)
    },
    onboarding: {
      status: state?.status ?? (legacyDraft ? 'draft' : null),
      currentStep: state?.currentStep ?? legacyDraft?.currentStep ?? null,
      completedSteps: state?.completedSteps ?? legacyDraft?.completedSteps ?? [],
      updatedAt: state?.updatedAt ?? legacyDraft?.savedAt ?? null,
      completedAt: state?.completedAt ?? null,
      documents: state?.onboardingDocuments ?? []
    },
    meta: args.isAdminViewer
      ? {
          history: state?.history ?? [],
          onboardingDocumentIds: state?.onboardingDocumentIds ?? []
        }
      : null
  };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const rateLimit = enforceRateLimit({
      namespace: 'practice-onboarding-business-get',
      key: getClientIp(request),
      limit: 80,
      windowMs: 60_000
    });
    if (rateLimit) return rateLimit;

    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const access = await resolveAccess({ applicationId: params.id, userId: user.id });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const admin = getSupabaseAdmin();
    const { data: crm } = await admin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', access.application.companyId)
      .maybeSingle();

    const adminFields = (crm?.admin_fields ?? {}) as Record<string, unknown>;
    return NextResponse.json(
      buildResponsePayload({
        applicationId: access.application.id,
        adminFields,
        isAdminViewer: access.profile.role === 'ops_admin',
        applicationGrantSlug: access.application.grantSlug ?? null
      })
    );
  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore caricamento dati onboarding pratica.') }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'practice-onboarding-business-patch',
      key: getClientIp(request),
      limit: 40,
      windowMs: 10 * 60_000
    });
    if (rateLimit) return rateLimit;

    const body = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Dati aggiornamento non validi.' }, { status: 422 });
    }

    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const access = await resolveAccess({ applicationId: params.id, userId: user.id });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const admin = getSupabaseAdmin();
    const { data: crm } = await admin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', access.application.companyId)
      .maybeSingle();
    const adminFields = (crm?.admin_fields ?? {}) as Record<string, unknown>;
    const existingState = getOnboardingApplicationState({
      adminFields,
      applicationId: access.application.id
    });

    const snapshot = upsertOnboardingApplicationState({
      adminFields,
      applicationId: access.application.id,
      action: 'edit_fields',
      actorProfileId: access.profile.id,
      actorRole: access.profile.role,
      status: existingState?.status ?? 'draft',
      grantSlug: existingState?.grantSlug ?? access.application.grantSlug,
      sourceChannel: existingState?.sourceChannel ?? null,
      practiceType: existingState?.practiceType ?? null,
      currentStep: existingState?.currentStep ?? null,
      completedSteps: existingState?.completedSteps ?? [],
      fieldPatch: {
        pec: body.data.pec,
        digitalSignature: body.data.digitalSignature,
        quotesText: body.data.quotesText
      }
    });

    const mergedFields = {
      ...snapshot.nextAdminFields,
      pec: snapshot.state.fields.pec,
      firma_digitale:
        snapshot.state.fields.digitalSignature === 'yes'
          ? 'si'
          : snapshot.state.fields.digitalSignature === 'no'
            ? 'no'
            : '',
      preventivi_testo: snapshot.state.fields.quotesText
    } as Record<string, unknown>;

    await admin.from('company_crm').upsert(
      {
        company_id: access.application.companyId,
        admin_fields: mergedFields as Json,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id' }
    );

    return NextResponse.json(
      buildResponsePayload({
        applicationId: access.application.id,
        adminFields: mergedFields,
        isAdminViewer: access.profile.role === 'ops_admin',
        applicationGrantSlug: access.application.grantSlug ?? null
      })
    );
  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore aggiornamento dati onboarding pratica.') }, { status: 500 });
  }
}
