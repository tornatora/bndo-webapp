import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import {
  ensurePracticeThreadCompat,
  touchParticipantReadCompat,
  type ViewerRole,
} from '@/lib/dashboard/practice-messages';

const ParamsSchema = z.object({
  applicationId: z.string().uuid(),
});

type ViewerProfile = {
  id: string;
  company_id: string | null;
  role: ViewerRole;
};

async function getViewerProfile() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) as NextResponse };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return { supabase, error: NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 }) as NextResponse };
  }

  return { supabase, profile: profile as ViewerProfile };
}

async function resolveApplication(args: {
  supabase: any;
  applicationId: string;
  companyId: string;
}) {
  const { supabase, applicationId, companyId } = args;
  const { data: application, error } = await supabase
    .from('tender_applications')
    .select('id, company_id')
    .eq('id', applicationId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return application as { id: string; company_id: string } | null;
}

export async function POST(
  _request: Request,
  { params }: { params: { applicationId: string } }
) {
  try {
    const parsedParams = ParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'ApplicationId non valido.' }, { status: 422 });
    }

    const viewer = await getViewerProfile();
    if ('error' in viewer) return viewer.error;

    const { supabase, profile } = viewer;

    if (hasAdminAccess(profile.role) || hasConsultantAccess(profile.role)) {
      return NextResponse.json({ error: 'Accesso non consentito.' }, { status: 403 });
    }

    if (!profile.company_id) {
      return NextResponse.json({ error: 'Profilo non associato ad alcuna azienda.' }, { status: 422 });
    }

    const application = await resolveApplication({
      supabase,
      applicationId: parsedParams.data.applicationId,
      companyId: profile.company_id,
    });

    if (!application) {
      return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
    }

    const thread = await ensurePracticeThreadCompat({
      supabase,
      applicationId: application.id,
      companyId: profile.company_id,
    });

    const touched = await touchParticipantReadCompat({
      supabase,
      threadId: thread.threadId,
      profileId: profile.id,
      role: profile.role,
      mode: thread.mode,
      atIso: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      threadId: thread.threadId,
      lastReadAt: touched.lastReadAt,
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Errore aggiornamento stato lettura.' },
      { status: 500 }
    );
  }
}
