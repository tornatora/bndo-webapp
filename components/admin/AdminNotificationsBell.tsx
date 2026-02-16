'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function AdminNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; threadId: string; companyId: string; title: string; body: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchAt = useRef<number>(0);

  const unreadCount = items.length;

  async function refresh(silent = true) {
    // avoid spamming the endpoint if realtime bursts
    const now = Date.now();
    if (now - lastFetchAt.current < 800) return;
    lastFetchAt.current = now;

    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications?limit=12', { cache: 'no-store' });
      const json = (await res.json()) as { ok?: boolean; items?: typeof items; error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'Impossibile caricare notifiche.');
      setItems(json.items ?? []);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Errore notifiche.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

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

  useEffect(() => {
    // initial load
    void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // realtime: refresh list when any message is inserted
    const supabase = createClient();
    const channel = supabase
      .channel('admin-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'consultant_messages' }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void refresh(true), 250);
      })
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onOpen(item: (typeof items)[number]) {
    setOpen(false);
    // Mark-as-read is handled when admin opens the client chat (ChatPanel marks read on mount).
    window.location.href = `/admin/clients/${item.companyId}?tab=chat`;
  }

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
        {unreadCount > 0 ? (
          <span className="notification-count" style={{ display: 'flex' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      <div className={`notifications-panel ${open ? 'active' : ''}`} id="adminNotificationsPanel">
        <div className="notifications-header">
          <div className="notifications-title">🔔 Notifiche</div>
          <button type="button" className="notifications-all-link" onClick={() => setOpen(false)}>
            Chiudi
          </button>
        </div>
        <div className="notifications-list">
          {unreadCount === 0 ? (
            <div className="notification-item">
              <div className="notification-title">✅ Nessuna nuova notifica</div>
              <div className="notification-message">Al momento non ci sono nuovi messaggi da leggere.</div>
              <div className="notification-time">Adesso</div>
              <button type="button" className="notifications-cta" onClick={() => setOpen(false)}>
                Ok
              </button>
            </div>
          ) : (
            items.slice(0, 10).map((it) => (
              <button
                key={it.id}
                type="button"
                className="notification-item unread"
                style={{ textAlign: 'left', width: '100%', border: 0, background: 'transparent' }}
                onClick={() => void onOpen(it)}
              >
                <div className="notification-title">💬 {it.title}</div>
                <div className="notification-message">{it.body}</div>
                <div className="notification-time">{new Date(it.createdAt).toLocaleString('it-IT')}</div>
              </button>
            ))
          )}

          {error ? (
            <div className="notification-item">
              <div className="notification-title">⚠️ Errore</div>
              <div className="notification-message">{error}</div>
              <div className="notification-time">Adesso</div>
              <button type="button" className="notifications-cta" onClick={() => void refresh(false)}>
                Riprova
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="notification-item">
              <div className="notification-title">Caricamento...</div>
              <div className="notification-message">Aggiorno le notifiche.</div>
              <div className="notification-time">Adesso</div>
            </div>
          ) : null}

          {unreadCount > 0 ? (
            <div className="notification-item" style={{ paddingTop: 8 }}>
              <button type="button" className="notifications-cta" onClick={() => setOpen(false)}>
                Chiudi
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
