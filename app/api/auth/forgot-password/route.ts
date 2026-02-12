import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { APP_URL, buildAbsoluteUrl } from '@/lib/site-urls';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(160)
});

function redirectWithMessage(key: 'error' | 'success', message: string) {
  const url = buildAbsoluteUrl(APP_URL, '/forgot-password');
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = ForgotPasswordSchema.safeParse({
    email: String(formData.get('email') ?? '')
  });

  if (!parsed.success) {
    return redirectWithMessage('error', 'Inserisci una email valida.');
  }

  const supabase = createClient();
  const redirectTo = buildAbsoluteUrl(APP_URL, '/reset-password').toString();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo
  });

  if (error) {
    return redirectWithMessage('error', 'Impossibile inviare la mail di recupero. Riprova.');
  }

  return redirectWithMessage('success', 'Email inviata. Controlla inbox e spam per il link di reset.');
}
