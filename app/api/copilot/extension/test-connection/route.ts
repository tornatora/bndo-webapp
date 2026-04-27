import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function resolveProvidedKey(request: Request, body?: Record<string, unknown>) {
  const fromHeader = request.headers.get('x-bndo-extension-key')?.trim();
  if (fromHeader) return fromHeader;
  const fromBody = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (fromBody) return fromBody;
  return '';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const provided = resolveProvidedKey(request, body);
    const expected = process.env.BNDO_EXTENSION_ADMIN_KEY?.trim() || '';

    if (expected && provided !== expected) {
      return NextResponse.json({ ok: false, error: 'API key non valida.' }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      mode: expected ? 'secured' : 'open_dev',
      message: expected
        ? 'Connessione estensione verificata.'
        : 'Connessione valida (env BNDO_EXTENSION_ADMIN_KEY non configurata).',
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore test connessione estensione.' },
      { status: 500 },
    );
  }
}
