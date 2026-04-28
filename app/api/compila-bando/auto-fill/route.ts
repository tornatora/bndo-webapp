import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  createBrowserbaseSession,
  primeBrowserbaseSessionToInvitalia,
  closeBrowserbaseSession,
  browserbaseReady,
} from '@/lib/copilot/browserbase';
import {
  createBrowserlessSession,
  closeBrowserlessSession,
  browserlessReady,
} from '@/lib/browser/browserless';
import type { BrowserlessSessionResult } from '@/lib/browser/browserless';

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

const SPID_LOGIN_URL =
  'https://minervaorgb2c.b2clogin.com/minervaorgb2c.onmicrosoft.com/b2c_1a_invitalia_signin/oauth2/v2.0/authorize' +
  '?client_id=74cea3c0-5ab9-4414-bf4d-9c80b9824a9f' +
  '&scope=openid%20profile%20offline_access' +
  '&redirect_uri=https%3A%2F%2Finvitalia-areariservata-fe.npi.invitalia.it%2Fhome' +
  '&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.32.2&client_info=1';

export async function POST(req: Request) {
  let browserbaseSessionId: string | null = null;

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
      // Flow template not found
    }

    // Browser session: Browserless (open source) > Browserbase > demo
    let liveViewUrl: string | null = null;
    let sessionId: string | null = null;
    let status: 'live' | 'demo' = 'demo';

    // Tier 1: Browserless v2 (open source, BROWSERLESS_URL env var)
    if (browserlessReady()) {
      try {
        const session = await createBrowserlessSession();
        sessionId = session.sessionId;
        liveViewUrl = session.liveViewUrl;
        browserbaseSessionId = session.sessionId; // reuse for cleanup
        status = 'live';
      } catch {
        // Fall through to Browserbase
      }
    }

    // Tier 2: Browserbase (API key)
    if (status === 'demo' && browserbaseReady()) {
      try {
        const session = await createBrowserbaseSession({});
        sessionId = session.sessionId;
        liveViewUrl = session.liveViewUrl;
        browserbaseSessionId = session.sessionId;

        if (session.connectUrl) {
          void primeBrowserbaseSessionToInvitalia(session.connectUrl, SPID_LOGIN_URL);
        }

        status = 'live';
      } catch {
        // Fallback a demo
      }
    }

    return NextResponse.json({
      status,
      browserless: browserlessReady(),
      browserbase: browserbaseReady(),
      client,
      liveViewUrl,
      browserbaseSessionId,
      flowTemplate: flowTemplate
        ? {
            name: flowTemplate.name,
            bandoKey: flowTemplate.bandoKey,
            stepsCount: flowTemplate.steps?.length ?? 0,
            expectedDurationSeconds: flowTemplate.expectedDurationSeconds,
          }
        : null,
    });
  } catch (e) {
    // Cleanup session on error
    if (browserbaseSessionId) {
      void closeBrowserlessSession(browserbaseSessionId).catch(() => {});
      void closeBrowserbaseSession(browserbaseSessionId);
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore auto-fill.' },
      { status: 500 }
    );
  }
}
