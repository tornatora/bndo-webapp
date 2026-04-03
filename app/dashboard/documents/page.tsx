import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { computeDocumentChecklistFromRequirements } from '@/lib/admin/document-requirements';
import { DocumentsPracticeCard } from '@/components/dashboard/DocumentsPracticeCard';

type DocumentRow = {
  id: string;
  application_id: string;
  file_name: string;
  requirement_key: string | null;
  storage_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
};

export default async function DashboardDocumentsPage() {
  const { profile } = await requireUserProfile();

  if (hasOpsAccess(profile.role)) {
    redirect('/admin');
  }

  if (!profile.company_id) {
    return (
      <section className="welcome-section">
        <h1 className="welcome-title">Profilo non valido</h1>
        <p className="welcome-subtitle">Profilo non associato ad alcuna azienda. Contatta il supporto.</p>
      </section>
    );
  }

  const supabase = createClient();
  const { data: applications } = await supabase
    .from('tender_applications')
    .select('id, tender_id, status')
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })
    .limit(300);

  const applicationIds = (applications ?? []).map((item) => item.id);
  const { data: documents } = applicationIds.length
    ? await supabase
        .from('application_documents')
        .select('id, application_id, file_name, requirement_key, storage_path, file_size, mime_type, created_at')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })
        .limit(120)
    : { data: [] as DocumentRow[] };

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

  const tenderIds = [...new Set((applications ?? []).map((item) => item.tender_id))];
  // Note: client RLS may block reading tenders. In that case, we fallback to admin client server-side
  // so the UI can still show the correct practice labels.
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
        // Ignore: keep best-effort tenders list.
      }
    }
  }

  const tenderMap = new Map((tenders ?? []).map((item) => [item.id, item]));

  const documentsByApplicationId = new Map<string, DocumentRow[]>();
  for (const doc of documents ?? []) {
    const prev = documentsByApplicationId.get(doc.application_id) ?? [];
    prev.push(doc);
    documentsByApplicationId.set(doc.application_id, prev);
  }
  const requirementsByApplicationId = new Map<
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
    const prev = requirementsByApplicationId.get(requirement.application_id) ?? [];
    prev.push(requirement);
    requirementsByApplicationId.set(requirement.application_id, prev);
  }

  const applicationsWithContext = await Promise.all(
    (applications ?? []).map(async (application) => {
      const tender = tenderMap.get(application.tender_id) ?? null;
      const practiceTitle = tender?.title ?? application.tender_id ?? 'Pratica';
      const docsInApp = documentsByApplicationId.get(application.id) ?? [];
      const appRequirements = requirementsByApplicationId.get(application.id) ?? [];
      const checklist =
        appRequirements.length > 0
          ? computeDocumentChecklistFromRequirements(
              application.id,
              appRequirements,
              docsInApp.map((d) => ({
                application_id: application.id,
                file_name: d.file_name,
                requirement_key: d.requirement_key
              }))
            )
          : [];
      const missing = checklist.filter((c) => !c.uploaded);

      return {
        applicationId: application.id,
        practiceTitle,
        missing: missing.map((m) => ({ key: m.key, label: m.label })),
        uploaded: docsInApp.map((d) => ({
          id: d.id,
          fileName: d.file_name,
          createdAt: d.created_at,
          fileSize: d.file_size,
          downloadUrl: null
        }))
      };
    })
  );

  return (
    <>
      <section className="welcome-section">
        <h1 className="welcome-title">I tuoi documenti</h1>
        <p className="welcome-subtitle">
          Per ogni pratica trovi la lista documenti richiesta: quali sono gia caricati e quali mancano.
        </p>
      </section>

      {applicationsWithContext.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p className="empty-text">Non hai ancora pratiche attive. Avvia una pratica per vedere la documentazione richiesta.</p>
          <div className="action-buttons" style={{ justifyContent: 'center', marginTop: 20 }}>
            <Link href="/dashboard" className="btn-action secondary">
              <span>↗</span>
              <span>Vai alle pratiche</span>
            </Link>
          </div>
        </div>
      ) : (
        <section className="space-y-4">
          {applicationsWithContext.map((app) => (
            <DocumentsPracticeCard
              key={app.applicationId}
              applicationId={app.applicationId}
              practiceTitle={app.practiceTitle}
              missing={app.missing}
              uploaded={app.uploaded}
            />
          ))}
        </section>
      )}
    </>
  );
}
