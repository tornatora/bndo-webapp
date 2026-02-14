'use client';

import { useState } from 'react';
import { appendMockMessage } from '@/lib/mock/chat';

type Props = {
  threadId: string | null;
  toEmail: string | null;
  companyName: string;
  practiceTitle: string;
  documentLabel: string;
};

export function DocReminderButton({ threadId, toEmail, companyName, practiceTitle, documentLabel }: Props) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);

  async function onClick() {
    if (sending) return;
    if (!threadId || !toEmail) return;
    setSending(true);
    setError(null);

    try {
      if (threadId.startsWith('mock-thread-')) {
        appendMockMessage(threadId, {
          thread_id: threadId,
          sender_profile_id: 'mock-admin',
          body: [
            '[PROMEMORIA DOCUMENTO]',
            `Pratica: ${practiceTitle}`,
            `Documento richiesto: ${documentLabel}`,
            '',
            '(Mock) Promemoria inviato via chat + email simulata.'
          ].join('\n')
        });
        setLastSentAt(new Date().toLocaleString('it-IT'));
        return;
      }

      const response = await fetch('/api/admin/document-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          toEmail,
          companyName,
          practiceTitle,
          documentLabel
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Invio promemoria fallito.');

      setLastSentAt(new Date().toLocaleString('it-IT'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invio promemoria fallito.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="admin-inline-actions">
      <button
        type="button"
        className="admin-reminder-btn"
        onClick={onClick}
        disabled={sending || !threadId || !toEmail}
        title={!threadId || !toEmail ? 'Dati non disponibili per inviare il promemoria' : 'Invia promemoria'}
      >
        {sending ? 'Invio…' : 'Promemoria'}
      </button>
      {lastSentAt ? <span className="admin-reminder-meta">Ultimo invio: {lastSentAt}</span> : null}
      {error ? <span className="admin-reminder-error">{error}</span> : null}
    </div>
  );
}
