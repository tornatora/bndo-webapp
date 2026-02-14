'use client';

import { useEffect, useState } from 'react';

export function AdminNotificationsBell() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const bell = document.getElementById('adminNotificationBell');
      const panel = document.getElementById('adminNotificationsPanel');
      if (!bell || !panel) return;
      if (bell.contains(target) || panel.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="notification-bell"
        id="adminNotificationBell"
        aria-label="Notifiche admin"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
      >
        <span aria-hidden="true">🔔</span>
      </button>

      <div className={`notifications-panel ${open ? 'active' : ''}`} id="adminNotificationsPanel">
        <div className="notifications-header">
          <div className="notifications-title">🔔 Notifiche</div>
          <button type="button" className="notifications-all-link" onClick={() => setOpen(false)}>
            Chiudi
          </button>
        </div>
        <div className="notifications-list">
          <div className="notification-item">
            <div className="notification-title">✅ Nessuna nuova notifica</div>
            <div className="notification-message">Al momento non ci sono nuove notifiche.</div>
            <div className="notification-time">Adesso</div>
            <button type="button" className="notifications-cta" onClick={() => setOpen(false)}>
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
