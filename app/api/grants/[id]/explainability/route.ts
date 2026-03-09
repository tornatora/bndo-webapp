import { NextResponse } from 'next/server';
import { buildFallbackGrantExplainability, isGrantNotFoundError } from '@/lib/grantDetailFallback';
import { fetchJsonWithTimeout, loginScannerApi, scannerApiUrl } from '@/lib/scannerApiClient';

export const runtime = 'nodejs';
const DETAIL_TIMEOUT_MS = 1_900;

export async function GET(_: Request, context: { params: { id: string } }) {
  const id = String(context.params?.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID bando mancante.' }, { status: 400 });
  }

  try {
    const token = await loginScannerApi(DETAIL_TIMEOUT_MS);
    const explainability = await fetchJsonWithTimeout<unknown>(
      scannerApiUrl(`/api/v1/grants/${encodeURIComponent(id)}/explainability`),
      {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` }
      },
      DETAIL_TIMEOUT_MS
    );

    return NextResponse.json(explainability);
  } catch (error) {
    try {
      const fallback = await buildFallbackGrantExplainability(id);
      return NextResponse.json(fallback);
    } catch (fallbackError) {
      if (isGrantNotFoundError(fallbackError)) {
        return NextResponse.json({ error: 'Bando non trovato.' }, { status: 404 });
      }
      const message =
        fallbackError instanceof Error
          ? fallbackError.message
          : error instanceof Error
            ? error.message
            : 'Errore caricamento explainability.';
      return NextResponse.json({ error: message }, { status: 503 });
    }
  }
}
