import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type TenderMatchResult = {
  id: string;
  relevance_score: number;
  status: 'new' | 'in_review' | 'participating' | 'submitted';
  tender: {
    id: string;
    authority_name: string;
    title: string;
    deadline_at: string;
    procurement_value: number | null;
  };
};

export default async function DashboardPage() {
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

  const [{ data: matches }, { data: companyApplications }, { data: thread }] = await Promise.all([
    supabase
      .from('tender_matches')
      .select('id, relevance_score, status, tender_id')
      .eq('company_id', profile.company_id)
      .order('relevance_score', { ascending: false })
      .limit(12),
    supabase.from('tender_applications').select('id').eq('company_id', profile.company_id).limit(500),
    supabase.from('consultant_threads').select('id').eq('company_id', profile.company_id).maybeSingle()
  ]);

  const applicationIds = (companyApplications ?? []).map((application) => application.id);
  const { count: docsCount } = applicationIds.length
    ? await supabase.from('application_documents').select('id', { count: 'exact', head: true }).in('application_id', applicationIds)
    : { count: 0 };

  const { data: messages } = thread?.id
    ? await supabase
        .from('consultant_messages')
        .select('id, thread_id, sender_profile_id, body, created_at')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true })
        .limit(40)
    : { data: [] as Array<{ id: string; thread_id: string; sender_profile_id: string; body: string; created_at: string }> };

  const { data: participant } = thread?.id
    ? await supabase
        .from('consultant_thread_participants')
        .select('last_read_at')
        .eq('thread_id', thread.id)
        .eq('profile_id', profile.id)
        .maybeSingle()
    : { data: null };

  const tenderIds = [...new Set((matches ?? []).map((match) => match.tender_id))];
  const { data: tenders } = tenderIds.length
    ? await supabase
        .from('tenders')
        .select('id, authority_name, title, deadline_at, procurement_value')
        .in('id', tenderIds)
    : { data: [] };

  const tenderMap = new Map((tenders ?? []).map((tender) => [tender.id, tender]));
  const typedMatches: TenderMatchResult[] = (matches ?? []).flatMap((match) => {
    const tender = tenderMap.get(match.tender_id);
    if (!tender) return [];

    return [
      {
        id: match.id,
        relevance_score: match.relevance_score,
        status: match.status,
        tender
      }
    ];
  });

  const unreadCount = (messages ?? []).filter(
    (message) =>
      message.sender_profile_id !== profile.id &&
      new Date(message.created_at).getTime() > new Date(participant?.last_read_at ?? new Date(0).toISOString()).getTime()
  ).length;

  return (
    <>
      <div className="welcome-section">
        <h1 className="welcome-title">📋 Le Tue Pratiche</h1>
        <p className="welcome-subtitle">Monitora l&apos;avanzamento delle tue richieste</p>

        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{typedMatches.length}</div>
            <div className="stat-label">Pratiche Attive</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{docsCount ?? 0}</div>
            <div className="stat-label">Documenti Caricati</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{unreadCount}</div>
            <div className="stat-label">Messaggi Non Letti</div>
          </div>
        </div>
      </div>

      {typedMatches.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p className="empty-text">Nessuna pratica disponibile al momento.</p>
        </div>
      ) : (
        typedMatches.map((match) => {
          const statusClass = match.status === 'submitted' ? 'badge badge-success' : 'badge badge-info';
          const statusLabel = match.status === 'submitted' ? 'Completata' : 'In corso';
          const relevance = Math.round(match.relevance_score * 100);

          return (
            <article key={match.id} className="pratica-card">
              <div className="pratica-header">
                <div>
                  <h2 className="pratica-title">{match.tender.title}</h2>
                  <p className="pratica-type">{match.tender.authority_name}</p>
                </div>
                <span className={statusClass}>{statusLabel}</span>
              </div>

              <div className="progress-section">
                <div className="progress-header">
                  <span className="progress-label">Rilevanza pratica</span>
                  <span className="progress-value">{relevance}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${relevance}%` }} />
                </div>
              </div>

              <div className="action-buttons" style={{ marginTop: 20 }}>
                <Link href={`/dashboard/tenders/${match.tender.id}`} className="btn-action primary">
                  <span>📋</span>
                  <span>Apri sintesi</span>
                </Link>
                <Link href={`/dashboard/tenders/${match.tender.id}/apply`} className="btn-action secondary">
                  <span>📤</span>
                  <span>Partecipa</span>
                </Link>
              </div>
            </article>
          );
        })
      )}
    </>
  );
}
