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
  | 'unknown';

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

async function withRemotePage<T>(connectUrl: string, fn: (page: any) => Promise<T>): Promise<T> {
  const mod = (await import('puppeteer-core')) as any;
  const puppeteer = mod?.default ?? mod;
  if (!puppeteer?.connect) throw new Error('puppeteer-core non disponibile');

  const browser = await puppeteer.connect({ browserWSEndpoint: connectUrl, defaultViewport: null });
  try {
    const pages = (await browser.pages()) as any[];
    const page = pages[0] ?? (await browser.newPage());
    return await fn(page);
  } finally {
    if (typeof browser.disconnect === 'function') browser.disconnect();
    else if (typeof browser.close === 'function') await browser.close();
  }
}

function classify(url: string, text: string): { loggedIn: boolean; hint: Hint } {
  const lowerUrl = (url || '').toLowerCase();
  const lowerText = (text || '').toLowerCase();

  if (lowerUrl.includes('.b2clogin.com')) return { loggedIn: false, hint: 'b2c_login' };

  // Heuristic for SPID provider pages: often external domains after "entra con spid".
  if (!lowerUrl.includes('invitalia-areariservata-fe.npi.invitalia.it') && lowerText.includes('spid')) {
    return { loggedIn: false, hint: 'spid_provider' };
  }

  const isInvitaliaArea = lowerUrl.includes('invitalia-areariservata-fe.npi.invitalia.it');
  if (!isInvitaliaArea) return { loggedIn: false, hint: 'unknown' };

  const looksLoggedOut =
    lowerText.includes('accedi con la tua identita') ||
    lowerText.includes('accedi con la tua identità') ||
    lowerText.includes('entra con spid') ||
    lowerText.includes('identita digitale') ||
    lowerText.includes('identità digitale');

  const looksLoggedIn =
    lowerText.includes('presenta domanda') ||
    lowerText.includes('area riservata') ||
    lowerText.includes('le mie domande') ||
    lowerText.includes('profilo');

  if (looksLoggedIn && !looksLoggedOut) return { loggedIn: true, hint: 'invitalia_home_logged_in' };
  return { loggedIn: false, hint: 'invitalia_home_logged_out' };
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

    const connectUrl = await getConnectUrl(sessionId);
    const result = await withRemotePage(connectUrl, async (page) => {
      const url = typeof page.url === 'function' ? String(page.url()) : '';
      const text = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        return bodyText.slice(0, 15000);
      });
      return { url, text };
    });

    const { loggedIn, hint } = classify(result.url, result.text);
    return NextResponse.json({ ok: true, url: result.url, loggedIn, hint });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore session-status' },
      { status: 500 }
    );
  }
}

