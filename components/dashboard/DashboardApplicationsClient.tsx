'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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

export function DashboardApplicationsClient({
  initialItems
}: {
  initialItems: SummaryItem[];
}) {
  const [items, setItems] = useState<SummaryItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch('/api/dashboard/applications-summary', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as {
          items?: SummaryItem[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? 'Impossibile aggiornare le pratiche.');
        if (cancelled) return;
        setItems(json.items ?? []);
        setError(null);
      } catch (refreshError) {
        if (cancelled) return;
        setError(refreshError instanceof Error ? refreshError.message : 'Aggiornamento non riuscito.');
      }
    };

    const delayed = window.setTimeout(() => {
      void refresh();
    }, 220);
    const interval = window.setInterval(() => {
      void refresh();
    }, 30000);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
    };
    const onFocus = () => {
      void refresh();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(delayed);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <>
      {error ? <div className="dashboard-inline-error">{error}</div> : null}
      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p className="empty-text">Nessuna pratica disponibile al momento.</p>
        </div>
      ) : null}
      {items.map((it) => (
        <Link key={it.applicationId} href={`/dashboard/practices/${it.applicationId}`} className="pratica-card pratica-card-link">
          <div className="pratica-header">
            <div>
              <h2 className="pratica-title">{it.title}</h2>
            </div>
            <span className={it.statusClassName}>{it.statusLabel}</span>
          </div>

          <div className="progress-section">
            <div className="progress-header">
              <span className="progress-label">Avanzamento pratica</span>
              <span className="progress-value">{it.progressPct}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${it.progressPct}%` }} />
            </div>
            <div className="document-date" style={{ marginTop: 10, marginBottom: 0 }}>
              Mancanti: <strong>{it.missingCount}</strong> · Caricati: <strong>{it.uploadedCount}</strong>
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
