import { NextResponse } from 'next/server';
import { ADMIN_URL, APP_URL, MARKETING_URL, hostFromBaseUrl } from '@/lib/site-urls';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

const STORE_KEY = '__bndo_rate_limit_store__';

function stripPort(host: string) {
  return host.split(':')[0].toLowerCase();
}

function getRateLimitStore() {
  const globalObject = globalThis as unknown as Record<string, unknown>;
  if (!globalObject[STORE_KEY]) {
    globalObject[STORE_KEY] = new Map<string, RateLimitEntry>();
  }
  return globalObject[STORE_KEY] as RateLimitStore;
}

export function getClientIp(request: Request) {
  const nf = request.headers.get('x-nf-client-connection-ip');
  if (nf && nf.trim()) return nf.trim();
  const xf = request.headers.get('x-forwarded-for');
  if (xf && xf.trim()) return xf.split(',')[0].trim();
  return 'unknown';
}

export function enforceRateLimit(opts: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
}) {
  const now = Date.now();
  const store = getRateLimitStore();
  const mapKey = `${opts.namespace}:${opts.key}`;
  const current = store.get(mapKey);

  if (!current || current.resetAt <= now) {
    store.set(mapKey, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  if (current.count >= opts.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: opts.message ?? 'Troppe richieste. Riprova tra pochi secondi.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  current.count += 1;
  store.set(mapKey, current);
  return null;
}

function allowedHostsForOriginCheck(request: Request) {
  const fromEnv = [hostFromBaseUrl(APP_URL), hostFromBaseUrl(ADMIN_URL), hostFromBaseUrl(MARKETING_URL)]
    .map(stripPort)
    .filter(Boolean);
  const requestHost = stripPort(request.headers.get('host') ?? '');
  return new Set([...fromEnv, requestHost].filter(Boolean));
}

export function rejectCrossSiteMutation(request: Request) {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;

  const secFetchSite = (request.headers.get('sec-fetch-site') ?? '').toLowerCase();
  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) {
    return NextResponse.json({ error: 'Richiesta non consentita.' }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  if (!origin) return null;

  try {
    const originHost = stripPort(new URL(origin).host);
    const allowed = allowedHostsForOriginCheck(request);
    if (!allowed.has(originHost)) {
      return NextResponse.json({ error: 'Richiesta non consentita.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Richiesta non consentita.' }, { status: 403 });
  }

  return null;
}

export function publicError(error: unknown, fallback: string) {
  if (process.env.NODE_ENV === 'production') return fallback;
  return error instanceof Error ? error.message : fallback;
}

export function safeSessionId(value: string | null | undefined) {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  if (raw === 'CHECKOUT_SESSION_ID' || raw.includes('{CHECKOUT_SESSION_ID}')) {
    return null;
  }

  if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(raw)) {
    return null;
  }

  return raw;
}

export function readApiErrorPayload(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const normalize = (value: string) => {
    const text = value.trim();
    if (!text) return '';
    const lowered = text.toLowerCase();
    if (lowered === 'bad request' || lowered === 'invalid request') return '';
    if (lowered.includes('invalid api key')) return 'Configurazione pagamento non valida. Contatta il supporto BNDO.';
    return text;
  };

  if (typeof record.error === 'string') {
    const normalized = normalize(record.error);
    if (normalized) return normalized;
  }
  if (typeof record.message === 'string') {
    const normalized = normalize(record.message);
    if (normalized) return normalized;
  }
  if (typeof record.detail === 'string') {
    const normalized = normalize(record.detail);
    if (normalized) return normalized;
  }
  return fallback;
}
