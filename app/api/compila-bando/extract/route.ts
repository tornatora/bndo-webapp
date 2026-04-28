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

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-e25689394fe94ceaba818e8dcc1d3024',
  baseURL: 'https://api.deepseek.com/v1',
});

async function extractPdfText(buf: Buffer, _baseUrl?: string): Promise<string> {
  // Tier 1: native require bypassing webpack (same mechanism as the working standalone function)
  try {
    const nativeReq: any =
      typeof (globalThis as any).__non_webpack_require__ !== 'undefined'
        ? (globalThis as any).__non_webpack_require__
        : eval('require');
    const pdfParse = nativeReq('pdf-parse');
    const PDFParse = pdfParse.PDFParse || pdfParse;
    const parser = new PDFParse({ data: buf });
    const data = await parser.getText();
    await parser.destroy();
    const text = String(data?.text ?? '').trim();
    if (text.length >= 80) return text;
  } catch {}

  // Tier 2: HTTP call to standalone Netlify function (http://localhost:8888 in netlify dev)
  try {
    const base = process.env.DEPLOY_PRIME_URL || process.env.URL || '';
    if (base) {
      const fnUrl = `${base.replace(/\/+$/, '')}/.netlify/functions/extract-pdf-text`;
      const formData = new FormData();
      formData.append('pdf', new Blob([new Uint8Array(buf)], { type: 'application/pdf' }), 'doc.pdf');
      const res = await fetch(fnUrl, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.text?.length >= 80) return json.text;
      }
    }
  } catch {}

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

async function fileToOpenAiContent(file: File): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart> {
  const buf = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const text = await extractPdfText(buf);
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
    if (!deepseek.apiKey) {
      return NextResponse.json({ error: 'DEEPSEEK_API_KEY non configurata.' }, { status: 500 });
    }

    const form = await req.formData();
    const visuraFile = form.get('visura') as File | null;
    const cartaIdentitaFile = form.get('carta_identita') as File | null;

    if (!visuraFile && !cartaIdentitaFile) {
      return NextResponse.json({ error: 'Carica almeno un documento.' }, { status: 400 });
    }

    const contents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: 'Estrai i dati da questi documenti.' },
    ];

    if (visuraFile) {
      contents.push(await fileToOpenAiContent(visuraFile));
    }

    if (cartaIdentitaFile) {
      contents.push(await fileToOpenAiContent(cartaIdentitaFile));
    }

    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: contents },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'Nessuna risposta da OpenAI.' }, { status: 500 });
    }

    const extracted = JSON.parse(content);

    return NextResponse.json({
      extracted: {
        ragione_sociale: extracted.ragione_sociale || null,
        sede_legale: extracted.sede_legale || null,
        codice_fiscale: extracted.codice_fiscale || null,
        partita_iva: extracted.partita_iva || null,
        rea: extracted.rea || null,
        forma_giuridica: extracted.forma_giuridica || null,
        nome_legale_rappresentante: extracted.nome_legale_rappresentante || null,
        email_pec: extracted.email_pec || null,
        telefono: extracted.telefono || null,
      },
      model: 'deepseek-chat',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore estrazione documenti.' },
      { status: 500 }
    );
  }
}
