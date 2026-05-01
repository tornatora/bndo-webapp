import { NextResponse } from 'next/server';
import { browserbaseReady, createBrowserbaseClient, validateBrowserbaseEnv } from '@/lib/copilot/browserbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReqBody = {
  sessionId?: unknown;
  action?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

async function getConnectUrl(sessionId: string): Promise<string> {
  const bb = await createBrowserbaseClient();
  const session = await bb.sessions.retrieve(sessionId);
  const connectUrl = (session as any).connectUrl;
  if (!connectUrl) throw new Error('Browserbase connectUrl mancante per sessionId');
  return String(connectUrl);
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
    const action = isNonEmptyString(body.action) ? body.action.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'sessionId richiesto' }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ ok: false, error: 'action richiesta' }, { status: 400 });
    }

    const connectUrl = await getConnectUrl(sessionId);
    const mod = (await import('puppeteer-core')) as any;
    const puppeteer = mod?.default ?? mod;
    if (!puppeteer?.connect) throw new Error('puppeteer-core non disponibile');

    const browser = await puppeteer.connect({ browserWSEndpoint: connectUrl, defaultViewport: null });
    try {
      const pages = (await browser.pages()) as any[];
      const page = pages.find((p) => {
        try {
          return !p.isClosed?.();
        } catch {
          return true;
        }
      }) ?? (await browser.newPage());

      if (action === 'open_linea_intervento') {
        const result = await page.evaluate(() => {
          const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
          const want = norm('Linea di intervento');

          const candidates = Array.from(document.querySelectorAll('mat-select')) as HTMLElement[];
          const byText =
            candidates.find((el) => norm(el.innerText || el.textContent || '').includes(want)) ||
            null;

          let target: HTMLElement | null = byText;
          if (!target) {
            // Try find by associated label text.
            const labels = Array.from(document.querySelectorAll('label')) as HTMLElement[];
            const label = labels.find((l) => norm(l.innerText || l.textContent || '').includes(want)) || null;
            if (label) {
              const forId = label.getAttribute('for');
              if (forId) {
                const byFor = document.getElementById(forId) as HTMLElement | null;
                if (byFor) target = byFor;
              }
              if (!target) {
                const near = label.closest('mat-form-field') || label.parentElement;
                if (near) {
                  const ms = near.querySelector('mat-select') as HTMLElement | null;
                  if (ms) target = ms;
                }
              }
            }
          }

          if (!target) return { ok: false, reason: 'NO_MAT_SELECT_FOUND' };

          const trigger =
            (target.querySelector('.mat-mdc-select-trigger') as HTMLElement | null) ||
            (target.querySelector('.mat-select-trigger') as HTMLElement | null) ||
            target;

          trigger.scrollIntoView({ block: 'center', inline: 'center' });
          const ev = (name: string) => new MouseEvent(name, { bubbles: true, cancelable: true, view: window });
          trigger.dispatchEvent(ev('mousedown'));
          trigger.dispatchEvent(ev('mouseup'));
          trigger.dispatchEvent(ev('click'));
          return { ok: true, tag: target.tagName.toLowerCase() };
        });

        return NextResponse.json({ ok: true, action, result });
      }

      return NextResponse.json({ ok: false, error: 'azione non supportata' }, { status: 400 });
    } finally {
      try {
        if (typeof browser.disconnect === 'function') browser.disconnect();
        else if (typeof browser.close === 'function') await browser.close();
      } catch {
        // ignore
      }
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore force recorder' },
      { status: 500 }
    );
  }
}

