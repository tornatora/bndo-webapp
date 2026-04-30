import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lazy-load dependencies (keep this route deploy-safe on Netlify functions).
let Docxtemplater: any;
let PizZip: any;

try {
  Docxtemplater = require('docxtemplater');
  PizZip = require('pizzip');
} catch { /* will fail at runtime */ }

const TEMPLATES_DIR = path.join(process.cwd(), 'public', 'templates_tagged');

const DOC_MAP: Record<string, string> = {
  dsan_antiriciclaggio: 'DSAN Antiriciclaggio rsud acn.docx',
  dsan_casellario_liquidatorie: 'DSAN Casellario e procedure concorsuali liquidatorie.docx',
  dsan_requisiti_iniziativa: 'DSAN Possesso requisiti iniziativa economica.docx',
  dsan_requisiti_soggettivi: 'DSAN Possesso requisiti soggettivi.docx',
  descrizione_iniziativa_c2: 'Descrizione iniziativa economica_attività individuali.docx',
};

function buildPayload(data: Record<string, string | null>, overrides: Record<string, string | null>) {
  return {
    ragione_sociale: data.ragione_sociale || '',
    sede_legale: data.sede_legale || '',
    codice_fiscale: data.codice_fiscale || '',
    partita_iva: data.partita_iva || '',
    rea: data.rea || '',
    forma_giuridica: data.forma_giuridica || '',
    nome_legale_rappresentante: data.nome_legale_rappresentante || '',
    email_pec: data.email_pec || '',
    telefono: data.telefono || '',
    ateco: data.ateco || '',
    descrizione_ateco: data.descrizione_ateco || '',
    residenza: overrides.residenza_legale_rappresentante || '',
    provincia: (data.sede_legale?.match(/\(([A-Z]{2})\)/) || [])[1] || '',
    cap: (data.sede_legale?.match(/\b(\d{5})\b/) || [])[1] || '',
    indirizzo: (data.sede_legale?.match(/^([^,(]+)/) || [])[1]?.trim() || '',
    descrizione_iniziativa: overrides.descrizione_iniziativa || '',
    importo_programma: overrides.importo_programma || '',
    luogo: overrides.luogo_firma || '',
    data: overrides.data_firma || new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  };
}

export async function POST(req: Request) {
  try {
    if (!Docxtemplater || !PizZip) {
      return NextResponse.json({ error: 'docxtemplater non disponibile' }, { status: 500 });
    }

    const body = await req.json();
    const data = body.data as Record<string, string | null>;
    const overrides = (body.overrides ?? {}) as Record<string, string | null>;
    const docKey = typeof body.doc === 'string' ? body.doc : null;
    const mode = typeof body.mode === 'string' ? body.mode : 'binary';
    const format = typeof body.format === 'string' ? body.format : 'docx';

    if (!docKey || !DOC_MAP[docKey]) {
      return NextResponse.json({ error: 'Documento non valido' }, { status: 400 });
    }

    const templatePath = path.join(TEMPLATES_DIR, DOC_MAP[docKey]);
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Template non trovato' }, { status: 404 });
    }

    const templateBuffer = fs.readFileSync(templatePath);
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.render(buildPayload(data, overrides));

    let outputBuffer: Buffer = doc.getZip().generate({ type: 'nodebuffer' });
    let outputMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    let outputFileName = DOC_MAP[docKey];

    // IMPORTANT: DOCX→PDF conversion is not reliable on Netlify serverless (chromium/brotli packaging).
    // We always return DOCX and do client-side PDF conversion in the dashboard.
    const pdfRequested = format === 'pdf';

    if (mode === 'base64') {
      return NextResponse.json({
        ok: true,
        key: docKey,
        fileName: outputFileName,
        mimeType: outputMime,
        base64: outputBuffer.toString('base64'),
        warning: pdfRequested ? 'pdf_conversion_client_side' : null,
      });
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': outputMime,
        'Content-Disposition': `attachment; filename="${outputFileName}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore generazione DSAN' },
      { status: 500 }
    );
  }
}
