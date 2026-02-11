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

type ThreadSummary = {
  threadId: string;
  companyId: string;
  companyName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

type AdminInboxProps = {
  viewerProfileId: string;
  initialThreads: ThreadSummary[];
  initialThreadId: string | null;
  initialMessages: Message[];
};

type MessagesResponse = {
  messages: Message[];
  unreadCount: number;
};

export function AdminInbox({ viewerProfileId, initialThreads, initialThreadId, initialMessages }: AdminInboxProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const selectedThreadRef = useRef<string | null>(initialThreadId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  function scrollToBottom() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }

  function updateThreadMetadata(threadId: string, update: Partial<ThreadSummary>) {
    setThreads((previous) => {
      const next = previous.map((thread) => (thread.threadId === threadId ? { ...thread, ...update } : thread));
      next.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
      return next;
    });
  }

  async function markThreadAsRead(threadId: string) {
    const response = await fetch('/api/chat/mark-read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ threadId })
    });

    if (response.ok) {
      updateThreadMetadata(threadId, { unreadCount: 0 });
    }
  }

  function scheduleMarkThreadRead(threadId: string) {
    if (markReadTimer.current) {
      clearTimeout(markReadTimer.current);
    }
    markReadTimer.current = setTimeout(() => {
      void markThreadAsRead(threadId);
    }, 350);
  }

  async function loadMessages(threadId: string) {
    setLoadingMessages(true);
    setSyncError(null);

    try {
      const response = await fetch(`/api/chat/messages?threadId=${threadId}`);
      if (!response.ok) {
        throw new Error('Impossibile caricare i messaggi del thread.');
      }

      const payload = (await response.json()) as MessagesResponse;
      const ordered = (payload.messages ?? []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setMessages(ordered);
      updateThreadMetadata(threadId, { unreadCount: payload.unreadCount ?? 0 });

      scheduleMarkThreadRead(threadId);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Errore sincronizzazione chat.');
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    selectedThreadRef.current = selectedThreadId;
    if (!selectedThreadId) return;
    void loadMessages(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('admin-inbox-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'consultant_messages'
        },
        (payload) => {
          const incoming = payload.new as Message;
          const activeThread = selectedThreadRef.current;

          updateThreadMetadata(incoming.thread_id, {
            lastMessage: incoming.body,
            lastMessageAt: incoming.created_at
          });

          if (incoming.thread_id === activeThread) {
            setMessages((previous) => {
              const exists = previous.some((message) => message.id === incoming.id);
              if (exists) return previous;
              return [...previous, incoming].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });

            if (incoming.sender_profile_id !== viewerProfileId && document.visibilityState === 'visible') {
              scheduleMarkThreadRead(incoming.thread_id);
            }
            return;
          }

          if (incoming.sender_profile_id !== viewerProfileId) {
            setThreads((previous) =>
              previous.map((thread) =>
                thread.threadId === incoming.thread_id
                  ? { ...thread, unreadCount: thread.unreadCount + 1 }
                  : thread
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      if (markReadTimer.current) {
        clearTimeout(markReadTimer.current);
        markReadTimer.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [viewerProfileId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedThreadId) return;

    const trimmed = value.trim();
    if (!trimmed) return;

    setSending(true);
    setSyncError(null);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      thread_id: selectedThreadId,
      sender_profile_id: viewerProfileId,
      body: trimmed,
      created_at: new Date().toISOString()
    };

    setMessages((previous) => [...previous, optimistic]);
    setValue('');
    updateThreadMetadata(selectedThreadId, {
      lastMessage: trimmed,
      lastMessageAt: optimistic.created_at
    });

    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threadId: selectedThreadId, body: trimmed })
      });

      if (!response.ok) {
        throw new Error('Invio messaggio fallito.');
      }

      const payload = (await response.json()) as { message?: Message };
      const persistedMessage = payload.message;

      if (persistedMessage) {
        setMessages((previous) => {
          const withoutOptimistic = previous.filter((message) => message.id !== optimistic.id);
          const exists = withoutOptimistic.some((message) => message.id === persistedMessage.id);
          if (exists) return withoutOptimistic;
          return [...withoutOptimistic, persistedMessage].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
        updateThreadMetadata(selectedThreadId, {
          lastMessage: persistedMessage.body,
          lastMessageAt: persistedMessage.created_at
        });
      }
    } catch (error) {
      setMessages((previous) => previous.filter((message) => message.id !== optimistic.id));
      setValue(trimmed);
      setSyncError(error instanceof Error ? error.message : 'Errore invio messaggio.');
    } finally {
      setSending(false);
    }
  }

  if (threads.length === 0) {
    return (
      <section className="welcome-section">
        <h1 className="welcome-title">👥 Gestione Clienti</h1>
        <p className="welcome-subtitle">
          Nessuna conversazione attiva. Quando un cliente entra in dashboard, la chat comparira qui.
        </p>
      </section>
    );
  }

  const unreadTotal = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);

  return (
    <div id="view1">
      <div className="welcome-section">
        <h1 className="welcome-title">👥 Gestione Clienti</h1>
        <p className="welcome-subtitle">Inbox clienti e messaggi in tempo reale</p>

        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{threads.length}</div>
            <div className="stat-label">Clienti Totali</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{threads.length}</div>
            <div className="stat-label">Conversazioni Attive</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{unreadTotal}</div>
            <div className="stat-label">Messaggi Non Letti</div>
          </div>
        </div>
      </div>

      <div className="admin-grid">
        <section className="section-card">
          <div className="section-title">
            <span>📬</span>
            <span>Conversazioni</span>
          </div>

          <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto' }}>
            {threads.map((thread) => {
              const isActive = thread.threadId === selectedThreadId;
              return (
                <button
                  key={thread.threadId}
                  type="button"
                  className="client-card"
                  style={
                    isActive
                      ? {
                          borderColor: 'rgba(34, 197, 95, 0.35)',
                          boxShadow: '0 4px 16px rgba(34, 197, 95, 0.12)'
                        }
                      : undefined
                  }
                  onClick={() => setSelectedThreadId(thread.threadId)}
                >
                  <div className="client-header">
                    <div className="client-info">
                      <div className="client-name">{thread.companyName}</div>
                      <div className="client-email">{thread.lastMessage || 'Nessun messaggio'}</div>
                    </div>
                    <span className={`status-badge ${thread.unreadCount > 0 ? 'status-active' : 'status-inactive'}`}>
                      {thread.unreadCount > 0 ? `${thread.unreadCount} non letti` : 'Allineato'}
                    </span>
                  </div>

                  <div className="client-meta">
                    <span className="meta-tag">
                      Ultimo update:{' '}
                      {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString('it-IT') : 'Nessun messaggio'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="section-card">
          <div className="section-title" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              💬 Chat con Cliente{selectedThread?.companyName ? ` - ${selectedThread.companyName}` : ''}
            </span>
            <button
              type="button"
              className="btn-action secondary"
              onClick={() => (selectedThreadId ? loadMessages(selectedThreadId) : undefined)}
            >
              <span>🔄</span>
              <span>Aggiorna</span>
            </button>
          </div>

          <div className="chat-card">
            <div className="chat-container">
              <div ref={scrollRef} className="chat-messages" id="chat">
                {loadingMessages ? (
                  <div className="empty-state">
                    <div className="empty-icon">⏳</div>
                    <p className="empty-text">Sincronizzazione messaggi...</p>
                  </div>
                ) : null}

                {!loadingMessages && messages.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">💬</div>
                    <p className="empty-text">Nessun messaggio in questa conversazione.</p>
                  </div>
                ) : null}

                {messages.map((message) => {
                  const isMine = message.sender_profile_id === viewerProfileId;
                  return (
                    <div key={message.id} className={`message ${isMine ? '' : 'user'}`}>
                      <div className="message-avatar">{isMine ? 'A' : 'C'}</div>
                      <div className="message-content">
                        <div className="message-bubble">{message.body}</div>
                        <div className="message-time">{new Date(message.created_at).toLocaleString('it-IT')}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className="chat-input-area" onSubmit={sendMessage}>
                <input
                  className="chat-input"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Scrivi un messaggio al cliente..."
                  maxLength={1200}
                  disabled={!selectedThreadId}
                />
                <button type="submit" className="btn-send" disabled={sending || !selectedThreadId}>
                  {sending ? 'Invio...' : 'Invia'}
                </button>
              </form>
            </div>
          </div>

          {syncError ? (
            <p style={{ marginTop: 12, fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>{syncError}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
