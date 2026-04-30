import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lazy-load dependencies
let Docxtemplater: any;
let PizZip: any;
let mammoth: any;
let chromium: any;
let puppeteer: any;

try {
  Docxtemplater = require('docxtemplater');
  PizZip = require('pizzip');
} catch { /* will fail at runtime */ }

try {
  mammoth = require('mammoth');
} catch { /* will fail at runtime */ }

try {
  chromium = require('@sparticuz/chromium');
  puppeteer = require('puppeteer-core');
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

async function docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  if (!mammoth || !puppeteer || !chromium) {
    throw new Error('Librerie conversione PDF non disponibili');
  }

  // 1. DOCX → HTML
  const htmlResult = await mammoth.convertToHtml({ buffer: docxBuffer });
  let html = htmlResult.value;

  // Wrap in full HTML with styles to preserve layout
  const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; max-width: 210mm; margin: 0 auto; padding: 20mm; }
  p { margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td, th { border: 1px solid #ccc; padding: 6px; font-size: 10pt; }
  h1 { font-size: 14pt; font-weight: bold; margin: 12px 0; }
  h2 { font-size: 12pt; font-weight: bold; margin: 10px 0; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  ul, ol { margin: 8px 0; padding-left: 24px; }
</style>
</head>
<body>
${html}
</body>
</html>`;

  // 2. HTML → PDF with Puppeteer
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
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

    // Convert to PDF if requested
    if (format === 'pdf') {
      try {
        outputBuffer = await docxToPdf(outputBuffer);
        outputMime = 'application/pdf';
        outputFileName = outputFileName.replace(/\.docx$/i, '.pdf');
      } catch (convErr) {
        const msg = convErr instanceof Error ? convErr.message : 'Errore conversione PDF';
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    if (mode === 'base64') {
      return NextResponse.json({
        ok: true,
        key: docKey,
        fileName: outputFileName,
        mimeType: outputMime,
        base64: outputBuffer.toString('base64'),
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
