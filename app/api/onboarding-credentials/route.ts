import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ ready: false, message: 'session_id mancante.' }, { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from('onboarding_credentials')
    .select('username, temp_password, first_viewed_at, emailed_at, email_delivery_error, company_id')
    .eq('checkout_session_id', sessionId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        ready: false,
        message: error.message
      },
      { status: 500 }
    );
  }

  if (!row) {
    return NextResponse.json({ ready: false, message: 'Account in provisioning.' }, { status: 200 });
  }

  if (!row.first_viewed_at) {
    await supabaseAdmin
      .from('onboarding_credentials')
      .update({ first_viewed_at: new Date().toISOString() })
      .eq('checkout_session_id', sessionId);
  }

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('name')
    .eq('id', row.company_id)
    .maybeSingle();
  const emailSent = Boolean(row.emailed_at);
  const allowCredentialsOnSuccessPage = process.env.ALLOW_SUCCESS_PAGE_CREDENTIALS === 'true';
  const showCredentials = allowCredentialsOnSuccessPage || !emailSent;

  const successMessage = emailSent
    ? 'Credenziali inviate via email. Controlla inbox e spam.'
    : row.email_delivery_error
      ? 'Email non inviata automaticamente. Usa le credenziali mostrate qui sotto.'
      : 'Credenziali pronte.';

  return NextResponse.json({
    ready: true,
    message: successMessage,
    emailSent,
    showCredentials,
    companyName: company?.name ?? 'Azienda',
    username: row.username,
    tempPassword: showCredentials ? row.temp_password : null,
    loginUrl: '/login'
  });
}
