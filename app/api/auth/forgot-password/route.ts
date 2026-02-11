import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(160)
});

function redirectWithMessage(request: NextRequest, key: 'error' | 'success', message: string) {
  const url = new URL('/forgot-password', request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = ForgotPasswordSchema.safeParse({
    email: String(formData.get('email') ?? '')
  });

  if (!parsed.success) {
    return redirectWithMessage(request, 'error', 'Inserisci una email valida.');
  }

  const supabase = createClient();
  const redirectTo = `${request.nextUrl.origin}/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo
  });

  if (error) {
    return redirectWithMessage(request, 'error', 'Impossibile inviare la mail di recupero. Riprova.');
  }

  return redirectWithMessage(request, 'success', 'Email inviata. Controlla inbox e spam per il link di reset.');
}
