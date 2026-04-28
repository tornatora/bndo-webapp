import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  createBrowserbaseSession,
  primeBrowserbaseSessionToInvitalia,
  closeBrowserbaseSession,
  browserbaseReady,
  validateBrowserbaseEnv,
} from '@/lib/copilot/browserbase';
import { loadFlowTemplate } from '@/lib/compila-bando/flow-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const B2C_AUTHORITY = 'https://minervaorgb2c.b2clogin.com/minervaorgb2c.onmicrosoft.com/b2c_1a_invitalia_signin/oauth2/v2.0/authorize';
const B2C_CLIENT_ID = '74cea3c0-5ab9-4414-bf4d-9c80b9824a9f';
const B2C_REDIRECT = 'https://invitalia-areariservata-fe.npi.invitalia.it/home';
const B2C_SCOPES = 'openid profile offline_access';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildPkceUrl(): string {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64url(hash);
  const state = base64url(crypto.randomBytes(16));
  const nonce = base64url(crypto.randomBytes(16));

  const params = new URLSearchParams({
    client_id: B2C_CLIENT_ID,
    scope: B2C_SCOPES,
    redirect_uri: B2C_REDIRECT,
    response_mode: 'fragment',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    'x-client-SKU': 'msal.js.browser',
    'x-client-VER': '2.32.2',
    client_info: '1',
  });

  return `${B2C_AUTHORITY}?${params.toString()}`;
}

interface ExtractedData {
  ragione_sociale?: string | null;
  sede_legale?: string | null;
  codice_fiscale?: string | null;
  partita_iva?: string | null;
  rea?: string | null;
  forma_giuridica?: string | null;
  nome_legale_rappresentante?: string | null;
  email_pec?: string | null;
  telefono?: string | null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
  const nome = normalizeText(extracted.nome_legale_rappresentante);
  const nomeParts = nome.split(' ');
  const cognome = nomeParts.length > 1 ? nomeParts.slice(1).join(' ') : nome;
  const sedeLegale = normalizeText(extracted.sede_legale);

  return {
    fullName: nome,
    firstName: nomeParts[0] || '',
    lastName: cognome,
    zip: extractCAP(sedeLegale),
    province: extractProvincia(sedeLegale),
    city: extractComune(sedeLegale),
    pec: normalizeText(extracted.email_pec),
    phone: normalizeText(extracted.telefono),
    ragioneSociale: normalizeText(extracted.ragione_sociale),
    codiceFiscale: normalizeText(extracted.codice_fiscale),
    partitaIva: normalizeText(extracted.partita_iva),
    rea: normalizeText(extracted.rea),
    sedeLegale,
    formaGiuridica: normalizeText(extracted.forma_giuridica),
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
    const data = (body?.data ?? {}) as ExtractedData;

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 400 });
    }

    const client = mapClientData(data);

    let flowTemplateSummary: {
      name: string;
      bandoKey: string;
      stepsCount: number;
      expectedDurationSeconds: number | null;
      version: number | null;
      source: string | null;
      updatedAt: string | null;
      checksumSha256: string | null;
    } | null = null;
    try {
      const { template, checksumSha256 } = loadFlowTemplate();
      flowTemplateSummary = {
        name: template.name,
        bandoKey: template.bandoKey,
        stepsCount: template.steps?.length ?? 0,
        expectedDurationSeconds: template.expectedDurationSeconds ?? null,
        version: template.version ?? null,
        source: template.source ?? null,
        updatedAt: template.updatedAt ?? null,
        checksumSha256,
      };
      console.info('[compila-bando][auto-fill] flow_template_loaded', {
        name: template.name,
        version: template.version ?? null,
        steps: template.steps.length,
        checksumSha256,
      });
    } catch {
      // Flow template not found
    }

    // Browser session: Browserbase only for Step9 live flow.
    let liveViewUrl: string | null = null;
    let sessionId: string | null = null;
    let connectUrl: string | null = null;
    let sessionExpiresAt: string | null = null;
    let status: 'live' | 'demo' = 'demo';
    let provider: 'browserbase' | 'demo' = 'demo';
    let providerError: string | null = null;

    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

    if (browserbaseReady()) {
      const envValidation = validateBrowserbaseEnv();
      if (!envValidation.ok) {
        providerError = envValidation.errors.join(' ');
      } else {
        if (envValidation.warnings.length > 0) {
          console.warn('[compila-bando][auto-fill] browserbase_env_warnings', envValidation.warnings);
        }
      }
    } else {
      providerError = 'BROWSERBASE_API_KEY non configurata.';
    }

    if (!providerError) {
      try {
        const session = await withTimeout(createBrowserbaseSession({}), 10_000);
        sessionId = session.sessionId;
        liveViewUrl = session.liveViewUrl;
        connectUrl = session.connectUrl;
        sessionExpiresAt = session.expiresAt;
        browserbaseSessionId = session.sessionId;

        if (!session.connectUrl || !session.liveViewUrl) {
          providerError = 'Sessione Browserbase incompleta: connectUrl/liveViewUrl mancanti.';
        } else {
          void primeBrowserbaseSessionToInvitalia(session.connectUrl, SPID_LOGIN_URL);
          status = 'live';
          provider = 'browserbase';
        }
      } catch (error) {
        providerError = error instanceof Error ? error.message : 'Errore Browserbase non gestito.';
      }
    }

    const spidPopupUrl = buildPkceUrl();

    return NextResponse.json({
      status,
      provider,
      browserbase: browserbaseReady(),
      client,
      liveViewUrl,
      connectUrl,
      sessionExpiresAt,
      spidPopupUrl,
      browserbaseSessionId,
      providerError,
      flowTemplate: flowTemplateSummary,
    });
  } catch (e) {
    // Cleanup session on error
    if (browserbaseSessionId) {
      void closeBrowserbaseSession(browserbaseSessionId);
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore auto-fill.' },
      { status: 500 }
    );
  }
}
