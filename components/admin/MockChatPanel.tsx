'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { appendMockMessage, loadMockMessages, type MockChatMessage } from '@/lib/mock/chat';

type MockChatPanelProps = {
  threadId: string;
};

const VIEWER_ID = 'mock-admin';

export function MockChatPanel({ threadId }: MockChatPanelProps) {
  const [messages, setMessages] = useState<MockChatMessage[]>([]);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ordered = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );

  function refresh() {
    setMessages(loadMockMessages(threadId));
  }

  function scrollToBottom() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }

  useEffect(() => {
    refresh();

    const onUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ threadId?: string }>;
      if (custom.detail?.threadId && custom.detail.threadId !== threadId) return;
      refresh();
    };

    window.addEventListener('bndo-mock-chat-update', onUpdate as EventListener);
    return () => window.removeEventListener('bndo-mock-chat-update', onUpdate as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    scrollToBottom();
  }, [ordered.length]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      appendMockMessage(threadId, {
        thread_id: threadId,
        sender_profile_id: VIEWER_ID,
        body: trimmed
      });
      setValue('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-card">
      <div className="chat-toolbar">
        <div className="chat-toolbar-title">Chat (Mock)</div>
        <div className="chat-toolbar-status">Realtime simulato (localStorage)</div>
      </div>
      <div className="chat-container">
        <div ref={scrollRef} className="chat-messages">
          {ordered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <p className="empty-text">Nessun messaggio. Inizia la chat.</p>
            </div>
          ) : (
            ordered.map((message) => {
              const isMine = message.sender_profile_id === VIEWER_ID;
              return (
                <div key={message.id} className={`message ${isMine ? 'user' : ''}`}>
                  <div className="message-avatar">{isMine ? 'A' : 'C'}</div>
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
            disabled={sending}
          />
          <button type="submit" className="btn-send" disabled={sending}>
            {sending ? 'Invio…' : 'Invia'}
          </button>
        </form>
      </div>
    </div>
  );
}

