'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

type GrantAiPopupProps = {
  grantId: string;
  grantTitle: string;
};

type PopupMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

type ConversationMetadata = {
  assistantText?: string;
  conversationId?: string;
};

const uid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const WELCOME_TEXT = (title: string) =>
  `Ciao, sono l’AI BNDO focalizzata su "${title}". Posso aiutarti con requisiti, spese ammissibili, scadenze, esclusioni e documenti richiesti.`;

export default function GrantAiPopup({ grantId, grantTitle }: GrantAiPopupProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<PopupMessage[]>([
    { id: uid(), role: 'assistant', text: WELCOME_TEXT(grantTitle) },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    root.scrollTop = root.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    setMessages([{ id: uid(), role: 'assistant', text: WELCOME_TEXT(grantTitle) }]);
    setConversationId(null);
    setError(null);
  }, [grantId, grantTitle]);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  async function handleSend() {
    const message = input.trim();
    if (!message || sending) return;

    setError(null);
    setInput('');
    setSending(true);

    const userId = uid();
    const assistantId = uid();
    setMessages((prev) => [...prev, { id: userId, role: 'user', text: message }, { id: assistantId, role: 'assistant', text: '' }]);

    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          interactionId: uid(),
          conversationId: conversationId ?? undefined,
          focusGrantContext: true,
          focusedGrantId: grantId,
          focusedGrantTitle: grantTitle,
        }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || 'Conversazione non disponibile.');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Stream non disponibile.');

      let buffer = '';
      let finalMeta: ConversationMetadata | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload) as { type?: string; content?: unknown };
            if (parsed.type === 'text') {
              const chunk = String(parsed.content ?? '');
              if (!chunk) continue;
              setMessages((prev) =>
                prev.map((entry) => (entry.id === assistantId ? { ...entry, text: `${entry.text}${chunk}` } : entry)),
              );
            } else if (parsed.type === 'metadata') {
              finalMeta = (parsed.content ?? {}) as ConversationMetadata;
              if (finalMeta.conversationId) setConversationId(finalMeta.conversationId);
            } else if (parsed.type === 'error') {
              throw new Error(String(parsed.content ?? 'Errore durante la generazione.'));
            }
          } catch (streamErr) {
            console.warn('[GrantAiPopup] SSE parse warning', streamErr);
          }
        }
      }

      if (finalMeta?.assistantText) {
        setMessages((prev) =>
          prev.map((entry) => (entry.id === assistantId ? { ...entry, text: finalMeta!.assistantText || entry.text } : entry)),
        );
      } else {
        setMessages((prev) =>
          prev.map((entry) =>
            entry.id === assistantId && !entry.text.trim()
              ? { ...entry, text: 'Al momento non ho una risposta utile. Riprova con una domanda più specifica sul bando.' }
              : entry,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore temporaneo.';
      setError(msg);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === assistantId && !entry.text.trim()
            ? { ...entry, text: 'C’è stato un problema temporaneo. Riprova tra qualche secondo.' }
            : entry,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  if (!mounted) return null;

  if (!open) {
    return createPortal(
      <button type="button" className="grant-ai-popup-launcher" onClick={() => setOpen(true)} aria-label="Apri chat AI sul bando">
        <span className="grant-ai-popup-launcher-icon" aria-hidden="true">
          ✨
        </span>
        <span>Chat AI bando</span>
      </button>,
      document.body,
    );
  }

  return createPortal(
    <aside className="grant-ai-popup" aria-label="Chat AI dedicata al bando">
      <header className="grant-ai-popup-header">
        <div className="grant-ai-popup-headline">
          <span className="grant-ai-popup-chip">AI sul bando</span>
          <strong>{grantTitle}</strong>
          <small>Chiedi informazioni specifiche su questa misura</small>
        </div>
        <button type="button" className="grant-ai-popup-minimize" onClick={() => setOpen(false)} aria-label="Riduci chat AI">
          −
        </button>
      </header>

      <div ref={listRef} className="grant-ai-popup-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`grant-ai-popup-message ${message.role === 'user' ? 'grant-ai-popup-message--user' : 'grant-ai-popup-message--assistant'}`}
          >
            {message.text || (message.role === 'assistant' && sending ? 'Sto scrivendo…' : '')}
          </div>
        ))}
      </div>

      {error ? <div className="grant-ai-popup-error">{error}</div> : null}

      <div className="grant-ai-popup-input-row">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Fai una domanda sul bando..."
          aria-label="Messaggio per AI sul bando"
        />
        <button type="button" onClick={() => void handleSend()} disabled={!canSend}>
          {sending ? '...' : 'Invia'}
        </button>
      </div>
    </aside>,
    document.body,
  );
}
