import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthSession = {
  email: string;
  exp: number;
};

const SESSION_COOKIE = 'bndo_session';
const SESSION_TTL_SECONDS = Number.parseInt(process.env.AUTH_SESSION_TTL_SECONDS || '2592000', 10);
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || process.env.AUTH_SECRET || 'bndo-local-dev-secret-change-me';

function toBase64Url(input: string) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payloadB64: string) {
  return createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
}

function parseCookies(req: Request) {
  const raw = req.headers.get('cookie') || '';
  return raw.split(';').reduce<Record<string, string>>((acc, part) => {
    const [k, ...rest] = part.trim().split('=');
    if (!k) return acc;
    acc[k] = decodeURIComponent(rest.join('=') || '');
    return acc;
  }, {});
}

export function createSessionToken(email: string) {
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, SESSION_TTL_SECONDS);
  const payload: AuthSession = { email: email.trim().toLowerCase(), exp };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getSessionMaxAge() {
  return Math.max(60, SESSION_TTL_SECONDS);
}

export function verifySessionToken(token: string | null | undefined): AuthSession | null {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64);
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actualBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as AuthSession;
    if (!payload?.email || !payload?.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { email: String(payload.email).trim().toLowerCase(), exp: payload.exp };
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: Request) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE]);
}
