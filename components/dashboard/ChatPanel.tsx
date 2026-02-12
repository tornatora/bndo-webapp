'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type Message = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

type ChatPanelProps = {
  threadId: string;
  viewerProfileId: string;
  initialMessages: Message[];
  initialLastReadAt: string | null;
};

type ChatSyncResponse = {
  messages?: Message[];
  lastReadAt?: string;
};

type SendMessageResponse = {
  message?: Message;
  autoReplyMessage?: Message;
  autoReplyNotice?: string;
};

export function ChatPanel({ threadId, viewerProfileId, initialMessages, initialLastReadAt }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string>(initialLastReadAt ?? new Date(0).toISOString());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const markReadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unreadMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.sender_profile_id !== viewerProfileId &&
          new Date(message.created_at).getTime() > new Date(lastReadAt).getTime()
      ),
    [messages, viewerProfileId, lastReadAt]
  );
  const unreadCount = unreadMessages.length;

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setLastReadAt(initialLastReadAt ?? new Date(0).toISOString());
  }, [initialLastReadAt]);

  useEffect(() => {
    if (!deliveryNotice) return;
    const timer = setTimeout(() => setDeliveryNotice(null), 6000);
    return () => {
      clearTimeout(timer);
    };
  }, [deliveryNotice]);

  function sortMessages(items: Message[]) {
    return [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  function mergeMessages(previous: Message[], incoming: Message[]) {
    const byId = new Map<string, Message>();
    for (const message of previous) byId.set(message.id, message);
    for (const message of incoming) byId.set(message.id, message);
    return sortMessages([...byId.values()]);
  }

  async function refreshMessages(silent = true) {
    try {
      const response = await fetch(`/api/chat/messages?threadId=${threadId}`);
      if (!response.ok) {
        throw new Error('Sincronizzazione chat non riuscita.');
      }
      const payload = (await response.json()) as ChatSyncResponse;
      setMessages((previous) => mergeMessages(previous, payload.messages ?? []));
      if (payload.lastReadAt) {
        setLastReadAt(payload.lastReadAt);
      }
      if (!silent) {
        setSyncError(null);
      }
    } catch (error) {
      if (!silent) {
        setSyncError(error instanceof Error ? error.message : 'Errore sincronizzazione chat.');
      }
    }
  }

  useEffect(() => {
    const bell = document.getElementById('notificationBell');
    if (!bell) return;

    const onToggle = () => setIsNotificationsOpen((previous) => !previous);
    bell.addEventListener('click', onToggle);

    return () => {
      bell.removeEventListener('click', onToggle);
    };
  }, []);

  useEffect(() => {
    const countElement = document.getElementById('notificationCount');
    if (!countElement) return;

    if (unreadCount > 0) {
      countElement.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      countElement.style.display = 'flex';
      return;
    }

    countElement.textContent = '0';
    countElement.style.display = 'none';
  }, [unreadCount]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const bell = document.getElementById('notificationBell');
      const panel = document.getElementById('notificationsPanel');
      const target = event.target as Node | null;
      if (!target || !bell || !panel) return;
      if (bell.contains(target) || panel.contains(target)) return;
      setIsNotificationsOpen(false);
    };

    document.addEventListener('click', onDocumentClick);
    return () => {
      document.removeEventListener('click', onDocumentClick);
    };
  }, []);

  function scrollToBottom() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }

  async function markThreadAsRead() {
    if (isMarkingRead) return;
    setIsMarkingRead(true);

    try {
      const response = await fetch('/api/chat/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threadId })
      });

      if (response.ok) {
        const payload = (await response.json()) as { lastReadAt?: string };
        setLastReadAt(payload.lastReadAt ?? new Date().toISOString());
      }
    } finally {
      setIsMarkingRead(false);
    }
  }

  function scheduleMarkRead() {
    if (markReadTimeout.current) {
      clearTimeout(markReadTimeout.current);
    }
    markReadTimeout.current = setTimeout(() => {
      void markThreadAsRead();
    }, 450);
  }

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`consultant-thread-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'consultant_messages',
          filter: `thread_id=eq.${threadId}`
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((previous) => {
            const exists = previous.some((message) => message.id === incoming.id);
            if (exists) return previous;
            const updated = [...previous, incoming];
            return updated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          });

          if (incoming.sender_profile_id !== viewerProfileId && document.visibilityState === 'visible') {
            scheduleMarkRead();
          }
        }
      )
      .subscribe();

    scheduleMarkRead();
    void refreshMessages(true);

    return () => {
      if (markReadTimeout.current) {
        clearTimeout(markReadTimeout.current);
        markReadTimeout.current = null;
      }
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, viewerProfileId]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void refreshMessages(true);
    }, 25000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshMessages(true);
      scheduleMarkRead();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    if (!isNotificationsOpen) return;
    void markThreadAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotificationsOpen]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed) return;

    setSending(true);
    setSyncError(null);
    setDeliveryNotice(null);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      thread_id: threadId,
      sender_profile_id: viewerProfileId,
      body: trimmed,
      created_at: new Date().toISOString()
    };

    setMessages((previous) => [...previous, optimistic]);
    setValue('');

    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threadId, body: trimmed })
      });

      if (!response.ok) {
        throw new Error('Invio messaggio non riuscito.');
      }

      const payload = (await response.json()) as SendMessageResponse;
      const persistedMessage = payload.message;

      if (persistedMessage) {
        setMessages((previous) => {
          const withoutTemp = previous.filter((message) => message.id !== optimistic.id);
          return mergeMessages(withoutTemp, [persistedMessage]);
        });
      }

      if (payload.autoReplyMessage) {
        setMessages((previous) => mergeMessages(previous, [payload.autoReplyMessage as Message]));
      }

      if (payload.autoReplyNotice) {
        setDeliveryNotice(payload.autoReplyNotice);
      }
    } catch (error) {
      setMessages((previous) => previous.filter((msg) => msg.id !== optimistic.id));
      setValue(trimmed);
      setSyncError(error instanceof Error ? error.message : 'Errore invio messaggio.');
    } finally {
      setSending(false);
    }
  }

  function getInitials(senderId: string) {
    return senderId === viewerProfileId ? 'U' : 'A';
  }

  return (
    <div>
      <div className={`notifications-panel ${isNotificationsOpen ? 'active' : ''}`} id="notificationsPanel">
        <div className="notifications-header">
          <div className="notifications-title">🔔 Notifiche</div>
        </div>
        <div className="notifications-list" id="notificationsList">
          {unreadCount === 0 ? (
            <div className="notification-item">
              <div className="notification-title">✅ Tutto letto</div>
              <div className="notification-message">Nessun nuovo messaggio.</div>
              <div className="notification-time">Adesso</div>
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
                  onClick={() => void markThreadAsRead()}
                >
                  <div className="notification-title">💬 Nuovo messaggio consulente</div>
                  <div className="notification-message">{notification.body}</div>
                  <div className="notification-time">{new Date(notification.created_at).toLocaleString('it-IT')}</div>
                </button>
              ))
          )}
        </div>
      </div>

      <div className="chat-card">
        <div className="chat-toolbar">
          <div className="chat-toolbar-title">Chat Consulente</div>
          <div className="chat-toolbar-status">
            {unreadCount > 0 ? `${unreadCount} nuovo${unreadCount > 1 ? 'i' : ''} messaggio${unreadCount > 1 ? 'i' : ''}` : 'Canale attivo'}
          </div>
        </div>
        <div className="chat-container">
          <div ref={scrollRef} className="chat-messages" id="chatMessages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <p className="empty-text">Nessun messaggio. Inizia una conversazione!</p>
              </div>
            ) : (
              messages.map((message) => {
                const isMine = message.sender_profile_id === viewerProfileId;

                return (
                  <div key={message.id} className={`message ${isMine ? 'user' : ''}`}>
                    <div className="message-avatar">{getInitials(message.sender_profile_id)}</div>
                    <div className="message-content">
                      <div className="message-bubble">{message.body}</div>
                      <div className="message-time">{new Date(message.created_at).toLocaleString('it-IT')}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form className="chat-input-area" onSubmit={sendMessage}>
            <input
              className="chat-input"
              placeholder="Scrivi un messaggio..."
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={1200}
            />
            <button type="submit" className="btn-send" disabled={sending}>
              {sending ? 'Invio...' : 'Invia'}
            </button>
          </form>

          {deliveryNotice ? (
            <p style={{ margin: '0 24px 14px', fontSize: '13px', fontWeight: 600, color: '#15803d' }}>{deliveryNotice}</p>
          ) : null}

          {syncError ? (
            <p style={{ margin: '0 24px 14px', fontSize: '13px', fontWeight: 600, color: '#b91c1c' }}>{syncError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
