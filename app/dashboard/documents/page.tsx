import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type DocumentRow = {
  id: string;
  application_id: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

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
        .select('id, application_id, file_name, storage_path, file_size, mime_type, created_at')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })
        .limit(120)
    : { data: [] as DocumentRow[] };

  const tenderIds = [...new Set((applications ?? []).map((item) => item.tender_id))];
  const { data: tenders } = tenderIds.length
    ? await supabase.from('tenders').select('id, title, authority_name').in('id', tenderIds)
    : { data: [] as Array<{ id: string; title: string; authority_name: string }> };

  const applicationMap = new Map((applications ?? []).map((item) => [item.id, item]));
  const tenderMap = new Map((tenders ?? []).map((item) => [item.id, item]));

  const docsWithContext = await Promise.all(
    (documents ?? []).map(async (document) => {
      const application = applicationMap.get(document.application_id);
      const tender = application ? tenderMap.get(application.tender_id) : null;
      const signed = await supabase.storage.from('application-documents').createSignedUrl(document.storage_path, 3600);

      return {
        ...document,
        tenderId: application?.tender_id ?? null,
        tenderTitle: tender?.title ?? 'Pratica senza titolo',
        authorityName: tender?.authority_name ?? 'Ente non disponibile',
        downloadUrl: signed.error ? null : signed.data.signedUrl
      };
    })
  );

  return (
    <>
      <section className="welcome-section">
        <h1 className="welcome-title">I tuoi documenti</h1>
        <p className="welcome-subtitle">Tutti i file caricati nelle pratiche, con download immediato.</p>
      </section>

      {docsWithContext.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p className="empty-text">Non hai ancora caricato documenti. Apri una pratica per iniziare.</p>
          <div className="action-buttons" style={{ justifyContent: 'center', marginTop: 20 }}>
            <Link href="/dashboard" className="btn-action secondary">
              <span>↗</span>
              <span>Vai alle pratiche</span>
            </Link>
          </div>
        </div>
      ) : (
        <section className="documents-grid">
          {docsWithContext.map((document) => (
            <article key={document.id} className="document-card">
              <div className="document-icon">📎</div>
              <h2 className="document-name">{document.file_name}</h2>
              <p className="document-date">{document.tenderTitle}</p>
              <p className="document-date">{document.authorityName}</p>
              <p className="document-date">Caricato: {formatDate(document.created_at)}</p>
              <p className="document-date">Dimensione: {formatFileSize(document.file_size)}</p>

              <div className="document-actions">
                {document.downloadUrl ? (
                  <a className="btn-doc" href={document.downloadUrl} target="_blank" rel="noreferrer">
                    <span>⬇</span>
                    <span>Download</span>
                  </a>
                ) : (
                  <span className="btn-doc" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                    <span>⚠</span>
                    <span>Non disponibile</span>
                  </span>
                )}

                <Link className="btn-doc" href={`/dashboard/practices/${document.application_id}`}>
                  <span>↗</span>
                  <span>Pratica</span>
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
