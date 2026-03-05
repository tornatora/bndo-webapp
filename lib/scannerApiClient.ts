const DEFAULT_SCANNER_API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3301';
const SCANNER_API_BASE_URL = (process.env.SCANNER_API_BASE_URL || DEFAULT_SCANNER_API_BASE_URL).replace(/\/+$/, '');
const SCANNER_API_EMAIL = process.env.SCANNER_API_EMAIL || 'demo@grants.local';
const SCANNER_API_PASSWORD = process.env.SCANNER_API_PASSWORD || 'Admin123!';
const SCANNER_API_TIMEOUT_MS = Number.parseInt(process.env.SCANNER_API_TIMEOUT_MS || '14000', 10);
const SCANNER_AUTH_CACHE_TTL_MS = Number.parseInt(process.env.SCANNER_AUTH_CACHE_TTL_MS || '540000', 10);

type ScannerAuthResponse = {
  tokens?: {
    accessToken?: string;
  };
};

let cachedToken: { value: string; expiresAt: number } | null = null;
let loginInFlight: Promise<string> | null = null;

export async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs = SCANNER_API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(init.headers ?? {})
      }
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      const message =
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error === 'string' && json.error) ||
        `HTTP ${res.status}`;
      throw new Error(message);
    }

    return (json ?? {}) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loginScannerApi(timeoutMs = SCANNER_API_TIMEOUT_MS): Promise<string> {
  if (!SCANNER_API_BASE_URL) {
    throw new Error('SCANNER_API_BASE_URL mancante.');
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 2_000) {
    return cachedToken.value;
  }

  if (loginInFlight) return loginInFlight;

  loginInFlight = (async () => {
    const login = await fetchJsonWithTimeout<ScannerAuthResponse>(
      `${SCANNER_API_BASE_URL}/api/v1/auth/login`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: SCANNER_API_EMAIL,
          password: SCANNER_API_PASSWORD
        })
      },
      timeoutMs
    );

    const token = login.tokens?.accessToken;
    if (!token) throw new Error('Scanner API login senza token.');
    cachedToken = {
      value: token,
      expiresAt: Date.now() + Math.max(60_000, SCANNER_AUTH_CACHE_TTL_MS)
    };
    return token;
  })();

  try {
    return await loginInFlight;
  } finally {
    loginInFlight = null;
  }
}

export function scannerApiUrl(path: string): string {
  if (!SCANNER_API_BASE_URL) {
    throw new Error('SCANNER_API_BASE_URL mancante.');
  }
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${SCANNER_API_BASE_URL}${safePath}`;
}
