import { NextResponse } from 'next/server';
import { fetchGrantDetail } from '@/lib/grants/details';

export const runtime = 'nodejs';

export async function GET(_: Request, context: { params: { id: string } }) {
  const id = String(context.params?.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID bando mancante.' }, { status: 400 });
  }

  try {
    const detail = await fetchGrantDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore caricamento bando.';
    const status = message === 'Bando non trovato.' ? 404 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
