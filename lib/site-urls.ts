const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function normalizeBaseUrl(rawValue: string | undefined, fallback: string) {
  const value = (rawValue ?? '').trim();
  if (!value) return fallback;

  try {
    const parsed = new URL(value);
    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

const DEFAULT_MARKETING_URL = IS_PRODUCTION ? 'https://bndo.it' : 'http://localhost:3000';
const DEFAULT_APP_URL = IS_PRODUCTION ? 'https://app.bndo.it' : 'http://localhost:3000';
const DEFAULT_ADMIN_URL = IS_PRODUCTION ? 'https://admin.bndo.it' : 'http://localhost:3000';

export const MARKETING_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_MARKETING_URL, DEFAULT_MARKETING_URL);
export const APP_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL, DEFAULT_APP_URL);
export const ADMIN_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_ADMIN_URL, DEFAULT_ADMIN_URL);

export function hostFromBaseUrl(baseUrl: string) {
  return new URL(baseUrl).host.toLowerCase();
}

export function buildAbsoluteUrl(baseUrl: string, pathname: string, search = '') {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(normalizedPathname, `${baseUrl}/`);

  if (search) {
    url.search = search.startsWith('?') ? search : `?${search}`;
  }

  return url;
}

