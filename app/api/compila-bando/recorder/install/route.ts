import { NextResponse } from 'next/server';
import { browserbaseReady, createBrowserbaseClient, validateBrowserbaseEnv } from '@/lib/copilot/browserbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReqBody = {
  sessionId?: unknown;
  recordingId?: unknown;
  appOrigin?: unknown;
};

type CachedRemote = {
  sessionId: string;
  connectUrl: string;
  browser: any;
  lastUsedAt: number;
};

const CACHE_TTL_MS = 70_000;

function getBrowserCache(): Map<string, CachedRemote> {
  const g = globalThis as any;
  if (!g.__bndo_remote_cache) g.__bndo_remote_cache = new Map<string, CachedRemote>();
  return g.__bndo_remote_cache as Map<string, CachedRemote>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function cleanupCacheBestEffort() {
  const cache = getBrowserCache();
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

async function getConnectUrl(sessionId: string): Promise<string> {
  const bb = await createBrowserbaseClient();
  const session = await bb.sessions.retrieve(sessionId);
  const connectUrl = (session as any).connectUrl;
  if (!connectUrl) throw new Error('Browserbase connectUrl mancante per sessionId');
  return String(connectUrl);
}

async function getOrCreateBrowser(sessionId: string): Promise<any> {
  const cache = getBrowserCache();
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

function buildInstallScript(recordingId: string, appOrigin: string) {
  // Keep this script self-contained and resilient (Invitalia is a 3rd-party site).
  // We intentionally avoid capturing full sensitive values; the recorder is about selectors + actions.
  const safeOrigin = appOrigin.replace(/"/g, '');
  const endpoint = `${safeOrigin}/api/compila-bando/recorder/event`;

  return `
(() => {
  try {
    if (window.__bndoRecorderInstalled && window.__bndoRecorderId === ${JSON.stringify(recordingId)}) return;
    window.__bndoRecorderInstalled = true;
    window.__bndoRecorderId = ${JSON.stringify(recordingId)};
    const ENDPOINT = ${JSON.stringify(endpoint)};

    const now = () => Date.now();
    const send = (payload) => {
      try {
        payload.recordingId = ${JSON.stringify(recordingId)};
        payload.url = String(location.href || '');
        payload.ts = payload.ts || now();
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
          mode: 'cors',
          credentials: 'omit',
        }).catch(() => {});
      } catch {}
    };

    const cssEscape = (s) => {
      try { return CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'); } catch { return String(s); }
    };

    const selectorFor = (el) => {
      if (!el || !el.tagName) return '';
      const tag = el.tagName.toLowerCase();
      if (el.id) return '#' + cssEscape(el.id);
      const dataTest = el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa'));
      if (dataTest) return tag + '[data-testid="' + cssEscape(dataTest) + '"]';
      const name = el.getAttribute && el.getAttribute('name');
      if (name) return tag + '[name="' + cssEscape(name) + '"]';
      const aria = el.getAttribute && el.getAttribute('aria-label');
      if (aria) return tag + '[aria-label="' + cssEscape(aria) + '"]';
      const ph = el.getAttribute && el.getAttribute('placeholder');
      if (ph) return tag + '[placeholder="' + cssEscape(ph) + '"]';
      let cur = el;
      const parts = [];
      for (let depth = 0; cur && cur.tagName && depth < 5; depth++) {
        let p = cur.tagName.toLowerCase();
        const cls = (cur.className && String(cur.className).trim()) ? String(cur.className).trim().split(/\\s+/).slice(0,2).join('.') : '';
        if (cls) p += '.' + cls;
        parts.unshift(p);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    };

    const labelFor = (el) => {
      try {
        if (!el) return '';
        const id = el.id;
        if (id) {
          const l = document.querySelector('label[for="' + cssEscape(id) + '"]');
          if (l) return (l.innerText || l.textContent || '').trim().slice(0, 160);
        }
        const parentLabel = el.closest ? el.closest('label') : null;
        if (parentLabel) return (parentLabel.innerText || parentLabel.textContent || '').trim().slice(0, 160);
      } catch {}
      return '';
    };

    const pickTarget = (raw) => {
      if (!raw) return null;
      const el = raw.closest ? (raw.closest('button, a, input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="radio"]') || raw) : raw;
      return el;
    };

    // Track URL changes
    let lastHref = String(location.href || '');
    setInterval(() => {
      try {
        const href = String(location.href || '');
        if (href && href !== lastHref) {
          lastHref = href;
          send({ type: 'goto', href });
        }
      } catch {}
    }, 700);

    document.addEventListener('click', (e) => {
      const el = pickTarget(e.target);
      if (!el) return;
      send({
        type: 'click',
        tag: el.tagName ? el.tagName.toLowerCase() : '',
        selector: selectorFor(el),
        id: el.id || '',
        name: (el.getAttribute && el.getAttribute('name')) || '',
        role: (el.getAttribute && el.getAttribute('role')) || '',
        label: labelFor(el),
        text: (el.innerText || el.textContent || '').trim().slice(0, 160),
      });
    }, true);

    const inputHandler = (e) => {
      const el = e && e.target;
      if (!el || !el.tagName) return;
      const tag = el.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
      const inputType = (el.getAttribute && el.getAttribute('type')) || '';
      const value = (tag === 'select')
        ? ((el.options && el.selectedIndex >= 0 && el.options[el.selectedIndex]) ? (el.options[el.selectedIndex].text || '') : '')
        : (el.value || '');
      const sample = String(value || '').slice(0, 40);
      send({
        type: tag === 'select' ? 'select' : 'type',
        tag,
        inputType,
        selector: selectorFor(el),
        id: el.id || '',
        name: (el.getAttribute && el.getAttribute('name')) || '',
        label: labelFor(el),
        valueSample: sample,
        valueLen: String(value || '').length,
      });
    };

    document.addEventListener('change', inputHandler, true);
    document.addEventListener('blur', inputHandler, true);

    // Record scroll (window or scrollable containers). Throttled to avoid event spam.
    let scrollT = null;
    const scrollHandler = (e) => {
      try {
        const raw = e && e.target ? e.target : null;
        const isDoc =
          raw === document ||
          raw === document.body ||
          raw === document.documentElement ||
          raw === (document.scrollingElement || null);
        const el = isDoc ? (document.scrollingElement || document.documentElement) : raw;
        if (!el) return;

        const tag = isDoc ? 'window' : (el.tagName ? el.tagName.toLowerCase() : '');
        const selector = isDoc ? '' : selectorFor(el);
        const scrollTop = isDoc
          ? (window.scrollY || (document.scrollingElement ? document.scrollingElement.scrollTop : 0) || 0)
          : (el.scrollTop || 0);
        const scrollLeft = isDoc
          ? (window.scrollX || (document.scrollingElement ? document.scrollingElement.scrollLeft : 0) || 0)
          : (el.scrollLeft || 0);
        const scrollHeight = isDoc
          ? ((document.scrollingElement ? document.scrollingElement.scrollHeight : 0) || 0)
          : (el.scrollHeight || 0);
        const clientHeight = isDoc
          ? ((document.scrollingElement ? document.scrollingElement.clientHeight : 0) || 0)
          : (el.clientHeight || 0);

        if (scrollT) clearTimeout(scrollT);
        scrollT = setTimeout(() => {
          send({
            type: 'scroll',
            tag,
            selector,
            id: (!isDoc && el.id) ? el.id : '',
            label: (!isDoc ? labelFor(el) : ''),
            scrollTop,
            scrollLeft,
            scrollHeight,
            clientHeight,
          });
        }, 260);
      } catch {}
    };
    document.addEventListener('scroll', scrollHandler, true);

    send({ type: 'recorder_ready' });
  } catch {}
})();
`;
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
    const recordingId = isNonEmptyString(body.recordingId) ? body.recordingId.trim() : '';
    const appOrigin = isNonEmptyString(body.appOrigin) ? body.appOrigin.trim() : '';

    if (!sessionId || !recordingId || !appOrigin) {
      return NextResponse.json({ ok: false, error: 'sessionId, recordingId, appOrigin richiesti' }, { status: 400 });
    }

    await cleanupCacheBestEffort();
    const browser = await getOrCreateBrowser(sessionId);
    const pages = ((await browser.pages()) as any[]).filter((p) => {
      try {
        return !p.isClosed?.();
      } catch {
        return true;
      }
    });
    const usablePages = pages.length > 0 ? pages : [await browser.newPage()];

    const script = buildInstallScript(recordingId, appOrigin);
    for (const page of usablePages) {
      try {
        await page.evaluateOnNewDocument(script);
      } catch {
        // ignore
      }
      try {
        await page.evaluate(script);
      } catch {
        // ignore
      }
    }

    const cache = getBrowserCache();
    const entry = cache.get(sessionId);
    if (entry) entry.lastUsedAt = Date.now();

    return NextResponse.json({ ok: true, installedOnPages: usablePages.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore install recorder' },
      { status: 500 }
    );
  }
}
