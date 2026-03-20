'use client';

import React, { useState } from 'react';
import { ClientUploadDocButton } from './ClientUploadDocButton';
import { formatDate, formatFileSize } from '@/lib/utils';

export interface ApplicationRequirement {
  key: string;
  label: string;
}

export interface ApplicationDocument {
  id: string;
  fileName: string;
  createdAt: string;
  fileSize: number;
  downloadUrl?: string | null;
}

interface DocumentsPracticeCardProps {
  applicationId: string;
  practiceTitle: string;
  missing: ApplicationRequirement[];
  uploaded: ApplicationDocument[];
}

export function DocumentsPracticeCard({
  applicationId,
  practiceTitle,
  missing,
  uploaded,
}: DocumentsPracticeCardProps) {
  const [tab, setTab] = useState<'missing' | 'uploaded' | null>(missing.length > 0 ? 'missing' : 'uploaded');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const missingCount = missing.length;
  const uploadedCount = uploaded.length;

  return (
    <article className="practice-card">
      <div className="practice-card-header">
        <h3 className="practice-card-title">{practiceTitle}</h3>
        {missingCount > 0 && (
          <div className="practice-card-badge is-warning">
            {missingCount} da caricare
          </div>
        )}
      </div>

      <div className="docs-tabs-nav">
        <button
          type="button"
          className={`docs-open-btn ${tab === 'missing' ? 'is-active' : ''}`}
          onClick={() => setTab((t) => (t === 'missing' ? null : 'missing'))}
          aria-expanded={tab === 'missing'}
        >
          <span className="docs-open-btn-ic" aria-hidden="true">
            ⚠️
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
                      <ClientUploadDocButton
                        applicationId={applicationId}
                        requirementKey={req.key}
                        documentLabel={req.label}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="docs-empty">
                <div className="docs-empty-title">Nessun documento mancante</div>
                <div className="docs-empty-sub">Hai già caricato tutto il necessario per questa pratica.</div>
              </div>
            )
          ) : uploadedCount ? (
            <div className="docs-list">
              {uploaded.map((doc) => {
                const label = doc.fileName || '';
                const isOnboarding = label.toLowerCase().includes('identità') || 
                                   label.toLowerCase().includes('codice fiscale') || 
                                   label.toLowerCase().includes('visura') ||
                                   label.toLowerCase().includes('did');
                return (
                  <div key={doc.id} className={`docs-row ${isOnboarding ? 'is-onboarding' : ''}`}>
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
                            const res = await fetch(`/api/documents/signed-url?documentId=${doc.id}`, { cache: 'no-store' });
                            const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
                            if (!res.ok || !json.url) throw new Error(json.error ?? 'Impossibile aprire il documento.');
                            if (win) {
                              win.location.href = json.url;
                            } else {
                              window.location.href = json.url;
                            }
                          } catch (e) {
                            if (win) win.close();
                            setOpenError(e instanceof Error ? e.message : 'Errore durante l\'apertura del documento.');
                          } finally {
                            setOpeningId(null);
                          }
                        }}
                      >
                        {openingId === doc.id ? 'Apertura...' : 'Apri'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="docs-empty">
              <div className="docs-empty-title">Nessun documento caricato</div>
              <div className="docs-empty-sub">Non è ancora stato caricato alcun documento per questa pratica.</div>
            </div>
          )}
          {openError && <div className="docs-error">{openError}</div>}
        </div>
      ) : null}
    </article>
  );
}
