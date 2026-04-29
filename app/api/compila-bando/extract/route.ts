import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import zlib from 'zlib';

// Polyfill DOM APIs needed by pdf-parse/pdfjs-dist on Netlify Lambda
if (typeof globalThis.DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class {
    a=1;b=0;c=0;d=1;e=0;f=0;
    constructor(init?: string) {
      if (typeof init === 'string' && init.startsWith('matrix(')) {
        const p = init.slice(7,-1).split(',').map(Number);
        this.a=p[0];this.b=p[1];this.c=p[2];this.d=p[3];this.e=p[4];this.f=p[5];
      }
    }
  };
}
if (typeof globalThis.Path2D === 'undefined') {
  (globalThis as any).Path2D = class {};
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExtractedPayload = {
  ragione_sociale: string | null;
  sede_legale: string | null;
  codice_fiscale: string | null;
  partita_iva: string | null;
  rea: string | null;
  forma_giuridica: string | null;
  nome_legale_rappresentante: string | null;
  email_pec: string | null;
  telefono: string | null;
};

const EMPTY_EXTRACTION: ExtractedPayload = {
  ragione_sociale: null,
  sede_legale: null,
  codice_fiscale: null,
  partita_iva: null,
  rea: null,
  forma_giuridica: null,
  nome_legale_rappresentante: null,
  email_pec: null,
  telefono: null,
};

const EXTRACTION_KEYS = Object.keys(EMPTY_EXTRACTION) as (keyof ExtractedPayload)[];

function normalizeSpaces(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toCleanNullable(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = normalizeSpaces(value);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizePersonName(value: string | null): string | null {
  if (!value) return null;
  const cleaned = normalizeSpaces(value).replace(/^[,;:\-]+|[,;:\-]+$/g, '').trim();
  if (!cleaned) return null;
  const allCaps = /^[A-ZÀ-ÖØ-Ý' ]+$/.test(cleaned);
  if (!allCaps) return cleaned;
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function mergeExtracted(...sources: Array<Partial<ExtractedPayload> | null | undefined>): ExtractedPayload {
  const merged: ExtractedPayload = { ...EMPTY_EXTRACTION };
  for (const source of sources) {
    if (!source) continue;
    for (const key of EXTRACTION_KEYS) {
      const current = merged[key];
      if (current) continue;
      const candidate = toCleanNullable(source[key]);
      if (candidate) merged[key] = candidate;
    }
  }
  return merged;
}

function hasExtractedValues(extracted: ExtractedPayload): boolean {
  return EXTRACTION_KEYS.some((key) => Boolean(extracted[key]));
}

function extractRegexValue(text: string, regex: RegExp): string | null {
  const match = text.match(regex);
  return toCleanNullable(match?.[1] ?? null);
}

function extractSedeLegale(text: string): string | null {
  const match = text.match(
    /(?:indirizzo\s+sede|sede\s+legale)\s*[:\-]?\s*([^\n]{4,180})(?:\n([^\n]{4,120}))?/i
  );
  if (!match) return null;
  const line1 = toCleanNullable(match[1]);
  const line2 = toCleanNullable(match[2]);
  if (!line1) return null;
  if (!line2) return line1;
  if (/\bCAP\b/i.test(line1) || /\b\d{5}\b/.test(line1)) return line1;
  if (line2.length > 60) return line1;
  return normalizeSpaces(`${line1} ${line2}`);
}

function extractNomeLegale(text: string, ragioneSociale: string | null): string | null {
  const direct = extractRegexValue(
    text,
    /(?:nome\s+legale\s+rappresentante|legale\s+rappresentante)\s*[:\-]?\s*([^\n]{5,120})/i
  );
  if (direct) return normalizePersonName(direct);

  const titolare = text.match(
    /titolare\s+di\s+impresa\s+individuale\s+([\s\S]{5,120}?)(?:attivita'|attività|numero\s+rea|codice\s+fiscale|partita\s+iva|$)/i
  );
  if (titolare?.[1]) {
    const candidate = normalizePersonName(titolare[1]);
    if (candidate) return candidate;
  }

  if (ragioneSociale) {
    const fromCompanyName = ragioneSociale.match(/\bDI\s+([A-ZÀ-ÖØ-Ý' ]{5,120})$/i);
    if (fromCompanyName?.[1]) {
      const candidate = normalizePersonName(fromCompanyName[1]);
      if (candidate) return candidate;
    }
  }

  return null;
}

function extractFromVisuraText(text: string): Partial<ExtractedPayload> {
  const raw = text.replace(/\r/g, '\n');
  // Normalize diacritics and collapse whitespace so regexes behave consistently across pdf extractors.
  const normalizedRaw = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'");
  const normalized = normalizeSpaces(normalizedRaw);

  // Pattern set 1: "classical" visura with explicit labels
  const ragioneSocialeLabeled = extractRegexValue(
    normalized,
    /(?:denominazione|ragione\s+sociale)\s*[:\-]?\s*([^\n]{3,180})/i
  );

  // Pattern set 2: InfoCamere "VISURA ORDINARIA DELL'IMPRESA" layout (no explicit ragione_sociale label)
  // Usually: "VISURA ORDINARIA DELL'IMPRESA" then company name on next lines, then "DATI ANAGRAFICI".
  const ragioneSocialeFromHeader = (() => {
    const m = normalized.match(/VISURA\s+ORDINARIA\s+DELL[' ]IMPRESA\s+(.{3,220}?)\s+DATI\s+ANAGRAFICI/i);
    if (!m?.[1]) return null;
    // Take first 1-3 "words/lines" chunk, avoid pulling the whole paragraph.
    return toCleanNullable(m[1].split(/\s{2,}|\s{1,}\bIl\b/i)[0]);
  })();

  const sedeLegale =
    extractSedeLegale(normalizedRaw) ??
    extractRegexValue(normalized, /Indirizzo\s+Sede\s+(.{6,180}?\bCAP\s*\d{5}\b.{0,40}?)(?:\s{2,}|\s+DOMICILIO|\s+Domicilio|$)/i);

  const emailPec =
    extractRegexValue(normalized, /(?:domicilio\s+digitale\/pec|domicilio\s+digitale|pec)\s*[:\-]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i) ??
    extractRegexValue(normalized, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);

  const rea =
    extractRegexValue(normalized, /Numero\s+REA\s*([A-Z]{2}\s*[-–—]?\s*\d{3,})/i) ??
    extractRegexValue(normalized, /(?:numero\s+rea|rea)\s*[:\\-]?\\s*([A-Z]{2}\\s*[-–—]?\\s*\\d{3,})/i);

  const partitaIva =
    extractRegexValue(normalized, /(?:partita\s*iva)\s*[:\-]?\s*(?:IT\s*)?(\d{11})\b/i) ??
    extractRegexValue(normalized, /\b(\d{11})\b/);

  const codiceFiscale =
    extractRegexValue(normalized, /Codice\s+fiscale[^\n]{0,40}\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/i) ??
    extractRegexValue(normalized, /\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/i);

  const formaGiuridica =
    extractRegexValue(normalized, /(?:forma\s+giuridica)\s*[:\-]?\s*([^\n]{3,120})/i) ??
    extractRegexValue(normalized, /Forma\s+giuridica\s+([A-Za-z ][A-Za-z ']{3,80})/i);

  const ragioneSociale = ragioneSocialeLabeled ?? ragioneSocialeFromHeader;
  const telefono = extractRegexValue(normalized, /(?:telefono|tel\.?)\s*[:\-]?\s*([+0-9][0-9\s\-\/]{5,20})/i);
  const nomeLegaleRappresentante = extractNomeLegale(normalized, ragioneSociale);

  return {
    ragione_sociale: ragioneSociale,
    sede_legale: sedeLegale,
    codice_fiscale: codiceFiscale,
    partita_iva: partitaIva,
    rea,
    forma_giuridica: formaGiuridica,
    nome_legale_rappresentante: nomeLegaleRappresentante,
    email_pec: emailPec ? emailPec.toLowerCase() : null,
    telefono,
  };
}

function getDeepseekClient(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
  });
}

function normalizeLlmJson(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

async function extractWithLlm(
  contents: OpenAI.Chat.Completions.ChatCompletionContentPart[]
): Promise<Partial<ExtractedPayload> | null> {
  const deepseek = getDeepseekClient();
  if (!deepseek) return null;

  try {
    const response = await deepseek.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: contents },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(normalizeLlmJson(content)) as Record<string, unknown>;
    return {
      ragione_sociale: toCleanNullable(parsed.ragione_sociale),
      sede_legale: toCleanNullable(parsed.sede_legale),
      codice_fiscale: toCleanNullable(parsed.codice_fiscale),
      partita_iva: toCleanNullable(parsed.partita_iva),
      rea: toCleanNullable(parsed.rea),
      forma_giuridica: toCleanNullable(parsed.forma_giuridica),
      nome_legale_rappresentante: normalizePersonName(toCleanNullable(parsed.nome_legale_rappresentante)),
      email_pec: toCleanNullable(parsed.email_pec)?.toLowerCase() ?? null,
      telefono: toCleanNullable(parsed.telefono),
    };
  } catch (error) {
    console.error('[compila-bando/extract] DeepSeek enrichment failed:', error);
    return null;
  }
}

async function extractPdfText(buf: Buffer, baseUrl?: string): Promise<string> {
  // Tier 1: dynamic import (deploy-safe; works with next.config externals)
  try {
    const mod = (await import('pdf-parse')) as unknown as {
      PDFParse?: new (opts: { data: Buffer }) => { getText: () => Promise<any>; destroy: () => Promise<void> };
    };
    const PDFParse = mod?.PDFParse;
    if (PDFParse) {
      const parser = new PDFParse({ data: buf });
      const data = await parser.getText();
      await parser.destroy();
      const text = String(data?.text ?? '').trim();
      if (text.length >= 80) return text;
    }
  } catch {}

  // Tier 2: HTTP call to standalone Netlify function
  // Try multiple sources for the base URL (env vars may not be available in Next.js Lambda)
  const bases = [
    baseUrl,
    process.env.DEPLOY_PRIME_URL,
    process.env.URL,
    process.env.DEPLOY_URL,
  ].filter((b): b is string => !!b && b.length > 0);

  for (const base of bases) {
    try {
      const fnUrl = `${base.replace(/\/+$/, '')}/.netlify/functions/extract-pdf-text`;
      const formData = new FormData();
      formData.append('pdf', new Blob([new Uint8Array(buf)], { type: 'application/pdf' }), 'doc.pdf');
      const res = await fetch(fnUrl, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.text?.length >= 80) return json.text;
      }
    } catch {}
  }

  // Tier 3: raw zlib
  return extractPdfTextZlib(buf);
}

function extractPdfTextZlib(buf: Buffer): string {
  const MARKER_STREAM = Buffer.from('stream\n');
  const MARKER_ENDSTREAM = Buffer.from('endstream');
  const textParts: string[] = [];
  let pos = 0;

  while (pos < buf.length) {
    const streamStart = buf.indexOf(MARKER_STREAM, pos);
    if (streamStart === -1) break;

    const dataStart = streamStart + MARKER_STREAM.length;
    const streamEnd = buf.indexOf(MARKER_ENDSTREAM, dataStart);
    if (streamEnd === -1) break;

    const streamBytes = buf.subarray(dataStart, streamEnd);

    let decompressed: Buffer;
    try {
      decompressed = zlib.inflateSync(streamBytes);
    } catch {
      decompressed = streamBytes;
    }

    const textOpRegex = /\(((?:[^()\\]|\\.)*)\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj/g;
    const decoded = decompressed.toString('latin1');
    const opMatches = decoded.matchAll(textOpRegex);

    for (const op of opMatches) {
      if (op[1]) {
        textParts.push(op[1].replace(/\\(.)/g, '$1'));
      } else if (op[2]) {
        const hex = op[2].replace(/\s/g, '');
        if (hex.length > 0 && hex.length % 2 === 0) {
          const hexBytes = Buffer.from(hex, 'hex');
          textParts.push(hexBytes.toString('utf-8'));
        }
      }
    }

    pos = streamEnd + MARKER_ENDSTREAM.length;
  }

  if (textParts.length === 0) {
    const raw = buf.toString('latin1');
    const parenMatches = raw.match(/\(([^)]*)\)/g);
    if (parenMatches) {
      return parenMatches.map(m => m.slice(1, -1)).join('\n');
    }
    return 'testo non estratto';
  }

  return textParts.join(' ');
}

async function fileToOpenAiContent(file: File, baseUrl?: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart> {
  const buf = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const text = await extractPdfText(buf, baseUrl);
    return { type: 'text', text: `=== DOCUMENTO PDF ===\n${text}\n=== FINE DOCUMENTO ===` };
  }
  return {
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${buf.toString('base64')}` },
  };
}

const EXTRACTION_SYSTEM_PROMPT = `Sei un assistente specializzato nell'estrazione di dati da documenti aziendali e documenti di identità italiani.

I documenti possono arrivare come testo estratto da PDF o come immagini (PNG di carte d'identità).

Da una VISURA CAMERALE estrai:
- ragione_sociale: denominazione esatta dell'impresa
- sede_legale: indirizzo completo della sede legale
- codice_fiscale: codice fiscale dell'impresa (16 caratteri alfanumerici)
- partita_iva: partita IVA (formato ITXXXXXXXXXXX)
- rea: numero REA (es. MI-1234567)
- forma_giuridica: tipo di società (SRL, SPA, ecc.)
- nome_legale_rappresentante: nome e cognome del legale rappresentante

Da una CARTA D'IDENTITÀ italiana (fronte/retro, arriva come immagine) estrai CONFERMA/INTEGRAZIONE per:
- nome_legale_rappresentante: nome e cognome
- codice_fiscale: codice fiscale (16 caratteri)

Rispondi SOLO con JSON valido, nessun altro testo.
Campi null se non trovati.

Formato risposta:
{
  "ragione_sociale": "string | null",
  "sede_legale": "string | null",
  "codice_fiscale": "string | null",
  "partita_iva": "string | null",
  "rea": "string | null",
  "forma_giuridica": "string | null",
  "nome_legale_rappresentante": "string | null",
  "email_pec": "string | null",
  "telefono": "string | null"
}`;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const visuraFile = form.get('visura') as File | null;
    const cartaIdentitaFile = form.get('carta_identita') as File | null;

    if (!visuraFile && !cartaIdentitaFile) {
      return NextResponse.json({ error: 'Carica almeno un documento.' }, { status: 400 });
    }

    // Derive base URL from request for calling standalone function
    const host = req.headers.get('host') || '';
    const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168') ? 'http' : 'https';
    const baseUrl = host ? `${proto}://${host}` : '';

    const contents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: 'Estrai i dati da questi documenti.' }];
    let deterministic: Partial<ExtractedPayload> = {};
    let visuraTextChars = 0;
    const warnings: string[] = [];

    if (visuraFile) {
      const visuraBuffer = Buffer.from(await visuraFile.arrayBuffer());
      const isVisuraPdf =
        visuraFile.type === 'application/pdf' || visuraFile.name.toLowerCase().endsWith('.pdf');
      if (isVisuraPdf) {
        const visuraText = await extractPdfText(visuraBuffer, baseUrl);
        visuraTextChars = visuraText.length;
        deterministic = extractFromVisuraText(visuraText);
        if (visuraTextChars < 120) {
          warnings.push('visura_text_short_or_scanned');
        }
      }
      contents.push(await fileToOpenAiContent(visuraFile, baseUrl));
    }

    if (cartaIdentitaFile) {
      contents.push(await fileToOpenAiContent(cartaIdentitaFile, baseUrl));
    }

    const llmExtracted = await extractWithLlm(contents);
    if (!llmExtracted) {
      warnings.push('llm_unavailable_or_failed');
    }
    const extracted = mergeExtracted(deterministic, llmExtracted);
    if (!hasExtractedValues(extracted)) {
      warnings.push('no_fields_extracted');
    }

    return NextResponse.json({
      extracted,
      provider: llmExtracted ? 'deterministic+deepseek' : 'deterministic',
      warnings,
      meta: {
        visuraTextChars,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore estrazione documenti.' },
      { status: 500 }
    );
  }
}
