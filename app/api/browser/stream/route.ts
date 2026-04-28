import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import crypto from 'crypto';
import type { Browser, Page } from 'playwright';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let browser: Browser | null = null;
let page: Page | null = null;
let lastScreenshot: Buffer | null = null;
let initPromise: Promise<void> | null = null;
let fillPromise: Promise<void> | null = null;
let browserState: 'idle' | 'filling' | 'done' = 'idle';

const B2C_AUTHORITY = 'https://minervaorgb2c.b2clogin.com/minervaorgb2c.onmicrosoft.com/b2c_1a_invitalia_signin/oauth2/v2.0/authorize';
const CLIENT_ID = '74cea3c0-5ab9-4414-bf4d-9c80b9824a9f';
const REDIRECT_URI = 'https://invitalia-areariservata-fe.npi.invitalia.it/home';
const SCOPES = 'openid profile offline_access';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64url(hash);
  return { codeVerifier, codeChallenge };
}

function buildB2CUrl(codeChallenge: string): string {
  const state = base64url(crypto.randomBytes(16));
  const nonce = base64url(crypto.randomBytes(16));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    response_mode: 'fragment',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    'x-client-SKU': 'msal.js.browser',
    'x-client-VER': '2.32.2',
    client_info: '1',
  });
  return `${B2C_AUTHORITY}?${params.toString()}`;
}

async function ensureBrowser() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { codeChallenge } = generatePkce();
    const url = buildB2CUrl(codeChallenge);

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });

    const tick = async () => {
      if (!page || page.isClosed()) return;
      try {
        lastScreenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
      } catch {
        // page may be closing
      }
      setTimeout(tick, 1500);
    };
    tick();
  })();

  return initPromise;
}

async function fillFormFields(fields: Record<string, string>) {
  if (!page || page.isClosed()) return;

  browserState = 'filling';

  // Navigate to the local demo form
  const formUrl = 'http://localhost:3000/demo-form.html';
  await page.goto(formUrl, { waitUntil: 'networkidle', timeout: 10_000 });

  // Fill each field with realistic typing delay
  const entries = Object.entries(fields);
  for (const [key, value] of entries) {
    if (!value) continue;
    const inputId = key;
    try {
      await page.waitForSelector(`#${inputId}`, { timeout: 3000 });
    } catch {
      // field not found, skip
      continue;
    }

    // Click the field (focus it)
    await page.click(`#${inputId}`);
    await new Promise((r) => setTimeout(r, 200));

    // Type character by character with small delays
    for (let i = 0; i < value.length; i++) {
      await page.keyboard.type(value[i]);
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
    }

    // Add the 'filled' class to show green highlight
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('filled');
    }, inputId);

    // Brief pause between fields
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
  }

  browserState = 'done';
}

export async function GET(req: Request) {
  try {
    await ensureBrowser();

    const { searchParams } = new URL(req.url);

    if (searchParams.get('state') === '1') {
      return NextResponse.json({
        state: browserState,
        url: page ? page.url() : null,
        title: page ? await page.title() : null,
      });
    }

    if (searchParams.get('debug') === '1' && page) {
      return NextResponse.json({
        state: browserState,
        url: page.url(),
        title: await page.title(),
      });
    }

    if (!lastScreenshot) {
      const start = Date.now();
      while (!lastScreenshot && Date.now() - start < 5_000) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (!lastScreenshot) {
      return NextResponse.json({ error: 'No screenshot yet' }, { status: 503 });
    }

    return new NextResponse(new Uint8Array(lastScreenshot), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Stream error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureBrowser();

    const body = await req.json();
    const { action, fields } = body;

    if (action === 'fill' && fields) {
      // Don't block the response — start filling in background
      fillPromise = fillFormFields(fields).catch((e) => {
        console.error('Fill form error:', e);
        browserState = 'idle';
      });

      return NextResponse.json({ ok: true, state: 'filling' });
    }

    if (action === 'reset') {
      browserState = 'idle';
      fillPromise = null;
      const { codeChallenge } = generatePkce();
      const url = buildB2CUrl(codeChallenge);
      await page!.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
      return NextResponse.json({ ok: true, state: 'idle' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'POST error' },
      { status: 500 }
    );
  }
}
