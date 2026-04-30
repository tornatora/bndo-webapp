import fs from 'node:fs';

export type BrowserbaseSessionCreateResult = {
  id: string;
  connectUrl?: string;
  expiresAt?: string;
};

export type BrowserbaseSessionRetrieveResult = {
  id: string;
  connectUrl?: string;
  expiresAt?: string;
};

export type BrowserbaseDebugResult = {
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
  pages?: Array<{ debuggerUrl?: string; debuggerFullscreenUrl?: string }>;
};

type BrowserbaseInstance = {
  sessions: {
    create: (input: {
      projectId?: string;
      extensionId?: string;
      keepAlive?: boolean;
      timeout?: number;
      browserSettings?: {
        viewport?: { width: number; height: number };
      };
    }) => Promise<BrowserbaseSessionCreateResult>;
    debug: (sessionId: string) => Promise<BrowserbaseDebugResult>;
    retrieve: (sessionId: string) => Promise<BrowserbaseSessionRetrieveResult>;
    close?: (sessionId: string) => Promise<unknown>;
  };
  extensions: {
    create: (input: { file: fs.ReadStream }) => Promise<{ id: string }>;
  };
};

function hasBrowserbaseConfig() {
  return Boolean(process.env.BROWSERBASE_API_KEY);
}

export type BrowserbaseEnvValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateBrowserbaseEnv(): BrowserbaseEnvValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const apiKey = (process.env.BROWSERBASE_API_KEY || '').trim();
  const projectId = (process.env.BROWSERBASE_PROJECT_ID || '').trim();
  const extensionId = (process.env.BROWSERBASE_EXTENSION_ID || '').trim();

  if (!apiKey) {
    errors.push('BROWSERBASE_API_KEY mancante.');
  }
  if (apiKey && !/^bb_(live|test)_/.test(apiKey)) {
    warnings.push('BROWSERBASE_API_KEY ha formato inatteso.');
  }
  if (!projectId) {
    warnings.push('BROWSERBASE_PROJECT_ID non impostata: il progetto verra inferito dalla API key.');
  }
  if (!extensionId) {
    warnings.push('BROWSERBASE_EXTENSION_ID non impostata: sessione senza estensione custom.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

async function importBrowserbaseSdk() {
  const mod = (await import('@browserbasehq/sdk')) as Record<string, unknown>;
  const maybeDefault = mod.default as new (...args: unknown[]) => BrowserbaseInstance;
  const maybeNamed = mod.Browserbase as new (...args: unknown[]) => BrowserbaseInstance;
  const Ctor = maybeDefault ?? maybeNamed;
  if (!Ctor) {
    throw new Error('SDK Browserbase non disponibile. Installa @browserbasehq/sdk.');
  }
  return Ctor;
}

export async function createBrowserbaseClient(): Promise<BrowserbaseInstance> {
  const validation = validateBrowserbaseEnv();
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  const BrowserbaseCtor = await importBrowserbaseSdk();
  return new BrowserbaseCtor({ apiKey: process.env.BROWSERBASE_API_KEY });
}

export async function createBrowserbaseSession(input: {
  extensionId?: string;
  keepAlive?: boolean;
  timeoutSeconds?: number;
  viewport?: { width: number; height: number };
}): Promise<{ sessionId: string; connectUrl: string | null; liveViewUrl: string | null; expiresAt: string | null }> {
  if (!hasBrowserbaseConfig()) {
    return { sessionId: '', connectUrl: null, liveViewUrl: null, expiresAt: null };
  }

  const bb = await createBrowserbaseClient();
  const created = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,
    extensionId: input.extensionId || process.env.BROWSERBASE_EXTENSION_ID || undefined,
    keepAlive: input.keepAlive ?? true,
    timeout: input.timeoutSeconds ?? 1800,
    browserSettings: {
      viewport: input.viewport ?? { width: 1470, height: 740 },
    },
  });
  let liveViewUrl: string | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const debug = await bb.sessions.debug(created.id);
    const liveFromPages = Array.isArray(debug.pages)
      ? (debug.pages[0]?.debuggerFullscreenUrl ?? debug.pages[0]?.debuggerUrl ?? null)
      : null;
    liveViewUrl = debug.debuggerFullscreenUrl ?? debug.debuggerUrl ?? liveFromPages ?? null;
    if (liveViewUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  return {
    sessionId: created.id,
    connectUrl: created.connectUrl ?? null,
    liveViewUrl,
    expiresAt: created.expiresAt ?? null,
  };
}

export async function primeBrowserbaseSessionToInvitalia(
  connectUrl: string | null | undefined,
  initialUrl?: string | null,
) {
  if (!connectUrl) return;

  try {
    // Use playwright-core for deploy friendliness (smaller + explicit dependency tracing).
    const mod = (await import('playwright-core')) as Record<string, unknown>;
    const chromium = mod.chromium as
      | {
          connectOverCDP: (
            endpointURL: string
          ) => Promise<{
            contexts: () => Array<{
              pages: () => Array<{
                goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
                waitForTimeout: (timeout: number) => Promise<unknown>;
                evaluate: <T>(fn: () => T) => Promise<T>;
              }>;
              newPage: () => Promise<{
                goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
                waitForTimeout: (timeout: number) => Promise<unknown>;
                evaluate: <T>(fn: () => T) => Promise<T>;
              }>;
            }>;
            newContext?: () => Promise<{
              pages: () => Array<{
                goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
                waitForTimeout: (timeout: number) => Promise<unknown>;
                evaluate: <T>(fn: () => T) => Promise<T>;
              }>;
              newPage: () => Promise<{
                goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
                waitForTimeout: (timeout: number) => Promise<unknown>;
                evaluate: <T>(fn: () => T) => Promise<T>;
              }>;
            }>;
            close: () => Promise<unknown>;
          }>;
        }
      | undefined;
    if (!chromium || typeof chromium.connectOverCDP !== 'function') return;

    const browser = await chromium.connectOverCDP(connectUrl);
    try {
      const context = browser.contexts()[0] ?? (typeof browser.newContext === 'function' ? await browser.newContext() : null);
      if (!context) return;
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(initialUrl || 'https://www.invitalia.it', {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      // Keep priming deterministic: no extra scrolling. Just a short delay so the page settles.
      await page.waitForTimeout(1200);
    } finally {
      await browser.close();
    }
  } catch {
    // Best effort: se la navigazione iniziale fallisce manteniamo comunque la sessione live.
  }
}

export async function closeBrowserbaseSession(sessionId: string | null | undefined) {
  if (!sessionId || !hasBrowserbaseConfig()) return;
  try {
    const bb = await createBrowserbaseClient();
    if (typeof bb.sessions.close === 'function') {
      await bb.sessions.close(sessionId);
    }
  } catch {
    // Best effort: non blocchiamo stop session se Browserbase non risponde.
  }
}

export function browserbaseReady() {
  return hasBrowserbaseConfig();
}

export function browserbaseRecorderReady() {
  return hasBrowserbaseConfig() && Boolean(process.env.BROWSERBASE_EXTENSION_ID);
}
