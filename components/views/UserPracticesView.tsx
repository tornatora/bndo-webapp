'use client';

import { useEffect, useState } from 'react';
import { AtomicPageLoader } from '@/components/dashboard/AtomicPageLoader';
import { PraticheView } from './PraticheView';

type SummaryItem = {
  applicationId: string;
  title: string;
  updatedAt: string;
  missingCount: number;
  uploadedCount: number;
  progressPct: number;
  statusLabel: string;
  statusClassName: string;
};

type UserPracticesViewProps = {
  onVerify?: (grantId?: string) => void;
  onOpenDetail?: (grantId: string) => void;
  onOpenApplication?: (applicationId: string) => void;
};

export function UserPracticesView({ onVerify, onOpenDetail, onOpenApplication }: UserPracticesViewProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/dashboard/applications-summary', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Impossibile caricare le tue pratiche.');
        if (!cancelled) {
          setItems(json.items || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Errore imprevisto.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchSummary();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <AtomicPageLoader className="mobile-menu-safe" title="Sto caricando" targetWord="pratiche" />;
  }

  const hasApplications = items.length > 0;

  return (
    <div className="content-stage mobile-menu-safe">
      {error ? (
        <section className="dashboard-section" style={{ marginBottom: 24 }}>
          <div className="form-error">{error}</div>
        </section>
      ) : null}

      {hasApplications && (
        <section className="dashboard-section" style={{ marginBottom: 40 }}>
          <div className="page-head">
            <div className="page-title">Le tue pratiche</div>
            <div className="page-sub">Monitora l&apos;avanzamento delle tue richieste attive.</div>
          </div>

          <div className="practice-grid">
            {items.map((it) => (
              <button
                key={it.applicationId}
                type="button"
                className="practice-card practice-card-interactive"
                onClick={() => onOpenApplication?.(it.applicationId)}
                style={{ textAlign: 'left', cursor: 'pointer', border: 'none', background: 'var(--white)', display: 'block', width: '100%' }}
              >
                <div className="practice-top">
                  <div className="practice-title">{it.title}</div>
                  <div className={it.statusClassName}>{it.statusLabel}</div>
                </div>

                <div className="practice-amount" style={{ padding: '16px 0', textAlign: 'left', borderBottom: 'none', marginBottom: 0 }}>
                  <div className="progress-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                     <span style={{ fontSize: 13, color: '#64748b' }}>Avanzamento</span>
                     <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{it.progressPct}%</span>
                  </div>
                  <div className="progress-bar" style={{ height: 8, background: 'rgba(11,17,54,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                    <div className="progress-fill" style={{ width: `${it.progressPct}%`, height: '100%', background: '#49cc72' }} />
                  </div>
                </div>

                <div className="practice-footer" style={{ borderTop: '0.5px solid rgba(11,17,54,0.04)', paddingTop: 12, marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Mancanti: <strong>{it.missingCount}</strong> · Caricati: <strong>{it.uploadedCount}</strong>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {!hasApplications && (
        <div className="empty-state" style={{ marginBottom: 40 }}>
          <div className="empty-icon">📋</div>
          <p className="empty-text">Nessuna pratica disponibile al momento.</p>
        </div>
      )}

      {/* Always show available grants as an option to start a "Nuova Pratica" */}
      <PraticheView onVerify={onVerify} onOpenDetail={onOpenDetail} />
    </div>
  );
}
