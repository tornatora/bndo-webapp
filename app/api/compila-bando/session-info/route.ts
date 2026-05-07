import { NextResponse } from 'next/server';
import { browserbaseReady, createBrowserbaseClient, validateBrowserbaseEnv } from '@/lib/copilot/browserbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReqBody = { sessionId?: unknown };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

    const bb = await createBrowserbaseClient();

    // The Browserbase retrieve() response does not include a live view URL.
    // We must call sessions.debug() and pick the best debugger URL.
    let liveViewUrl: string | null = null;
    let expiresAt: string | null = null;

    try {
      const session = await bb.sessions.retrieve(sessionId);
      expiresAt = (session as any).expiresAt ?? null;
    } catch {
      // ignore
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const debug = await bb.sessions.debug(sessionId).catch(() => null as any);
      const fromPages = Array.isArray(debug?.pages)
        ? (debug.pages[0]?.debuggerFullscreenUrl ?? debug.pages[0]?.debuggerUrl ?? null)
        : null;
      liveViewUrl = debug?.debuggerFullscreenUrl ?? debug?.debuggerUrl ?? fromPages ?? null;
      if (liveViewUrl) break;
      await new Promise((r) => setTimeout(r, 650));
    }

    if (!liveViewUrl) {
      return NextResponse.json({ ok: false, error: 'Live View non disponibile per sessionId (debuggerUrl mancante)' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, liveViewUrl, expiresAt });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore session-info' },
      { status: 500 }
    );
  }
}
