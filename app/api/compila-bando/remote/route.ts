import { NextResponse } from 'next/server';
import {
  browserbaseReady,
  validateBrowserbaseEnv,
  createBrowserbaseClient,
} from '@/lib/copilot/browserbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RemoteRequest =
  | { action: 'screenshot'; sessionId: string }
  | { action: 'click'; sessionId: string; x: number; y: number; button?: 'left' | 'middle' | 'right' }
  | { action: 'type'; sessionId: string; text: string; delayMs?: number }
  | { action: 'press'; sessionId: string; key: string }
  | { action: 'scroll'; sessionId: string; deltaY: number; deltaX?: number };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function getConnectUrl(sessionId: string): Promise<string> {
  const bb = await createBrowserbaseClient();
  const session = await bb.sessions.retrieve(sessionId);
  const connectUrl = session.connectUrl;
  if (!connectUrl) {
    throw new Error('Browserbase connectUrl mancante per sessionId');
  }
  return connectUrl;
}

async function withRemotePage<T>(sessionId: string, fn: (page: any, browser: any) => Promise<T>): Promise<T> {
  const connectUrl = await getConnectUrl(sessionId);
  const mod = (await import('puppeteer-core')) as any;
  const puppeteer = mod?.default ?? mod;
  if (!puppeteer?.connect) throw new Error('puppeteer-core non disponibile');

  const browser = await puppeteer.connect({
    browserWSEndpoint: connectUrl,
    defaultViewport: null,
  });

  try {
    const pages = (await browser.pages()) as any[];
    const page = pages[0] ?? (await browser.newPage());
    return await fn(page, browser);
  } finally {
    // Detach without ending the remote session (keepAlive=true on Browserbase session).
    if (typeof browser.disconnect === 'function') browser.disconnect();
    else if (typeof browser.close === 'function') await browser.close();
  }
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

    const body = (await req.json()) as Partial<RemoteRequest> | null;
    const action = body?.action;
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    if (!action || !sessionId) {
      return NextResponse.json({ ok: false, error: 'Payload non valido' }, { status: 400 });
    }

    if (action === 'screenshot') {
      const result = await withRemotePage(sessionId, async (page) => {
        // Use CDP screenshot for speed + smaller payload. Keep it viewport-only to stay under Netlify payload limits.
        const client = await page.target().createCDPSession();
        await client.send('Page.enable');
        const { data } = await client.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 65,
          captureBeyondViewport: false,
        });
        const meta = await page.evaluate(() => ({
          url: location.href,
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        }));

        return { data, meta };
      });

      return NextResponse.json({
        ok: true,
        mimeType: 'image/jpeg',
        data: result.data,
        meta: result.meta,
      });
    }

    if (action === 'click') {
      const x = (body as any)?.x;
      const y = (body as any)?.y;
      const button = (body as any)?.button ?? 'left';
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        return NextResponse.json({ ok: false, error: 'Coordinate non valide' }, { status: 400 });
      }

      await withRemotePage(sessionId, async (page) => {
        await page.mouse.click(x, y, { button });
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'type') {
      const text = (body as any)?.text;
      const delayMs = (body as any)?.delayMs;
      if (typeof text !== 'string') {
        return NextResponse.json({ ok: false, error: 'Testo non valido' }, { status: 400 });
      }

      await withRemotePage(sessionId, async (page) => {
        await page.keyboard.type(text, { delay: isFiniteNumber(delayMs) ? delayMs : 0 });
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'press') {
      const key = (body as any)?.key;
      if (typeof key !== 'string' || !key) {
        return NextResponse.json({ ok: false, error: 'Key non valida' }, { status: 400 });
      }

      await withRemotePage(sessionId, async (page) => {
        await page.keyboard.press(key);
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'scroll') {
      const deltaY = (body as any)?.deltaY;
      const deltaX = (body as any)?.deltaX ?? 0;
      if (!isFiniteNumber(deltaY) || !isFiniteNumber(deltaX)) {
        return NextResponse.json({ ok: false, error: 'Delta scroll non valido' }, { status: 400 });
      }

      await withRemotePage(sessionId, async (page) => {
        await page.mouse.wheel({ deltaY, deltaX });
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Azione non supportata' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore remote control' },
      { status: 500 }
    );
  }
}

