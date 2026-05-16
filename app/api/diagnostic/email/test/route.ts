import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/services/email';

/**
 * GET /api/diagnostic/email/test?to=email@example.com
 *
 * Invia una mail di prova per verificare che la configurazione email funzioni.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get('to')?.trim().toLowerCase();

  if (!to) {
    return NextResponse.json(
      { ok: false, error: 'Parametro "to" obbligatorio. Usa ?to=email@example.com' },
      { status: 400 }
    );
  }

  const subject = '[BNDO] Test configurazione email';
  const text = [
    'Questa è una mail di prova inviata da BNDO.',
    '',
    `Inviata a: ${to}`,
    `Data: ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`,
    '',
    'Se ricevi questa mail, la configurazione email funziona correttamente.',
    '',
    'Team BNDO',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10243a;max-width:640px;margin:0 auto;padding:24px;">
      <h1 style="font-size:18px;margin:0 0 10px;">Test configurazione email BNDO</h1>
      <p style="margin:0 0 14px;">Questa è una mail di prova.</p>
      <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:14px;">
        <p style="margin:0 0 6px;"><strong>Inviata a:</strong> ${to}</p>
        <p style="margin:0;"><strong>Data:</strong> ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</p>
      </div>
      <p style="margin:0;font-size:12px;color:#5f7388;">Se ricevi questa mail, la configurazione email funziona correttamente.</p>
      <p style="margin:4px 0 0;font-size:12px;color:#5f7388;">Team BNDO</p>
    </div>
  `;

  const result = await sendEmail([to], subject, text, html);

  return NextResponse.json({
    ok: result.sent,
    to,
    sent: result.sent,
    skipped: !!result.skipped,
    error: result.error || null,
    providerMessageId: result.providerMessageId || null,
    timestamp: new Date().toISOString(),
  });
}
