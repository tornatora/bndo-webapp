import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ConsultantPracticeChatPanel } from '@/components/consultant/ConsultantPracticeChatPanel';
import { ConsultantPracticeDocumentsActions } from '@/components/consultant/ConsultantPracticeDocumentsActions';
import { ConsultantPracticeProgressPanel } from '@/components/consultant/ConsultantPracticeProgressPanel';
import { computeDocumentChecklist, computeDocumentChecklistFromRequirements } from '@/lib/admin/document-requirements';
import { computeDerivedProgressKey, extractProgressFromNotes } from '@/lib/admin/practice-progress';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { listApplicationDocumentsForSingleApplicationCompat } from '@/lib/db/applicationDocumentsCompat';
import { ensurePracticeThreadForApplication, ensurePracticeThreadParticipants } from '@/lib/ops/assignments';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PreventiviSection } from '@/components/dashboard/PreventiviSection';

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

async function listMessagesCompat(admin: any, threadId: string) {
  const primary = await admin
    .from('consultant_practice_messages')
    .select('id, thread_id, sender_profile_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(150);
  if (!primary.error) return { rows: primary.data ?? [], error: null as { message?: string } | null };
  if (!isMissingTable(primary.error, 'consultant_practice_messages')) {
    return { rows: [] as PracticeMessage[], error: primary.error };
  }
  const fallback = await admin
    .from('consultant_messages')
    .select('id, thread_id, sender_profile_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(150);
  return {
    rows: fallback.data ?? [],
    error: fallback.error ?? null,
  };
}

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
    .select(
      'id, company_id, tender_id, status, supplier_registry_status, notes, updated_at, tender:tenders(title), company:companies(name)'
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (applicationError || !application) notFound();

  const { data: assignment, error: assignmentError } = await admin
    .from('consultant_practice_assignments')
    .select('consultant_profile_id, assigned_at, note, status')
    .eq('application_id', applicationId)
    .eq('status', 'active')
    .maybeSingle();

  let effectiveAssignment = assignment;
  if (assignmentError && !isMissingTable(assignmentError, 'consultant_practice_assignments')) {
    return (
      <section className="section-card">
        <div className="section-title">
          <span>⚠️</span>
          <span>Errore caricamento assegnazione</span>
        </div>
        <p className="admin-item-sub" style={{ marginTop: 10 }}>
          {assignmentError.message}
        </p>
      </section>
    );
  }
  if (assignmentError && isMissingTable(assignmentError, 'consultant_practice_assignments')) {
    const { data: legacyThread } = await admin
      .from('consultant_threads')
      .select('id')
      .eq('company_id', application.company_id)
      .maybeSingle();
    if (legacyThread?.id) {
      const { data: consultantParticipants } = await admin
        .from('consultant_thread_participants')
        .select('profile_id, created_at')
        .eq('thread_id', legacyThread.id)
        .eq('participant_role', 'consultant')
        .order('created_at', { ascending: false })
        .limit(1);
      const selected = (consultantParticipants ?? [])[0] as { profile_id?: string; created_at?: string } | undefined;
      if (selected?.profile_id) {
        effectiveAssignment = {
          consultant_profile_id: selected.profile_id,
          assigned_at: selected.created_at ?? null,
          note: null,
          status: 'active'
        } as any;
      }
    }
  }

  if (profile.role === 'consultant' && effectiveAssignment?.consultant_profile_id !== profile.id) {
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
      consultantProfileId:
        effectiveAssignment?.consultant_profile_id ?? (profile.role === 'consultant' ? profile.id : null),
      opsProfileId: profile.role === 'ops_admin' ? profile.id : null,
    });
  } catch (cause) {
    threadError = cause instanceof Error ? cause.message : 'Thread pratica non disponibile.';
  }

  const [requirementsRes, documentsResult, messagesRes] = await Promise.all([
    admin
      .from('practice_document_requirements')
      .select('requirement_key, label, is_required, status')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true }),
    listApplicationDocumentsForSingleApplicationCompat({
      client: admin as unknown as Parameters<typeof listApplicationDocumentsForSingleApplicationCompat>[0]['client'],
      applicationId,
      ascending: true,
      includeExtendedColumns: true
    }),
    threadId ? listMessagesCompat(admin, threadId) : Promise.resolve({ rows: [], error: null }),
  ]);

  if (documentsResult.error) {
    return (
      <section className="section-card">
        <div className="section-title">
          <span>⚠️</span>
          <span>Errore documenti pratica</span>
        </div>
        <p className="admin-item-sub" style={{ marginTop: 10 }}>
          {documentsResult.error.message ?? 'Impossibile caricare i documenti della pratica.'}
        </p>
      </section>
    );
  }

  const requirementsTableMissing = Boolean(
    requirementsRes.error && isMissingTable(requirementsRes.error, 'practice_document_requirements')
  );
  const requirementsErrorMessage =
    requirementsRes.error && !requirementsTableMissing ? requirementsRes.error.message : null;

  const requirements = !requirementsTableMissing
    ? ((requirementsRes.data ?? []) as Array<{
        requirement_key: string;
        label: string;
        is_required: boolean;
        status: 'missing' | 'uploaded' | 'waived';
      }>)
    : [];

  const documents = (documentsResult.rows ?? []).map((row) => ({
    id: row.id ?? `${applicationId}:${row.file_name}:${row.created_at ?? ''}`,
    file_name: row.file_name,
    requirement_key: row.requirement_key,
    created_at: row.created_at ?? new Date().toISOString(),
    storage_path: row.storage_path ?? null
  }));

  // Separate preventivi docs from regular docs
  const preventiviRawDocs = documents.filter((d) => d.file_name.startsWith('Preventivo_spesa__'));
  const regularRawDocs = documents.filter((d) => !d.file_name.startsWith('Preventivo_spesa__'));

  // Fetch preventivi_testo
  let preventivi_testo: string | null = null;
  try {
    const { data: crmRow } = await admin
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', companyId)
      .maybeSingle();
    const fields = (crmRow?.admin_fields ?? {}) as Record<string, unknown>;
    preventivi_testo =
      typeof fields.preventivi_testo === 'string' && fields.preventivi_testo.trim()
        ? fields.preventivi_testo.trim()
        : null;
  } catch {
    // CRM non disponibile
  }

  const documentsWithLinks = await Promise.all(
    documents.map(async (document) => {
      if (!document.storage_path) {
        return { ...document, downloadUrl: null as string | null };
      }
      const signed = await admin.storage.from('application-documents').createSignedUrl(document.storage_path, 3600);
      return {
        ...document,
        downloadUrl: signed.error ? null : signed.data.signedUrl
      };
    })
  );

  const fallbackChecklist =
    requirements.length === 0
      ? computeDocumentChecklist(
          applicationId,
          String(application.tender_id ?? application.tender?.title ?? 'base'),
          regularRawDocs.map((document) => ({
            application_id: applicationId,
            file_name: document.file_name,
            requirement_key: document.requirement_key
          }))
        )
      : [];

  const checklist = requirements.length
    ? computeDocumentChecklistFromRequirements(
        applicationId,
        requirements.map((requirement) => ({
          application_id: applicationId,
          requirement_key: requirement.requirement_key,
          label: requirement.label,
          is_required: requirement.is_required
        })),
        regularRawDocs.map((document) => ({
          application_id: applicationId,
          file_name: document.file_name,
          requirement_key: document.requirement_key
        }))
      ).map((item) => ({
        requirement_key: item.key,
        label: item.label,
        is_required: true,
        status: item.uploaded ? ('uploaded' as const) : ('missing' as const)
      }))
    : fallbackChecklist.map((item) => ({
        requirement_key: item.key,
        label: item.label,
        is_required: true,
        status: item.uploaded ? ('uploaded' as const) : ('missing' as const)
      }));

  const messages = (messagesRes.rows ?? []) as PracticeMessage[];

  const missingRequirements = checklist.filter((row) => row.is_required && row.status === 'missing');
  const uploadedRequirements = checklist.filter((row) => row.status === 'uploaded');
  const currentStep =
    extractProgressFromNotes(application.notes ?? null) ??
    computeDerivedProgressKey(String(application.status ?? 'draft'), missingRequirements.length);

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
            <div className="admin-kpi-value">{formatDateTime(effectiveAssignment?.assigned_at ?? null)}</div>
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
              Documenti caricati ({documentsWithLinks.length})
            </div>
            <div className="admin-table">
              {documentsWithLinks.map((document) => (
                <div key={document.id} className="admin-table-row">
                  <div className="admin-table-main">
                    <div className="admin-table-name">{document.file_name}</div>
                    <div className="admin-table-meta">{formatDateTime(document.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {document.downloadUrl ? (
                      <a
                        href={document.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-action secondary"
                      >
                        Scarica
                      </a>
                    ) : (
                      <span className="admin-item-sub">Link non disponibile</span>
                    )}
                  </div>
                </div>
              ))}
              {documentsWithLinks.length === 0 ? <div className="admin-item-sub">Nessun documento caricato.</div> : null}
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

        {requirementsTableMissing ? (
          <div className="admin-item-sub" style={{ marginTop: 10, color: '#92400E', fontWeight: 700 }}>
            Checklist dinamica non disponibile su questo ambiente: uso checklist operativa di fallback.
          </div>
        ) : null}
        {requirementsErrorMessage ? (
          <div className="admin-item-sub" style={{ marginTop: 10, color: '#B91C1C', fontWeight: 700 }}>
            Errore checklist requisiti: {requirementsErrorMessage}
          </div>
        ) : null}
      </section>

      <ConsultantPracticeProgressPanel applicationId={applicationId} initialStep={currentStep} />

      <ConsultantPracticeDocumentsActions
        applicationId={applicationId}
        requirements={checklist.map((row) => ({
          key: row.requirement_key,
          label: row.label || row.requirement_key,
          status: row.status
        }))}
      />

      {/* Sezione Preventivi */}
      <section className="section-card">
        <div className="section-title">
          <span>🧾</span>
          <span>Preventivi</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <PreventiviSection
            preventivi_testo={preventivi_testo}
            files={preventiviRawDocs.map((doc) => ({
              id: doc.id,
              fileName: doc.file_name,
              createdAt: doc.created_at,
              fileSize: 0,
              downloadUrl: null
            }))}
          />
        </div>
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
