'use client';

import { ChatPanel } from '@/components/dashboard/ChatPanel';

type Message = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

export function MessagesPageClient({
  viewerProfileId,
  initialThreadId,
  initialMessages,
  initialLastReadAt,
  initialError,
}: {
  viewerProfileId: string;
  initialThreadId: string | null;
  initialMessages: Message[];
  initialLastReadAt: string | null;
  initialError?: string | null;
}) {
  const error = initialError ?? null;

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <p className="empty-text">{error}</p>
      </div>
    );
  }

  if (!initialThreadId) {
    return (
      <div className="empty-state">
        <div className="empty-icon">💬</div>
        <p className="empty-text">Thread non disponibile.</p>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <ChatPanel
        threadId={initialThreadId}
        viewerProfileId={viewerProfileId}
        initialMessages={initialMessages}
        initialLastReadAt={initialLastReadAt}
      />
    </div>
  );
}
