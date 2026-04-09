import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ensurePracticeThreadForApplication, ensurePracticeThreadParticipants, upsertActiveAssignment } from '@/lib/ops/assignments';
import { logAdminAudit } from '@/lib/ops/audit';
import { logPlatformEvent } from '@/lib/ops/telemetry';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  companyId: z.string().uuid().optional(),
});

const AssignSchema = z.object({
  applicationId: z.string().uuid(),
  companyId: z.string().uuid(),
  consultantProfileId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  await requireOpsProfile();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    companyId: url.searchParams.get('companyId') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;

  const consultantsPromise = admin
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('role', 'consultant')
    .order('created_at', { ascending: true });

  const applicationsQuery = admin
    .from('tender_applications')
    .select('id, company_id, status, updated_at, tender:tenders(title), company:companies(name)')
    .order('updated_at', { ascending: false })
    .limit(400);

  if (parsed.data.companyId) {
    applicationsQuery.eq('company_id', parsed.data.companyId);
  }

  const [consultantsRes, applicationsRes] = await Promise.all([consultantsPromise, applicationsQuery]);

  if (consultantsRes.error) return NextResponse.json({ error: consultantsRes.error.message }, { status: 500 });
  if (applicationsRes.error) return NextResponse.json({ error: applicationsRes.error.message }, { status: 500 });

  const applicationIds = (applicationsRes.data ?? []).map((row: any) => row.id as string);
  const assignmentsRes = applicationIds.length
    ? await admin
        .from('consultant_practice_assignments')
        .select('id, application_id, consultant_profile_id, assigned_at, status, note')
        .in('application_id', applicationIds)
        .order('assigned_at', { ascending: false })
    : { data: [], error: null };
  if (assignmentsRes.error) {
    if (isMissingTable(assignmentsRes.error, 'consultant_practice_assignments')) {
      const companyIds = Array.from(new Set((applicationsRes.data ?? []).map((row: any) => String(row.company_id))));
      const { data: legacyThreads } = companyIds.length
        ? await admin.from('consultant_threads').select('id, company_id').in('company_id', companyIds)
        : { data: [] as Array<{ id: string; company_id: string }> };
      const threadIds = (legacyThreads ?? []).map((thread: any) => String(thread.id));
      const { data: legacyParticipants } = threadIds.length
        ? await admin
            .from('consultant_thread_participants')
            .select('thread_id, profile_id, participant_role, created_at')
            .in('thread_id', threadIds)
            .eq('participant_role', 'consultant')
            .order('created_at', { ascending: false })
        : { data: [] as Array<{ thread_id: string; profile_id: string; participant_role: string; created_at: string }> };

      const threadByCompany = new Map<string, string>();
      for (const thread of legacyThreads ?? []) {
        threadByCompany.set(String((thread as any).company_id), String((thread as any).id));
      }
      const consultantByThread = new Map<string, { profileId: string; assignedAt: string | null }>();
      for (const participant of legacyParticipants ?? []) {
        const threadId = String((participant as any).thread_id);
        if (!consultantByThread.has(threadId)) {
          consultantByThread.set(threadId, {
            profileId: String((participant as any).profile_id),
            assignedAt: typeof (participant as any).created_at === 'string' ? (participant as any).created_at : null
          });
        }
      }

      const consultants = (consultantsRes.data ?? []).map((entry: any) => ({
        id: entry.id,
        fullName: entry.full_name,
        email: entry.email,
      }));
      const assignments = (applicationsRes.data ?? []).map((row: any) => ({
        applicationId: row.id as string,
        companyId: row.company_id as string,
        companyName: row.company?.name ?? 'Cliente',
        practiceTitle: row.tender?.title ?? `Pratica ${String(row.id).slice(0, 8)}`,
        status: row.status as string,
        updatedAt: row.updated_at as string,
        assignment: (() => {
          const threadId = threadByCompany.get(String(row.company_id));
          if (!threadId) return null;
          const consultant = consultantByThread.get(threadId);
          if (!consultant) return null;
          return {
            id: `legacy-${String(row.id)}`,
            consultantProfileId: consultant.profileId,
            assignedAt: consultant.assignedAt,
            note: null
          };
        })(),
      }));
      return NextResponse.json({
        consultants,
        assignments,
        notice:
          'Assegnazioni operative in modalità compatibile: mapping consulente ricavato dai partecipanti thread cliente.',
      });
    }
    return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });
  }

  const activeByApplication = new Map<string, any>();
  for (const row of assignmentsRes.data ?? []) {
    if (row.status !== 'active') continue;
    if (!activeByApplication.has(row.application_id)) {
      activeByApplication.set(row.application_id, row);
    }
  }

  const consultants = (consultantsRes.data ?? []).map((entry: any) => ({
    id: entry.id,
    fullName: entry.full_name,
    email: entry.email,
  }));

  const assignments = (applicationsRes.data ?? []).map((row: any) => ({
    applicationId: row.id as string,
    companyId: row.company_id as string,
    companyName: row.company?.name ?? 'Cliente',
    practiceTitle: row.tender?.title ?? `Pratica ${String(row.id).slice(0, 8)}`,
    status: row.status as string,
    updatedAt: row.updated_at as string,
    assignment: activeByApplication.get(row.id)
      ? {
          id: activeByApplication.get(row.id).id as string,
          consultantProfileId: activeByApplication.get(row.id).consultant_profile_id as string,
          assignedAt: activeByApplication.get(row.id).assigned_at as string,
          note: (activeByApplication.get(row.id).note ?? null) as string | null,
        }
      : null,
  }));

  return NextResponse.json({ consultants, assignments, notice: null });
}

export async function POST(request: Request) {
  const { profile } = await requireOpsProfile();

  const parsed = AssignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });

  try {
    const admin = getSupabaseAdmin() as any;
    let assignment = await upsertActiveAssignment({
      applicationId: parsed.data.applicationId,
      companyId: parsed.data.companyId,
      consultantProfileId: parsed.data.consultantProfileId,
      actorProfileId: profile.id,
      note: parsed.data.note ?? null,
    });
    let compatibilityMode = false;

    const threadId = await ensurePracticeThreadForApplication({
      applicationId: parsed.data.applicationId,
      companyId: parsed.data.companyId,
    });

    const [{ data: clientProfile }, { data: consultantProfile }] = await Promise.all([
      admin
        .from('profiles')
        .select('id')
        .eq('company_id', parsed.data.companyId)
        .eq('role', 'client_admin')
        .limit(1)
        .maybeSingle(),
      admin.from('profiles').select('id').eq('id', parsed.data.consultantProfileId).maybeSingle(),
    ]);

    await ensurePracticeThreadParticipants({
      threadId,
      clientProfileId: clientProfile?.id ?? null,
      consultantProfileId: consultantProfile?.id ?? null,
      opsProfileId: profile.id,
    });

    await logAdminAudit({
      actionType: 'assignment.upsert',
      actorProfileId: profile.id,
      actorRole: profile.role,
      targetType: 'tender_application',
      targetId: parsed.data.applicationId,
      companyId: parsed.data.companyId,
      applicationId: parsed.data.applicationId,
      details: {
        consultantProfileId: parsed.data.consultantProfileId,
        note: parsed.data.note ?? null,
      },
    });

    await logPlatformEvent({
      eventType: 'assignment_updated',
      actorProfileId: profile.id,
      actorRole: profile.role,
      companyId: parsed.data.companyId,
      applicationId: parsed.data.applicationId,
      channel: 'admin',
      metadata: {
        consultantProfileId: parsed.data.consultantProfileId,
      },
    });

    return NextResponse.json({ ok: true, assignment, threadId, compatibilityMode });
  } catch (error) {
    const missingAssignmentTable = isMissingTable(error instanceof Error ? error.message : null, 'consultant_practice_assignments');
    if (missingAssignmentTable) {
      try {
        const admin = getSupabaseAdmin() as any;
        const threadId = await ensurePracticeThreadForApplication({
          applicationId: parsed.data.applicationId,
          companyId: parsed.data.companyId
        });

        await admin
          .from('consultant_thread_participants')
          .delete()
          .eq('thread_id', threadId)
          .eq('participant_role', 'consultant')
          .neq('profile_id', parsed.data.consultantProfileId);

        await admin.from('consultant_thread_participants').upsert(
          {
            thread_id: threadId,
            profile_id: parsed.data.consultantProfileId,
            participant_role: 'consultant',
            last_read_at: new Date(0).toISOString()
          },
          { onConflict: 'thread_id,profile_id' }
        );

        const [{ data: clientProfile }, { data: consultantProfile }] = await Promise.all([
          admin
            .from('profiles')
            .select('id')
            .eq('company_id', parsed.data.companyId)
            .eq('role', 'client_admin')
            .limit(1)
            .maybeSingle(),
          admin.from('profiles').select('id').eq('id', parsed.data.consultantProfileId).maybeSingle()
        ]);

        await ensurePracticeThreadParticipants({
          threadId,
          clientProfileId: clientProfile?.id ?? null,
          consultantProfileId: consultantProfile?.id ?? null,
          opsProfileId: profile.id
        });

        const fallbackAssignment = {
          id: `legacy-${parsed.data.applicationId}`,
          application_id: parsed.data.applicationId,
          company_id: parsed.data.companyId,
          consultant_profile_id: parsed.data.consultantProfileId,
          assigned_by_profile_id: profile.id,
          note: parsed.data.note ?? null,
          status: 'active',
          assigned_at: new Date().toISOString(),
          unassigned_at: null
        };

        await logAdminAudit({
          actionType: 'assignment.upsert',
          actorProfileId: profile.id,
          actorRole: profile.role,
          targetType: 'tender_application',
          targetId: parsed.data.applicationId,
          companyId: parsed.data.companyId,
          applicationId: parsed.data.applicationId,
          details: {
            consultantProfileId: parsed.data.consultantProfileId,
            note: parsed.data.note ?? null,
            compatibilityMode: true
          },
        });

        await logPlatformEvent({
          eventType: 'assignment_updated',
          actorProfileId: profile.id,
          actorRole: profile.role,
          companyId: parsed.data.companyId,
          applicationId: parsed.data.applicationId,
          channel: 'admin',
          metadata: {
            consultantProfileId: parsed.data.consultantProfileId,
            compatibilityMode: true
          },
        });

        return NextResponse.json({
          ok: true,
          assignment: fallbackAssignment,
          threadId,
          compatibilityMode: true,
          notice: 'Assegnazione salvata in modalità compatibile (thread partecipanti).'
        });
      } catch (fallbackError) {
        return NextResponse.json(
          { error: fallbackError instanceof Error ? fallbackError.message : 'Errore assegnazione compatibile.' },
          { status: 500 }
        );
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Errore assegnazione.' }, { status: 500 });
  }
}
