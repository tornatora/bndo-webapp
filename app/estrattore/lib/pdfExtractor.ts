import type { ExtractedData } from './types';
import { callPdfExtractFunction } from '@/lib/pdf/extractPdfText';

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLineValue(text: string, keys: string[]): string | null {
  for (const k of keys) {
    const re = new RegExp(`^\\s*${k}\\s*[:\\-]?\\s*(.+)$`, 'im');
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v && v.length <= 240) return v;
    }
  }
  return null;
}

function extractBlockValue(text: string, keys: string[]): string | null {
  for (const k of keys) {
    const re = new RegExp(`${k}\\s*[:\\-]?\\s*\\n?\\s*([^\\n]{2,240})`, 'i');
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v) return v;
    }
  }
  return null;
}

function extractCodiceFiscale(text: string): string | null {
  const raw = text ?? '';
  const pf = raw.match(/\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/i);
  if (pf) return pf[1].toUpperCase();
  const az = raw.match(/\b(\d{11})\b/);
  if (az) return az[1];
  return null;
}

function extractPartitaIva(text: string): string | null {
  const raw = text ?? '';
  const m = raw.match(/\b(\d{11})\b/);
  if (m) return m[1];
  return null;
}

function extractRea(text: string): string | null {
  const raw = text ?? '';
  const re = /(?:rea|numero\s+rea)\s*[:\-]?\s*([A-Za-z]{2}\s*[\-–—]?\s*\d{4,})/i;
  const m = raw.match(re);
  if (m?.[1]) return m[1].replace(/\s+/g, ' ').trim();
  return null;
}

function extractSedeLegale(text: string): string | null {
  const raw = text ?? '';
  const re = /(?:sede\s+legale|indirizzo\s+sed[e]?)\s*[:\-]?\s*\n?\s*([^\n]{5,200})/i;
  const m = raw.match(re);
  if (m?.[1]) return m[1].trim();
  return null;
}

async function getPdfText(buffer: Buffer): Promise<{ text: string; pages: number | null }> {
  // Tier 1: Netlify standalone function
  const netlifyText = await callPdfExtractFunction(buffer);
  if (netlifyText) return { text: netlifyText, pages: null };

  // Tier 2: local pdf-parse
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  await parser.destroy();
  return { text: String(data?.text ?? ''), pages: (data as any)?.total ?? null };
}

export async function extractFromPdf(buffer: Buffer): Promise<{
  extracted: ExtractedData;
  meta: { pages: number | null; textChars: number };
  warnings: string[];
}> {
  const { text, pages } = await getPdfText(buffer);
  const textNorm = normalizeForMatch(text);
  const textChars = textNorm.length;

  if (textChars < 120) {
    return {
      extracted: {
        ragione_sociale: null,
        sede_legale: null,
        codice_fiscale: null,
        partita_iva: null,
        rea: null,
        forma_giuridica: null,
      },
      meta: { pages, textChars },
      warnings: ['pdf_scanned_or_empty'],
    };
  }

  const ragione_sociale =
    extractLineValue(text, ['Denominazione', 'Ragione\\s+sociale', 'Ragione Sociale']) ||
    extractBlockValue(text, ['Denominazione', 'Ragione\\s+sociale']);

  const sede_legale = extractSedeLegale(text);
  const codice_fiscale = extractCodiceFiscale(text);
  const partita_iva = extractPartitaIva(text);
  const rea = extractRea(text);
  const forma_giuridica = extractLineValue(text, ['Forma\\s+giuridica', 'Forma Giuridica']);

  const warnings: string[] = [];
  if (!ragione_sociale) warnings.push('ragione_sociale_not_found');
  if (!sede_legale) warnings.push('sede_legale_not_found');
  if (!codice_fiscale) warnings.push('codice_fiscale_not_found');
  if (!partita_iva) warnings.push('partita_iva_not_found');
  if (!rea) warnings.push('rea_not_found');
  if (!forma_giuridica) warnings.push('forma_giuridica_not_found');

  return {
    extracted: {
      ragione_sociale,
      sede_legale,
      codice_fiscale,
      partita_iva,
      rea,
      forma_giuridica,
    },
    meta: { pages, textChars },
    warnings,
  };
}
