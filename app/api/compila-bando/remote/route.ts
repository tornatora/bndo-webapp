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
  | { action: 'scroll'; sessionId: string; deltaY: number; deltaX?: number }
  | { action: 'goto'; sessionId: string; url: string }
  | { action: 'inspect'; sessionId: string; x: number; y: number }
  | { action: 'active-element'; sessionId: string };

const INVITALIA_AREA_HOST = 'invitalia-areariservata-fe.npi.invitalia.it';

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

async function selectRemotePage(browser: any) {
  const pages = ((await browser.pages()) as any[]).filter((page) => {
    try {
      return !page.isClosed?.();
    } catch {
      return true;
    }
  });
  if (pages.length === 0) return browser.newPage();

  const scored = pages.map((page, index) => {
    let url = '';
    try {
      url = typeof page.url === 'function' ? String(page.url()).toLowerCase() : '';
    } catch {
      url = '';
    }

    let score = index;
    if (url && url !== 'about:blank') score += 100;
    if (url.includes(INVITALIA_AREA_HOST)) score += 1000;
    if (url.includes('.b2clogin.com')) score += 900;
    if (url.includes('spid')) score += 800;
    return { page, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const page = scored[0]?.page ?? pages[0];
  try {
    await page.bringToFront?.();
  } catch {
    // Best effort.
  }
  return page;
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
    const page = await selectRemotePage(browser);
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

    if (action === 'goto') {
      const url = (body as any)?.url;
      if (typeof url !== 'string' || !url.trim()) {
        return NextResponse.json({ ok: false, error: 'URL non valido' }, { status: 400 });
      }
      await withRemotePage(sessionId, async (page) => {
        await page.goto(url.trim(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'inspect') {
      const x = (body as any)?.x;
      const y = (body as any)?.y;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        return NextResponse.json({ ok: false, error: 'Coordinate non valide' }, { status: 400 });
      }

      const result = await withRemotePage(sessionId, async (page) => {
        const meta = await page.evaluate(() => ({
          url: location.href,
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        }));
        const target = await page.evaluate(
          ({ x, y }: { x: number; y: number }) => {
            const el = document.elementFromPoint(x, y) as HTMLElement | null;
            if (!el) return null;

            const tag = (el.tagName || '').toLowerCase();
            const id = el.id || '';
            const name = (el.getAttribute('name') || '').trim();
            const role = (el.getAttribute('role') || '').trim();
            const inputType = (el.getAttribute('type') || '').trim();
            const placeholder = (el.getAttribute('placeholder') || '').trim();
            const ariaLabel = (el.getAttribute('aria-label') || '').trim();
            const text = (el.innerText || el.textContent || '').trim().slice(0, 140);

            // Try label association.
            let label = '';
            if (id) {
              const l = document.querySelector(`label[for="${CSS.escape(id)}"]`) as HTMLElement | null;
              if (l) label = (l.innerText || '').trim().slice(0, 160);
            }
            if (!label) {
              const parentLabel = el.closest('label') as HTMLElement | null;
              if (parentLabel) label = (parentLabel.innerText || '').trim().slice(0, 160);
            }
            if (!label && ariaLabel) label = ariaLabel;

            // CSS selector preference: id > name > tag
            let css = '';
            if (id) css = `#${CSS.escape(id)}`;
            else if (name) css = `${tag}[name="${name.replace(/\"/g, '\\"')}"]`;
            else css = tag;

            // XPath (best-effort)
            const buildXPath = (el: Element | null): string | null => {
              if (!el) return null;
              const parts: string[] = [];
              let node: Element | null = el;
              while (node && node.nodeType === 1) {
                const t = node.tagName.toLowerCase();
                if ((node as HTMLElement).id) {
                  parts.unshift(`${t}[@id="${(node as HTMLElement).id}"]`);
                  break;
                }
                let idx = 1;
                let sib = node.previousElementSibling;
                while (sib) {
                  if (sib.tagName === node.tagName) idx += 1;
                  sib = sib.previousElementSibling;
                }
                parts.unshift(`${t}[${idx}]`);
                node = node.parentElement;
              }
              return `/${parts.join('/')}`;
            };

            const xpath = buildXPath(el);
            return {
              tag,
              id: id || undefined,
              name: name || undefined,
              role: role || undefined,
              inputType: inputType || undefined,
              placeholder: placeholder || undefined,
              label: label || undefined,
              text: text || undefined,
              css: css || undefined,
              xpath: xpath || undefined,
            };
          },
          { x, y }
        );
        return { meta, target };
      });

      return NextResponse.json({ ok: true, meta: result.meta, target: result.target });
    }

    if (action === 'active-element') {
      const result = await withRemotePage(sessionId, async (page) => {
        const meta = await page.evaluate(() => ({
          url: location.href,
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        }));
        const target = await page.evaluate(() => {
          const el = (document.activeElement as HTMLElement | null) || null;
          if (!el) return null;
          const tag = (el.tagName || '').toLowerCase();
          const id = el.id || '';
          const name = (el.getAttribute('name') || '').trim();
          const role = (el.getAttribute('role') || '').trim();
          const inputType = (el.getAttribute('type') || '').trim();
          const placeholder = (el.getAttribute('placeholder') || '').trim();
          const ariaLabel = (el.getAttribute('aria-label') || '').trim();
          const text = (el.innerText || el.textContent || '').trim().slice(0, 140);

          let label = '';
          if (id) {
            const l = document.querySelector(`label[for="${CSS.escape(id)}"]`) as HTMLElement | null;
            if (l) label = (l.innerText || '').trim().slice(0, 160);
          }
          if (!label) {
            const parentLabel = el.closest('label') as HTMLElement | null;
            if (parentLabel) label = (parentLabel.innerText || '').trim().slice(0, 160);
          }
          if (!label && ariaLabel) label = ariaLabel;

          let css = '';
          if (id) css = `#${CSS.escape(id)}`;
          else if (name) css = `${tag}[name="${name.replace(/\"/g, '\\"')}"]`;
          else css = tag;

          const buildXPath = (el: Element | null): string | null => {
            if (!el) return null;
            const parts: string[] = [];
            let node: Element | null = el;
            while (node && node.nodeType === 1) {
              const t = node.tagName.toLowerCase();
              if ((node as HTMLElement).id) {
                parts.unshift(`${t}[@id="${(node as HTMLElement).id}"]`);
                break;
              }
              let idx = 1;
              let sib = node.previousElementSibling;
              while (sib) {
                if (sib.tagName === node.tagName) idx += 1;
                sib = sib.previousElementSibling;
              }
              parts.unshift(`${t}[${idx}]`);
              node = node.parentElement;
            }
            return `/${parts.join('/')}`;
          };

          const xpath = buildXPath(el);
          return {
            tag,
            id: id || undefined,
            name: name || undefined,
            role: role || undefined,
            inputType: inputType || undefined,
            placeholder: placeholder || undefined,
            label: label || undefined,
            text: text || undefined,
            css: css || undefined,
            xpath: xpath || undefined,
          };
        });
        return { meta, target };
      });

      return NextResponse.json({ ok: true, meta: result.meta, target: result.target });
    }

    return NextResponse.json({ ok: false, error: 'Azione non supportata' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore remote control' },
      { status: 500 }
    );
  }
}
