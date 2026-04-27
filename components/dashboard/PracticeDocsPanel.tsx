'use client';

import { useMemo, useState } from 'react';
import { ClientUploadDocButton } from '@/components/dashboard/ClientUploadDocButton';

type MissingRequirement = {
  key: string;
  label: string;
};

type UploadedDoc = {
  id: string;
  fileName: string;
  createdAt: string;
};

type DocsView = 'all' | 'missing' | 'uploaded';

export function PracticeDocsPanel({
  applicationId,
  missing,
  uploaded
}: {
  applicationId: string;
  missing: MissingRequirement[];
  uploaded: UploadedDoc[];
}) {
  const [docsView, setDocsView] = useState<DocsView>('all');
  const [query, setQuery] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const qNorm = query.trim().toLowerCase();

  const missingFiltered = useMemo(() => {
    if (!qNorm) return missing;
    return missing.filter((item) => item.label.toLowerCase().includes(qNorm));
  }, [missing, qNorm]);

  const uploadedFiltered = useMemo(() => {
    if (!qNorm) return uploaded;
    return uploaded.filter((item) => item.fileName.toLowerCase().includes(qNorm));
  }, [uploaded, qNorm]);

  return (
    <>
      <div className="client-practice-kpis" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="admin-kpi admin-kpi-link"
          onClick={() => {
            setDocsView((prev) => (prev === 'missing' ? 'all' : 'missing'));
            setQuery('');
          }}
        >
          <div className="admin-kpi-label">Documenti da caricare</div>
          <div className={`admin-kpi-value ${missing.length > 0 ? 'is-warn' : 'is-ok'}`}>{missing.length}</div>
        </button>
        <button
          type="button"
          className="admin-kpi admin-kpi-link"
          onClick={() => {
            setDocsView((prev) => (prev === 'uploaded' ? 'all' : 'uploaded'));
            setQuery('');
          }}
        >
          <div className="admin-kpi-label">Documenti caricati</div>
          <div className="admin-kpi-value">{uploaded.length}</div>
        </button>
      </div>

      {docsView !== 'all' ? (
        <section className="admin-docs-panel client-docs-panel">
          <div className="admin-docs-panel-head">
            <div className="admin-docs-title">
              {docsView === 'missing' ? 'Documenti da caricare' : 'Documenti caricati'}
            </div>
            <button type="button" className="admin-docs-back" onClick={() => setDocsView('all')}>
              Chiudi
            </button>
          </div>

          <div className="admin-docs-search">
            <span className="admin-docs-search-icon">⌕</span>
            <input
              className="admin-docs-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca documento…"
            />
          </div>

            {docsView === 'missing' ? (
            <div className="admin-docs-col">
              <div className="admin-docs-col-title">Documenti da caricare ({missingFiltered.length})</div>
              {missingFiltered.length === 0 ? (
                <div className="admin-panel-empty">Nessun documento da caricare{qNorm ? ' per la ricerca.' : '.'}</div>
              ) : (
                <ul className="admin-checklist">
                  {missingFiltered.map((req) => (
                    <li key={req.key} className="admin-checklist-item is-missing">
                      <span className="admin-check is-missing" aria-hidden="true" />
                      <span style={{ flex: 1 }}>{req.label}</span>
                      <ClientUploadDocButton
                        applicationId={applicationId}
                        requirementKey={req.key}
                        documentLabel={req.label}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="admin-docs-col">
              <div className="admin-docs-col-title">Caricati ({uploadedFiltered.length})</div>
              {uploadedFiltered.length === 0 ? (
                <div className="admin-panel-empty">Nessun documento caricato{qNorm ? ' per la ricerca.' : '.'}</div>
              ) : (
                <div className="admin-table">
                  {uploadedFiltered.map((doc) => (
                    <div key={doc.id} className="admin-table-row">
                      <div className="admin-table-main">
                        <div className="admin-table-name">{doc.fileName}</div>
                        <div className="admin-table-meta">{new Date(doc.createdAt).toLocaleString('it-IT')}</div>
                      </div>

                      <button
                        type="button"
                        className="btn-doc"
                        disabled={openingId === doc.id}
                        onClick={async () => {
                          const win = window.open('', '_blank', 'noreferrer');
                          try {
                            setOpenError(null);
                            setOpeningId(doc.id);
                            const res = await fetch(`/api/documents/signed-url?documentId=${doc.id}`, {
                              cache: 'no-store'
                            });
                            const json = (await res.json().catch(() => ({}))) as {
                              ok?: boolean;
                              url?: string;
                              error?: string;
                            };
                            if (!res.ok || !json.url) {
                              throw new Error(json.error ?? 'Impossibile aprire il documento.');
                            }
                            if (win) {
                              win.location.href = json.url;
                            } else {
                              window.location.href = json.url;
                            }
                          } catch (error) {
                            if (win) win.close();
                            setOpenError(error instanceof Error ? error.message : 'Errore durante l\'apertura del documento.');
                          } finally {
                            setOpeningId(null);
                          }
                        }}
                      >
                        <span>{openingId === doc.id ? '⏳' : '👁'}</span>
                        <span>{openingId === doc.id ? 'Apertura...' : 'Apri'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {openError ? <div className="admin-reminder-error">{openError}</div> : null}
        </section>
      ) : null}
    </>
  );
}
