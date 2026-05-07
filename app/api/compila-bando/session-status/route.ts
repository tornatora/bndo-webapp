import { NextResponse } from 'next/server';
import { browserbaseReady, createBrowserbaseClient, validateBrowserbaseEnv } from '@/lib/copilot/browserbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReqBody = { sessionId?: unknown };

type Hint =
  | 'b2c_login'
  | 'spid_provider'
  | 'invitalia_home_logged_in'
  | 'invitalia_home_logged_out'
  | 'invitalia_form'
  | 'unknown';

type PageInspection = {
  index: number;
  url: string;
  title: string;
  text: string;
  loggedIn: boolean;
  hint: Hint;
};

const INVITALIA_AREA_HOST = 'invitalia-areariservata-fe.npi.invitalia.it';
const INVITALIA_FORM_HOST = 'presentazione-domanda-pia.npi.invitalia.it';

type CachedRemote = {
  sessionId: string;
  connectUrl: string;
  browser: any;
  lastUsedAt: number;
};

const CACHE_TTL_MS = 70_000;

function getCache(): Map<string, CachedRemote> {
  const g = globalThis as any;
  if (!g.__bndo_remote_cache) g.__bndo_remote_cache = new Map<string, CachedRemote>();
  return g.__bndo_remote_cache as Map<string, CachedRemote>;
}

async function cleanupCacheBestEffort() {
  const cache = getCache();
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.lastUsedAt < CACHE_TTL_MS) continue;
    cache.delete(key);
    try {
      if (typeof entry.browser?.disconnect === 'function') entry.browser.disconnect();
      else if (typeof entry.browser?.close === 'function') await entry.browser.close();
    } catch {
      // ignore
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function getConnectUrl(sessionId: string): Promise<string> {
  const bb = await createBrowserbaseClient();
  const session = await bb.sessions.retrieve(sessionId);
  const connectUrl = session.connectUrl;
  if (!connectUrl) throw new Error('Browserbase connectUrl mancante per sessionId');
  return connectUrl;
}

async function getOrCreateBrowser(sessionId: string): Promise<any> {
  const cache = getCache();
  const existing = cache.get(sessionId);
  const now = Date.now();
  if (existing && now - existing.lastUsedAt < CACHE_TTL_MS) {
    try {
      await existing.browser.pages();
      existing.lastUsedAt = now;
      return existing.browser;
    } catch {
      cache.delete(sessionId);
      try {
        if (typeof existing.browser?.disconnect === 'function') existing.browser.disconnect();
        else if (typeof existing.browser?.close === 'function') await existing.browser.close();
      } catch {
        // ignore
      }
    }
  }

  const connectUrl = existing?.connectUrl ?? (await getConnectUrl(sessionId));
  const mod = (await import('puppeteer-core')) as any;
  const puppeteer = mod?.default ?? mod;
  if (!puppeteer?.connect) throw new Error('puppeteer-core non disponibile');

  const browser = await puppeteer.connect({ browserWSEndpoint: connectUrl, defaultViewport: null });
  cache.set(sessionId, { sessionId, connectUrl, browser, lastUsedAt: now });
  return browser;
}

function classify(url: string, text: string): { loggedIn: boolean; hint: Hint } {
  const lowerUrl = (url || '').toLowerCase();
  const lowerText = (text || '').toLowerCase();

  if (lowerUrl.includes('.b2clogin.com')) return { loggedIn: false, hint: 'b2c_login' };

  // Heuristic for SPID provider pages: often external domains after "entra con spid".
  if (!lowerUrl.includes(INVITALIA_AREA_HOST) && lowerText.includes('spid')) {
    return { loggedIn: false, hint: 'spid_provider' };
  }

  const isInvitaliaArea = lowerUrl.includes(INVITALIA_AREA_HOST);
  const isInvitaliaForm = lowerUrl.includes(INVITALIA_FORM_HOST);
  if (!isInvitaliaArea && !isInvitaliaForm) return { loggedIn: false, hint: 'unknown' };

  const looksLoggedOut =
    lowerText.includes('accedi con la tua identita') ||
    lowerText.includes('accedi con la tua identità') ||
    lowerText.includes('entra con spid') ||
    lowerText.includes('identita digitale') ||
    lowerText.includes('identità digitale') ||
    lowerText.includes('scegli il tuo provider') ||
    lowerText.includes('seleziona il gestore');

  // Dopo SPID l'utente puo' essere portato sul portale domanda (dominio diverso dall'area riservata).
  // Se siamo gia' lì e non vediamo segnali di login, consideriamo l'utente autenticato.
  if (isInvitaliaForm) {
    const looksLikeDomanda =
      lowerUrl.includes('/domanda/') ||
      lowerUrl.includes('/info-privacy') ||
      lowerUrl.includes('/step-finale/');
    if (looksLikeDomanda && !looksLoggedOut) {
      return { loggedIn: true, hint: 'invitalia_form' };
    }
  }

  const looksLoggedIn =
    lowerText.includes('presenta domanda') ||
    lowerText.includes('area riservata') ||
    lowerText.includes('la tua area personale') ||
    lowerText.includes('area personale') ||
    lowerText.includes('le mie domande') ||
    lowerText.includes('nuova domanda') ||
    lowerText.includes('cruscotto') ||
    lowerText.includes('fascicolo') ||
    lowerText.includes('agevolazioni') ||
    lowerText.includes('profilo') ||
    lowerText.includes('logout') ||
    lowerText.includes('esci');
  const looksLikeReturnedHome = lowerUrl.includes('/home') && lowerText.length > 250;

  if ((looksLoggedIn || looksLikeReturnedHome) && !looksLoggedOut) {
    return { loggedIn: true, hint: 'invitalia_home_logged_in' };
  }
  return { loggedIn: false, hint: 'invitalia_home_logged_out' };
}

async function inspectPage(page: any, index: number): Promise<PageInspection> {
  const fallback: PageInspection = {
    index,
    url: '',
    title: '',
    text: '',
    loggedIn: false,
    hint: 'unknown',
  };

  try {
    const url = typeof page.url === 'function' ? String(page.url()) : '';
    const data = await page
      .evaluate(() => ({
        title: document.title || '',
        text: (document.body?.innerText || '').slice(0, 15000),
      }))
      .catch(() => ({ title: '', text: '' }));
    const { loggedIn, hint } = classify(url, data.text);
    return {
      index,
      url,
      title: data.title,
      text: data.text,
      loggedIn,
      hint,
    };
  } catch {
    return fallback;
  }
}

function pickBestInspection(inspections: PageInspection[]): PageInspection {
  const nonBlank = inspections.filter((item) => item.url && item.url !== 'about:blank');
  const pool = nonBlank.length > 0 ? nonBlank : inspections;

  const loggedIn = pool.find((item) => item.loggedIn);
  if (loggedIn) return loggedIn;

  const spid = pool.find((item) => item.hint === 'spid_provider');
  if (spid) return spid;

  const b2c = pool.find((item) => item.hint === 'b2c_login');
  if (b2c) return b2c;

  const invitalia = pool.find((item) => item.hint === 'invitalia_home_logged_out');
  if (invitalia) return invitalia;

  return pool[pool.length - 1] ?? {
    index: 0,
    url: '',
    title: '',
    text: '',
    loggedIn: false,
    hint: 'unknown',
  };
}

export async function POST(req: Request) {
  try {
    if (!browserbaseReady()) {
      return NextResponse.json({ ok: false, error: 'Browserbase non configurato' }, { status: 400 });
    }

    const env = validateBrowserbaseEnv();
    if (!env.ok) {
      return NextResponse.json({ ok: false, error: env.errors.join(' ') }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const sessionId = isNonEmptyString(body.sessionId) ? body.sessionId.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'sessionId richiesto' }, { status: 400 });
    }

    await cleanupCacheBestEffort();
    const browser = await getOrCreateBrowser(sessionId);
    const result = await (async () => {
      const pages = ((await browser.pages()) as any[]).filter((page) => {
        try {
          return !page.isClosed?.();
        } catch {
          return true;
        }
      });
      const usablePages = pages.length > 0 ? pages : [await browser.newPage()];
      const inspections = await Promise.all(usablePages.map((page, index) => inspectPage(page, index)));
      return pickBestInspection(inspections);
    })();

    const cache = getCache();
    const entry = cache.get(sessionId);
    if (entry) entry.lastUsedAt = Date.now();

    return NextResponse.json({
      ok: true,
      url: result.url,
      loggedIn: result.loggedIn,
      hint: result.hint,
      title: result.title,
      lastSeenAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore session-status' },
      { status: 500 }
    );
  }
}
