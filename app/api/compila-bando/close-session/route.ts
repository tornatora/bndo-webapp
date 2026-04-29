import { NextResponse } from 'next/server';
import { browserbaseReady, closeBrowserbaseSession, validateBrowserbaseEnv } from '@/lib/copilot/browserbase';

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

    await closeBrowserbaseSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore close-session' },
      { status: 500 }
    );
  }
}

