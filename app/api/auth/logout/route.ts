import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { APP_URL, buildAbsoluteUrl } from '@/lib/site-urls';

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

function clearAuthCookies(response: NextResponse, request: NextRequest) {
  const names = new Set<string>([
    'sb-access-token',
    'sb-refresh-token',
    'supabase-auth-token',
  ]);

  for (const cookie of request.cookies.getAll()) {
    if (isAuthCookieName(cookie.name)) {
      names.add(cookie.name);
    }
  }

  for (const name of names) {
    response.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      expires: new Date(0),
      sameSite: 'lax',
    });
  }
}

async function performBestEffortSignOut() {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // Do not fail logout UX if upstream signout throws.
  }
}

export async function POST(request: NextRequest) {
  await performBestEffortSignOut();

  const response = NextResponse.json({ success: true });
  clearAuthCookies(response, request);

  return response;
}

export async function GET(request: NextRequest) {
  await performBestEffortSignOut();

  const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/login';
  const safeRedirect = redirectTo.trim() || '/login';
  let response: NextResponse;

  if (safeRedirect.startsWith('http://') || safeRedirect.startsWith('https://')) {
    response = NextResponse.redirect(safeRedirect, { status: 303 });
    clearAuthCookies(response, request);
    return response;
  }

  const requestHost = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
  
  const isPreview =
    requestHost.endsWith('.netlify.app') ||
    requestHost.startsWith('localhost') ||
    requestHost.startsWith('127.0.0.1');

  const targetBaseUrl = isPreview ? request.nextUrl.origin : APP_URL;
  response = NextResponse.redirect(buildAbsoluteUrl(targetBaseUrl, safeRedirect), { status: 303 });
  clearAuthCookies(response, request);
  return response;
}
