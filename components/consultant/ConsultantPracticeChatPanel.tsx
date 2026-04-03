'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type PracticeMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

type Props = {
  applicationId: string;
  viewerProfileId: string;
  initialMessages: PracticeMessage[];
  initialError?: string | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function mergeMessages(previous: PracticeMessage[], incoming: PracticeMessage[]) {
  const map = new Map<string, PracticeMessage>();
  for (const row of previous) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);
  return [...map.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function ConsultantPracticeChatPanel({ applicationId, viewerProfileId, initialMessages, initialError }: Props) {
  const [messages, setMessages] = useState<PracticeMessage[]>(initialMessages);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(() => {
    return messages.filter((row) => row.sender_profile_id !== viewerProfileId).length;
  }, [messages, viewerProfileId]);

  function scrollToBottom() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }

  async function refreshMessages() {
    try {
      const response = await fetch(`/api/consultant/practices/${applicationId}/messages?limit=150`, { cache: 'no-store' });
      const payload = (await response.json()) as { rows?: PracticeMessage[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Errore caricamento messaggi.');
      setMessages((previous) => mergeMessages(previous, payload.rows ?? []));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore caricamento messaggi.');
    }
  }

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    void refreshMessages();
    const intervalId = setInterval(() => {
      void refreshMessages();
    }, 12000);
    return () => {
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/consultant/practices/${applicationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      const payload = (await response.json()) as { row?: PracticeMessage; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Invio messaggio non riuscito.');
      if (payload.row) {
        setMessages((previous) => mergeMessages(previous, [payload.row as PracticeMessage]));
      }
      setValue('');
      void refreshMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invio messaggio non riuscito.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-card">
      <div className="section-title">
        <span>💬</span>
        <span>Chat pratica</span>
      </div>
      <div className="admin-item-sub" style={{ marginTop: 4 }}>
        Messaggistica dedicata a questa pratica assegnata. Nuovi messaggi: {unreadCount}
      </div>

      <div
        ref={scrollRef}
        style={{
          marginTop: 12,
          border: '0.5px solid rgba(11,17,54,0.1)',
          borderRadius: 14,
          background: '#fff',
          minHeight: 220,
          maxHeight: 440,
          overflow: 'auto',
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        {messages.map((message) => {
          const isMine = message.sender_profile_id === viewerProfileId;
          return (
            <div key={message.id} style={{ display: 'grid', justifyItems: isMine ? 'end' : 'start', gap: 4 }}>
              <div
                style={{
                  maxWidth: '78%',
                  border: '0.5px solid rgba(11,17,54,0.11)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  background: isMine ? '#0B1136' : '#F8FAFC',
                  color: isMine ? '#fff' : '#0B1136',
                  fontSize: 14,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.body}
              </div>
              <div className="admin-item-sub" style={{ fontSize: 11 }}>
                {formatDateTime(message.created_at)}
              </div>
            </div>
          );
        })}
        {messages.length === 0 ? <div className="admin-item-sub">Nessun messaggio disponibile.</div> : null}
      </div>

      <form onSubmit={sendMessage} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        <textarea
          className="modal-textarea"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Scrivi aggiornamenti operativi per questa pratica..."
          maxLength={1200}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="admin-item-sub">{value.length}/1200</div>
          <button type="submit" className="btn-action" disabled={loading}>
            {loading ? 'Invio...' : 'Invia messaggio'}
          </button>
        </div>
      </form>

      {error ? (
        <div className="admin-item-sub" style={{ marginTop: 10, color: '#B91C1C', fontWeight: 700 }}>
          {error}
        </div>
      ) : null}
    </section>
  );
}
