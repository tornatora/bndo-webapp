'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, MessageSquare, RefreshCcw, Send } from 'lucide-react';
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
  const [isThreadsOpen, setIsThreadsOpen] = useState(false);
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
    setIsThreadsOpen(false);
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
      if (payload.message) {
        setMessages((previous) => {
          const withoutOptimistic = previous.filter((message) => message.id !== optimistic.id);
          const exists = withoutOptimistic.some((message) => message.id === payload.message?.id);
          if (exists) return withoutOptimistic;
          return [...withoutOptimistic, payload.message].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
        updateThreadMetadata(selectedThreadId, {
          lastMessage: payload.message.body,
          lastMessageAt: payload.message.created_at
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
      <section className="panel p-6">
        <h1 className="text-2xl font-extrabold text-brand.navy">Pannello Admin</h1>
        <p className="mt-2 text-sm text-slate-600">
          Nessuna conversazione attiva. Quando un cliente entra in dashboard, la chat comparira qui.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand.steel">Admin BNDO</p>
            <h1 className="text-2xl font-extrabold text-brand.navy">Inbox clienti in tempo reale</h1>
          </div>

          <button
            type="button"
            className="btn btn-muted text-sm"
            onClick={() => (selectedThreadId ? loadMessages(selectedThreadId) : undefined)}
          >
            <RefreshCcw className="h-4 w-4" />
            Aggiorna
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className={`panel p-3 ${isThreadsOpen ? 'block' : 'hidden'} lg:block`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-brand.navy">Conversazioni</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{threads.length}</span>
          </div>

          <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
            {threads.map((thread) => {
              const isActive = thread.threadId === selectedThreadId;
              return (
                <button
                  key={thread.threadId}
                  type="button"
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isActive
                      ? 'border-brand.steel bg-brand.steel/5'
                      : 'border-slate-200 bg-white hover:border-brand.steel/40'
                  }`}
                  onClick={() => setSelectedThreadId(thread.threadId)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-brand.navy">{thread.companyName}</p>
                    {thread.unreadCount > 0 ? (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        {thread.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString('it-IT') : 'Nessun messaggio'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{thread.lastMessage || 'Nessun messaggio.'}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel flex h-[74vh] flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-sm font-semibold text-brand.steel">Thread attivo</p>
              <h3 className="text-lg font-bold text-brand.navy">{selectedThread?.companyName ?? 'Seleziona un cliente'}</h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-muted text-sm lg:hidden"
                onClick={() => setIsThreadsOpen((previous) => !previous)}
              >
                <MessageSquare className="h-4 w-4" />
                Thread
              </button>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                <BellRing className="h-3.5 w-3.5" />
                {selectedThread?.unreadCount ?? 0} non letti
              </span>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
            {loadingMessages ? <p className="text-sm text-slate-500">Sincronizzazione messaggi...</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="text-sm text-slate-500">Nessun messaggio in questa conversazione.</p>
            ) : null}

            {messages.map((message) => {
              const isMine = message.sender_profile_id === viewerProfileId;
              return (
                <article
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                    isMine ? 'ml-auto bg-brand.navy text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'
                  }`}
                >
                  <p>{message.body}</p>
                  <p className={`mt-1 text-[11px] ${isMine ? 'text-slate-200' : 'text-slate-500'}`}>
                    {new Date(message.created_at).toLocaleString('it-IT')}
                  </p>
                </article>
              );
            })}
          </div>

          <form className="mt-3 flex items-center gap-2" onSubmit={sendMessage}>
            <input
              className="input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Scrivi una risposta per il cliente..."
              maxLength={1200}
              disabled={!selectedThreadId}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !selectedThreadId}>
              <Send className="h-4 w-4" />
              {sending ? 'Invio...' : 'Invia'}
            </button>
          </form>

          {syncError ? <p className="mt-2 text-sm font-semibold text-red-700">{syncError}</p> : null}
        </section>
      </div>
    </div>
  );
}
