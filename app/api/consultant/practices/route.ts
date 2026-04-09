import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
  companyId: z.string().uuid().optional()
});

export async function GET(request: Request) {
  const { profile } = await requireOpsOrConsultantProfile();

  const parsed = QuerySchema.safeParse({
    status: new URL(request.url).searchParams.get('status') || undefined,
    companyId: new URL(request.url).searchParams.get('companyId') || undefined
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
  if (parsed.data.companyId) {
    assignmentsQuery = assignmentsQuery.eq('company_id', parsed.data.companyId);
  }

  const { data: assignments, error } = await assignmentsQuery;
  const useCompatibilityMode = Boolean(error && isMissingTable(error, 'consultant_practice_assignments'));
  if (error && !useCompatibilityMode) return NextResponse.json({ error: error.message }, { status: 500 });

  const compatibilityAssignments = useCompatibilityMode
    ? await (async () => {
        const participantQuery = admin
          .from('consultant_thread_participants')
          .select('thread_id, profile_id, participant_role, created_at')
          .eq('participant_role', 'consultant');
        if (profile.role === 'consultant') {
          participantQuery.eq('profile_id', profile.id);
        }
        const { data: participants, error: participantsError } = await participantQuery;
        if (participantsError) throw new Error(participantsError.message);

        const threadIds = Array.from(new Set((participants ?? []).map((row: any) => String(row.thread_id))));
        if (threadIds.length === 0) return [] as any[];

        const { data: threads, error: threadsError } = await admin
          .from('consultant_threads')
          .select('id, company_id')
          .in('id', threadIds);
        if (threadsError) throw new Error(threadsError.message);
        const companyByThread = new Map<string, string>();
        for (const thread of threads ?? []) {
          companyByThread.set(String((thread as any).id), String((thread as any).company_id));
        }

        const consultantByCompany = new Map<string, { consultantProfileId: string; assignedAt: string | null }>();
        for (const participant of participants ?? []) {
          const threadId = String((participant as any).thread_id);
          const companyId = companyByThread.get(threadId);
          if (!companyId) continue;
          if (!consultantByCompany.has(companyId)) {
            consultantByCompany.set(companyId, {
              consultantProfileId: String((participant as any).profile_id),
              assignedAt: typeof (participant as any).created_at === 'string' ? (participant as any).created_at : null
            });
          }
        }

      const out: any[] = [];
      for (const [companyId, consultant] of consultantByCompany.entries()) {
        if (parsed.data.companyId && companyId !== parsed.data.companyId) continue;
        out.push({
          application_id: null,
          company_id: companyId,
            assigned_at: consultant.assignedAt,
            note: null,
            status: 'active',
            consultant_profile_id: consultant.consultantProfileId
          });
        }
        return out;
      })()
    : [];

  let effectiveAssignments = (assignments ?? []) as any[];
  if (useCompatibilityMode) {
    const companyIds = Array.from(new Set((compatibilityAssignments ?? []).map((assignment: any) => String(assignment.company_id))));
    if (companyIds.length > 0) {
      const { data: applicationsByCompany, error: applicationsByCompanyError } = await admin
        .from('tender_applications')
        .select('id, company_id, updated_at')
        .in('company_id', companyIds)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (applicationsByCompanyError) {
        return NextResponse.json({ error: applicationsByCompanyError.message }, { status: 500 });
      }
      const assignmentsExpanded: any[] = [];
      for (const assignment of compatibilityAssignments ?? []) {
        const companyId = String(assignment.company_id);
        for (const application of applicationsByCompany ?? []) {
          if (String((application as any).company_id) !== companyId) continue;
          assignmentsExpanded.push({
            ...assignment,
            application_id: String((application as any).id)
          });
        }
      }
      effectiveAssignments = assignmentsExpanded;
    }
  }

  const applicationIds = effectiveAssignments.map((a: any) => String(a.application_id)).filter(Boolean);
  if (applicationIds.length === 0) {
    return NextResponse.json({
      kpis: {
        total: 0,
        draft: 0,
        reviewed: 0,
        submitted: 0,
        docsMissing: 0,
        grossPaidCents: 0,
        consultantEarningsCents: 0,
        platformFeeCents: 0,
        paidPractices: 0
      },
      items: [],
      notice: useCompatibilityMode
        ? 'Nessuna pratica assegnata in modalità compatibile.'
        : null
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
      .in('id', Array.from(new Set(effectiveAssignments.map((a: any) => String(a.company_id))))),
  ]);

  if (applicationsRes.error) return NextResponse.json({ error: applicationsRes.error.message }, { status: 500 });
  if (docsRes.error) return NextResponse.json({ error: docsRes.error.message }, { status: 500 });
  if (requirementsRes.error && !isMissingTable(requirementsRes.error, 'practice_document_requirements')) {
    return NextResponse.json({ error: requirementsRes.error.message }, { status: 500 });
  }
  if (companiesRes.error) return NextResponse.json({ error: companiesRes.error.message }, { status: 500 });

  const paymentsRes = applicationIds.length
    ? await admin
        .from('practice_payments')
        .select('application_id, amount_cents, status')
        .in('application_id', applicationIds)
        .limit(2000)
    : { data: [], error: null };
  const paymentsMissing = Boolean(paymentsRes.error && isMissingTable(paymentsRes.error, 'practice_payments'));
  if (paymentsRes.error && !paymentsMissing) {
    return NextResponse.json({ error: paymentsRes.error.message }, { status: 500 });
  }
  const paymentsRows = (paymentsMissing ? [] : paymentsRes.data ?? []) as Array<{
    application_id: string | null;
    amount_cents: number | null;
    status: string | null;
  }>;
  let grossPaidCents = 0;
  let refundedCents = 0;
  const paidPracticeIds = new Set<string>();
  for (const row of paymentsRows) {
    const amountCents = Number(row.amount_cents ?? 0);
    const status = String(row.status ?? '');
    if (status === 'paid') {
      grossPaidCents += amountCents;
      if (row.application_id) paidPracticeIds.add(String(row.application_id));
    }
    if (status === 'refunded') {
      refundedCents += amountCents;
    }
  }
  const netPaidCents = Math.max(0, grossPaidCents - refundedCents);
  const consultantEarningsCents = Math.round(netPaidCents * 0.65);
  const platformFeeCents = Math.max(0, netPaidCents - consultantEarningsCents);

  const docsCountByApplication = new Map<string, number>();
  for (const row of docsRes.data ?? []) {
    const key = String(row.application_id);
    docsCountByApplication.set(key, (docsCountByApplication.get(key) ?? 0) + 1);
  }

  const missingReqByApplication = new Map<string, number>();
  for (const row of requirementsRes.error ? [] : requirementsRes.data ?? []) {
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
  for (const row of effectiveAssignments) assignmentByAppId.set(String(row.application_id), row);

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
    grossPaidCents: netPaidCents,
    consultantEarningsCents,
    platformFeeCents,
    paidPractices: paidPracticeIds.size
  };

  const notices: string[] = [];
  if (useCompatibilityMode) {
    notices.push('Pratiche consulente caricate in modalità compatibile (assegnazioni da thread partecipanti).');
  }
  if (paymentsMissing) {
    notices.push('Modulo guadagni in modalità base: tabella pagamenti non ancora allineata su questo ambiente.');
  }

  return NextResponse.json({
    kpis,
    items: rows,
    notice: notices.length > 0 ? notices.join(' ') : null
  });
}
