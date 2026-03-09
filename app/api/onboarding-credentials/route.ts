import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { enforceRateLimit, getClientIp, publicError, safeSessionId } from '@/lib/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const url = new URL(request.url);
    const sessionId = safeSessionId(url.searchParams.get('session_id'));
    const isProd = process.env.NODE_ENV === 'production';

    const rateLimit = enforceRateLimit({
      namespace: 'onboarding-credentials',
      key: `${getClientIp(request)}:${sessionId ?? 'invalid'}`,
      limit: 30,
      windowMs: 60_000
    });
    if (rateLimit) return rateLimit;

    if (!sessionId) {
      return NextResponse.json({ ready: false, message: 'session_id non valido.' }, { status: 422 });
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
          message: 'Impossibile recuperare lo stato provisioning.'
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
    const showCredentials = !isProd && (allowCredentialsOnSuccessPage || !emailSent);

    const successMessage = emailSent
      ? 'Credenziali inviate via email. Controlla inbox e spam.'
      : row.email_delivery_error
        ? 'Email non inviata automaticamente. Contatta supporto per il reinvio.'
        : 'Credenziali pronte.';

    // In production, do not leak identifiers: the user will receive credentials via email.
    if (isProd) {
      return NextResponse.json({
        ready: true,
        message: successMessage,
        emailSent,
        showCredentials: false,
        companyName: null,
        username: null,
        tempPassword: null,
        loginUrl: '/login'
      });
    }

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
  } catch (error) {
    return NextResponse.json({ ready: false, message: publicError(error, 'Errore temporaneo.') }, { status: 500 });
  }
}
