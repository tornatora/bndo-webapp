import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_URL, APP_URL, buildAbsoluteUrl, hostFromBaseUrl } from '@/lib/site-urls';
import { enforceRateLimit, getClientIp, rejectCrossSiteMutation } from '@/lib/security/http';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(160)
});

function redirectWithMessage(request: NextRequest, key: 'error' | 'success', message: string) {
  const requestHost = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host
  ).split(',')[0].trim().toLowerCase();
  
  const isPreview =
    requestHost.endsWith('.netlify.app') ||
    requestHost.startsWith('localhost') ||
    requestHost.startsWith('127.0.0.1');

  const targetBaseUrl = isPreview ? request.nextUrl.origin : APP_URL;
  const url = buildAbsoluteUrl(targetBaseUrl, '/forgot-password');
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, { status: 303 });
}

function redirectAdminRecoveryBlocked() {
  const url = buildAbsoluteUrl(ADMIN_URL, '/login');
  url.searchParams.set('mode', 'admin');
  url.searchParams.set('error', 'Recupero password admin disabilitato');
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;

  const formData = await request.formData();
  const mode = String(formData.get('mode') ?? '').trim().toLowerCase();
  const requestHost = String(request.headers.get('host') ?? '').toLowerCase();
  const adminHost = hostFromBaseUrl(ADMIN_URL);
  const parsed = ForgotPasswordSchema.safeParse({
    email: String(formData.get('email') ?? '')
  });

  if (!parsed.success) {
    return redirectWithMessage(request, 'error', 'Inserisci una email valida.');
  }

  if (mode === 'admin' || requestHost === adminHost) {
    return redirectAdminRecoveryBlocked();
  }

  const normalizedEmail = parsed.data.email.toLowerCase();

  const rateLimit = enforceRateLimit({
    namespace: 'auth-forgot-password',
    key: `${getClientIp(request)}:${normalizedEmail}`,
    limit: 6,
    windowMs: 10 * 60_000,
    message: 'Troppi tentativi di recupero password. Riprova tra qualche minuto.'
  });
  if (rateLimit) return rateLimit;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profile?.role && hasOpsAccess(profile.role)) {
    return redirectAdminRecoveryBlocked();
  }

  const supabase = createClient();
  const requestHostForRedirect = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host
  ).split(',')[0].trim().toLowerCase();
  const isPreviewForRedirect =
    requestHostForRedirect.endsWith('.netlify.app') ||
    requestHostForRedirect.startsWith('localhost') ||
    requestHostForRedirect.startsWith('127.0.0.1');
  const targetBaseUrl = isPreviewForRedirect ? request.nextUrl.origin : APP_URL;

  const redirectTo = buildAbsoluteUrl(targetBaseUrl, '/reset-password').toString();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo
  });

  if (error) {
    return redirectWithMessage(request, 'error', 'Impossibile inviare la mail di recupero. Riprova.');
  }

  return redirectWithMessage(request, 'success', 'Email inviata. Controlla inbox e spam per il link di reset.');
}
