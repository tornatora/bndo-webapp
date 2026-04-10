import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/database.types';
import { hasAdminAccess, hasConsultantAccess, hasOpsAccess } from '@/lib/roles';
import { ADMIN_URL, APP_URL, MARKETING_URL, buildAbsoluteUrl, hostFromBaseUrl } from '@/lib/site-urls';

function stripPort(host: string) {
  return host.split(':')[0].toLowerCase();
}

function resolveRequestHost(request: NextRequest) {
  return stripPort(request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '');
}

export async function middleware(request: NextRequest) {
  const host = resolveRequestHost(request);
  const hostname = request.nextUrl.hostname.toLowerCase();
  const path = request.nextUrl.pathname;
  const requestOrigin = request.nextUrl.origin;
  const isNetlifyPreview = host.endsWith('.netlify.app') || hostname.endsWith('.netlify.app');

  if (process.env.MOCK_BACKEND === 'true' || host === 'localhost' || host === '127.0.0.1') {
    return NextResponse.next();
  }

  // Define dynamic bases for redirects. 
  // On Netlify previews, we stay on the same domain for everything.
  const appBase = isNetlifyPreview ? requestOrigin : APP_URL;
  const marketingBase = isNetlifyPreview ? requestOrigin : MARKETING_URL;
  const adminBase = isNetlifyPreview ? requestOrigin : ADMIN_URL;

  const marketingHost = stripPort(hostFromBaseUrl(MARKETING_URL));
  const appHost = stripPort(hostFromBaseUrl(APP_URL));
  const adminHost = stripPort(hostFromBaseUrl(ADMIN_URL));

  const isMarketingHost = host === marketingHost;
  const isAppHost = host === appHost;
  const isAdminHost = host === adminHost;
  const hasDistinctDomainMapping = new Set([marketingHost, appHost, adminHost]).size >= 3;

  const isDashboardPath = path.startsWith('/dashboard');
  const isAdminPath = path.startsWith('/admin');
  const isConsultantPath = path.startsWith('/consultant');
  const isAuthPath = path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/forgot-password');
  const isAppDomainAuthPath = isAuthPath || path.startsWith('/reset-password');
  const isQuizPath = path.startsWith('/quiz');
  const isOnboardingPath = path.startsWith('/onboarding');
  const isPaymentPath = path.startsWith('/payment');
  const hasAuthError = request.nextUrl.searchParams.has('error');
  const isAdminMode = request.nextUrl.searchParams.get('mode') === 'admin';
  const isAdminPasswordPath = path === '/forgot-password' || path === '/reset-password';
  const isAdminAuthModePath = isAdminMode && path === '/login';

  if (isAdminMode && isAdminPasswordPath) {
    const loginUrl = buildAbsoluteUrl(adminBase, '/login');
    loginUrl.searchParams.set('mode', 'admin');
    loginUrl.searchParams.set('error', 'Recupero password admin disabilitato');
    return NextResponse.redirect(loginUrl);
  }

  const search = request.nextUrl.search;
  if (hasDistinctDomainMapping) {
    if (isMarketingHost) {
      if (isDashboardPath || isAppDomainAuthPath) {
        return NextResponse.redirect(buildAbsoluteUrl(appBase, path, search));
      }
      if (isAdminPath) {
        return NextResponse.redirect(buildAbsoluteUrl(adminBase, path, search));
      }
    }

    if (isAppHost) {
      if (path === '/') {
        return NextResponse.redirect(buildAbsoluteUrl(appBase, '/login', search));
      }
      if (isAdminAuthModePath) {
        return NextResponse.redirect(buildAbsoluteUrl(adminBase, path, search));
      }
      if (isAdminPath) {
        return NextResponse.redirect(buildAbsoluteUrl(adminBase, path, search));
      }
      if (isQuizPath || isOnboardingPath || isPaymentPath) {
        return NextResponse.redirect(buildAbsoluteUrl(marketingBase, path, search));
      }
    }

    if (isAdminHost) {
      if (path === '/') {
        return NextResponse.redirect(buildAbsoluteUrl(adminBase, '/admin', search));
      }
      if (isDashboardPath || isConsultantPath || (isAppDomainAuthPath && !isAdminAuthModePath)) {
        return NextResponse.redirect(buildAbsoluteUrl(appBase, path, search));
      }
      if (isQuizPath || isOnboardingPath || isPaymentPath) {
        return NextResponse.redirect(buildAbsoluteUrl(marketingBase, path, search));
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
    const loginUrl = buildAbsoluteUrl(adminBase, '/login');
    loginUrl.searchParams.set('mode', 'admin');
    loginUrl.searchParams.set('next', buildAbsoluteUrl(adminBase, path, request.nextUrl.search).toString());
    return NextResponse.redirect(loginUrl);
  }

  if (isDashboardPath && !user) {
    return NextResponse.redirect(buildAbsoluteUrl(appBase, '/login'));
  }
  if (isConsultantPath && !user) {
    return NextResponse.redirect(buildAbsoluteUrl(appBase, '/login'));
  }

  if (isAuthPath && user && !hasAuthError) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

    if (profile?.role && hasAdminAccess(profile.role)) {
      return NextResponse.redirect(buildAbsoluteUrl(adminBase, '/admin'));
    }
    if (profile?.role && hasConsultantAccess(profile.role)) {
      return NextResponse.redirect(buildAbsoluteUrl(appBase, '/consultant'));
    }

    return NextResponse.redirect(buildAbsoluteUrl(appBase, '/dashboard/pratiche'));
  }
  if (isAdminPath && user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile?.role || !hasAdminAccess(profile.role)) {
      if (profile?.role && hasConsultantAccess(profile.role)) {
        return NextResponse.redirect(buildAbsoluteUrl(appBase, '/consultant'));
      }
      return NextResponse.redirect(buildAbsoluteUrl(appBase, '/dashboard/pratiche'));
    }
  }

  if (isConsultantPath && user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile?.role || !hasOpsAccess(profile.role)) {
      return NextResponse.redirect(buildAbsoluteUrl(appBase, '/dashboard/pratiche'));
    }
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
    '/payment/:path*',
    '/dashboard/:path*',
    '/consultant/:path*',
    '/admin/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password'
  ]
};
