'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { removeChannelSafely, subscribeToChannelSafely } from '@/lib/supabase/realtime-safe';

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

type ClientSummary = {
  company: {
    id: string;
    name: string;
    vat_number: string | null;
    industry: string | null;
    annual_spend_target: number | null;
    created_at: string;
  } | null;
  clientProfile: {
    id: string;
    email: string;
    full_name: string;
    username: string;
    role: string;
    created_at: string;
  } | null;
  applications: Array<{
    id: string;
    tender_id: string;
    status: string;
    supplier_registry_status: string;
    notes: string | null;
    updated_at: string;
  }>;
  documents: Array<{
    id: string;
    application_id: string;
    file_name: string;
    storage_path: string;
    file_size: number;
    mime_type: string;
    created_at: string;
    downloadUrl: string | null;
  }>;
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
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [requestDocValue, setRequestDocValue] = useState('Visura camerale');
  const selectedThreadRef = useRef<string | null>(initialThreadId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );
  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) => thread.companyName.toLowerCase().includes(q) || thread.lastMessage.toLowerCase().includes(q));
  }, [threads, search]);
  const unreadTotal = useMemo(() => threads.reduce((sum, thread) => sum + thread.unreadCount, 0), [threads]);

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

  async function syncThreadSilently(threadId: string) {
    try {
      const response = await fetch(`/api/chat/messages?threadId=${threadId}`);
      if (!response.ok) return;

      const payload = (await response.json()) as MessagesResponse;
      const ordered = (payload.messages ?? []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      if (selectedThreadRef.current === threadId) {
        setMessages(ordered);
      }

      updateThreadMetadata(threadId, { unreadCount: payload.unreadCount ?? 0 });
    } catch {
      // silent fallback sync, no blocking UI error
    }
  }

  useEffect(() => {
    selectedThreadRef.current = selectedThreadId;
    if (!selectedThreadId) return;
    void loadMessages(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  useEffect(() => {
    const companyId = selectedThread?.companyId ?? null;
    if (!companyId) {
      setClientSummary(null);
      return;
    }

    let cancelled = false;
    setLoadingClient(true);

    fetch(`/api/admin/client-summary?companyId=${companyId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Impossibile caricare dettagli cliente.');
        return (await res.json()) as ClientSummary;
      })
      .then((payload) => {
        if (cancelled) return;
        setClientSummary(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setClientSummary(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingClient(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedThread?.companyId]);

  useEffect(() => {
    if (!selectedThreadId) return;

    const intervalId = setInterval(() => {
      void syncThreadSilently(selectedThreadId);
    }, 25000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void syncThreadSilently(selectedThreadId);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();

    const channel = subscribeToChannelSafely(
      () =>
        supabase
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
          .subscribe(),
      'admin inbox'
    );

    return () => {
      if (markReadTimer.current) {
        clearTimeout(markReadTimer.current);
        markReadTimer.current = null;
      }
      removeChannelSafely(supabase, channel, 'admin inbox');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerProfileId]);

  useEffect(() => {
    const bell = document.getElementById('adminNotificationBell');
    if (!bell) return;

    const onToggle = () => setIsNotificationsOpen((previous) => !previous);
    bell.addEventListener('click', onToggle);
    return () => {
      bell.removeEventListener('click', onToggle);
    };
  }, []);

  useEffect(() => {
    const countElement = document.getElementById('ncount');
    if (!countElement) return;

    if (unreadTotal > 0) {
      countElement.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal);
      countElement.style.display = 'flex';
      return;
    }

    countElement.textContent = '0';
    countElement.style.display = 'none';
  }, [unreadTotal]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const bell = document.getElementById('adminNotificationBell');
      const panel = document.getElementById('npanel');
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

  async function requestDocument() {
    if (!selectedThreadId) return;
    const body = `Per favore carica questo documento: ${requestDocValue}. Se hai dubbi scrivimi qui e ti guido passo passo.`;
    setValue(body);
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

  return (
    <div id="view1">
      <div className={`notifications-panel ${isNotificationsOpen ? 'active' : ''}`} id="npanel">
        <div className="notifications-header">
          <div className="notifications-title">🔔 Notifiche Sistema</div>
        </div>
        <div className="notifications-list">
          {unreadTotal > 0 ? (
            <div className="notification-item unread">
              <div className="notification-title">💬 Messaggi in arrivo</div>
              <div className="notification-message">Hai {unreadTotal} messaggi cliente non letti.</div>
              <div className="notification-time">Adesso</div>
            </div>
          ) : (
            <div className="notification-item">
              <div className="notification-title">✅ Realtime attivo</div>
              <div className="notification-message">Dashboard sincronizzata in tempo reale.</div>
              <div className="notification-time">Adesso</div>
            </div>
          )}
        </div>
      </div>

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

          <div style={{ marginBottom: 12 }}>
            <input
              className="chat-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca cliente..."
            />
          </div>

          <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto' }}>
            {filteredThreads.map((thread) => {
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

          <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
            <div className="stat-item" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="stat-label">Cliente</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {loadingClient ? 'Caricamento…' : clientSummary?.company?.name ?? selectedThread?.companyName ?? '—'}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
                    {clientSummary?.clientProfile?.email ? clientSummary.clientProfile.email : ''}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
                    {clientSummary?.clientProfile?.full_name ? clientSummary.clientProfile.full_name : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="chat-input"
                    value={requestDocValue}
                    onChange={(e) => setRequestDocValue(e.target.value)}
                    style={{ maxWidth: 260 }}
                  >
                    <option>Visura camerale</option>
                    <option>Documento identita</option>
                    <option>Codice fiscale</option>
                    <option>Bilancio / Unico</option>
                    <option>Estratto conto</option>
                    <option>Altro (scrivi in chat)</option>
                  </select>
                  <button type="button" className="btn-action primary" onClick={requestDocument} disabled={!selectedThreadId}>
                    <span>📎</span>
                    <span>Richiedi documento</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                <div className="meta-tag">Pratiche: {clientSummary?.applications?.length ?? 0}</div>
                <div className="meta-tag">Documenti: {clientSummary?.documents?.length ?? 0}</div>
                {clientSummary?.company?.vat_number ? <div className="meta-tag">P.IVA: {clientSummary.company.vat_number}</div> : null}
              </div>

              {clientSummary?.documents?.length ? (
                <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                  {clientSummary.documents.slice(0, 6).map((doc) => (
                    <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#0B1136', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.file_name}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                          {new Date(doc.created_at).toLocaleString('it-IT')}
                        </div>
                      </div>
                      {doc.downloadUrl ? (
                        <a className="btn-doc" href={doc.downloadUrl} target="_blank" rel="noreferrer">
                          <span>⬇</span>
                          <span>Download</span>
                        </a>
                      ) : (
                        <span className="btn-doc" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                          <span>⚠</span>
                          <span>Non disponibile</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
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
