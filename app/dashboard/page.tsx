import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { PracticeRequestPanel } from '@/components/dashboard/PracticeRequestPanel';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { computeDocumentChecklist } from '@/lib/admin/document-requirements';
import {
  computeDerivedProgressKey,
  computeProgressBar,
  extractProgressFromNotes,
  progressBadge
} from '@/lib/admin/practice-progress';

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

  const [{ data: applications }, { data: thread }] = await Promise.all([
    supabase
      .from('tender_applications')
      .select('id, tender_id, status, supplier_registry_status, notes, updated_at')
      .eq('company_id', profile.company_id)
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase.from('consultant_threads').select('id').eq('company_id', profile.company_id).maybeSingle()
  ]);

  const tenderIds = [...new Set((applications ?? []).map((app) => app.tender_id).filter(Boolean))];
  // Note: client RLS may block reading tenders. Fallback server-side with service role so we can
  // still show the practice title instead of raw IDs.
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

  const applicationIds = typedApplications.map((application) => application.id);

  const { data: docs } = applicationIds.length
    ? await supabase
        .from('application_documents')
        .select('id, application_id, file_name, created_at')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })
        .limit(500)
    : { data: [] as Array<{ id: string; application_id: string; file_name: string; created_at: string }> };

  const docsCount = docs?.length ?? 0;

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

  const unreadCount = (messages ?? []).filter(
    (message) =>
      message.sender_profile_id !== profile.id &&
      new Date(message.created_at).getTime() > new Date(participant?.last_read_at ?? new Date(0).toISOString()).getTime()
  ).length;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: latestQuiz } = await supabaseAdmin
    .from('quiz_submissions')
    .select('eligibility, bando_type, created_at')
    .eq('email', profile.email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const quizCompleted = Boolean(latestQuiz);
  const quizEligible = latestQuiz?.eligibility === 'eligible';

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
          <div className="stat-item">
            <div className="stat-value">{docsCount}</div>
            <div className="stat-label">Documenti Caricati</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{unreadCount}</div>
            <div className="stat-label">Messaggi Non Letti</div>
          </div>
        </div>
      </div>

      {typedApplications.length === 0 ? (
        <PracticeRequestPanel
          quizCompleted={quizCompleted}
          quizEligible={quizEligible}
          quizType={latestQuiz?.bando_type ?? null}
          quizCompletedAt={latestQuiz?.created_at ?? null}
        />
      ) : null}

      {typedApplications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p className="empty-text">Nessuna pratica disponibile al momento.</p>
        </div>
      ) : (
        typedApplications.map((application) => {
          const title = application.tender?.title ?? 'Pratica';

          const docsInApp = (docs ?? []).filter((d) => d.application_id === application.id);
          const checklist = computeDocumentChecklist(
            application.id,
            title,
            docsInApp.map((d) => ({ application_id: application.id, file_name: d.file_name }))
          );
          const missingCount = checklist.filter((c) => !c.uploaded).length;
          const uploadedCount = docsInApp.length;

          const step =
            extractProgressFromNotes(application.notes ?? null) ??
            computeDerivedProgressKey(application.status, missingCount);
          const bar = computeProgressBar(step);
          const badge = progressBadge(step);

          return (
            <Link key={application.id} href={`/dashboard/practices/${application.id}`} className="pratica-card pratica-card-link">
              <div className="pratica-header">
                <div>
                  <h2 className="pratica-title">{title}</h2>
                </div>
                <span className={badge.className}>{badge.label}</span>
              </div>

              <div className="progress-section">
                <div className="progress-header">
                  <span className="progress-label">Avanzamento pratica</span>
                  <span className="progress-value">{bar.pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${bar.pct}%` }} />
                </div>
                <div className="document-date" style={{ marginTop: 10, marginBottom: 0 }}>
                  Mancanti: <strong>{missingCount}</strong> · Caricati: <strong>{uploadedCount}</strong>
                </div>
              </div>
            </Link>
          );
        })
      )}
    </>
  );
}
