/**
 * Chrome DevTools adapter — supports both local Chrome and Browserless v2.
 *
 * Local Chrome:  BROWSERLESS_URL=http://localhost:9222
 * Browserless:   BROWSERLESS_URL=https://chrome-production-xxx.up.railway.app
 *
 * Flow:
 *   1. GET /json/list → discover page targets
 *   2. Navigate to SPID login via CDP WebSocket (works on localhost, best-effort on Railway)
 *   3. Live view = DevTools inspector URL (Google CDN for local, self-hosted for Browserless)
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

function isLocalChrome(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.startsWith('[::1]');
  } catch {
    return false;
  }
}

function getHostname(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

async function navigateViaCDP(wsUrl: string, url: string): Promise<void> {
  const ws = new WebSocket(wsUrl);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('CDP navigation timeout'));
    }, 8_000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Page.navigate',
          params: { url },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id === 1) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      ws.close();
      reject(new Error('CDP WebSocket error'));
    };
  });
}

export async function createBrowserlessSession(): Promise<BrowserlessSessionResult> {
  const baseUrl = getBrowserlessBaseUrl();
  if (!baseUrl) {
    throw new Error('BROWSERLESS_URL non configurata');
  }

  const targetsRes = await fetch(`${baseUrl}/json/list`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!targetsRes.ok) {
    throw new Error(`Browserless /json/list failed: ${targetsRes.status}`);
  }

  const targets = (await targetsRes.json()) as Array<{
    id?: string;
    targetId?: string;
    devtoolsFrontendUrl?: string;
    webSocketDebuggerUrl?: string;
    title?: string;
    type?: string;
  }>;

  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    throw new Error('Browserless: no page target found');
  }

  const local = isLocalChrome(baseUrl);

  // Local Chrome uses "id" field (plain hash), Browserless uses "targetId" (/devtools/page/ prefix)
  const rawId = page.id || page.targetId || '';
  const targetId = local ? rawId : rawId.replace('/devtools/page/', '').replace('/page/', '').replace('/devtools/', '');
  const sessionId = targetId;
  const wsUrl = page.webSocketDebuggerUrl || '';

  // Live view URL: Google CDN inspector for local Chrome, self-hosted for Browserless
  let liveViewUrl: string | null = null;
  if (local) {
    // Use Google CDN inspector (HTTP) — has full JS bundles, no mixed content with ws://localhost
    const devtoolsUrl = page.devtoolsFrontendUrl || '';
    liveViewUrl = devtoolsUrl.replace(/^https:\/\//, 'http://') || null;
  } else {
    const host = getHostname(baseUrl);
    liveViewUrl = `${baseUrl}/devtools/inspector.html?ws=${host}/devtools/page/${targetId}`;
  }

  // Navigate to SPID login via CDP WebSocket (works locally, best-effort on Railway)
  if (wsUrl) {
    const spidUrl =
      process.env.INVITALIA_SPID_URL ||
      'https://minervaorgb2c.b2clogin.com/minervaorgb2c.onmicrosoft.com/b2c_1a_invitalia_signin/oauth2/v2.0/authorize' +
      '?client_id=74cea3c0-5ab9-4414-bf4d-9c80b9824a9f' +
      '&scope=openid%20profile%20offline_access' +
      '&redirect_uri=https%3A%2F%2Finvitalia-areariservata-fe.npi.invitalia.it%2Fhome' +
      '&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.32.2&client_info=1';

    navigateViaCDP(wsUrl, spidUrl).catch(() => {
      // Best effort — page stays at about:blank on remote (Railway blocks WebSocket)
    });
  }

  return { sessionId, liveViewUrl, connectUrl: wsUrl };
}

export async function closeBrowserlessSession(_sessionId: string | null | undefined): Promise<void> {
  // Pre-booted browser stays alive — no cleanup needed
}
