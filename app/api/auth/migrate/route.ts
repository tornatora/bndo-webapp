import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_URL, APP_URL, MARKETING_URL, buildAbsoluteUrl, hostFromBaseUrl } from '@/lib/site-urls';

function normalizeHost(host: string) {
  return host.split(':')[0].trim().toLowerCase();
}

function isAuthCookieName(name: string) {
  const normalized = name.toLowerCase();
  return (
    normalized.startsWith('sb-') ||
    normalized.startsWith('__host-sb-') ||
    normalized.startsWith('__secure-sb-') ||
    normalized.includes('supabase') ||
    normalized.includes('auth-token') ||
    normalized === 'sb-access-token' ||
    normalized === 'sb-refresh-token'
  );
}

function resolveSafeRedirect(target: string | null, fallback: URL, allowedHosts: Set<string>, baseUrl: string) {
  if (!target) return fallback;

  try {
    const resolved = new URL(target, `${baseUrl}/`);
    if (!allowedHosts.has(normalizeHost(resolved.host))) {
      return fallback;
    }
    return resolved;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const requestHostRaw =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host;
  const requestHost = normalizeHost(requestHostRaw.split(',')[0] ?? '');
  const requestOrigin = request.nextUrl.origin;

  const isPreviewOrLocalHost =
    requestHost.endsWith('.netlify.app') ||
    requestHost.startsWith('localhost') ||
    requestHost.startsWith('127.0.0.1');

  const appBaseUrl = isPreviewOrLocalHost ? requestOrigin : APP_URL;

  const allowedHosts = new Set<string>([
    normalizeHost(hostFromBaseUrl(APP_URL)),
    normalizeHost(hostFromBaseUrl(ADMIN_URL)),
    normalizeHost(hostFromBaseUrl(MARKETING_URL)),
    normalizeHost(requestHost),
  ]);

  const fallback = buildAbsoluteUrl(appBaseUrl, '/login');
  const returnParam = request.nextUrl.searchParams.get('return');
  const safeReturn = resolveSafeRedirect(returnParam, fallback, allowedHosts, appBaseUrl);

  const response = NextResponse.redirect(safeReturn, { status: 303 });

  const names = new Set<string>(['sb-access-token', 'sb-refresh-token', 'supabase-auth-token']);
  for (const cookie of request.cookies.getAll()) {
    if (isAuthCookieName(cookie.name)) {
      names.add(cookie.name);
    }
  }

  const shouldClearLegacyDomain = requestHost === 'bndo.it' || requestHost.endsWith('.bndo.it');
  const secure = !(requestHost.startsWith('localhost') || requestHost.startsWith('127.0.0.1'));
  const maxAge = 400 * 24 * 60 * 60;

  for (const name of names) {
    const value = request.cookies.get(name)?.value;

    if (value) {
      // Copy the current cookie payload to a host-only cookie on this hostname.
      response.cookies.set(name, value, {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        secure,
        maxAge,
      });
    }

    if (shouldClearLegacyDomain) {
      // Delete the old domain-wide cookie, so sessions are isolated per subdomain (app/admin).
      response.cookies.set(name, '', {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        secure,
        maxAge: 0,
        expires: new Date(0),
        domain: '.bndo.it',
      });
    }
  }

  return response;
}
