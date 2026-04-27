'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ThreadSummary = {
  applicationId: string;
  threadId: string | null;
  title: string;
  consultantFirstName: string | null;
  consultantLabel: string;
  hasAssignedConsultant: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  updatedAt: string;
  available: boolean;
  unavailableReason: string | null;
};

type PracticeMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

type ThreadsResponse = {
  chats?: ThreadSummary[];
  error?: string;
};

type MessagesResponse = {
  messages?: PracticeMessage[];
  error?: string;
};

type SendMessageResponse = {
  message?: PracticeMessage;
  autoReplyMessage?: PracticeMessage;
  autoReplyNotice?: string;
  error?: string;
};

function mergeMessages(previous: PracticeMessage[], incoming: PracticeMessage[]) {
  const map = new Map<string, PracticeMessage>();
  for (const row of previous) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);
  return [...map.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function formatListTimestamp(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function formatBubbleTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'N/D';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAvatarInitials(nameOrLabel: string | null | undefined) {
  const normalized = String(nameOrLabel ?? '').trim();
  if (!normalized) return 'C';
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function MessagesPageClient({
  viewerProfileId,
}: {
  viewerProfileId: string;
  initialThreadId?: string | null;
  initialMessages?: PracticeMessage[];
  initialLastReadAt?: string | null;
  initialError?: string | null;
}) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(null);
  const [messagesByApplication, setMessagesByApplication] = useState<Record<string, PracticeMessage[]>>({});
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [query, setQuery] = useState('');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const markReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.applicationId === activeApplicationId) ?? null,
    [threads, activeApplicationId]
  );

  const activeMessages = useMemo(() => {
    if (!activeApplicationId) return [] as PracticeMessage[];
    return messagesByApplication[activeApplicationId] ?? [];
  }, [messagesByApplication, activeApplicationId]);

  const filteredThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return threads;

    return threads.filter((thread) => {
      const haystack = [thread.title, thread.consultantLabel, thread.consultantFirstName ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [threads, query]);

  const fetchMessages = useCallback(
    async (applicationId: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoadingMessages(true);

      try {
        const response = await fetch(`/api/dashboard/messages/practices/${applicationId}?limit=220`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as MessagesResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? 'Errore caricamento messaggi.');
        }

        const rows = payload.messages ?? [];
        setMessagesByApplication((previous) => ({
          ...previous,
          [applicationId]: mergeMessages(previous[applicationId] ?? [], rows),
        }));

        setError(null);
      } catch (cause) {
        if (!silent) {
          setError(cause instanceof Error ? cause.message : 'Errore caricamento messaggi.');
        }
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    []
  );

  const markAsRead = useCallback(async (applicationId: string) => {
    try {
      const response = await fetch(`/api/dashboard/messages/practices/${applicationId}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      await response.json().catch(() => null);
      if (!response.ok) return;

      setThreads((previous) =>
        previous.map((thread) =>
          thread.applicationId === applicationId
            ? {
                ...thread,
                unreadCount: 0,
              }
            : thread
        )
      );
    } catch {
      // best effort
    }
  }, []);

  const scheduleMarkRead = useCallback(
    (applicationId: string) => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
      }
      markReadTimeoutRef.current = setTimeout(() => {
        void markAsRead(applicationId);
      }, 350);
    },
    [markAsRead]
  );

  const fetchThreads = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoadingThreads(true);

      try {
        const response = await fetch('/api/dashboard/messages/threads?limit=90', { cache: 'no-store' });
        const payload = (await response.json()) as ThreadsResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? 'Errore caricamento chat.');
        }

        const chats = payload.chats ?? [];
        setThreads(chats);

        setActiveApplicationId((previous) => {
          if (previous && chats.some((thread) => thread.applicationId === previous)) {
            return previous;
          }
          return chats[0]?.applicationId ?? null;
        });

        setError(null);
      } catch (cause) {
        if (!silent) {
          setError(cause instanceof Error ? cause.message : 'Errore caricamento chat.');
        }
      } finally {
        if (!silent) setLoadingThreads(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (!activeApplicationId) return;
    void fetchMessages(activeApplicationId);
  }, [activeApplicationId, fetchMessages]);

  useEffect(() => {
    if (!activeApplicationId) return;

    const intervalId = setInterval(() => {
      void fetchThreads({ silent: true });
      void fetchMessages(activeApplicationId, { silent: true });
    }, 15000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchThreads({ silent: true });
      void fetchMessages(activeApplicationId, { silent: true });
      scheduleMarkRead(activeApplicationId);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeApplicationId, fetchMessages, fetchThreads, scheduleMarkRead]);

  useEffect(() => {
    if (!activeApplicationId || !activeThread?.available) return;
    scheduleMarkRead(activeApplicationId);
  }, [activeApplicationId, activeThread?.available, scheduleMarkRead, activeMessages.length]);

  useEffect(() => {
    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeMessages.length, activeApplicationId]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)');

    const sync = () => {
      const narrow = media.matches;
      setIsNarrow(narrow);
      if (!narrow) {
        setMobileDetailOpen(false);
      }
    };

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeThread?.available || !activeApplicationId) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) return;

    setSending(true);
    setError(null);

    const optimistic: PracticeMessage = {
      id: `temp-${Date.now()}`,
      thread_id: activeThread.threadId ?? `application-${activeApplicationId}`,
      sender_profile_id: viewerProfileId,
      body: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessagesByApplication((previous) => ({
      ...previous,
      [activeApplicationId]: mergeMessages(previous[activeApplicationId] ?? [], [optimistic]),
    }));
    setValue('');

    try {
      const response = await fetch(`/api/dashboard/messages/practices/${activeApplicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });

      const payload = (await response.json()) as SendMessageResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'Invio messaggio non riuscito.');
      }

      setMessagesByApplication((previous) => {
        const withoutTemp = (previous[activeApplicationId] ?? []).filter((row) => row.id !== optimistic.id);
        const withPersisted = payload.message ? mergeMessages(withoutTemp, [payload.message]) : withoutTemp;
        const withReply = payload.autoReplyMessage
          ? mergeMessages(withPersisted, [payload.autoReplyMessage])
          : withPersisted;
        return {
          ...previous,
          [activeApplicationId]: withReply,
        };
      });

      if (!payload.autoReplyMessage && payload.autoReplyNotice) {
        const syntheticAutoReply: PracticeMessage = {
          id: `auto-${Date.now()}`,
          thread_id: activeThread.threadId ?? `application-${activeApplicationId}`,
          sender_profile_id: 'assistant-auto',
          body: payload.autoReplyNotice,
          created_at: new Date().toISOString(),
        };
        setMessagesByApplication((previous) => ({
          ...previous,
          [activeApplicationId]: mergeMessages(previous[activeApplicationId] ?? [], [syntheticAutoReply]),
        }));
      }

      void fetchThreads({ silent: true });
    } catch (cause) {
      setMessagesByApplication((previous) => ({
        ...previous,
        [activeApplicationId]: (previous[activeApplicationId] ?? []).filter((row) => row.id !== optimistic.id),
      }));
      setValue(trimmed);
      setError(cause instanceof Error ? cause.message : 'Invio messaggio non riuscito.');
    } finally {
      setSending(false);
    }
  }

  const onOpenThread = (thread: ThreadSummary) => {
    setActiveApplicationId(thread.applicationId);
    if (isNarrow) {
      setMobileDetailOpen(true);
    }
  };

  const showDetailPane = !isNarrow || mobileDetailOpen;
  const showListPane = !isNarrow || !mobileDetailOpen;
  const previewThreads = filteredThreads.slice(0, 3);
  const previewMessages = activeMessages;
  const shellClass = `dmx-shell no-app-pane${
    isNarrow ? ` is-mobile ${mobileDetailOpen ? 'is-mobile-detail' : 'is-mobile-list'}` : ''
  }`;

  return (
    <div className="chat-page dmx-root">
      <div className={shellClass}>
        {showListPane ? (
          <aside className="dmx-threads-pane">
            {!isNarrow ? (
              <div className="dmx-threads-head">
                <h2 className="dmx-threads-title">Messaggi</h2>
              </div>
            ) : null}

            <div className="dmx-search-wrap">
              <input
                className="dmx-search-input"
                placeholder="Cerca per bando o consulente"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="dmx-thread-list" role="list" aria-label="Lista chat consulenti">
              {loadingThreads ? (
                <div className="dmx-list-empty">Sto caricando le conversazioni...</div>
              ) : previewThreads.length === 0 ? (
                <div className="dmx-list-empty">
                  {threads.length === 0 ? 'Nessuna pratica trovata.' : 'Nessuna chat corrisponde alla ricerca.'}
                </div>
              ) : (
                previewThreads.map((thread) => {
                  const isActive = thread.applicationId === activeApplicationId;
                  return (
                    <button
                      key={thread.applicationId}
                      type="button"
                      className={`dmx-thread-item ${isActive ? 'is-active' : ''} ${!thread.available ? 'is-disabled' : ''}`}
                      onClick={() => onOpenThread(thread)}
                    >
                      <div className="dmx-thread-avatar">{getAvatarInitials(thread.consultantFirstName ?? 'Consulente')}</div>
                      <div className="dmx-thread-main">
                        <div className="dmx-thread-headline">
                          <span className="dmx-thread-title">{thread.consultantLabel}</span>
                          <span className="dmx-thread-time">{formatListTimestamp(thread.lastMessageAt ?? thread.updatedAt)}</span>
                        </div>
                        <div className="dmx-thread-subline">{thread.title}</div>
                        <div className="dmx-thread-preview">{thread.lastMessagePreview ?? 'Nessun messaggio ancora.'}</div>
                      </div>
                      {thread.unreadCount > 0 ? <span className="dmx-thread-badge">{thread.unreadCount}</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        ) : null}

        {showDetailPane ? (
          <section className="dmx-chat-pane">
            {activeThread ? (
              <>
                <header className="dmx-chat-head">
                  <div className="dmx-chat-left">
                    {isNarrow ? (
                      <button
                        type="button"
                        className="dmx-back-btn"
                        onClick={() => setMobileDetailOpen(false)}
                        aria-label="Torna alla lista chat"
                      >
                        &larr;
                      </button>
                    ) : null}

                    <div className="dmx-chat-avatar">{getAvatarInitials(activeThread.consultantFirstName ?? 'Consulente')}</div>
                    <div className="dmx-chat-meta">
                      <div className="dmx-chat-name">{activeThread.consultantLabel}</div>
                      <div className="dmx-chat-context">{activeThread.title}</div>
                    </div>
                  </div>
                </header>

                <div ref={scrollRef} className="dmx-chat-stream" aria-live="polite">
                  {!loadingMessages && previewMessages.length > 0 ? <div className="dmx-day-separator">Oggi</div> : null}

                  {loadingMessages ? (
                    <div className="dmx-stream-empty is-loading">Sto caricando la chat...</div>
                  ) : previewMessages.length === 0 ? (
                    <div className="dmx-stream-empty">
                      {activeThread.hasAssignedConsultant
                        ? 'Nessun messaggio. Inizia la conversazione con il tuo consulente.'
                        : 'Consulente in assegnazione. Puoi comunque lasciare un messaggio.'}
                    </div>
                  ) : (
                    previewMessages.map((message) => {
                      const mine = message.sender_profile_id === viewerProfileId;
                      const messageTime = formatListTimestamp(message.created_at) || formatBubbleTimestamp(message.created_at);
                      return (
                        <div key={message.id} className={`dmx-message-row ${mine ? 'is-mine' : ''}`}>
                          {!mine ? (
                            <div className="dmx-message-author">
                              <span>{activeThread.consultantLabel}</span>
                            </div>
                          ) : null}
                          <div className="dmx-message-bubble">
                            <span className="dmx-message-text">{message.body}</span>
                            <span className="dmx-message-time">{messageTime}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form className="dmx-composer" onSubmit={handleSendMessage}>
                  <button type="button" className="dmx-ghost-icon" aria-label="Emoji">
                    :)
                  </button>
                  <input
                    className="dmx-composer-input"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder="Scrivi un messaggio"
                    maxLength={1200}
                    disabled={!activeThread.available || sending}
                  />
                  <button type="button" className="dmx-ghost-icon" aria-label="Allegato">
                    +
                  </button>
                  <button type="submit" className="dmx-composer-send" disabled={!activeThread.available || sending}>
                    {sending ? 'Invio...' : 'Invia'}
                  </button>
                </form>

                {activeThread.unavailableReason ? (
                  <div className="dmx-inline-error">{activeThread.unavailableReason}</div>
                ) : null}
              </>
            ) : (
              <div className="dmx-stream-empty">Seleziona una chat per iniziare.</div>
            )}

            {error ? <div className="dmx-inline-error">{error}</div> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
