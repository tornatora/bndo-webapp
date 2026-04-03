import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ConsultantPracticeChatPanel } from '@/components/consultant/ConsultantPracticeChatPanel';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { ensurePracticeThreadForApplication, ensurePracticeThreadParticipants } from '@/lib/ops/assignments';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ParamsSchema = z.object({
  applicationId: z.string().uuid(),
});

type PracticeMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT');
}

export default async function ConsultantPracticeDetailPage({
  params,
}: {
  params: { applicationId: string };
}) {
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) notFound();

  const { profile } = await requireOpsOrConsultantProfile();
  const applicationId = parsed.data.applicationId;
  const admin = getSupabaseAdmin() as any;

  const { data: application, error: applicationError } = await admin
    .from('tender_applications')
    .select('id, company_id, status, supplier_registry_status, notes, updated_at, tender:tenders(title), company:companies(name)')
    .eq('id', applicationId)
    .maybeSingle();

  if (applicationError || !application) notFound();

  const { data: assignment } = await admin
    .from('consultant_practice_assignments')
    .select('consultant_profile_id, assigned_at, note, status')
    .eq('application_id', applicationId)
    .eq('status', 'active')
    .maybeSingle();

  if (profile.role === 'consultant' && assignment?.consultant_profile_id !== profile.id) {
    return (
      <section className="section-card">
        <div className="section-title">
          <span>🔒</span>
          <span>Accesso negato</span>
        </div>
        <p className="admin-item-sub" style={{ marginTop: 10 }}>
          Questa pratica non risulta assegnata al tuo account consulente.
        </p>
        <div style={{ marginTop: 14 }}>
          <Link href="/consultant" className="btn-action secondary">
            Torna alle pratiche assegnate
          </Link>
        </div>
      </section>
    );
  }

  const companyId = String(application.company_id);
  let threadId: string | null = null;
  let threadError: string | null = null;
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
    threadError = cause instanceof Error ? cause.message : 'Thread pratica non disponibile.';
  }

  const [requirementsRes, documentsRes, messagesRes] = await Promise.all([
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
    threadId
      ? admin
          .from('consultant_practice_messages')
          .select('id, thread_id, sender_profile_id, body, created_at')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true })
          .limit(150)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const requirements = (requirementsRes.data ?? []) as Array<{
    requirement_key: string;
    label: string;
    is_required: boolean;
    status: 'missing' | 'uploaded' | 'waived';
  }>;
  const documents = (documentsRes.data ?? []) as Array<{ id: string; file_name: string; created_at: string }>;
  const messages = (messagesRes.data ?? []) as PracticeMessage[];

  const missingRequirements = requirements.filter((row) => row.is_required && row.status === 'missing');
  const uploadedRequirements = requirements.filter((row) => row.status === 'uploaded');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="welcome-section">
        <h1 className="welcome-title">{application.tender?.title ?? `Pratica ${applicationId.slice(0, 8)}`}</h1>
        <p className="welcome-subtitle">
          Cliente: {application.company?.name ?? 'Cliente'} · Stato: {application.status} · Registro fornitore:{' '}
          {application.supplier_registry_status}
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/consultant" className="back-button">
            ← Torna alle pratiche assegnate
          </Link>
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>📈</span>
          <span>Stato pratica</span>
        </div>
        <div className="admin-practice-crm-top" style={{ marginTop: 12 }}>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Aggiornata</div>
            <div className="admin-kpi-value">{formatDateTime(application.updated_at)}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Documenti caricati</div>
            <div className="admin-kpi-value">{documents.length}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Requisiti uploaded</div>
            <div className="admin-kpi-value">{uploadedRequirements.length}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Requisiti mancanti</div>
            <div className="admin-kpi-value is-warn">{missingRequirements.length}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Assegnata il</div>
            <div className="admin-kpi-value">{formatDateTime(assignment?.assigned_at ?? null)}</div>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>📎</span>
          <span>Documenti e checklist</span>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <div>
            <div className="admin-item-sub" style={{ fontWeight: 800, color: '#0B1136', marginBottom: 8 }}>
              Documenti caricati ({documents.length})
            </div>
            <div className="admin-table">
              {documents.map((document) => (
                <div key={document.id} className="admin-table-row">
                  <div className="admin-table-main">
                    <div className="admin-table-name">{document.file_name}</div>
                    <div className="admin-table-meta">{formatDateTime(document.created_at)}</div>
                  </div>
                </div>
              ))}
              {documents.length === 0 ? <div className="admin-item-sub">Nessun documento caricato.</div> : null}
            </div>
          </div>

          <div>
            <div className="admin-item-sub" style={{ fontWeight: 800, color: '#0B1136', marginBottom: 8 }}>
              Documenti mancanti ({missingRequirements.length})
            </div>
            <div className="admin-table">
              {missingRequirements.map((requirement) => (
                <div key={requirement.requirement_key} className="admin-table-row">
                  <div className="admin-table-main">
                    <div className="admin-table-name">{requirement.label || requirement.requirement_key}</div>
                    <div className="admin-table-meta">Chiave requisito: {requirement.requirement_key}</div>
                  </div>
                </div>
              ))}
              {missingRequirements.length === 0 ? <div className="admin-item-sub">Checklist completa.</div> : null}
            </div>
          </div>
        </div>

        {requirementsRes.error ? (
          <div className="admin-item-sub" style={{ marginTop: 10, color: '#B91C1C', fontWeight: 700 }}>
            Errore checklist requisiti: {requirementsRes.error.message}
          </div>
        ) : null}
      </section>

      {threadError ? (
        <section className="section-card">
          <div className="section-title">
            <span>💬</span>
            <span>Chat pratica</span>
          </div>
          <div className="admin-item-sub" style={{ marginTop: 8, color: '#B91C1C', fontWeight: 700 }}>
            {threadError}
          </div>
        </section>
      ) : (
        <ConsultantPracticeChatPanel
          applicationId={applicationId}
          viewerProfileId={profile.id}
          initialMessages={messages}
          initialError={messagesRes.error?.message ?? null}
        />
      )}
    </div>
  );
}
