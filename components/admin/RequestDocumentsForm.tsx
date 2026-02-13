'use client';

import { FormEvent, useMemo, useState } from 'react';
import { appendMockMessage } from '@/lib/mock/chat';

type Priority = 'bassa' | 'media' | 'alta' | 'urgente';

const PRIORITY_LABEL: Record<Priority, string> = {
  bassa: 'Bassa',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente'
};

function buildRequestMessage(priority: Priority, text: string) {
  return `[RICHIESTA DOCUMENTI]\nPRIORITA: ${PRIORITY_LABEL[priority]}\n\n${text.trim()}`;
}

export function RequestDocumentsForm({ threadId, context }: { threadId: string; context?: string }) {
  const [priority, setPriority] = useState<Priority>('media');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const remaining = useMemo(() => 1000 - text.length, [text.length]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    setFeedback(null);

    try {
      const body = context
        ? `${buildRequestMessage(priority, trimmed)}\n\nCONTESTO: ${context.trim()}`
        : buildRequestMessage(priority, trimmed);

      if (threadId.startsWith('mock-thread-')) {
        appendMockMessage(threadId, {
          thread_id: threadId,
          sender_profile_id: 'mock-admin',
          body
        });
      } else {
        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            threadId,
            body
          })
        });

        if (!response.ok) {
          throw new Error('Invio richiesta fallito.');
        }
      }

      setText('');
      setFeedback({ type: 'success', message: 'Richiesta inviata in chat.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Errore invio richiesta.'
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="form-group">
        <label className="form-label" htmlFor="priority">
          Priorita
        </label>
        <select
          id="priority"
          className="form-input"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          disabled={sending}
        >
          <option value="bassa">Bassa</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
          <option value="urgente">Urgente</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="requestText">
          Testo libero
        </label>
        <textarea
          id="requestText"
          className="form-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Esempio: Carica visura camerale aggiornata e bilancio 2023."
          maxLength={1000}
          disabled={sending}
          style={{ minHeight: 120, resize: 'vertical' }}
        />
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#64748B' }}>
          {remaining} caratteri rimanenti
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" className="btn-action primary" disabled={sending || text.trim().length === 0}>
          {sending ? 'Invio…' : 'Invia richiesta'}
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Viene inviato come messaggio in chat al cliente.</span>
      </div>

      {feedback ? (
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            fontWeight: 700,
            color: feedback.type === 'success' ? '#065f46' : '#b91c1c'
          }}
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
