import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { computeDocumentChecklist, computeDocumentChecklistFromRequirements } from '@/lib/admin/document-requirements';
import {
  computeDerivedProgressKey,
  computeProgressBar,
  extractProgressFromNotes,
  progressBadge
} from '@/lib/admin/practice-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  company_id: string | null;
  role: 'client_admin' | 'consultant' | 'ops_admin';
};

type ApplicationRow = {
  id: string;
  tender_id: string;
  status: 'draft' | 'submitted' | 'reviewed';
  supplier_registry_status: 'pending' | 'in_progress' | 'completed';
  notes: string | null;
  updated_at: string;
};

type DocRow = {
  application_id: string;
  file_name: string;
  requirement_key: string | null;
};

export async function GET() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });
  const typedProfile = profile as ProfileRow;
  if (hasOpsAccess(typedProfile.role)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  if (!typedProfile.company_id) return NextResponse.json({ error: 'Profilo non associato ad alcuna azienda.' }, { status: 422 });

  const { data: applications } = await supabase
    .from('tender_applications')
    .select('id, tender_id, status, supplier_registry_status, notes, updated_at')
    .eq('company_id', typedProfile.company_id)
    .order('updated_at', { ascending: false })
    .limit(50);

  const typedApplications = ((applications ?? []) as unknown as ApplicationRow[]) ?? [];

  const tenderIds = [...new Set(typedApplications.map((a) => a.tender_id).filter(Boolean))];
  const { data: tenders } = tenderIds.length
    ? await supabase.from('tenders').select('id, title, authority_name').in('id', tenderIds)
    : { data: [] as Array<{ id: string; title: string; authority_name: string }> };

  const tenderMap = new Map((tenders ?? []).map((t) => [t.id, t]));

  const applicationIds = typedApplications.map((a) => a.id);
  const { data: docsRaw } = applicationIds.length
    ? await supabase
        .from('application_documents')
        .select('application_id, file_name, requirement_key')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })
        .limit(500)
    : { data: [] as DocRow[] };
  let docs = ((docsRaw ?? []) as unknown as DocRow[]) ?? [];

  if (applicationIds.length && hasRealServiceRoleKey()) {
    try {
      const admin = getSupabaseAdmin();
      const { data: adminDocs } = await admin
        .from('application_documents')
        .select('application_id, file_name, requirement_key')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })
        .limit(500);
      if ((adminDocs ?? []).length >= docs.length) {
        docs = ((adminDocs ?? []) as unknown as DocRow[]) ?? [];
      }
    } catch {
      // Best-effort fallback for company-wide docs visibility.
    }
  }

  const { data: dynamicRequirements } = applicationIds.length
    ? await supabase
        .from('practice_document_requirements')
        .select('application_id, requirement_key, label, description, is_required')
        .in('application_id', applicationIds)
    : {
        data: [] as Array<{
          application_id: string;
          requirement_key: string;
          label: string;
          description: string | null;
          is_required: boolean;
        }>
      };

  const docsByApp = new Map<string, DocRow[]>();
  for (const d of (docs ?? []) as unknown as DocRow[]) {
    const prev = docsByApp.get(d.application_id) ?? [];
    prev.push(d);
    docsByApp.set(d.application_id, prev);
  }
  const requirementsByApp = new Map<
    string,
    Array<{
      application_id: string;
      requirement_key: string;
      label: string;
      description: string | null;
      is_required: boolean;
    }>
  >();
  for (const requirement of dynamicRequirements ?? []) {
    const prev = requirementsByApp.get(requirement.application_id) ?? [];
    prev.push(requirement);
    requirementsByApp.set(requirement.application_id, prev);
  }

  const items = typedApplications.map((application) => {
    const tender = tenderMap.get(application.tender_id) ?? null;
    const title = tender?.title ?? 'Pratica';

    const appDocs = docsByApp.get(application.id) ?? [];
    const appRequirements = requirementsByApp.get(application.id) ?? [];
    const checklist =
      appRequirements.length > 0
        ? computeDocumentChecklistFromRequirements(application.id, appRequirements, appDocs)
        : computeDocumentChecklist(application.id, title, appDocs);
    const missingCount = checklist.filter((c: any) => !c.uploaded).length;
    const uploadedCount = appDocs.length;

    const step =
      extractProgressFromNotes(application.notes ?? null) ??
      computeDerivedProgressKey(application.status, missingCount);
    const bar = computeProgressBar(step);
    const badge = progressBadge(step);
    return {
      applicationId: application.id,
      title,
      updatedAt: application.updated_at,
      missingCount,
      uploadedCount,
      progressPct: bar.pct,
      statusLabel: badge.label,
      statusClassName: badge.className
    };
  });

  const { data: latestQuiz } = await supabase
    .from('quiz_submissions')
    .select('eligibility, bando_type, created_at')
    .eq('email', user.email?.toLowerCase() ?? '')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    items,
    latestQuiz: latestQuiz ? {
      completed: true,
      eligible: latestQuiz.eligibility === 'eligible',
      type: latestQuiz.bando_type,
      createdAt: latestQuiz.created_at
    } : null
  }, { status: 200 });
}
