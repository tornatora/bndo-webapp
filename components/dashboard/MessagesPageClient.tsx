'use client';

import { useEffect, useState } from 'react';
import { ChatPanel } from '@/components/dashboard/ChatPanel';

type ThreadContextPayload = {
  threadId: string | null;
  lastReadAt: string | null;
};

type Message = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

type ChatSyncResponse = {
  messages?: Message[];
  lastReadAt?: string;
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
        const ctxRes = await fetch('/api/chat/thread-context', { cache: 'no-store' });
        const ctxJson = (await ctxRes.json().catch(() => ({}))) as ThreadContextPayload & { error?: string };
        if (!ctxRes.ok) throw new Error(ctxJson.error ?? 'Impossibile inizializzare la chat.');
        if (!ctxJson.threadId) throw new Error('Thread non disponibile.');

        const msgRes = await fetch(`/api/chat/messages?threadId=${ctxJson.threadId}`, { cache: 'no-store' });
        const msgJson = (await msgRes.json().catch(() => ({}))) as ChatSyncResponse & { error?: string };
        if (!msgRes.ok) throw new Error((msgJson as { error?: string }).error ?? 'Impossibile caricare i messaggi.');

        if (cancelled) return;
        setThreadId(ctxJson.threadId);
        setInitialLastReadAt(ctxJson.lastReadAt ?? msgJson.lastReadAt ?? null);
        setInitialMessages(msgJson.messages ?? []);
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

