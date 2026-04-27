import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Usa pdfjs-dist legacy build (nessun worker/canvas richiesto, puro Node.js)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    pages.push(text);
  }
  const text = pages.join('\n').trim();
  if (!text) {
    // Fallback: estrazione raw come utf-8 per PDF malformati
    const raw = buffer.toString('utf-8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
    const matches = raw.match(/\(([^)]*)\)/g);
    if (matches) return matches.map(m => m.slice(1, -1)).join('\n');
    return 'testo non estratto';
  }
  return text;
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
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY non configurata.' }, { status: 500 });
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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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
      model: 'gpt-4o',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore estrazione documenti.' },
      { status: 500 }
    );
  }
}
