import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  DashboardApplicationResolverError,
  resolveCanonicalDashboardApplication
} from '@/lib/onboarding/dashboardApplicationResolver';
import { removeOnboardingApplicationState } from '@/lib/onboarding/practiceOnboardingState';
import type { PracticeSourceChannel } from '@/lib/practices/orchestrator';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation
} from '@/lib/security/http';

export const runtime = 'nodejs';

const BodySchema = z.object({
  applicationId: z.string().uuid().optional().nullable(),
  grantId: z.string().trim().min(1).optional().nullable(),
  grantSlug: z.string().trim().min(1).optional().nullable(),
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord', 'generic']).optional().nullable(),
  sourceChannel: z.enum(['scanner', 'chat', 'direct', 'admin']).optional().nullable()
});

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'onboarding-reset-progress',
      key: getClientIp(request),
      limit: 30,
      windowMs: 10 * 60_000
    });
    if (rateLimit) return rateLimit;

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati non validi per reset onboarding.' }, { status: 422 });
    }

    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sessione non valida. Effettua l’accesso e riprova.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, company_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.id || profile.role !== 'client_admin' || !profile.company_id) {
      return NextResponse.json({ error: 'Profilo non autorizzato al reset onboarding.' }, { status: 403 });
    }

    const sourceChannel: PracticeSourceChannel = parsed.data.sourceChannel ?? 'direct';

    let canonicalApplicationId: string;
    try {
      const resolved = await resolveCanonicalDashboardApplication({
        admin,
        companyId: profile.company_id,
        userId: profile.id,
        sourceChannel,
        requestedApplicationId: parsed.data.applicationId ?? null,
        grantId: parsed.data.grantId ?? null,
        grantSlug: parsed.data.grantSlug ?? null
      });
      canonicalApplicationId = resolved.canonicalApplicationId;
    } catch (error) {
      if (error instanceof DashboardApplicationResolverError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const nowIso = new Date().toISOString();
    const { data: crm } = await admin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', profile.company_id)
      .maybeSingle();
    const removed = removeOnboardingApplicationState({
      adminFields: (crm?.admin_fields ?? {}) as Record<string, unknown>,
      applicationId: canonicalApplicationId
    });

    await admin.from('company_crm').upsert(
      {
        company_id: profile.company_id,
        admin_fields: removed.nextAdminFieldsJson,
        updated_at: nowIso
      },
      { onConflict: 'company_id' }
    );

    const { data: payments } = await admin
      .from('practice_payments')
      .select('id, metadata, onboarding_status')
      .eq('application_id', canonicalApplicationId)
      .order('updated_at', { ascending: false })
      .limit(20);

    for (const payment of payments ?? []) {
      const baseMetadata =
        payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
          ? ({ ...(payment.metadata as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      if (Object.prototype.hasOwnProperty.call(baseMetadata, 'onboarding_wizard')) {
        delete baseMetadata.onboarding_wizard;
      }

      await admin
        .from('practice_payments')
        .update({
          metadata: baseMetadata as Json,
          onboarding_status: payment.onboarding_status === 'completed' ? 'completed' : 'not_started',
          updated_at: nowIso
        })
        .eq('id', payment.id);
    }

    return NextResponse.json({
      ok: true,
      applicationId: canonicalApplicationId
    });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore reset progressi onboarding.') }, { status: 500 });
  }
}
