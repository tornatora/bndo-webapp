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
      // If the user explicitly goes to admin.bndo.it/login, keep them on the admin host
      // and force admin mode (otherwise we'd bounce to app.bndo.it and break session cookies).
      if (path === '/login' && !isAdminMode) {
        const loginUrl = buildAbsoluteUrl(adminBase, '/login');
        loginUrl.searchParams.set('mode', 'admin');
        const next = request.nextUrl.searchParams.get('next');
        const error = request.nextUrl.searchParams.get('error');
        const success = request.nextUrl.searchParams.get('success');
        if (next) loginUrl.searchParams.set('next', next);
        if (error) loginUrl.searchParams.set('error', error);
        if (success) loginUrl.searchParams.set('success', success);
        return NextResponse.redirect(loginUrl);
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
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let roleCache: string | null | undefined = undefined;
  const getRole = async () => {
    if (!user) return null;
    if (roleCache !== undefined) return roleCache;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    roleCache = profile?.role ?? null;
    return roleCache;
  };

  // Admin sessions must never "stick" to app.bndo.it. If we detect an admin on the app host,
  // we migrate the legacy domain cookie to an admin-host-only cookie, then send the user back
  // to app login (so users/consultants can log in normally).
  if (hasDistinctDomainMapping && !isNetlifyPreview && isAppHost && user) {
    const role = await getRole();
    if (role && hasAdminAccess(role)) {
      const returnUrl = buildAbsoluteUrl(appBase, '/login');
      const migrateUrl = buildAbsoluteUrl(adminBase, '/api/auth/migrate');
      migrateUrl.searchParams.set('return', returnUrl.toString());
      return NextResponse.redirect(migrateUrl, { status: 303 });
    }
  }

  if (isAdminPath && !user) {
    const loginUrl = buildAbsoluteUrl(adminBase, '/login');
    loginUrl.searchParams.set('mode', 'admin');
    loginUrl.searchParams.set('next', buildAbsoluteUrl(adminBase, path, request.nextUrl.search).toString());
    return NextResponse.redirect(loginUrl);
  }

  if (isDashboardPath && !user && !isNetlifyPreview) {
    return NextResponse.redirect(buildAbsoluteUrl(appBase, '/login'));
  }
  if (isConsultantPath && !user && !isNetlifyPreview) {
    return NextResponse.redirect(buildAbsoluteUrl(appBase, '/login'));
  }

  if (isAuthPath && user && !hasAuthError) {
    const role = await getRole();

    if (role && hasAdminAccess(role)) {
      return NextResponse.redirect(buildAbsoluteUrl(adminBase, '/admin'));
    }
    if (role && hasConsultantAccess(role)) {
      return NextResponse.redirect(buildAbsoluteUrl(appBase, '/consultant'));
    }

    return NextResponse.redirect(buildAbsoluteUrl(appBase, '/dashboard/pratiche'));
  }
  if (isAdminPath && user) {
    const role = await getRole();
    if (!role || !hasAdminAccess(role)) {
      if (role && hasConsultantAccess(role)) {
        return NextResponse.redirect(buildAbsoluteUrl(appBase, '/consultant'));
      }
      return NextResponse.redirect(buildAbsoluteUrl(appBase, '/dashboard/pratiche'));
    }
  }

  if (isConsultantPath && user) {
    const role = await getRole();
    if (!role || !hasOpsAccess(role)) {
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
    '/reset-password',
    '/compila-bando-preview'
  ]
};
