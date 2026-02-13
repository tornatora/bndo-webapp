import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { MockChatPanel } from '@/components/admin/MockChatPanel';
import { RequestDocumentsModal } from '@/components/admin/RequestDocumentsModal';
import { ChatPanel } from '@/components/dashboard/ChatPanel';
import { requireOpsProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getClientSummary } from '@/lib/admin/client-summary';
import { getMockClientDetail } from '@/lib/mock/data';
import { computeDocumentChecklist } from '@/lib/admin/document-requirements';
import { DocReminderButton } from '@/components/admin/DocReminderButton';
import { AdminUploadDocButton } from '@/components/admin/AdminUploadDocButton';
import { AdminPracticeProgress } from '@/components/admin/AdminPracticeProgress';
import { computeDerivedProgressKey, extractProgressFromNotes } from '@/lib/admin/practice-progress';
import { AdminPracticeStatusBadge } from '@/components/admin/AdminPracticeStatusBadge';
import { AdminQuizViewer } from '@/components/admin/AdminQuizViewer';
import { AdminClientCoreInfoForm } from '@/components/admin/AdminClientCoreInfoForm';
import { AdminBillingPanel } from '@/components/admin/AdminBillingPanel';

const ParamsSchema = z.object({
  companyId: z.string().uuid()
});

function buildMockDocPreviewUrl(doc: { file_name: string; created_at: string }, companyName: string) {
  const body = [
    `Documento (Mock)`,
    ``,
    `Azienda: ${companyName}`,
    `Nome file: ${doc.file_name}`,
    `Caricato: ${new Date(doc.created_at).toLocaleString('it-IT')}`,
    ``,
    `Contenuto di prova per testare la visualizzazione documenti in admin.`
  ].join('\n');

  return `data:text/plain;charset=utf-8,${encodeURIComponent(body)}`;
}

function practiceLabel(tenderId: string) {
  const key = tenderId.toLowerCase();
  if (key === 'resto_sud_2_0' || key === 'resto al sud 2.0') return 'Resto al Sud 2.0';
  if (key === 'autoimpiego_centro_nord' || key === 'autoimpiego centro nord') return 'Autoimpiego Centro Nord';
  return tenderId;
}

function formatPracticeTitle(value: string) {
  const labeled = practiceLabel(value);
  if (labeled !== value) return labeled;
  // If it's a UUID (real DB tender_id), show a short stable label.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return `Pratica ${value.slice(0, 8)}`;
  }
  return `Pratica ${value}`;
}

function displayPracticeTitle(practice: { tender_id: string; tender_title?: string | null }) {
  return practice.tender_title && practice.tender_title.trim() ? practice.tender_title : formatPracticeTitle(practice.tender_id);
}

type TabKey = 'info' | 'chat' | 'billing' | `practice:${string}`;

function getActiveTab(searchParams?: Record<string, string | string[] | undefined>): TabKey {
  const raw = searchParams?.tab;
  const tab = Array.isArray(raw) ? raw[0] : raw;
  if (!tab) return 'info';
  if (tab === 'info' || tab === 'chat' || tab === 'billing') return tab as TabKey;
  if (tab.startsWith('practice:')) return tab as TabKey;
  return 'info';
}

export default async function AdminClientDetailPage({
  params,
  searchParams
}: {
  params: { companyId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) notFound();

  const companyId = parsed.data.companyId;
  const isMock = process.env.MOCK_BACKEND === 'true';
  const activeTab = getActiveTab(searchParams);
  const rawDocsView = Array.isArray(searchParams?.docs) ? searchParams?.docs?.[0] : searchParams?.docs;
  const docsView: 'all' | 'missing' | 'uploaded' = rawDocsView === 'missing' || rawDocsView === 'uploaded' ? rawDocsView : 'all';
  const rawQuery = Array.isArray(searchParams?.q) ? searchParams?.q?.[0] : searchParams?.q;
  const q = (rawQuery ?? '').toString().trim();
  const qNorm = q.toLowerCase();

  if (isMock) {
    const detail = getMockClientDetail(companyId);
    if (!detail) notFound();

    const client = detail.client;
    const selectedPracticeId = activeTab.startsWith('practice:') ? activeTab.split(':')[1] : null;
    const selectedPractice = selectedPracticeId ? detail.practices.find((p) => p.id === selectedPracticeId) ?? null : null;

    return (
      <div className="dashboard-shell-client">
        <aside className="dashboard-sidebar-client">
          <nav className="main-tabs" aria-label="Menu cliente">
            <div className="main-tabs-container">
              <Link className={`main-tab ${activeTab === 'info' ? 'active' : ''}`} href={`/admin/clients/${companyId}?tab=info`}>
                <span className="main-tab-label">Info cliente</span>
              </Link>

              <div className="sidebar-section-title">Pratiche richieste</div>
              {detail.practices.map((practice) => (
                <Link
                  key={practice.id}
                  className={`main-tab ${activeTab === `practice:${practice.id}` ? 'active' : ''}`}
                  href={`/admin/clients/${companyId}?tab=practice:${practice.id}`}
                  title={displayPracticeTitle(practice)}
                >
                  <span className="main-tab-label">{displayPracticeTitle(practice)}</span>
                </Link>
              ))}

              <div className="sidebar-divider" />

              <Link className={`main-tab ${activeTab === 'billing' ? 'active' : ''}`} href={`/admin/clients/${companyId}?tab=billing`}>
                <span className="main-tab-label">Fatturazione e pagamenti</span>
              </Link>

              <Link className={`main-tab ${activeTab === 'chat' ? 'active' : ''}`} href={`/admin/clients/${companyId}?tab=chat`}>
                <span className="main-tab-label">Chat</span>
              </Link>

              <div style={{ padding: '10px 18px' }}>
                <Link className="back-button" href="/admin" style={{ marginBottom: 0, width: '100%', justifyContent: 'center' }}>
                  ← Clienti
                </Link>
              </div>
            </div>
          </nav>
        </aside>

        <main className="dashboard-content dashboard-content-client">
          {activeTab === 'info' ? (
            <>
              <section className="welcome-section">
                <h1 className="welcome-title">{client.companyName}</h1>
                <p className="welcome-subtitle">{client.clientEmail}</p>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                  {client.vatNumber ? <span className="meta-tag">P.IVA: {client.vatNumber}</span> : null}
                  {client.industry ? <span className="meta-tag">Settore: {client.industry}</span> : null}
                  <span className="meta-tag">Pratiche: {detail.practices.length}</span>
                </div>
              </section>

              <section className="section-card">
                <div className="section-title">Scheda cliente</div>
                <div className="admin-item-sub" style={{ marginTop: -6, marginBottom: 14 }}>
                  In modalità test alcuni dati sono simulati.
                </div>

                <AdminClientCoreInfoForm
                  isMock
                  initial={{
                    company: {
                      id: client.companyId,
                      name: client.companyName,
                      vat_number: client.vatNumber,
                      industry: client.industry,
                      annual_spend_target: null
                    },
                    profile: {
                      id: client.companyId,
                      email: client.clientEmail,
                      full_name: client.clientFullName,
                      username: 'demo'
                    }
                  }}
                />
              </section>

              <AdminQuizViewer email={client.clientEmail} isMock />
            </>
          ) : null}

          {activeTab.startsWith('practice:') ? (
            selectedPractice ? (
              (() => {
                const appDocs = detail.documents.filter((d) => d.application_id === selectedPractice.id);
                const checklist = computeDocumentChecklist(selectedPractice.id, selectedPractice.tender_id, appDocs);
                const missingCount = checklist.filter((item) => !item.uploaded).length;
                const initialStep = computeDerivedProgressKey(selectedPractice.status, missingCount);
                const title = displayPracticeTitle(selectedPractice);

                return (
                  <article className="pratica-card">
                    <div className="pratica-header">
                      <div>
                        <h2 className="pratica-title">{title}</h2>
                        <p className="pratica-type">
                          Aggiornata: {new Date(selectedPractice.updated_at).toLocaleString('it-IT')}
                          {selectedPractice.notes ? ` · ${selectedPractice.notes}` : ''}
                        </p>
                      </div>
                      <AdminPracticeStatusBadge applicationId={selectedPractice.id} initialStep={initialStep} />
                    </div>

                    <div className="admin-practice-crm">
                      <div className="admin-practice-crm-top">
                        <Link className="admin-kpi admin-kpi-link" href={`/admin/clients/${companyId}?tab=practice:${selectedPractice.id}&docs=missing`}>
                          <div className="admin-kpi-label">Mancanti</div>
                          <div className={`admin-kpi-value ${missingCount > 0 ? 'is-warn' : 'is-ok'}`}>{missingCount}</div>
                        </Link>
                      <Link className="admin-kpi admin-kpi-link" href={`/admin/clients/${companyId}?tab=practice:${selectedPractice.id}&docs=uploaded`}>
                        <div className="admin-kpi-label">Caricati</div>
                        <div className="admin-kpi-value">{appDocs.length}</div>
                      </Link>

                      <div style={{ marginLeft: 'auto' }}>
                        <RequestDocumentsModal
                          threadId={detail.threadId}
                          context={`Bando: ${title}`}
                          buttonLabel="Nuova richiesta"
                          />
                        </div>
                      </div>

                      {docsView === 'all' ? (
                        <AdminPracticeProgress
                          applicationId={selectedPractice.id}
                          initialStep={initialStep}
                          threadId={detail.threadId}
                          toEmail={client.clientEmail}
                          companyName={client.companyName}
                          practiceTitle={title}
                          isMock
                        />
                      ) : null}

                      {docsView !== 'all' ? (
                        (() => {
                          const missingAll = checklist.filter((c) => !c.uploaded);
                          const missingFiltered = qNorm ? missingAll.filter((r) => r.label.toLowerCase().includes(qNorm)) : missingAll;
                          const docsFiltered = qNorm ? appDocs.filter((d) => d.file_name.toLowerCase().includes(qNorm)) : appDocs;

                          return (
                            <section className="admin-docs-panel">
                              <div className="admin-docs-panel-head">
                                <div className="admin-docs-title">{docsView === 'missing' ? 'Documenti mancanti' : 'Documenti caricati'}</div>
                                <Link className="admin-docs-back" href={`/admin/clients/${companyId}?tab=practice:${selectedPractice.id}`}>
                                  Chiudi
                                </Link>
                              </div>

                              <div className="admin-docs-search">
                                <span className="admin-docs-search-icon">⌕</span>
                                <form>
                                  <input
                                    className="admin-docs-search-input"
                                    name="q"
                                    placeholder="Cerca documento…"
                                    defaultValue={q}
                                  />
                                  <input type="hidden" name="tab" value={`practice:${selectedPractice.id}`} />
                                  <input type="hidden" name="docs" value={docsView} />
                                </form>
                              </div>

                              {docsView === 'missing' ? (
                                <div className="admin-docs-col">
                                  <div className="admin-docs-col-title">Mancanti ({missingFiltered.length})</div>
                                  {missingFiltered.length === 0 ? (
                                    <div className="admin-panel-empty">Nessun documento mancante{qNorm ? ' per la ricerca.' : '.'}</div>
                                  ) : (
                                    <ul className="admin-checklist">
                                      {missingFiltered.map((req) => (
                                        <li key={req.key} className="admin-checklist-item is-missing">
                                          <span className="admin-check is-missing" aria-hidden="true" />
                                          <span style={{ flex: 1 }}>{req.label}</span>
                                          <DocReminderButton
                                            threadId={detail.threadId}
                                            toEmail={client.clientEmail}
                                            companyName={client.companyName}
                                            practiceTitle={title}
                                            documentLabel={req.label}
                                          />
                                          <AdminUploadDocButton
                                            applicationId={selectedPractice.id}
                                            companyId={client.companyId}
                                            documentLabel={req.label}
                                            disabledReason="Upload admin (mock) non attivo"
                                          />
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ) : (
                                <div className="admin-docs-col">
                                  <div className="admin-docs-col-title">Caricati ({docsFiltered.length})</div>
                                  {docsFiltered.length === 0 ? (
                                    <div className="admin-panel-empty">Nessun documento caricato{qNorm ? ' per la ricerca.' : '.'}</div>
                                  ) : (
                                    <div className="admin-table">
                                      {docsFiltered.map((doc) => (
                                        <div key={doc.id} className="admin-table-row">
                                          <div className="admin-table-main">
                                            <div className="admin-table-name">{doc.file_name}</div>
                                            <div className="admin-table-meta">{new Date(doc.created_at).toLocaleString('it-IT')}</div>
                                          </div>
                                          <a
                                            className="btn-doc"
                                            href={buildMockDocPreviewUrl(doc, client.companyName)}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <span>👁</span>
                                            <span>Apri</span>
                                          </a>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </section>
                          );
                        })()
                      ) : null}
                    </div>
                  </article>
                );
              })()
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p className="empty-text">Pratica non trovata.</p>
              </div>
            )
          ) : null}

          {activeTab === 'chat' ? (
            <section className="section-card">
              <div className="section-title">
                <span>💬</span>
                <span>Chat con Cliente</span>
              </div>
              <MockChatPanel threadId={detail.threadId} />
            </section>
          ) : null}

          {activeTab === 'billing' ? (
            <AdminBillingPanel
              isMock
              companyId={client.companyId}
              threadId={detail.threadId}
              toEmail={client.clientEmail}
              companyName={client.companyName}
              practices={detail.practices.map((p) => ({ id: p.id, tender_id: p.tender_id, tender_title: null }))}
            />
          ) : null}
        </main>
      </div>
    );
  }

  const { profile } = await requireOpsProfile();
  const supabase = createClient();

  const summary = await getClientSummary(supabase, companyId);

  const { data: existingThread } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  let threadId = existingThread?.id ?? null;

  if (!threadId) {
    const { data: createdThread, error } = await supabase
      .from('consultant_threads')
      .insert({ company_id: companyId })
      .select('id')
      .single();

    if (!error && createdThread?.id) {
      threadId = createdThread.id;
    } else {
      const { data: fallbackThread } = await supabase
        .from('consultant_threads')
        .select('id')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();
      threadId = fallbackThread?.id ?? null;
    }
  }

  const { data: participant } = threadId
    ? await supabase
        .from('consultant_thread_participants')
        .select('last_read_at')
        .eq('thread_id', threadId)
        .eq('profile_id', profile.id)
        .maybeSingle()
    : { data: null };

  const { data: initialMessages } = threadId
    ? await supabase
        .from('consultant_messages')
        .select('id, thread_id, sender_profile_id, body, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(200)
    : { data: [] };

  // serviceOrder intentionally not loaded here anymore (scheda cliente is now editable form-first).

  const selectedPracticeId = activeTab.startsWith('practice:') ? activeTab.split(':')[1] : null;
  const selectedPractice = selectedPracticeId ? summary.applications.find((p) => p.id === selectedPracticeId) ?? null : null;

  return (
    <div className="dashboard-shell-client">
      <aside className="dashboard-sidebar-client">
        <nav className="main-tabs" aria-label="Menu cliente">
          <div className="main-tabs-container">
            <Link className={`main-tab ${activeTab === 'info' ? 'active' : ''}`} href={`/admin/clients/${companyId}?tab=info`}>
              <span className="main-tab-label">Info cliente</span>
            </Link>

            <div className="sidebar-section-title">Pratiche richieste</div>
            {summary.applications.map((practice) => (
              <Link
                key={practice.id}
                className={`main-tab ${activeTab === `practice:${practice.id}` ? 'active' : ''}`}
                href={`/admin/clients/${companyId}?tab=practice:${practice.id}`}
                title={displayPracticeTitle(practice)}
              >
                <span className="main-tab-label">{displayPracticeTitle(practice)}</span>
              </Link>
            ))}

            <div className="sidebar-divider" />

            <Link className={`main-tab ${activeTab === 'billing' ? 'active' : ''}`} href={`/admin/clients/${companyId}?tab=billing`}>
              <span className="main-tab-label">Fatturazione e pagamenti</span>
            </Link>

            <Link className={`main-tab ${activeTab === 'chat' ? 'active' : ''}`} href={`/admin/clients/${companyId}?tab=chat`}>
              <span className="main-tab-label">Chat</span>
            </Link>

            <div style={{ padding: '10px 18px' }}>
              <Link className="back-button" href="/admin" style={{ marginBottom: 0, width: '100%', justifyContent: 'center' }}>
                ← Clienti
              </Link>
            </div>
          </div>
        </nav>
      </aside>

      <main className="dashboard-content dashboard-content-client">
        {activeTab === 'info' ? (
          <>
            <section className="welcome-section">
              <h1 className="welcome-title">{summary.company?.name ?? 'Cliente'}</h1>
              <p className="welcome-subtitle">{summary.clientProfile?.email ?? 'Nessun profilo client_admin trovato.'}</p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                {summary.company?.vat_number ? <span className="meta-tag">P.IVA: {summary.company.vat_number}</span> : null}
                {summary.company?.industry ? <span className="meta-tag">Settore: {summary.company.industry}</span> : null}
                {summary.company?.annual_spend_target ? (
                  <span className="meta-tag">Spesa target: {summary.company.annual_spend_target.toLocaleString('it-IT')} €</span>
                ) : null}
                <span className="meta-tag">Pratiche: {summary.applications.length}</span>
              </div>
            </section>

            <section className="section-card">
              <div className="section-title">Scheda cliente</div>
              <AdminClientCoreInfoForm
                isMock={false}
                initial={{
                  company: {
                    id: companyId,
                    name: summary.company?.name ?? '',
                    vat_number: summary.company?.vat_number ?? null,
                    industry: summary.company?.industry ?? null,
                    annual_spend_target: summary.company?.annual_spend_target ?? null
                  },
                  profile: summary.clientProfile
                    ? {
                        id: summary.clientProfile.id,
                        email: summary.clientProfile.email,
                        full_name: summary.clientProfile.full_name,
                        username: summary.clientProfile.username
                      }
                    : null
                }}
              />
            </section>
            <AdminQuizViewer email={summary.clientProfile?.email ?? null} isMock={false} />
          </>
        ) : null}

        {activeTab.startsWith('practice:') ? (
          selectedPractice ? (
            (() => {
              const appDocs = summary.documents.filter((d) => d.application_id === selectedPractice.id);
              const checklist = computeDocumentChecklist(
                selectedPractice.id,
                selectedPractice.tender_title ?? selectedPractice.tender_id,
                appDocs
              );
              const missingCount = checklist.filter((item) => !item.uploaded).length;
              const initialStep = extractProgressFromNotes(selectedPractice.notes) ?? computeDerivedProgressKey(selectedPractice.status, missingCount);
              const title = displayPracticeTitle(selectedPractice);

              return (
                <article className="pratica-card">
                  <div className="pratica-header">
                    <div>
                      <h2 className="pratica-title">{title}</h2>
                      <p className="pratica-type">
                        Aggiornata: {new Date(selectedPractice.updated_at).toLocaleString('it-IT')}
                        {selectedPractice.notes ? ` · ${selectedPractice.notes}` : ''}
                      </p>
                    </div>
                    <AdminPracticeStatusBadge applicationId={selectedPractice.id} initialStep={initialStep} />
                  </div>

                  <div className="admin-practice-crm">
                    <div className="admin-practice-crm-top">
                      <Link className="admin-kpi admin-kpi-link" href={`/admin/clients/${companyId}?tab=practice:${selectedPractice.id}&docs=missing`}>
                        <div className="admin-kpi-label">Mancanti</div>
                        <div className={`admin-kpi-value ${missingCount > 0 ? 'is-warn' : 'is-ok'}`}>{missingCount}</div>
                      </Link>
                    <Link className="admin-kpi admin-kpi-link" href={`/admin/clients/${companyId}?tab=practice:${selectedPractice.id}&docs=uploaded`}>
                      <div className="admin-kpi-label">Caricati</div>
                      <div className="admin-kpi-value">{appDocs.length}</div>
                    </Link>

                    <div style={{ marginLeft: 'auto' }}>
                      <RequestDocumentsModal
                        threadId={threadId}
                        context={`Bando: ${title}`}
                        buttonLabel="Nuova richiesta"
                        />
                      </div>
                    </div>

                    {docsView === 'all' ? (
                      <AdminPracticeProgress
                        applicationId={selectedPractice.id}
                        initialStep={initialStep}
                        threadId={threadId}
                        toEmail={summary.clientProfile?.email ?? null}
                        companyName={summary.company?.name ?? 'Cliente'}
                        practiceTitle={title}
                        isMock={false}
                      />
                    ) : null}

                    {docsView !== 'all' ? (
                      (() => {
                        const missingAll = checklist.filter((c) => !c.uploaded);
                        const missingFiltered = qNorm ? missingAll.filter((r) => r.label.toLowerCase().includes(qNorm)) : missingAll;
                        const docsFiltered = qNorm ? appDocs.filter((d) => d.file_name.toLowerCase().includes(qNorm)) : appDocs;

                        return (
                          <section className="admin-docs-panel">
                            <div className="admin-docs-panel-head">
                              <div className="admin-docs-title">{docsView === 'missing' ? 'Documenti mancanti' : 'Documenti caricati'}</div>
                              <Link className="admin-docs-back" href={`/admin/clients/${companyId}?tab=practice:${selectedPractice.id}`}>
                                Chiudi
                              </Link>
                            </div>

                            <div className="admin-docs-search">
                              <span className="admin-docs-search-icon">⌕</span>
                              <form>
                                <input
                                  className="admin-docs-search-input"
                                  name="q"
                                  placeholder="Cerca documento…"
                                  defaultValue={q}
                                />
                                <input type="hidden" name="tab" value={`practice:${selectedPractice.id}`} />
                                <input type="hidden" name="docs" value={docsView} />
                              </form>
                            </div>

                            {docsView === 'missing' ? (
                              <div className="admin-docs-col">
                                <div className="admin-docs-col-title">Mancanti ({missingFiltered.length})</div>
                                {missingFiltered.length === 0 ? (
                                  <div className="admin-panel-empty">Nessun documento mancante{qNorm ? ' per la ricerca.' : '.'}</div>
                                ) : (
                                  <ul className="admin-checklist">
                                    {missingFiltered.map((req) => (
                                      <li key={req.key} className="admin-checklist-item is-missing">
                                        <span className="admin-check is-missing" aria-hidden="true" />
                                        <span style={{ flex: 1 }}>{req.label}</span>
                                        <DocReminderButton
                                          threadId={threadId}
                                          toEmail={summary.clientProfile?.email ?? null}
                                          companyName={summary.company?.name ?? 'Cliente'}
                                          practiceTitle={title}
                                          documentLabel={req.label}
                                        />
                                        <AdminUploadDocButton
                                          applicationId={selectedPractice.id}
                                          companyId={companyId}
                                          documentLabel={req.label}
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ) : (
                              <div className="admin-docs-col">
                                <div className="admin-docs-col-title">Caricati ({docsFiltered.length})</div>
                                {docsFiltered.length === 0 ? (
                                  <div className="admin-panel-empty">Nessun documento caricato{qNorm ? ' per la ricerca.' : '.'}</div>
                                ) : (
                                  <div className="admin-table">
                                    {docsFiltered.map((doc) => (
                                      <div key={doc.id} className="admin-table-row">
                                        <div className="admin-table-main">
                                          <div className="admin-table-name">{doc.file_name}</div>
                                          <div className="admin-table-meta">{new Date(doc.created_at).toLocaleString('it-IT')}</div>
                                        </div>

                                        {doc.downloadUrl ? (
                                          <a className="btn-doc" href={doc.downloadUrl} target="_blank" rel="noreferrer">
                                            <span>👁</span>
                                            <span>Apri</span>
                                          </a>
                                        ) : (
                                          <span className="btn-doc" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                                            <span>⚠</span>
                                            <span>Non disponibile</span>
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </section>
                        );
                      })()
                    ) : null}
                  </div>
                </article>
              );
            })()
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p className="empty-text">Pratica non trovata.</p>
            </div>
          )
        ) : null}

        {activeTab === 'chat' ? (
          <section className="section-card">
            <div className="section-title">
              <span>💬</span>
              <span>Chat con Cliente</span>
            </div>

            {!threadId ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <p className="empty-text">Impossibile creare/aprire il thread chat per questa azienda.</p>
              </div>
            ) : (
              <ChatPanel
                threadId={threadId}
                viewerProfileId={profile.id}
                initialMessages={initialMessages ?? []}
                initialLastReadAt={participant?.last_read_at ?? null}
              />
            )}
          </section>
        ) : null}

        {activeTab === 'billing' ? (
          <AdminBillingPanel
            isMock={false}
            companyId={companyId}
            threadId={threadId}
            toEmail={summary.clientProfile?.email ?? null}
            companyName={summary.company?.name ?? 'Cliente'}
            practices={summary.applications.map((p) => ({ id: p.id, tender_id: p.tender_id, tender_title: p.tender_title }))}
          />
        ) : null}
      </main>
    </div>
  );
}
