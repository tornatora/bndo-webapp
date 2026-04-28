import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExtractedData {
  ragione_sociale: string;
  sede_legale: string;
  codice_fiscale: string;
  partita_iva: string;
  rea: string;
  forma_giuridica: string;
  nome_legale_rappresentante: string;
  email_pec: string;
  telefono: string;
}

function extractCAP(sedeLegale: string): string {
  const m = sedeLegale.match(/\b(\d{5})\b/);
  return m ? m[1] : '';
}

function extractProvincia(sedeLegale: string): string {
  const m = sedeLegale.match(/\(([A-Z]{2})\)/);
  return m ? m[1] : '';
}

function extractComune(sedeLegale: string): string {
  const m = sedeLegale.match(/^([^,(]+)/);
  return m ? m[1].trim() : '';
}

function mapClientData(extracted: ExtractedData) {
  const nome = extracted.nome_legale_rappresentante || '';
  const nomeParts = nome.split(' ');
  const cognome = nomeParts.length > 1 ? nomeParts.slice(1).join(' ') : nome;

  return {
    fullName: nome,
    firstName: nomeParts[0] || '',
    lastName: cognome,
    zip: extractCAP(extracted.sede_legale),
    province: extractProvincia(extracted.sede_legale),
    city: extractComune(extracted.sede_legale),
    pec: extracted.email_pec || '',
    phone: extracted.telefono || '',
    ragioneSociale: extracted.ragione_sociale || '',
    codiceFiscale: extracted.codice_fiscale || '',
    partitaIva: extracted.partita_iva || '',
    rea: extracted.rea || '',
    sedeLegale: extracted.sede_legale || '',
    formaGiuridica: extracted.forma_giuridica || '',
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = body.data as ExtractedData;

    if (!data) {
      return NextResponse.json({ error: 'Nessun dato ricevuto.' }, { status: 400 });
    }

    const client = mapClientData(data);

    let flowTemplate = null;
    try {
      const flowPath = path.join(process.cwd(), 'data', 'flows', 'resto-al-sud-2-0.json');
      flowTemplate = JSON.parse(fs.readFileSync(flowPath, 'utf-8'));
    } catch {
      // Flow template not found — demo mode
    }

    // In demo mode, simulate a successful session
    // When Browserbase is configured, this would create a real browser session
    const status = 'demo';

    return NextResponse.json({
      status,
      client,
      flowTemplate: flowTemplate ? {
        name: flowTemplate.name,
        bandoKey: flowTemplate.bandoKey,
        stepsCount: flowTemplate.steps?.length ?? 0,
        expectedDurationSeconds: flowTemplate.expectedDurationSeconds,
      } : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore auto-fill.' },
      { status: 500 }
    );
  }
}
