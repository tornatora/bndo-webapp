import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // Prefer codes near the "ateco" keyword.
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

  // Fallback: scan entire document for dotted patterns, but take the most specific.
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

  // Choose the most specific (longest) candidate, prefer ones with dots.
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
    const parser = new PDFParse({ data: buf });
    const data = await parser.getText();
    await parser.destroy();

    const text = String(data?.text ?? '');
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
      meta: { pages: (data as any)?.total ?? null, textChars },
      warnings
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore parsing visura.' }, { status: 500 });
  }
}
