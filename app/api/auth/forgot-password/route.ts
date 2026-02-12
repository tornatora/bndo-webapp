import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_URL, APP_URL, buildAbsoluteUrl, hostFromBaseUrl } from '@/lib/site-urls';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(160)
});

function redirectWithMessage(key: 'error' | 'success', message: string) {
  const url = buildAbsoluteUrl(APP_URL, '/forgot-password');
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
  const formData = await request.formData();
  const mode = String(formData.get('mode') ?? '').trim().toLowerCase();
  const requestHost = String(request.headers.get('host') ?? '').toLowerCase();
  const adminHost = hostFromBaseUrl(ADMIN_URL);
  const parsed = ForgotPasswordSchema.safeParse({
    email: String(formData.get('email') ?? '')
  });

  if (!parsed.success) {
    return redirectWithMessage('error', 'Inserisci una email valida.');
  }

  if (mode === 'admin' || requestHost === adminHost) {
    return redirectAdminRecoveryBlocked();
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
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
  const redirectTo = buildAbsoluteUrl(APP_URL, '/reset-password').toString();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo
  });

  if (error) {
    return redirectWithMessage('error', 'Impossibile inviare la mail di recupero. Riprova.');
  }

  return redirectWithMessage('success', 'Email inviata. Controlla inbox e spam per il link di reset.');
}
