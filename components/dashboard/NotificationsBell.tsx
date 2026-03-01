'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { removeChannelSafely, subscribeToChannelSafely } from '@/lib/supabase/realtime-safe';
import { isAutoReplyMessage } from '@/lib/chat/constants';

type Message = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

type ChatSyncResponse = {
  messages?: Message[];
  lastReadAt?: string;
};

type ThreadContextPayload = {
  threadId: string | null;
  lastReadAt: string | null;
};

// Simple in-memory cache to avoid refetching on every navigation.
let cachedThreadContext: ThreadContextPayload | null = null;
let cachedAt = 0;

export function NotificationsBell({ viewerProfileId }: { viewerProfileId: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string>(new Date(0).toISOString());
  const [contextLoaded, setContextLoaded] = useState(false);
  const markingRead = useRef(false);

  async function loadThreadContext() {
    // Cache for a short time; enough to cover multiple tab navigations.
    const now = Date.now();
    if (cachedThreadContext && now - cachedAt < 30_000) {
      setThreadId(cachedThreadContext.threadId);
      setLastReadAt(cachedThreadContext.lastReadAt ?? new Date(0).toISOString());
      setContextLoaded(true);
      return;
    }

    try {
      const res = await fetch('/api/chat/thread-context', { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as ThreadContextPayload & { error?: string };
      if (!res.ok) {
        // Keep silent; bell still renders but with no thread.
        setContextLoaded(true);
        return;
      }
      cachedThreadContext = { threadId: json.threadId ?? null, lastReadAt: json.lastReadAt ?? null };
      cachedAt = now;
      setThreadId(json.threadId ?? null);
      setLastReadAt(json.lastReadAt ?? new Date(0).toISOString());
      setContextLoaded(true);
    } catch {
      setContextLoaded(true);
    }
  }

  const unreadMessages = useMemo(() => {
    if (!threadId) return [];
    const lastRead = new Date(lastReadAt).getTime();
    return messages.filter(
      (message) =>
        message.sender_profile_id !== viewerProfileId &&
        new Date(message.created_at).getTime() > lastRead &&
        !isAutoReplyMessage(message.body)
    );
  }, [messages, viewerProfileId, lastReadAt, threadId]);

  const unreadCount = unreadMessages.length;

  function mergeMessages(previous: Message[], incoming: Message[]) {
    const byId = new Map<string, Message>();
    for (const msg of previous) byId.set(msg.id, msg);
    for (const msg of incoming) byId.set(msg.id, msg);
    return [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async function refresh() {
    if (!threadId) return;
    const response = await fetch(`/api/chat/messages?threadId=${threadId}`);
    if (!response.ok) return;
    const payload = (await response.json()) as ChatSyncResponse;
    setMessages((prev) => mergeMessages(prev, payload.messages ?? []));
    if (payload.lastReadAt) setLastReadAt(payload.lastReadAt);
  }

  async function markRead() {
    if (!threadId) return;
    if (markingRead.current) return;
    markingRead.current = true;
    try {
      const response = await fetch('/api/chat/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId })
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { lastReadAt?: string };
      setLastReadAt(payload.lastReadAt ?? new Date().toISOString());
    } finally {
      markingRead.current = false;
    }
  }

  useEffect(() => {
    void loadThreadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!threadId) return;
    const supabase = createClient();
    const channel = subscribeToChannelSafely(
      () =>
        supabase
          .channel(`notify-thread-${threadId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'consultant_messages', filter: `thread_id=eq.${threadId}` },
            (payload) => {
              const incoming = payload.new as Message;
              setMessages((prev) => mergeMessages(prev, [incoming]));
            }
          )
          .subscribe(),
      'dashboard notifications'
    );

    return () => {
      removeChannelSafely(supabase, channel, 'dashboard notifications');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (!contextLoaded) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextLoaded, threadId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function onOpenChat() {
    setIsOpen(false);
    router.push('/dashboard/messages');
  }

  async function onNotificationTap() {
    // Mark as read but don't block navigation.
    void markRead();
    await onOpenChat();
  }

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
          <Link className="notifications-all-link" href="/dashboard/notifications" onClick={() => setIsOpen(false)}>
            Vedi tutte
          </Link>
        </div>
        <div className="notifications-list">
          {unreadCount === 0 ? (
            <div className="notification-item">
              <div className="notification-title">✅ Nessuna nuova notifica</div>
              <div className="notification-message">Non ci sono nuovi messaggi da leggere.</div>
              <div className="notification-time">Adesso</div>
              <button type="button" className="notifications-cta" onClick={() => void onOpenChat()}>
                Apri chat
              </button>
            </div>
          ) : (
            unreadMessages
              .slice(-8)
              .reverse()
              .map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className="notification-item unread"
                  style={{ textAlign: 'left', width: '100%', border: 0, background: 'transparent' }}
                  onClick={() => void onNotificationTap()}
                >
                  <div className="notification-title">💬 Nuovo messaggio consulente</div>
                  <div className="notification-message">{notification.body}</div>
                  <div className="notification-time">{new Date(notification.created_at).toLocaleString('it-IT')}</div>
                </button>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
