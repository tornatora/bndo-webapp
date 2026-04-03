export function parseCookieHeader(setCookieRaw) {
  if (!setCookieRaw) return null;
  const parts = String(setCookieRaw).split(/,(?=[^;]+=[^;]+)/g);
  for (const part of parts) {
    const token = part.split(';', 1)[0]?.trim();
    if (token?.startsWith('bndo_assistant_session=')) return token;
  }
  return null;
}

export function parseConversationSsePayload(rawText) {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/);
  let assistantText = '';
  let metadata = null;
  const errors = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;

    try {
      const event = JSON.parse(payload);
      if (event?.type === 'text') {
        assistantText += String(event.content ?? '');
      } else if (event?.type === 'metadata' && event.content && typeof event.content === 'object') {
        metadata = event.content;
      } else if (event?.type === 'error') {
        errors.push(String(event.content ?? 'Errore conversazione.'));
      }
    } catch {
      // Ignore malformed SSE chunks.
    }
  }

  return {
    assistantText: assistantText.trim(),
    metadata,
    errors,
  };
}

export function normalizeConversationResponse(args) {
  const {
    response,
    text,
  } = args;

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream') || String(text || '').trimStart().startsWith('data:')) {
    const parsed = parseConversationSsePayload(text);
    const base = parsed.metadata && typeof parsed.metadata === 'object' ? { ...parsed.metadata } : {};
    const assistantText =
      typeof base.assistantText === 'string' && base.assistantText.trim()
        ? base.assistantText
        : parsed.assistantText;

    return {
      json: {
        ...base,
        assistantText,
        __streamErrors: parsed.errors,
      },
      rawText: text,
      isStream: true,
    };
  }

  try {
    return {
      json: text ? JSON.parse(text) : {},
      rawText: text,
      isStream: false,
    };
  } catch {
    return {
      json: { error: 'Invalid JSON response' },
      rawText: text,
      isStream: false,
    };
  }
}

export async function postConversationMessage(baseUrl, message, options = {}) {
  const headers = { 'content-type': 'application/json' };
  if (options.cookie) headers.cookie = options.cookie;

  const payload = { message };
  if (typeof options.interactionId === 'string') payload.interactionId = options.interactionId;
  if (typeof options.conversationId === 'string') payload.conversationId = options.conversationId;

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/conversation`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const normalized = normalizeConversationResponse({ response, text });
  const setCookie = parseCookieHeader(response.headers.get('set-cookie'));

  return {
    ok: response.ok,
    status: response.status,
    json: normalized.json,
    cookie: setCookie || options.cookie || null,
    isStream: normalized.isStream,
    rawText: normalized.rawText,
    headers: response.headers,
  };
}
