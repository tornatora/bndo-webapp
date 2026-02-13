export type MockChatMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

const STORAGE_PREFIX = 'bndo_mock_chat_v1:';

function storageKey(threadId: string) {
  return `${STORAGE_PREFIX}${threadId}`;
}

function safeParse(raw: string | null): MockChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as MockChatMessage[];
  } catch {
    return [];
  }
}

export function loadMockMessages(threadId: string): MockChatMessage[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(storageKey(threadId))).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function appendMockMessage(threadId: string, message: Omit<MockChatMessage, 'id' | 'created_at'> & { id?: string; created_at?: string }) {
  if (typeof window === 'undefined') return;
  const now = new Date().toISOString();
  const next: MockChatMessage = {
    id: message.id ?? `mock-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    created_at: message.created_at ?? now,
    thread_id: threadId,
    sender_profile_id: message.sender_profile_id,
    body: message.body
  };

  const existing = loadMockMessages(threadId);
  const updated = [...existing, next];
  window.localStorage.setItem(storageKey(threadId), JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('bndo-mock-chat-update', { detail: { threadId } }));
}

