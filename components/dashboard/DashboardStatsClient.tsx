'use client';

import { useEffect, useState } from 'react';

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

    const refreshStats = async () => {
      try {
        const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as {
          docsCount?: number;
          unreadCount?: number;
        };
        if (!res.ok || cancelled) return;
        if (typeof json.docsCount === 'number') setDocsCount(json.docsCount);
        if (typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount);
      } catch {
        // refresh best-effort
      }
    };

    const delayed = window.setTimeout(() => {
      void refreshStats();
    }, 180);
    const interval = window.setInterval(() => {
      void refreshStats();
    }, 25000);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshStats();
    };
    const onFocus = () => {
      void refreshStats();
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
