import fs from 'node:fs';

export type BrowserbaseSessionCreateResult = {
  id: string;
  connectUrl?: string;
};

export type BrowserbaseDebugResult = {
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
  pages?: Array<{ debuggerUrl?: string; debuggerFullscreenUrl?: string }>;
};

type BrowserbaseInstance = {
  sessions: {
    create: (input: { projectId?: string; extensionId?: string }) => Promise<BrowserbaseSessionCreateResult>;
    debug: (sessionId: string) => Promise<BrowserbaseDebugResult>;
    close?: (sessionId: string) => Promise<unknown>;
  };
  extensions: {
    create: (input: { file: fs.ReadStream }) => Promise<{ id: string }>;
  };
};

function hasBrowserbaseConfig() {
  return Boolean(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID);
}

async function importBrowserbaseSdk() {
  const dynamicImport = new Function('moduleName', 'return import(moduleName)') as (
    moduleName: string
  ) => Promise<Record<string, unknown>>;

  const mod = await dynamicImport('@browserbasehq/sdk');
  const maybeDefault = mod.default as new (...args: unknown[]) => BrowserbaseInstance;
  const maybeNamed = mod.Browserbase as new (...args: unknown[]) => BrowserbaseInstance;
  const Ctor = maybeDefault ?? maybeNamed;
  if (!Ctor) {
    throw new Error('SDK Browserbase non disponibile. Installa @browserbasehq/sdk.');
  }
  return Ctor;
}

export async function createBrowserbaseClient(): Promise<BrowserbaseInstance> {
  if (!process.env.BROWSERBASE_API_KEY) {
    throw new Error('BROWSERBASE_API_KEY non configurata.');
  }

  const BrowserbaseCtor = await importBrowserbaseSdk();
  return new BrowserbaseCtor({ apiKey: process.env.BROWSERBASE_API_KEY });
}

export async function createBrowserbaseSession(input: {
  extensionId?: string;
}): Promise<{ sessionId: string; connectUrl: string | null; liveViewUrl: string | null }> {
  if (!hasBrowserbaseConfig()) {
    return { sessionId: '', connectUrl: null, liveViewUrl: null };
  }

  const bb = await createBrowserbaseClient();
  const created = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    extensionId: input.extensionId ?? process.env.BROWSERBASE_EXTENSION_ID,
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
  };
}

export async function primeBrowserbaseSessionToInvitalia(
  connectUrl: string | null | undefined,
  initialUrl?: string | null,
) {
  if (!connectUrl) return;

  try {
    const dynamicImport = new Function('moduleName', 'return import(moduleName)') as (
      moduleName: string
    ) => Promise<Record<string, unknown>>;
    const mod = await dynamicImport('playwright-core');
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
      // Delay a bit so the embedded live view has time to connect before the scripted motion starts.
      await page.waitForTimeout(3500);
      await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
      await page.waitForTimeout(1300);
      await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'smooth' }));
      await page.waitForTimeout(1400);
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
      await page.waitForTimeout(1300);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(900);
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
