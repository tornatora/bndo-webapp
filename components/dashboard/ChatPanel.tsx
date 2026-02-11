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

export function ChatPanel({ threadId, viewerProfileId, initialMessages, initialLastReadAt }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string>(initialLastReadAt ?? new Date(0).toISOString());
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const markReadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setLastReadAt(initialLastReadAt ?? new Date(0).toISOString());
  }, [initialLastReadAt]);

  function scrollToBottom() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }

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

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      thread_id: threadId,
      sender_profile_id: viewerProfileId,
      body: trimmed,
      created_at: new Date().toISOString()
    };

    setMessages((previous) => [...previous, optimistic]);
    setValue('');

    const response = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ threadId, body: trimmed })
    });

    if (!response.ok) {
      setMessages((previous) => previous.filter((msg) => msg.id !== optimistic.id));
      setValue(trimmed);
      setSending(false);
      return;
    }

    const payload = (await response.json()) as { message?: Message };
    const persistedMessage = payload.message;

    if (persistedMessage) {
      setMessages((previous) => {
        const withoutTemp = previous.filter((message) => message.id !== optimistic.id);
        const exists = withoutTemp.some((message) => message.id === persistedMessage.id);
        if (exists) return withoutTemp;
        return [...withoutTemp, persistedMessage].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    }

    setSending(false);
  }

  function getInitials(senderId: string) {
    return senderId === viewerProfileId ? 'U' : 'A';
  }

  return (
    <div>
      <div className="action-buttons" style={{ marginBottom: 12 }}>
        <button type="button" className="notification-bell" onClick={() => setIsNotificationsOpen((previous) => !previous)}>
          <span>🔔</span>
          {unreadCount > 0 ? (
            <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
          ) : null}
        </button>
      </div>

      {isNotificationsOpen ? (
        <div className="notifications-panel" style={{ display: 'block', position: 'static', marginBottom: 16 }}>
          <div className="notifications-header">
            <div className="notifications-title">🔔 Nuovi messaggi</div>
          </div>
          <div className="notifications-list">
            {unreadCount === 0 ? (
              <div className="notification-item">
                <div className="notification-message">Nessun nuovo messaggio.</div>
              </div>
            ) : (
              unreadMessages
                .slice(-8)
                .reverse()
                .map((notification) => (
                  <div className="notification-item unread" key={notification.id}>
                    <div className="notification-title">Nuovo messaggio consulente</div>
                    <div className="notification-message">{notification.body}</div>
                    <div className="notification-time">{new Date(notification.created_at).toLocaleString('it-IT')}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      ) : null}

      <div className="chat-card">
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
        </div>
      </div>
    </div>
  );
}
