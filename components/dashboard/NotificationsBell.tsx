'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { removeChannelSafely, subscribeToChannelSafely } from '@/lib/supabase/realtime-safe';

type InboxItem = {
  id: string;
  title: string;
  body: string;
  actionPath: string | null;
  createdAt: string;
  readAt: string | null;
};

type InboxResponse = {
  unreadCount?: number;
  items?: InboxItem[];
  error?: string;
};

export function NotificationsBell({
  viewerProfileId,
  inboxHref = '/dashboard/notifications',
  defaultActionPath = '/dashboard/messages'
}: {
  viewerProfileId: string;
  inboxHref?: string;
  defaultActionPath?: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadItems = useMemo(() => items.filter((item) => !item.readAt), [items]);

  async function refresh() {
    const response = await fetch('/api/notifications/inbox?limit=12', { cache: 'no-store' });
    const json = (await response.json().catch(() => ({}))) as InboxResponse;
    if (!response.ok) return;
    setItems(json.items ?? []);
    setUnreadCount(Number(json.unreadCount ?? 0));
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

  async function openNotification(item: InboxItem) {
    if (!item.readAt) {
      await markRead([item.id]);
    }
    setIsOpen(false);
    router.push(item.actionPath || defaultActionPath);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = subscribeToChannelSafely(
      () =>
        supabase
          .channel(`notify-inbox-${viewerProfileId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notification_inbox',
              filter: `recipient_profile_id=eq.${viewerProfileId}`
            },
            () => {
              if (refreshTimer.current) clearTimeout(refreshTimer.current);
              refreshTimer.current = setTimeout(() => void refresh(), 250);
            }
          )
          .subscribe(),
      'dashboard notifications inbox'
    );

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      removeChannelSafely(supabase, channel, 'dashboard notifications inbox');
    };
  }, [viewerProfileId]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const bell = document.getElementById('bndoNotificationBell');
      const panel = document.getElementById('bndoNotificationsPanel');
      if (!bell || !panel) return;
      if (bell.contains(target) || panel.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="notification-bell"
        id="bndoNotificationBell"
        aria-label="Notifiche"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((p) => !p)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? (
          <span className="notification-count" style={{ display: 'flex' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      <div className={`notifications-panel ${isOpen ? 'active' : ''}`} id="bndoNotificationsPanel">
        <div className="notifications-header">
          <div className="notifications-title">🔔 Notifiche</div>
          <Link className="notifications-all-link" href={inboxHref} onClick={() => setIsOpen(false)}>
            Vedi tutte
          </Link>
        </div>
        <div className="notifications-list">
          {unreadItems.length === 0 ? (
            <div className="notification-item">
              <div className="notification-title">✅ Nessuna nuova notifica</div>
              <div className="notification-message">Tutto aggiornato.</div>
              <div className="notification-time">Adesso</div>
              <Link className="notifications-cta" href={inboxHref} onClick={() => setIsOpen(false)}>
                Apri timeline
              </Link>
            </div>
          ) : (
            unreadItems.slice(0, 8).map((notification) => (
              <button
                key={notification.id}
                type="button"
                className="notification-item unread"
                style={{ textAlign: 'left', width: '100%', border: 0, background: 'transparent' }}
                onClick={() => void openNotification(notification)}
              >
                <div className="notification-title">{notification.title}</div>
                <div className="notification-message">{notification.body}</div>
                <div className="notification-time">{new Date(notification.createdAt).toLocaleString('it-IT')}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
