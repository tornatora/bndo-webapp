import type { SupabaseClient } from '@supabase/supabase-js';
import { ensurePracticeFlow, type PracticeSourceChannel } from '@/lib/practices/orchestrator';
import type { Database } from '@/lib/supabase/database.types';

type AdminClient = SupabaseClient<Database>;

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DashboardApplicationRow = Pick<
  Database['public']['Tables']['tender_applications']['Row'],
  'id' | 'company_id' | 'tender_id' | 'notes'
>;

export class DashboardApplicationResolverError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = 'DashboardApplicationResolverError';
    this.status = status;
  }
}

export function deriveGrantIdentifierFromDashboardInputs(args: {
  grantId?: string | null;
  grantSlug?: string | null;
  requestedApplicationId?: string | null;
}) {
  const direct =
    String(args.grantId ?? '').trim() ||
    String(args.grantSlug ?? '').trim();
  if (direct) return direct;

  const requested = String(args.requestedApplicationId ?? '').trim();
  if (!requested || UUID_LIKE.test(requested)) return null;
  if (requested.startsWith('public-')) {
    const legacyGrant = requested.replace(/^public-/, '').trim();
    return legacyGrant || null;
  }
  return null;
}

async function loadOwnedApplication(args: {
  admin: AdminClient;
  applicationId: string;
  companyId: string;
}) {
  const { data, error } = await args.admin
    .from('tender_applications')
    .select('id, company_id, tender_id, notes')
    .eq('id', args.applicationId)
    .maybeSingle();

  if (error) {
    throw new DashboardApplicationResolverError(
      `Errore caricamento pratica: ${error.message}`,
      500
    );
  }
  if (!data?.id) {
    throw new DashboardApplicationResolverError(
      'Pratica non trovata per applicationId indicato.',
      404
    );
  }
  if (data.company_id !== args.companyId) {
    throw new DashboardApplicationResolverError(
      'La pratica indicata non appartiene alla tua azienda.',
      403
    );
  }
  return data satisfies DashboardApplicationRow;
}

export async function resolveCanonicalDashboardApplication(args: {
  admin: AdminClient;
  companyId: string;
  userId: string;
  sourceChannel: PracticeSourceChannel;
  requestedApplicationId?: string | null;
  grantId?: string | null;
  grantSlug?: string | null;
}) {
  const requestedApplicationId = String(args.requestedApplicationId ?? '').trim();
  const requestedApplicationUuid = UUID_LIKE.test(requestedApplicationId)
    ? requestedApplicationId
    : null;

  if (requestedApplicationUuid) {
    const application = await loadOwnedApplication({
      admin: args.admin,
      applicationId: requestedApplicationUuid,
      companyId: args.companyId
    });
    return {
      application,
      canonicalApplicationId: application.id,
      resolvedBy: 'application_id' as const
    };
  }

  const grantIdentifier = deriveGrantIdentifierFromDashboardInputs({
    grantId: args.grantId,
    grantSlug: args.grantSlug,
    requestedApplicationId
  });
  if (!grantIdentifier) {
    throw new DashboardApplicationResolverError(
      'Mancano i riferimenti della pratica. Riapri l’onboarding dal dettaglio bando o dallo scanner.',
      422
    );
  }

  const flow = await ensurePracticeFlow(args.admin, {
    companyId: args.companyId,
    userId: args.userId,
    grantId: grantIdentifier,
    sourceChannel: args.sourceChannel
  });

  const application = await loadOwnedApplication({
    admin: args.admin,
    applicationId: flow.applicationId,
    companyId: args.companyId
  });

  return {
    application,
    canonicalApplicationId: application.id,
    resolvedBy: 'grant_flow' as const
  };
}
