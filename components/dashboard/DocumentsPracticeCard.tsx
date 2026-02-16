'use client';

import { useMemo, useState } from 'react';
import { ClientUploadDocButton } from '@/components/dashboard/ClientUploadDocButton';

type MissingReq = {
  key: string;
  label: string;
};

type UploadedFile = {
  id: string;
  fileName: string;
  createdAt: string;
  fileSize: number;
  downloadUrl: string | null;
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

export function DocumentsPracticeCard({
  applicationId,
  practiceTitle,
  missing,
  uploaded
}: {
  applicationId: string;
  practiceTitle: string;
  missing: MissingReq[];
  uploaded: UploadedFile[];
}) {
  const [tab, setTab] = useState<'missing' | 'uploaded' | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const missingCount = missing.length;
  const uploadedCount = uploaded.length;

  const hasContent = useMemo(() => missingCount > 0 || uploadedCount > 0, [missingCount, uploadedCount]);

  return (
    <article className="section-card docs-practice-card" style={{ marginBottom: 0 }}>
      <div className="docs-practice-head">
        <div className="pratica-type">Pratica</div>
        <div className="pratica-title docs-practice-title">{practiceTitle}</div>
      </div>

      <div className="docs-practice-actions">
        <button
          type="button"
          className={`docs-open-btn docs-open-btn-missing ${tab === 'missing' ? 'is-active' : ''}`}
          onClick={() => setTab((t) => (t === 'missing' ? null : 'missing'))}
          aria-expanded={tab === 'missing'}
        >
          <span className="docs-open-btn-ic" aria-hidden="true">
            ⚠
          </span>
          <span className="docs-open-btn-txt">
            Documenti mancanti <strong>({missingCount})</strong>
          </span>
          <span className="docs-open-btn-arrow" aria-hidden="true">
            ›
          </span>
        </button>

        <button
          type="button"
          className={`docs-open-btn ${tab === 'uploaded' ? 'is-active' : ''}`}
          onClick={() => setTab((t) => (t === 'uploaded' ? null : 'uploaded'))}
          aria-expanded={tab === 'uploaded'}
        >
          <span className="docs-open-btn-ic" aria-hidden="true">
            📎
          </span>
          <span className="docs-open-btn-txt">
            Documenti caricati <strong>({uploadedCount})</strong>
          </span>
          <span className="docs-open-btn-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      </div>

      {tab ? (
        <div className="docs-tab">
          {tab === 'missing' ? (
            missingCount ? (
              <div className="docs-list">
                {missing.map((req) => (
                  <div key={req.key} className="docs-row docs-row-missing">
                    <div className="docs-row-main">
                      <div className="docs-row-title">{req.label}</div>
                      <div className="docs-row-sub">Da caricare per completare la pratica.</div>
                    </div>
                    <div className="docs-row-cta">
                      <ClientUploadDocButton applicationId={applicationId} documentLabel={req.label} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="docs-empty">
                <div className="docs-empty-title">Nessun documento mancante</div>
                <div className="docs-empty-sub">Hai gia caricato tutto il necessario per questa pratica.</div>
              </div>
            )
          ) : uploadedCount ? (
            <div className="docs-list">
              {uploaded.map((doc) => (
                <div key={doc.id} className="docs-row">
                  <div className="docs-row-main">
                    <div className="docs-row-title">{doc.fileName}</div>
                    <div className="docs-row-sub">
                      {formatDate(doc.createdAt)} · {formatFileSize(doc.fileSize)}
                    </div>
                  </div>
                  <div className="docs-row-cta">
                    <button
                      type="button"
                      className="docs-link"
                      disabled={openingId === doc.id}
                      onClick={async () => {
                        try {
                          setOpenError(null);
                          setOpeningId(doc.id);
                          const res = await fetch(`/api/documents/signed-url?documentId=${doc.id}`, { cache: 'no-store' });
                          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
                          if (!res.ok || !json.url) throw new Error(json.error ?? 'Impossibile aprire il documento.');
                          window.open(json.url, '_blank', 'noreferrer');
                        } catch (e) {
                          setOpenError(e instanceof Error ? e.message : 'Errore apertura documento.');
                        } finally {
                          setOpeningId(null);
                        }
                      }}
                    >
                      {openingId === doc.id ? 'Apro...' : 'Apri'}
                    </button>
                  </div>
                </div>
              ))}
              {openError ? (
                <div className="docs-empty" style={{ marginTop: 10 }}>
                  <div className="docs-empty-title">Errore</div>
                  <div className="docs-empty-sub">{openError}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="docs-empty">
              <div className="docs-empty-title">Nessun documento caricato</div>
              <div className="docs-empty-sub">
                Carica i documenti mancanti per iniziare. {hasContent ? null : 'Non risultano ancora file in questa pratica.'}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}
