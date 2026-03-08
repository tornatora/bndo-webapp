import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/database.types';
import { hasOpsAccess } from '@/lib/roles';
import { ADMIN_URL, APP_URL, MARKETING_URL, buildAbsoluteUrl, hostFromBaseUrl } from '@/lib/site-urls';

function stripPort(host: string) {
  return host.split(':')[0].toLowerCase();
}

function resolveRequestHost(request: NextRequest) {
  return stripPort(request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '');
}

export async function middleware(request: NextRequest) {
  if (process.env.MOCK_BACKEND === 'true') {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  const host = resolveRequestHost(request);

  const marketingHost = stripPort(hostFromBaseUrl(MARKETING_URL));
  const appHost = stripPort(hostFromBaseUrl(APP_URL));
  const adminHost = stripPort(hostFromBaseUrl(ADMIN_URL));

  const isMarketingHost = host === marketingHost;
  const isAppHost = host === appHost;
  const isAdminHost = host === adminHost;
  const hasDistinctDomainMapping = new Set([marketingHost, appHost, adminHost]).size >= 3;

  const isDashboardPath = path.startsWith('/dashboard');
  const isAdminPath = path.startsWith('/admin');
  const isAuthPath = path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/forgot-password');
  const isAppDomainAuthPath = isAuthPath || path.startsWith('/reset-password');
  const isQuizPath = path.startsWith('/quiz');
  const isOnboardingPath = path.startsWith('/onboarding');
  const hasAuthError = request.nextUrl.searchParams.has('error');
  const isAdminMode = request.nextUrl.searchParams.get('mode') === 'admin';
  const isAdminPasswordPath = path === '/forgot-password' || path === '/reset-password';
  const isAdminAuthModePath = isAdminMode && path === '/login';

  if (isAdminMode && isAdminPasswordPath) {
    const loginUrl = buildAbsoluteUrl(ADMIN_URL, '/login');
    loginUrl.searchParams.set('mode', 'admin');
    loginUrl.searchParams.set('error', 'Recupero password admin disabilitato');
    return NextResponse.redirect(loginUrl);
  }

  const search = request.nextUrl.search;
  if (hasDistinctDomainMapping) {
    if (isMarketingHost) {
      if (isDashboardPath || isAppDomainAuthPath) {
        return NextResponse.redirect(buildAbsoluteUrl(APP_URL, path, search));
      }
      if (isAdminPath) {
        return NextResponse.redirect(buildAbsoluteUrl(ADMIN_URL, path, search));
      }
    }

    if (isAppHost) {
      if (path === '/') {
        return NextResponse.redirect(buildAbsoluteUrl(APP_URL, '/login', search));
      }
      if (isAdminAuthModePath) {
        return NextResponse.redirect(buildAbsoluteUrl(ADMIN_URL, path, search));
      }
      if (isAdminPath) {
        return NextResponse.redirect(buildAbsoluteUrl(ADMIN_URL, path, search));
      }
      if (isQuizPath || isOnboardingPath) {
        return NextResponse.redirect(buildAbsoluteUrl(MARKETING_URL, path, search));
      }
    }

    if (isAdminHost) {
      if (path === '/') {
        return NextResponse.redirect(buildAbsoluteUrl(ADMIN_URL, '/admin', search));
      }
      if (isDashboardPath || (isAppDomainAuthPath && !isAdminAuthModePath)) {
        return NextResponse.redirect(buildAbsoluteUrl(APP_URL, path, search));
      }
      if (isQuizPath || isOnboardingPath) {
        return NextResponse.redirect(buildAbsoluteUrl(MARKETING_URL, path, search));
      }
    }
  }

  let response = NextResponse.next({
    request
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  try {
  const supabase = createServerClient<Database, 'public'>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (isAdminPath && !user) {
    const loginUrl = buildAbsoluteUrl(ADMIN_URL, '/login');
    loginUrl.searchParams.set('mode', 'admin');
    loginUrl.searchParams.set('next', buildAbsoluteUrl(ADMIN_URL, path, request.nextUrl.search).toString());
    return NextResponse.redirect(loginUrl);
  }

  if (isDashboardPath && !user) {
    return NextResponse.redirect(buildAbsoluteUrl(APP_URL, '/login'));
  }

  if (isAuthPath && user && !hasAuthError) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

    if (profile?.role && hasOpsAccess(profile.role)) {
      return NextResponse.redirect(buildAbsoluteUrl(ADMIN_URL, '/admin'));
    }

    return NextResponse.redirect(buildAbsoluteUrl(APP_URL, '/dashboard'));
  }
  } catch {
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/quiz/:path*',
    '/onboarding/:path*',
    '/dashboard/:path*',
    '/admin/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password'
  ]
};
