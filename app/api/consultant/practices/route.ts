import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const QuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
});

export async function GET(request: Request) {
  const { profile } = await requireOpsOrConsultantProfile();

  const parsed = QuerySchema.safeParse({
    status: new URL(request.url).searchParams.get('status') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;
  let assignmentsQuery = admin
    .from('consultant_practice_assignments')
    .select('application_id, company_id, assigned_at, note, status, consultant_profile_id')
    .eq('status', 'active')
    .order('assigned_at', { ascending: false })
    .limit(500);

  if (profile.role === 'consultant') {
    assignmentsQuery = assignmentsQuery.eq('consultant_profile_id', profile.id);
  }

  const { data: assignments, error } = await assignmentsQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const applicationIds = (assignments ?? []).map((a: any) => String(a.application_id));
  if (applicationIds.length === 0) {
    return NextResponse.json({
      kpis: { total: 0, draft: 0, reviewed: 0, submitted: 0, docsMissing: 0 },
      items: [],
    });
  }

  const [applicationsRes, docsRes, requirementsRes, companiesRes] = await Promise.all([
    admin
      .from('tender_applications')
      .select('id, company_id, tender_id, status, supplier_registry_status, notes, updated_at, tender:tenders(title)')
      .in('id', applicationIds),
    admin
      .from('application_documents')
      .select('application_id, id')
      .in('application_id', applicationIds),
    admin
      .from('practice_document_requirements')
      .select('application_id, requirement_key, status, is_required')
      .in('application_id', applicationIds),
    admin
      .from('companies')
      .select('id, name')
      .in('id', Array.from(new Set((assignments ?? []).map((a: any) => String(a.company_id))))),
  ]);

  if (applicationsRes.error) return NextResponse.json({ error: applicationsRes.error.message }, { status: 500 });
  if (docsRes.error) return NextResponse.json({ error: docsRes.error.message }, { status: 500 });
  if (requirementsRes.error) return NextResponse.json({ error: requirementsRes.error.message }, { status: 500 });
  if (companiesRes.error) return NextResponse.json({ error: companiesRes.error.message }, { status: 500 });

  const docsCountByApplication = new Map<string, number>();
  for (const row of docsRes.data ?? []) {
    const key = String(row.application_id);
    docsCountByApplication.set(key, (docsCountByApplication.get(key) ?? 0) + 1);
  }

  const missingReqByApplication = new Map<string, number>();
  for (const row of requirementsRes.data ?? []) {
    if (row.is_required && row.status === 'missing') {
      const key = String(row.application_id);
      missingReqByApplication.set(key, (missingReqByApplication.get(key) ?? 0) + 1);
    }
  }

  const companyNameById = new Map<string, string>();
  for (const row of companiesRes.data ?? []) {
    companyNameById.set(String(row.id), String(row.name ?? 'Cliente'));
  }

  const assignmentByAppId = new Map<string, any>();
  for (const row of assignments ?? []) assignmentByAppId.set(String(row.application_id), row);

  const rows = (applicationsRes.data ?? [])
    .map((row: any) => {
      const assignment = assignmentByAppId.get(String(row.id));
      const practiceStatus = String(row.status ?? 'draft');
      if (parsed.data.status && practiceStatus !== parsed.data.status) return null;
      return {
        applicationId: row.id as string,
        companyId: row.company_id as string,
        companyName: companyNameById.get(String(row.company_id)) ?? 'Cliente',
        practiceTitle: row.tender?.title ?? `Pratica ${String(row.id).slice(0, 8)}`,
        status: practiceStatus,
        supplierRegistryStatus: String(row.supplier_registry_status ?? 'pending'),
        notes: (row.notes ?? null) as string | null,
        updatedAt: row.updated_at as string,
        docsUploadedCount: docsCountByApplication.get(String(row.id)) ?? 0,
        docsMissingCount: missingReqByApplication.get(String(row.id)) ?? 0,
        assignedAt: assignment?.assigned_at ?? null,
        assignmentNote: assignment?.note ?? null,
        consultantProfileId: assignment?.consultant_profile_id ?? null,
      };
    })
    .filter(Boolean);

  const kpis = {
    total: rows.length,
    draft: rows.filter((row: any) => row.status === 'draft').length,
    reviewed: rows.filter((row: any) => row.status === 'reviewed').length,
    submitted: rows.filter((row: any) => row.status === 'submitted').length,
    docsMissing: rows.reduce((acc: number, row: any) => acc + Number(row.docsMissingCount ?? 0), 0),
  };

  return NextResponse.json({ kpis, items: rows });
}
