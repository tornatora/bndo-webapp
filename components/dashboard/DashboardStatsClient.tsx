'use client';

import { useEffect, useState } from 'react';

type StatsPayload = {
  ok?: boolean;
  docsCount?: number;
  unreadCount?: number;
  error?: string;
};

export function DashboardStatsClient({
  initialDocsCount,
  initialUnreadCount
}: {
  initialDocsCount: number;
  initialUnreadCount: number;
}) {
  const [docsCount, setDocsCount] = useState<number>(initialDocsCount);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as StatsPayload;
        if (!res.ok) return;
        if (cancelled) return;
        if (typeof json.docsCount === 'number') setDocsCount(json.docsCount);
        if (typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount);
      } catch {
        // silent
      }
    };
    // Small delay so navigation feels instant; stats update after render.
    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="stats-grid">
      <div className="stat-item">
        <div className="stat-value" suppressHydrationWarning>
          {docsCount}
        </div>
        <div className="stat-label">Documenti Caricati</div>
      </div>
      <div className="stat-item">
        <div className="stat-value" suppressHydrationWarning>
          {unreadCount}
        </div>
        <div className="stat-label">Messaggi Non Letti</div>
      </div>
    </div>
  );
}

