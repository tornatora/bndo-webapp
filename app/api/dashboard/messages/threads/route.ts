import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { createClient } from '@/lib/supabase/server';
import {
  buildPreviewText,
  countUnreadCompat,
  ensurePracticeThreadCompat,
  extractFirstName,
  fetchLatestMessageCompat,
  findLatestConsultantParticipantProfileIdCompat,
  readLastReadAtCompat,
  type PracticeThreadMode,
  type ViewerRole,
} from '@/lib/dashboard/practice-messages';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(120).optional(),
});

type ViewerProfile = {
  id: string;
  company_id: string | null;
  role: ViewerRole;
};

type ApplicationRow = {
  id: string;
  tender_id: string;
  updated_at: string;
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

export async function GET(request: Request) {
  try {
    const parsedQuery = QuerySchema.safeParse({
      limit: new URL(request.url).searchParams.get('limit') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
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

    const appLimit = parsedQuery.data.limit ?? 80;

    const { data: applications, error: applicationsError } = await supabase
      .from('tender_applications')
      .select('id, tender_id, updated_at')
      .eq('company_id', profile.company_id)
      .order('updated_at', { ascending: false })
      .limit(appLimit);

    if (applicationsError) {
      return NextResponse.json({ error: applicationsError.message }, { status: 500 });
    }

    const typedApplications = ((applications ?? []) as ApplicationRow[]).filter((row) => row.id && row.tender_id);

    if (typedApplications.length === 0) {
      return NextResponse.json({ chats: [] });
    }

    const tenderIds = [...new Set(typedApplications.map((row) => row.tender_id).filter(Boolean))];
    const { data: tenders, error: tendersError } = await supabase
      .from('tenders')
      .select('id, title')
      .in('id', tenderIds);

    if (tendersError) {
      return NextResponse.json({ error: tendersError.message }, { status: 500 });
    }

    const tenderTitleById = new Map<string, string>(
      (tenders ?? []).map((row) => [String(row.id), String(row.title ?? 'Pratica')])
    );

    const applicationIds = typedApplications.map((row) => row.id);
    const db = supabase as any;
    const assignmentLookup = await db
      .from('consultant_practice_assignments')
      .select('application_id, consultant_profile_id')
      .in('application_id', applicationIds)
      .eq('status', 'active');

    if (assignmentLookup.error && !isMissingTable(assignmentLookup.error, 'consultant_practice_assignments')) {
      return NextResponse.json({ error: assignmentLookup.error.message }, { status: 500 });
    }

    const assignedConsultantByApplication = new Map<string, string>();
    if (!assignmentLookup.error) {
      for (const row of assignmentLookup.data ?? []) {
        if (row.application_id && row.consultant_profile_id) {
          assignedConsultantByApplication.set(String(row.application_id), String(row.consultant_profile_id));
        }
      }
    }

    const threadContexts = await Promise.all(
      typedApplications.map(async (application) => {
        try {
          const resolved = await ensurePracticeThreadCompat({
            supabase,
            applicationId: application.id,
            companyId: profile.company_id as string,
          });
          return {
            application,
            threadId: resolved.threadId,
            mode: resolved.mode,
            unavailableReason: null as string | null,
          };
        } catch (cause) {
          return {
            application,
            threadId: null,
            mode: 'practice' as PracticeThreadMode,
            unavailableReason: cause instanceof Error ? cause.message : 'Thread non disponibile.',
          };
        }
      })
    );

    const consultantFromParticipants = await Promise.all(
      threadContexts.map(async (context) => {
        if (!context.threadId) return null;

        try {
          const fallbackConsultant = await findLatestConsultantParticipantProfileIdCompat({
            supabase,
            mode: context.mode,
            threadId: context.threadId,
          });
          return {
            applicationId: context.application.id,
            consultantProfileId: fallbackConsultant.profileId,
          };
        } catch {
          return {
            applicationId: context.application.id,
            consultantProfileId: null,
          };
        }
      })
    );

    for (const row of consultantFromParticipants) {
      if (!row?.applicationId) continue;
      if (!assignedConsultantByApplication.get(row.applicationId) && row.consultantProfileId) {
        assignedConsultantByApplication.set(row.applicationId, row.consultantProfileId);
      }
    }

    const consultantIds = [...new Set([...assignedConsultantByApplication.values()].filter(Boolean))];
    let consultantNameById = new Map<string, string>();

    if (consultantIds.length > 0) {
      const { data: consultants, error: consultantsError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', consultantIds);

      if (consultantsError) {
        return NextResponse.json({ error: consultantsError.message }, { status: 500 });
      }

      consultantNameById = new Map<string, string>(
        (consultants ?? []).map((row) => [String(row.id), extractFirstName(String(row.full_name ?? '')) ?? 'Consulente'])
      );
    }

    const chats = await Promise.all(
      threadContexts.map(async (context) => {
        const applicationId = context.application.id;
        const title = tenderTitleById.get(context.application.tender_id) ?? 'Pratica';
        const assignedConsultantId = assignedConsultantByApplication.get(applicationId) ?? null;
        const consultantFirstName = assignedConsultantId ? consultantNameById.get(assignedConsultantId) ?? null : null;
        const consultantLabel = consultantFirstName
          ? `Consulente ${consultantFirstName}`
          : 'Consulente in Assegnazione';

        if (!context.threadId) {
          return {
            applicationId,
            threadId: null,
            title,
            consultantFirstName,
            consultantLabel,
            hasAssignedConsultant: Boolean(consultantFirstName),
            lastMessagePreview: null,
            lastMessageAt: null,
            unreadCount: 0,
            updatedAt: context.application.updated_at,
            available: false,
            unavailableReason: context.unavailableReason,
          };
        }

        let mode = context.mode;
        const lastRead = await readLastReadAtCompat({
          supabase,
          threadId: context.threadId,
          profileId: profile.id,
          mode,
        });
        mode = lastRead.mode;

        const latestMessage = await fetchLatestMessageCompat({
          supabase,
          threadId: context.threadId,
          mode,
        });
        mode = latestMessage.mode;

        const unread = await countUnreadCompat({
          supabase,
          threadId: context.threadId,
          mode,
          viewerProfileId: profile.id,
          lastReadAt: lastRead.lastReadAt,
        });

        return {
          applicationId,
          threadId: context.threadId,
          title,
          consultantFirstName,
          consultantLabel,
          hasAssignedConsultant: Boolean(consultantFirstName),
          lastMessagePreview: buildPreviewText(latestMessage.message?.body ?? null),
          lastMessageAt: latestMessage.message?.created_at ?? null,
          unreadCount: unread.unreadCount,
          updatedAt: context.application.updated_at,
          available: true,
          unavailableReason: null,
        };
      })
    );

    chats.sort((a, b) => {
      const aTs = new Date(a.lastMessageAt ?? a.updatedAt).getTime();
      const bTs = new Date(b.lastMessageAt ?? b.updatedAt).getTime();
      return bTs - aTs;
    });

    return NextResponse.json({ chats });
  } catch (cause) {
    return NextResponse.json(
      {
        error: cause instanceof Error ? cause.message : 'Errore caricamento lista messaggi.',
      },
      { status: 500 }
    );
  }
}
