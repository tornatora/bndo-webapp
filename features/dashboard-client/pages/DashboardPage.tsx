import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasAdminAccess, hasConsultantAccess, hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { DashboardStatsClient } from '@/components/dashboard/DashboardStatsClient';
import { DashboardApplicationsClient } from '@/components/dashboard/DashboardApplicationsClient';
import { computeDocumentChecklistFromRequirements } from '@/lib/admin/document-requirements';
import { computeProgressBar, computeDerivedProgressKey, extractProgressFromNotes, progressBadge } from '@/lib/admin/practice-progress';

type ApplicationRow = {
  id: string;
  tender_id: string;
  status: 'draft' | 'submitted' | 'reviewed';
  supplier_registry_status: 'pending' | 'in_progress' | 'completed';
  notes: string | null;
  updated_at: string;
  tender: { title: string; authority_name: string } | null;
};

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/pratiche');
  }

  const { profile } = await requireUserProfile();

  if (hasAdminAccess(profile.role)) {
    redirect('/admin');
  }
  if (hasConsultantAccess(profile.role)) {
    redirect('/consultant');
  }

  if (!profile.company_id) {
    return (
      <section className="welcome-section">
        <h1 className="welcome-title">Profilo non valido</h1>
        <p className="welcome-subtitle">Profilo non associato ad alcuna azienda. Contatta il supporto.</p>
      </section>
    );
  }

  const [{ data: applications }] = await Promise.all([
    supabase
      .from('tender_applications')
      .select('id, tender_id, status, supplier_registry_status, notes, updated_at')
      .eq('company_id', profile.company_id)
      .order('updated_at', { ascending: false })
      .limit(50),
  ]);

  const tenderIds = [...new Set((applications ?? []).map((app) => app.tender_id).filter(Boolean))];
  let tenders: Array<{ id: string; title: string; authority_name: string }> = [];
  if (tenderIds.length) {
    const { data } = await supabase.from('tenders').select('id, title, authority_name').in('id', tenderIds);
    tenders = (data ?? []) as typeof tenders;

    const missingTitles = tenders.length === 0 || tenders.some((t) => !t.title);
    if (missingTitles && hasRealServiceRoleKey()) {
      try {
        const admin = getSupabaseAdmin();
        const { data: adminTenders } = await admin
          .from('tenders')
          .select('id, title, authority_name')
          .in('id', tenderIds);
        tenders = ((adminTenders ?? []) as typeof tenders) || tenders;
      } catch {
        // Ignore: best-effort title resolution.
      }
    }
  }

  const tenderMap = new Map((tenders ?? []).map((t) => [t.id, t]));
  const typedApplications: ApplicationRow[] =
    (applications ?? []).map((app) => ({
      id: app.id,
      tender_id: app.tender_id,
      status: app.status,
      supplier_registry_status: app.supplier_registry_status,
      notes: (app as unknown as { notes?: string | null }).notes ?? null,
      updated_at: app.updated_at,
      tender: tenderMap.get(app.tender_id) ?? null
    })) ?? [];
  const applicationIds = typedApplications.map((a) => a.id);
  const { data: docsRaw } = applicationIds.length
    ? await supabase
        .from('application_documents')
        .select('application_id, file_name, requirement_key')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })
        .limit(500)
    : { data: [] as Array<{ application_id: string; file_name: string; requirement_key: string | null }> };
  let docs =
    (docsRaw ?? []) as Array<{ application_id: string; file_name: string; requirement_key: string | null }>;

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
        docs = (adminDocs ?? []) as Array<{ application_id: string; file_name: string; requirement_key: string | null }>;
      }
    } catch {
      // Best-effort fallback for company-wide document visibility.
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

  const docsByApp = new Map<string, Array<{ application_id: string; file_name: string }>>();
  for (const d of docs ?? []) {
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

  const docsCount = (docs ?? []).length;

  const { data: thread } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', profile.company_id)
    .maybeSingle();

  let unreadCount = 0;
  if (thread?.id) {
    const { data: participant } = await supabase
      .from('consultant_thread_participants')
      .select('last_read_at')
      .eq('thread_id', thread.id)
      .eq('profile_id', profile.id)
      .maybeSingle();
    const lastReadAt = participant?.last_read_at ?? new Date(0).toISOString();
    const { count } = await supabase
      .from('consultant_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', thread.id)
      .gt('created_at', lastReadAt)
      .neq('sender_profile_id', profile.id);
    unreadCount = count ?? 0;
  }

  const initialItems = typedApplications.map((application) => {
    const title = application.tender?.title ?? 'Pratica';
    const appDocs = docsByApp.get(application.id) ?? [];
    const appRequirements = requirementsByApp.get(application.id) ?? [];
    const checklist =
      appRequirements.length > 0
        ? computeDocumentChecklistFromRequirements(application.id, appRequirements, appDocs)
        : [];
    const missingCount = checklist.filter((c) => !c.uploaded).length;
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
      statusClassName: badge.className,
    };
  });

  return (
    <>
      <div className="welcome-section">
        <h1 className="welcome-title">Le tue pratiche</h1>
        <p className="welcome-subtitle">Monitora l&apos;avanzamento delle tue richieste</p>

        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{typedApplications.length}</div>
            <div className="stat-label">Pratiche Attive</div>
          </div>
        </div>

        <DashboardStatsClient initialDocsCount={docsCount} initialUnreadCount={unreadCount} />
      </div>

      {typedApplications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p className="empty-text">Nessuna pratica disponibile al momento.</p>
        </div>
      ) : null}

      <DashboardApplicationsClient initialItems={initialItems} />
    </>
  );
}
