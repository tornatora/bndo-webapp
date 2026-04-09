'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { removeChannelSafely, subscribeToChannelSafely } from '@/lib/supabase/realtime-safe';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  actionPath: string | null;
  createdAt: string;
  readAt: string | null;
};

type InboxResponse = {
  unreadCount?: number;
  items?: NotificationItem[];
  error?: string;
};

export function AdminNotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh() {
    try {
      const res = await fetch('/api/notifications/inbox?limit=12', { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as InboxResponse;
      if (!res.ok) throw new Error(json.error ?? 'Impossibile caricare notifiche.');
      setItems(json.items ?? []);
      setUnreadCount(Number(json.unreadCount ?? 0));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore notifiche.');
    }
  }

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    await fetch('/api/notifications/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, read: true })
    });
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, readAt: new Date().toISOString() } : it)));
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }

  async function openItem(item: NotificationItem) {
    if (!item.readAt) await markRead([item.id]);
    setOpen(false);
    router.push(item.actionPath || '/admin/notifications');
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = subscribeToChannelSafely(
      () =>
        supabase
          .channel('admin-inbox-notifications')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_inbox' }, () => {
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            refreshTimer.current = setTimeout(() => void refresh(), 250);
          })
          .subscribe(),
      'admin notifications inbox'
    );

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      removeChannelSafely(supabase, channel, 'admin notifications inbox');
    };
  }, []);

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
        {unreadCount > 0 ? (
          <span className="notification-count" style={{ display: 'flex' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      <div className={`notifications-panel ${open ? 'active' : ''}`} id="adminNotificationsPanel">
        <div className="notifications-header">
          <div className="notifications-title">🔔 Notifiche</div>
          <Link className="notifications-all-link" href="/admin/notifications" onClick={() => setOpen(false)}>
            Vedi tutte
          </Link>
        </div>
        <div className="notifications-list">
          {unreadCount === 0 ? (
            <div className="notification-item">
              <div className="notification-title">✅ Nessuna nuova notifica</div>
              <div className="notification-message">Al momento non ci sono notifiche non lette.</div>
              <div className="notification-time">Adesso</div>
            </div>
          ) : (
            items
              .filter((it) => !it.readAt)
              .slice(0, 10)
              .map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="notification-item unread"
                  style={{ textAlign: 'left', width: '100%', border: 0, background: 'transparent' }}
                  onClick={() => void openItem(it)}
                >
                  <div className="notification-title">{it.title}</div>
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
