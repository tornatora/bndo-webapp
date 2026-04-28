/**
 * Browserless v2 adapter — open source browser automation
 *
 * Browserless exposes:
 *   POST /session        → create a new browser session
 *   GET  /devtools/<id>  → live DevTools view (embeddable in iframe like Browserbase)
 *   POST /close/<id>     → close session
 *
 * Deploy: Docker container `browserless/chrome` on Railway / Hetzner / Fly.io
 * Set BROWSERLESS_URL env var to the deployment URL.
 */

export type BrowserlessSessionResult = {
  sessionId: string;
  liveViewUrl: string | null;
  connectUrl: string | null;
};

function getBrowserlessBaseUrl(): string | null {
  const url = (process.env.BROWSERLESS_URL || '').trim().replace(/\/+$/, '');
  return url || null;
}

export function browserlessReady(): boolean {
  return Boolean(process.env.BROWSERLESS_URL);
}

export async function createBrowserlessSession(): Promise<BrowserlessSessionResult> {
  const baseUrl = getBrowserlessBaseUrl();
  if (!baseUrl) {
    throw new Error('BROWSERLESS_URL non configurata');
  }

  // Create a new session via Browserless HTTP API
  const res = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Browserless session creation failed: ${res.status}`);
  }

  const data = (await res.json()) as { sessionId?: string; webSocketDebuggerUrl?: string };
  const sessionId = data.sessionId || '';

  // Browserless DevTools URL works as live view — embeddable in iframe
  const liveViewUrl = sessionId ? `${baseUrl}/devtools/${sessionId}` : null;
  // CDP WebSocket URL for Playwright automation
  const connectUrl = data.webSocketDebuggerUrl || null;

  return { sessionId, liveViewUrl, connectUrl };
}

export async function closeBrowserlessSession(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return;
  const baseUrl = getBrowserlessBaseUrl();
  if (!baseUrl) return;

  try {
    await fetch(`${baseUrl}/close/${sessionId}`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Best effort
  }
}
