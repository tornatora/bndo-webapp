import { NextResponse } from 'next/server';
import { extractFromPdf } from '@/app/estrattore/lib/pdfExtractor';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const rate = checkRateLimit(req, { keyPrefix: 'estrattore_extract', windowMs: 60_000, max: 10 });
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra qualche secondo.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File mancante (field "file").' }, { status: 400 });
    }
    if (file.type && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Formato non supportato. Carica un PDF.' }, { status: 400 });
    }
    if (typeof file.size === 'number' && file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande. Massimo 12 MB.' }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await extractFromPdf(buf);

    if (result.warnings.includes('pdf_scanned_or_empty')) {
      return NextResponse.json(
        {
          error:
            'Non riesco a leggere il testo del PDF. Probabilmente è un PDF scansionato (immagine). Carica un PDF testuale.',
          extracted: result.extracted,
          meta: result.meta,
          warnings: result.warnings,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      extracted: result.extracted,
      meta: result.meta,
      warnings: result.warnings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore durante l\'estrazione.' },
      { status: 500 }
    );
  }
}
