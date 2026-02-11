'use client';

import { Bell, BellRing } from 'lucide-react';
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

  return (
    <section className="panel flex h-[430px] flex-col p-4">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-brand.navy">Consulente dedicato</h3>
            <p className="text-sm text-slate-600">
              Richiedi supporto su documentazione, requisiti e strategia di partecipazione.
            </p>
          </div>
          <button
            type="button"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand.navy"
            aria-label="Apri notifiche chat"
            onClick={() => setIsNotificationsOpen((previous) => !previous)}
          >
            {unreadCount > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>
        </div>

        {isNotificationsOpen ? (
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
            {unreadCount === 0 ? (
              <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">Nessun nuovo messaggio.</p>
            ) : (
              unreadMessages
                .slice(-8)
                .reverse()
                .map((notification) => (
                  <article key={notification.id} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    <p className="font-semibold text-brand.navy">Nuovo messaggio consulente</p>
                    <p>{notification.body}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(notification.created_at).toLocaleString('it-IT')}
                    </p>
                  </article>
                ))
            )}
          </div>
        ) : null}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">Nessun messaggio. Inizia una conversazione con il consulente.</p>
        ) : (
          messages.map((message) => {
            const isMine = message.sender_profile_id === viewerProfileId;

            return (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  isMine
                    ? 'ml-auto bg-brand.navy text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                <p>{message.body}</p>
                <p className={`mt-1 text-[11px] ${isMine ? 'text-slate-200' : 'text-slate-400'}`}>
                  {new Date(message.created_at).toLocaleString('it-IT')}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form className="mt-3 flex items-center gap-2" onSubmit={sendMessage}>
        <input
          className="input"
          placeholder="Scrivi al consulente..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={1200}
        />
        <button type="submit" className="btn btn-primary whitespace-nowrap" disabled={sending}>
          {sending ? 'Invio...' : 'Invia'}
        </button>
      </form>
    </section>
  );
}
