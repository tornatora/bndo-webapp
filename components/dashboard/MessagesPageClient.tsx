'use client';

import { useEffect, useState } from 'react';
import { ChatPanel } from '@/components/dashboard/ChatPanel';

type ThreadContextPayload = {
  threadId: string | null;
  lastReadAt: string | null;
  messages?: Message[];
  error?: string;
};

type Message = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

export function MessagesPageClient({ viewerProfileId }: { viewerProfileId: string }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[] | null>(null);
  const [initialLastReadAt, setInitialLastReadAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/chat/sync', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as ThreadContextPayload;
        if (!res.ok) throw new Error(json.error ?? 'Impossibile inizializzare la chat.');
        if (!json.threadId) throw new Error('Thread non disponibile.');

        if (cancelled) return;
        setThreadId(json.threadId);
        setInitialLastReadAt(json.lastReadAt ?? null);
        setInitialMessages(json.messages ?? []);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Errore chat.');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <p className="empty-text">{error}</p>
      </div>
    );
  }

  if (!threadId || !initialMessages) {
    return (
      <div className="chat-page">
        <div className="panel p-5 sm:p-6" style={{ minHeight: 420 }}>
          <div className="admin-panel-empty">Carico la chat…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <ChatPanel
        threadId={threadId}
        viewerProfileId={viewerProfileId}
        initialMessages={initialMessages}
        initialLastReadAt={initialLastReadAt}
      />
    </div>
  );
}
