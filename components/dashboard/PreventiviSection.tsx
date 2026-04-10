'use client';

import { useState } from 'react';
import { formatDate, formatFileSize } from '@/lib/utils';

export interface PreventivoFile {
  id: string;
  fileName: string;
  createdAt: string;
  fileSize: number;
  downloadUrl?: string | null;
}

interface PreventiviSectionProps {
  /** Testo libero dei preventivi inserito durante l'onboarding */
  preventivi_testo?: string | null;
  /** File preventivi uploadati (filtrati per prefix 'Preventivo_spesa__') */
  files: PreventivoFile[];
}

export function PreventiviSection({ preventivi_testo, files }: PreventiviSectionProps) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const hasContent = (preventivi_testo && preventivi_testo.trim()) || files.length > 0;

  return (
    <article className="practice-card">
      <div className="practice-card-header">
        <h3 className="practice-card-title">Preventivi</h3>
        {files.length > 0 && (
          <div className="practice-card-badge">
            {files.length} {files.length === 1 ? 'file' : 'file'}
          </div>
        )}
      </div>

      <div className="docs-tab" style={{ marginTop: 8 }}>
        {!hasContent ? (
          <div className="docs-empty">
            <div className="docs-empty-title">Nessun preventivo caricato</div>
            <div className="docs-empty-sub">
              Nessun preventivo è stato inserito durante l&apos;onboarding.
            </div>
          </div>
        ) : (
          <div className="docs-list">
            {/* Testo preventivo */}
            {preventivi_testo && preventivi_testo.trim() ? (
              <div className="docs-row" style={{ alignItems: 'flex-start' }}>
                <div className="docs-row-main">
                  <div className="docs-row-title" style={{ marginBottom: 6 }}>
                    📝 Descrizione preventivo
                  </div>
                  <div
                    className="docs-row-sub"
                    style={{
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                      color: '#374151',
                      fontStyle: 'normal'
                    }}
                  >
                    {preventivi_testo.trim()}
                  </div>
                </div>
              </div>
            ) : null}

            {/* File preventivi */}
            {files.map((doc) => (
              <div key={doc.id} className="docs-row is-onboarding">
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
                      const win = window.open('', '_blank', 'noreferrer');
                      try {
                        setOpenError(null);
                        setOpeningId(doc.id);
                        const res = await fetch(
                          `/api/documents/signed-url?documentId=${doc.id}`,
                          { cache: 'no-store' }
                        );
                        const json = (await res.json().catch(() => ({}))) as {
                          ok?: boolean;
                          url?: string;
                          error?: string;
                        };
                        if (!res.ok || !json.url)
                          throw new Error(json.error ?? 'Impossibile aprire il documento.');
                        if (win) {
                          win.location.href = json.url;
                        } else {
                          window.location.href = json.url;
                        }
                      } catch (e) {
                        if (win) win.close();
                        setOpenError(
                          e instanceof Error ? e.message : "Errore durante l'apertura del documento."
                        );
                      } finally {
                        setOpeningId(null);
                      }
                    }}
                  >
                    {openingId === doc.id ? 'Apertura...' : 'Apri'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {openError && <div className="docs-error">{openError}</div>}
      </div>
    </article>
  );
}
