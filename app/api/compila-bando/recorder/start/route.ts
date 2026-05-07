import { NextResponse } from 'next/server';
import { browserbaseReady, validateBrowserbaseEnv, createBrowserbaseSession, primeBrowserbaseSessionToInvitalia } from '@/lib/copilot/browserbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReqBody = { startUrl?: unknown };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
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
    const startUrl = isNonEmptyString(body.startUrl) ? body.startUrl.trim() : 'https://presentazione-domanda-pia.npi.invitalia.it/info-privacy';

    const session = await createBrowserbaseSession({
      keepAlive: true,
      timeoutSeconds: 1800,
      viewport: { width: 1470, height: 860 },
    });

    if (!session.sessionId || !session.connectUrl || !session.liveViewUrl) {
      return NextResponse.json({ ok: false, error: 'Sessione Browserbase incompleta' }, { status: 500 });
    }

    // Prime to startUrl (does not bypass login; it just sets initial navigation).
    await primeBrowserbaseSessionToInvitalia(session.connectUrl, startUrl);

    return NextResponse.json({
      ok: true,
      session: {
        sessionId: session.sessionId,
        connectUrl: session.connectUrl,
        liveViewUrl: session.liveViewUrl,
        sessionExpiresAt: session.expiresAt,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Errore start recorder' },
      { status: 500 }
    );
  }
}

