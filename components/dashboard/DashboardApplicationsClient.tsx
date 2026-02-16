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

type SummaryPayload = {
  ok?: boolean;
  items?: SummaryItem[];
  error?: string;
};

export function DashboardApplicationsClient({
  initialCount,
  initialItems
}: {
  initialCount: number;
  initialItems?: SummaryItem[];
}) {
  const [loading, setLoading] = useState(!initialItems);
  const [items, setItems] = useState<SummaryItem[]>(initialItems ?? []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/dashboard/applications-summary', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as SummaryPayload;
        if (!res.ok) throw new Error(json.error ?? 'Impossibile caricare le pratiche.');
        if (cancelled) return;
        setItems(json.items ?? []);
      } catch {
        if (!cancelled && !initialItems) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    // If we have SSR items, refresh in the background; otherwise fetch immediately.
    const t = setTimeout(run, initialItems ? 400 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [initialItems]);

  if (loading) {
    // Keep layout stable: render a couple of skeleton cards.
    return (
      <>
        {[0, 1].map((i) => (
          <div key={i} className="pratica-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ height: 20, width: 220, borderRadius: 10, background: 'rgba(11,17,54,0.06)' }} />
              <div style={{ height: 22, width: 110, borderRadius: 999, background: 'rgba(11,17,54,0.05)' }} />
            </div>
            <div style={{ height: 10, width: '100%', borderRadius: 999, background: 'rgba(11,17,54,0.05)', marginTop: 14 }} />
            <div style={{ height: 12, width: 260, borderRadius: 10, background: 'rgba(11,17,54,0.05)', marginTop: 12 }} />
          </div>
        ))}
      </>
    );
  }

  if (items.length === 0 && initialCount === 0) return null;

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <p className="empty-text">Nessuna pratica disponibile al momento.</p>
      </div>
    );
  }

  return (
    <>
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
