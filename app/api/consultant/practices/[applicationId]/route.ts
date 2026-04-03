import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { ensurePracticeThreadForApplication, ensurePracticeThreadParticipants } from '@/lib/ops/assignments';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ParamsSchema = z.object({
  applicationId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  { params }: { params: { applicationId: string } }
) {
  const { profile } = await requireOpsOrConsultantProfile();
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: 'ApplicationId non valido.' }, { status: 422 });

  const applicationId = parsed.data.applicationId;
  const admin = getSupabaseAdmin() as any;

  const { data: application, error: applicationError } = await admin
    .from('tender_applications')
    .select('id, company_id, status, supplier_registry_status, notes, updated_at, tender:tenders(title), company:companies(name)')
    .eq('id', applicationId)
    .maybeSingle();

  if (applicationError) return NextResponse.json({ error: applicationError.message }, { status: 500 });
  if (!application) return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });

  const { data: assignment, error: assignmentError } = await admin
    .from('consultant_practice_assignments')
    .select('consultant_profile_id, assigned_at, note, status')
    .eq('application_id', applicationId)
    .eq('status', 'active')
    .maybeSingle();

  if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  if (profile.role === 'consultant' && assignment?.consultant_profile_id !== profile.id) {
    return NextResponse.json({ error: 'Pratica non assegnata al consulente corrente.' }, { status: 403 });
  }

  const companyId = String(application.company_id);
  let threadId: string | null = null;

  try {
    threadId = await ensurePracticeThreadForApplication({ applicationId, companyId });
    const { data: clientProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('role', 'client_admin')
      .limit(1)
      .maybeSingle();
    await ensurePracticeThreadParticipants({
      threadId,
      clientProfileId: clientProfile?.id ?? null,
      consultantProfileId: assignment?.consultant_profile_id ?? (profile.role === 'consultant' ? profile.id : null),
      opsProfileId: profile.role === 'ops_admin' ? profile.id : null,
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Thread pratica non disponibile.' },
      { status: 500 }
    );
  }

  const [requirementsRes, documentsRes] = await Promise.all([
    admin
      .from('practice_document_requirements')
      .select('requirement_key, label, is_required, status')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true }),
    admin
      .from('application_documents')
      .select('id, file_name, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true }),
  ]);

  if (requirementsRes.error) return NextResponse.json({ error: requirementsRes.error.message }, { status: 500 });
  if (documentsRes.error) return NextResponse.json({ error: documentsRes.error.message }, { status: 500 });

  return NextResponse.json({
    practice: {
      applicationId: application.id as string,
      companyId,
      companyName: application.company?.name ?? 'Cliente',
      practiceTitle: application.tender?.title ?? `Pratica ${String(application.id).slice(0, 8)}`,
      status: String(application.status ?? 'draft'),
      supplierRegistryStatus: String(application.supplier_registry_status ?? 'pending'),
      notes: (application.notes ?? null) as string | null,
      updatedAt: String(application.updated_at ?? new Date().toISOString()),
      assignment: assignment
        ? {
            consultantProfileId: assignment.consultant_profile_id as string,
            assignedAt: assignment.assigned_at as string,
            note: (assignment.note ?? null) as string | null,
          }
        : null,
      threadId,
    },
    requirements: requirementsRes.data ?? [],
    documents: documentsRes.data ?? [],
  });
}
