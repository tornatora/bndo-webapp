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
        assignment: null,
      }));
      return NextResponse.json({
        consultants,
        assignments,
        notice:
          'Modulo assegnazioni in fase di attivazione database. Le pratiche sono visibili, l’assegnazione consulente verrà abilitata appena completata la migrazione.',
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
    const assignment = await upsertActiveAssignment({
      applicationId: parsed.data.applicationId,
      companyId: parsed.data.companyId,
      consultantProfileId: parsed.data.consultantProfileId,
      actorProfileId: profile.id,
      note: parsed.data.note ?? null,
    });

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

    return NextResponse.json({ ok: true, assignment, threadId });
  } catch (error) {
    if (isMissingTable(error instanceof Error ? error.message : null, 'consultant_practice_assignments')) {
      return NextResponse.json(
        {
          error:
            'Assegnazioni non ancora attive su questo ambiente. Completa la migrazione database e riprova.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Errore assegnazione.' }, { status: 500 });
  }
}
