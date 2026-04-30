import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
const PDF_TEMPLATES_DIR = path.join(process.cwd(), 'public', 'templates_pdf');

const DOC_MAP: Record<string, string> = {
  dsan_antiriciclaggio: 'DSAN Antiriciclaggio rsud acn.docx',
  dsan_casellario_liquidatorie: 'DSAN Casellario e procedure concorsuali liquidatorie.docx',
  dsan_requisiti_iniziativa: 'DSAN Possesso requisiti iniziativa economica.docx',
  dsan_requisiti_soggettivi: 'DSAN Possesso requisiti soggettivi.docx',
  // Keep ASCII filename to avoid Unicode normalization issues on Linux deploys (Netlify).
  descrizione_iniziativa_c2: 'Descrizione_iniziativa_economica_attivita_individuali.docx',
};

const PDF_MAP: Record<string, { templateFileName: string; outputFileName: string }> = {
  dsan_antiriciclaggio: {
    templateFileName: 'DSAN_Antiriciclaggio_rsud_acn.pdf',
    outputFileName: 'DSAN_Antiriciclaggio.pdf',
  },
  dsan_casellario_liquidatorie: {
    templateFileName: 'DSAN_Casellario_procedure_concorsuali_liquidatorie.pdf',
    outputFileName: 'DSAN_Casellario.pdf',
  },
  dsan_requisiti_iniziativa: {
    templateFileName: 'DSAN_Possesso_requisiti_iniziativa_economica.pdf',
    outputFileName: 'DSAN_Requisiti_Iniziativa.pdf',
  },
  dsan_requisiti_soggettivi: {
    templateFileName: 'DSAN_Possesso_requisiti_soggettivi.pdf',
    outputFileName: 'DSAN_Requisiti_Soggettivi.pdf',
  },
  descrizione_iniziativa_c2: {
    templateFileName: 'Descrizione_iniziativa_economica_attivita_individuali.pdf',
    outputFileName: 'Descrizione_Iniziativa_C2.pdf',
  },
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

function clampText(value: string, maxLen: number): string {
  const trimmed = String(value || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`;
}

function sanitizeSingleLine(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim();
}

function splitNameForPdf(nome: string): { nome: string; cognome: string } {
  const cleaned = sanitizeSingleLine(nome);
  if (!cleaned) return { nome: '', cognome: '' };
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) return { nome: parts[0], cognome: '' };
  return { nome: parts.slice(1).join(' '), cognome: parts[0] };
}

function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const cleaned = String(text || '').replace(/\r/g, '\n').trim();
  if (!cleaned) return [];
  const words = cleaned.replace(/\n+/g, ' ').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxCharsPerLine) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = w;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function fillPdfFromTemplate(docKey: string, templateBuffer: Buffer, payload: Record<string, string>) {
  const pdfDoc = await PDFDocument.load(templateBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const black = rgb(0, 0, 0);

  const drawFitted = (
    pageIndex: number,
    rawText: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number
  ) => {
    const page = pages[pageIndex];
    const text = sanitizeSingleLine(rawText);
    if (!page || !text) return;

    // Fit text into the placeholder width, shrinking font size if needed.
    let s = size;
    const min = 7;
    while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
    const finalText =
      font.widthOfTextAtSize(text, s) <= maxWidth
        ? text
        : clampText(text, Math.max(12, Math.floor(text.length * (maxWidth / font.widthOfTextAtSize(text, s)))));

    page.drawText(finalText, { x, y, size: s, font, color: black });
  };

  const drawMultiline = (
    pageIndex: number,
    rawText: string,
    x: number,
    yTop: number,
    maxWidth: number,
    size: number,
    lineHeight: number,
    maxLines: number
  ) => {
    const page = pages[pageIndex];
    const text = String(rawText || '').trim();
    if (!page || !text) return;
    const lines = wrapLines(text, 95, maxLines);
    if (lines.length === 0) return;
    let y = yTop;
    for (const ln of lines) {
      drawFitted(pageIndex, ln, x, y, maxWidth, size);
      y -= lineHeight;
      if (y < 0) break;
    }
  };

  const nome = sanitizeSingleLine(payload.nome_legale_rappresentante || '');
  const cf = sanitizeSingleLine(payload.codice_fiscale || payload.partita_iva || '');
  const piva = sanitizeSingleLine(payload.partita_iva || '');
  const sede = sanitizeSingleLine(payload.sede_legale || '');
  splitNameForPdf(nome); // keep helper linked for future fields

  // IMPORTANT: we prefer leaving a field blank over writing garbage in the wrong place.
  // We only place a handful of high-signal fields that we actually have.
  switch (docKey) {
    case 'dsan_casellario_liquidatorie': {
      // Page 1: dichiarante
      drawFitted(0, nome, 153.17, 596.33, 166.6, 10);
      drawFitted(0, cf, 249.68, 579.05, 100, 10);
      drawFitted(0, sanitizeSingleLine(payload.residenza || ''), 390.02, 579.05, 140, 10);

      // Page 1: impresa
      drawFitted(0, payload.ragione_sociale || '', 193.51, 371.86, 144.3, 10);
      drawFitted(0, cf, 427.42, 371.86, 108, 10);
      drawFitted(0, piva, 133.45, 354.58, 120, 10);
      // Try putting the full sede legale (short) in the "comune" slot.
      drawFitted(0, sede, 396.55, 354.58, 110.8, 9);
      drawFitted(0, sanitizeSingleLine(payload.provincia || ''), 70.82, 337.54, 27.7, 10);
      drawFitted(0, sanitizeSingleLine(payload.indirizzo || sede), 139.58, 337.54, 250, 9);
      drawFitted(0, sede, 116.69, 320.26, 122, 9);
      drawFitted(0, sanitizeSingleLine(payload.provincia || ''), 328.68, 320.26, 63.5, 10);

      // Page 2: luogo/data firma (se disponibili)
      drawFitted(1, sanitizeSingleLine(payload.luogo || ''), 100.13, 594.17, 228.1, 10);
      drawFitted(1, sanitizeSingleLine(payload.data || ''), 328.20, 594.17, 47.2, 9);
      break;
    }

    case 'dsan_requisiti_iniziativa': {
      // Page 1: dichiarante (nome + CF + residenza)
      drawFitted(0, nome, 157.74, 600.74, 145, 10);
      drawFitted(0, cf, 173.08, 583.44, 101, 10);
      drawFitted(0, sanitizeSingleLine(payload.residenza || ''), 408.89, 583.44, 125, 9);
      drawFitted(0, sanitizeSingleLine(payload.residenza || ''), 197.76, 566.16, 206, 9);

      // Page 1: società + sede legale
      drawFitted(0, payload.ragione_sociale || '', 302.29, 548.88, 97, 9);
      drawFitted(0, sede, 56.54, 531.58, 136.2, 9);
      drawFitted(0, sanitizeSingleLine(payload.provincia || ''), 237.38, 531.58, 30.8, 10);
      drawFitted(0, sanitizeSingleLine(payload.indirizzo || ''), 330.31, 531.58, 208.5, 9);
      drawFitted(0, sanitizeSingleLine(payload.cap || ''), 134.46, 514.30, 55, 10);
      break;
    }

    case 'dsan_requisiti_soggettivi': {
      // Page 1: dichiarante (nome + CF + residenza)
      drawFitted(0, nome, 157.80, 559.85, 145, 10);
      drawFitted(0, cf, 173.15, 542.54, 101, 10);
      drawFitted(0, sanitizeSingleLine(payload.residenza || ''), 408.75, 542.54, 125, 9);
      drawFitted(0, sanitizeSingleLine(payload.residenza || ''), 197.90, 525.26, 175, 9);
      break;
    }

    case 'dsan_antiriciclaggio': {
      // Page 1: only the core identity fields (layout has lines, no underscores).
      drawFitted(0, nome, 165, 560.57, 170, 10);
      drawFitted(0, cf, 360, 543.50, 165, 10);
      drawFitted(0, sanitizeSingleLine(payload.residenza || ''), 150, 526.46, 270, 9);
      drawFitted(0, sanitizeSingleLine(payload.residenza || ''), 150, 509.66, 270, 9);
      break;
    }

    case 'descrizione_iniziativa_c2': {
      // Page 1: company header fields + description box.
      drawFitted(0, payload.ragione_sociale || '', 170, 512.06, 360, 10);
      drawFitted(0, cf, 170, 435.0, 200, 10);
      drawFitted(0, piva, 170, 411.72, 200, 10);

      // Big multiline box (Descrizione sintetica dell’iniziativa economica)
      drawMultiline(0, payload.descrizione_iniziativa || '', 115, 665, 430, 10, 12, 9);
      break;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
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

    const payload = buildPayload(data, overrides);
    const pdfRequested = format === 'pdf';

    let outputBuffer: Buffer;
    let outputMime: string;
    let outputFileName: string;

    if (pdfRequested) {
      const pdfInfo = PDF_MAP[docKey];
      if (!pdfInfo) {
        return NextResponse.json({ error: 'Template PDF non disponibile' }, { status: 400 });
      }
      const templatePath = path.join(PDF_TEMPLATES_DIR, pdfInfo.templateFileName);
      if (!fs.existsSync(templatePath)) {
        return NextResponse.json({ error: 'Template PDF non trovato' }, { status: 404 });
      }
      const templateBuffer = fs.readFileSync(templatePath);
      outputBuffer = await fillPdfFromTemplate(docKey, templateBuffer, payload);
      outputMime = 'application/pdf';
      outputFileName = pdfInfo.outputFileName;
    } else {
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

      doc.render(payload);

      outputBuffer = doc.getZip().generate({ type: 'nodebuffer' });
      outputMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      outputFileName = DOC_MAP[docKey];
    }

    if (mode === 'base64') {
      return NextResponse.json({
        ok: true,
        key: docKey,
        fileName: outputFileName,
        mimeType: outputMime,
        base64: outputBuffer.toString('base64'),
        warning: null,
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
