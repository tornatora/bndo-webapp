import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = doc.getPages();
  const lines: string[] = [];
  for (const page of pages) {
    const text = (page as any).getTextContent?.();
    if (text) lines.push(text);
  }
  if (lines.length === 0) {
    const raw = buffer.toString('utf-8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
    const matches = raw.match(/\(([^)]*)\)/g);
    if (matches) {
      matches.forEach(m => lines.push(m.slice(1, -1)));
    }
  }
  return lines.join('\n') || '';
}

const IT_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto'
] as const;

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectRegion(text: string): string | null {
  const n = normalizeForMatch(text);
  for (const r of IT_REGIONS) {
    const rn = normalizeForMatch(r);
    if (` ${n} `.includes(` ${rn} `)) return r;
  }
  return null;
}

function extractAteco(text: string): string | null {
  const raw = text ?? '';
  const norm = normalizeForMatch(raw);

  const idx = norm.indexOf('ateco');
  const window = idx >= 0 ? raw.slice(Math.max(0, idx - 180), Math.min(raw.length, idx + 260)) : raw;

  const dotted = /\b(\d{2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\b/g;
  const candidates: string[] = [];
  let m: RegExpExecArray | null = null;
  while ((m = dotted.exec(window))) {
    const a = m[1];
    const b = m[2];
    const c = m[3];
    if (!a) continue;
    if (b && c) candidates.push(`${a}.${b.padStart(2, '0')}.${c.padStart(2, '0')}`);
    else if (b) candidates.push(`${a}.${b.padStart(2, '0')}`);
    else candidates.push(a);
  }

  if (candidates.length === 0) {
    while ((m = dotted.exec(raw))) {
      const a = m[1];
      const b = m[2];
      const c = m[3];
      if (!a) continue;
      if (b && c) candidates.push(`${a}.${b.padStart(2, '0')}.${c.padStart(2, '0')}`);
      else if (b) candidates.push(`${a}.${b.padStart(2, '0')}`);
      else candidates.push(a);
      if (candidates.length > 30) break;
    }
  }

  if (candidates.length === 0) return null;

  const sorted = [...new Set(candidates)].sort((x, y) => y.length - x.length);
  return sorted[0] ?? null;
}

function extractLineValue(text: string, keys: string[]) {
  for (const k of keys) {
    const re = new RegExp(`^\\s*${k}\\s*[:\\-]?\\s*(.+)$`, 'im');
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v && v.length <= 160) return v;
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File mancante (field "file").' }, { status: 400 });
    }
    if (file.type && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Formato non supportato. Carica un PDF.' }, { status: 400 });
    }
    if (typeof file.size === 'number' && file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande. Carica una visura PDF sotto i 12MB.' }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const text = await parsePdf(buf);
    const textNorm = normalizeForMatch(text);
    const textChars = textNorm.length;

    if (textChars < 120) {
      return NextResponse.json(
        {
          error:
            'Non riesco a leggere il testo della visura. Probabilmente e un PDF scansionato (immagine). Carica una visura in PDF testuale.',
          extracted: { region: null, ateco: null, denomination: null, legalForm: null },
          warnings: ['pdf_scanned_or_empty']
        },
        { status: 422 }
      );
    }

    const region = detectRegion(text);
    const ateco = extractAteco(text);
    const denomination = extractLineValue(text, ['Denominazione', 'Ragione\\s+sociale']);
    const legalForm = extractLineValue(text, ['Forma\\s+giuridica']);

    const warnings: string[] = [];
    if (!ateco) warnings.push('ateco_not_found');
    if (!region) warnings.push('region_not_found');

    return NextResponse.json({
      extracted: { region, ateco, denomination, legalForm },
      meta: { pages: null, textChars },
      warnings
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore parsing visura.' }, { status: 500 });
  }
}
