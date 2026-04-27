import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = body.data as Record<string, string | null> | undefined;

    if (!data) {
      return NextResponse.json({ error: 'Nessun dato ricevuto.' }, { status: 400 });
    }

    const hasBrowserbase = Boolean(
      process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID
    );

    if (!hasBrowserbase) {
      return NextResponse.json(
        {
          status: 'demo',
          message: 'BrowserBase non configurato. Modalità demo attiva.',
          fields: Object.entries(data)
            .filter(([, v]) => v)
            .map(([key, value]) => ({ key, value })),
        },
        { status: 200 }
      );
    }

    let sessionId = '';
    let connectUrl: string | null = null;
    let liveViewUrl: string | null = null;

    try {
      const { default: Browserbase } = await import('@browserbasehq/sdk');
      const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

      const session = await bb.sessions.create({
        projectId: process.env.BROWSERBASE_PROJECT_ID,
        extensionId: process.env.BROWSERBASE_EXTENSION_ID,
      });

      sessionId = session.id;
      connectUrl = session.connectUrl ?? null;

      for (let attempt = 0; attempt < 8; attempt++) {
        const debug = await bb.sessions.debug(session.id);
        liveViewUrl =
          debug.debuggerFullscreenUrl ??
          debug.debuggerUrl ??
          (Array.isArray(debug.pages)
            ? (debug.pages[0]?.debuggerFullscreenUrl ?? debug.pages[0]?.debuggerUrl ?? null)
            : null) ??
          null;
        if (liveViewUrl) break;
        await new Promise((r) => setTimeout(r, 900));
      }
    } catch (e) {
      return NextResponse.json({
        status: 'session_error',
        message: e instanceof Error ? e.message : 'Errore creazione sessione',
        fields: Object.entries(data)
          .filter(([, v]) => v)
          .map(([key, value]) => ({ key, value })),
      });
    }

    return NextResponse.json({
      status: 'session_created',
      sessionId,
      liveViewUrl,
      connectUrl,
      fields: Object.entries(data)
        .filter(([, v]) => v)
        .map(([key, value]) => ({ key, value })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore sessione BrowserBase.' },
      { status: 500 }
    );
  }
}
