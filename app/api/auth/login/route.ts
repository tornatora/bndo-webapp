import { NextRequest, NextResponse } from 'next/server';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_URL, APP_URL, buildAbsoluteUrl, hostFromBaseUrl } from '@/lib/site-urls';
import { enforceRateLimit, getClientIp, rejectCrossSiteMutation } from '@/lib/security/http';

function resolveSafeRedirect(target: string | null, fallback: URL, allowedHosts: Set<string>, baseUrl: string) {
  if (!target) return fallback;

  try {
    const resolved = new URL(target, `${baseUrl}/`);
    if (!allowedHosts.has(resolved.host.toLowerCase())) {
      return fallback;
    }

    return resolved;
  } catch {
    return fallback;
  }
}

function redirectWithError(
  error: string,
  mode: 'admin' | 'user' = 'user',
  next: string | null = null,
  baseUrls?: { appBaseUrl: string; adminBaseUrl: string }
) {
  const appBaseUrl = baseUrls?.appBaseUrl ?? APP_URL;
  const adminBaseUrl = baseUrls?.adminBaseUrl ?? ADMIN_URL;
  const url = buildAbsoluteUrl(mode === 'admin' ? adminBaseUrl : appBaseUrl, '/login');
  url.searchParams.set('error', error);
  if (mode === 'admin') {
    url.searchParams.set('mode', 'admin');
  }
  if (next) {
    url.searchParams.set('next', next);
  }
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;

  const requestHost = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
  const requestOrigin = request.nextUrl.origin;
  const isPreviewOrLocalHost =
    requestHost.endsWith('.netlify.app') ||
    requestHost.startsWith('localhost') ||
    requestHost.startsWith('127.0.0.1');
  const appBaseUrl = isPreviewOrLocalHost ? requestOrigin : APP_URL;
  const adminBaseUrl = isPreviewOrLocalHost ? requestOrigin : ADMIN_URL;

  const formData = await request.formData();
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const mode = String(formData.get('mode') ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  const nextParam = String(formData.get('next') ?? '').trim() || null;
  const adminDefault = buildAbsoluteUrl(adminBaseUrl, '/admin');
  const allowedHosts = new Set([
    hostFromBaseUrl(APP_URL),
    hostFromBaseUrl(ADMIN_URL),
    requestHost
  ]);
  const baseUrls = { appBaseUrl, adminBaseUrl };

  if (!identifier || !password) {
    return redirectWithError('Credenziali obbligatorie', mode, nextParam, baseUrls);
  }

  const rateLimit = enforceRateLimit({
    namespace: 'auth-login',
    key: `${getClientIp(request)}:${identifier.toLowerCase()}`,
    limit: 15,
    windowMs: 60_000,
    message: 'Troppi tentativi di login. Riprova tra poco.'
    });
  if (rateLimit) return rateLimit;

  const supabaseAdmin = hasRealServiceRoleKey() ? getSupabaseAdmin() : null;
  let email = identifier;

  if (!identifier.includes('@')) {
    if (!supabaseAdmin) {
      // Without a real service-role key we cannot safely map username -> email.
      return redirectWithError('Inserisci la tua email (non username)', mode, nextParam, baseUrls);
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('username', identifier)
      .maybeSingle();

    if (!profile?.email) {
      return redirectWithError('Username non trovato', mode, nextParam, baseUrls);
    }

    email = profile.email;
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return redirectWithError('Credenziali non valide', mode, nextParam, baseUrls);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const { data: signedProfile } = supabaseAdmin
      ? await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
      : await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

    const isAdmin = Boolean(signedProfile?.role && hasAdminAccess(signedProfile.role));
    const isConsultant = Boolean(signedProfile?.role && hasConsultantAccess(signedProfile.role));

    if (mode === 'admin') {
      if (isAdmin) {
        const safeTarget = resolveSafeRedirect(nextParam, adminDefault, allowedHosts, adminBaseUrl);
        return NextResponse.redirect(safeTarget, { status: 303 });
      }

      await supabase.auth.signOut();
      return redirectWithError('Questo account non ha accesso admin', 'admin', adminDefault.toString(), baseUrls);
    }

    if (isAdmin) {
      return NextResponse.redirect(adminDefault, { status: 303 });
    }
    if (isConsultant) {
      const consultantDefault = buildAbsoluteUrl(appBaseUrl, '/consultant');
      const safeConsultantTarget = resolveSafeRedirect(nextParam, consultantDefault, allowedHosts, appBaseUrl);
      return NextResponse.redirect(safeConsultantTarget, { status: 303 });
    }
  }

  const userDefault = buildAbsoluteUrl(appBaseUrl, '/dashboard/pratiche');
  const safeUserTarget = resolveSafeRedirect(nextParam, userDefault, allowedHosts, appBaseUrl);
  return NextResponse.redirect(safeUserTarget, { status: 303 });
}
