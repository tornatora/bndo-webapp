import { NextResponse } from 'next/server';
import { fetchGrantDetail, fetchGrantExplainability } from '@/lib/grants/details';
import { getOrBuildGrantDetailContent } from '@/lib/grants/detailPageContent';

export const runtime = 'nodejs';

export async function GET(_: Request, context: { params: { id: string } }) {
  const id = String(context.params?.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID bando mancante.' }, { status: 400 });
  }

  try {
    const [detail, explainability] = await Promise.all([fetchGrantDetail(id), fetchGrantExplainability(id)]);
    const detailContent = await getOrBuildGrantDetailContent(detail, explainability);

    return NextResponse.json({ detail, explainability, detailContent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore caricamento pagina bando.';
    const status = message === 'Bando non trovato.' ? 404 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
