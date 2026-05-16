import { NextResponse } from 'next/server';

/**
 * GET /api/diagnostic/email
 *
 * Diagnostica la configurazione email senza inviare mail reali.
 * Legge le env var e mostra lo stato dei servizi.
 */
export async function GET() {
  const smtpHost = process.env.SMTP_HOST || '(default: smtps.aruba.it)';
  const smtpPort = process.env.SMTP_PORT || '(default: 465)';
  const smtpUser = process.env.SMTP_USER || '(default: admin@bndo.it)';
  const smtpPass = process.env.SMTP_PASS;
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || '(default: admin@bndo.it)';
  const smtpFromName = process.env.SMTP_FROM_NAME || '(default: BNDO)';

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  const smtpConfigured = Boolean(smtpPass);
  const resendConfigured = Boolean(resendApiKey && resendFromEmail);

  const configSummary =
    !smtpConfigured && !resendConfigured
      ? 'NESSUN METODO CONFIGURATO — le email non vengono inviate!'
      : smtpConfigured && resendConfigured
        ? 'SMTP + Resend entrambi configurati. SMTP provato per primo, fallback a Resend.'
        : smtpConfigured
          ? 'Solo SMTP configurato. Nessun fallback Resend.'
          : 'Solo Resend configurato.';

  return NextResponse.json({
    ok: smtpConfigured || resendConfigured,
    config: {
      smtp: {
        configured: smtpConfigured,
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        passSet: !!smtpPass,
        passPreview: smtpPass ? `${smtpPass.slice(0, 3)}***${smtpPass.slice(-2)}` : null,
        fromEmail: smtpFromEmail,
        fromName: smtpFromName,
      },
      resend: {
        configured: resendConfigured,
        apiKeySet: !!resendApiKey,
        fromEmail: resendFromEmail || null,
      },
    },
    summary: configSummary,
    recipients: {
      QUIZ_NOTIFICATION_EMAILS: process.env.QUIZ_NOTIFICATION_EMAILS || '(non impostata)',
      QUIZ_NOTIFICATION_EMAIL: process.env.QUIZ_NOTIFICATION_EMAIL || '(non impostata)',
      ADMIN_NOTIFICATION_EMAIL: process.env.ADMIN_NOTIFICATION_EMAIL || '(non impostata)',
      OPS_NOTIFICATION_EMAIL: process.env.OPS_NOTIFICATION_EMAIL || '(non impostata)',
      defaultFallback: 'nataleletteriotornatora@gmail.com',
    },
    note: 'Usa /api/diagnostic/email/test per inviare una mail di prova a un indirizzo specifico (?to=email@example.com).',
    timestamp: new Date().toISOString(),
  });
}
