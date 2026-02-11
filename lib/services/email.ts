type SendOnboardingCredentialsEmailInput = {
  toEmail: string;
  contactName: string;
  companyName: string;
  username: string;
  tempPassword: string;
  loginUrl: string;
};

type SendEmailResult = {
  sent: boolean;
  providerMessageId?: string;
  error?: string;
  skipped?: boolean;
};

type ResendResponse = {
  id?: string;
};

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendOnboardingCredentialsEmail(
  input: SendOnboardingCredentialsEmailInput
): Promise<SendEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !resendFromEmail) {
    return {
      sent: false,
      skipped: true,
      error: 'Missing RESEND_API_KEY or RESEND_FROM_EMAIL.'
    };
  }

  const subject = `Credenziali accesso BidPilot - ${input.companyName}`;

  const text = [
    `Ciao ${input.contactName},`,
    '',
    'il tuo account BidPilot e stato attivato con successo.',
    '',
    `Azienda: ${input.companyName}`,
    `Username: ${input.username}`,
    `Password temporanea: ${input.tempPassword}`,
    '',
    `Accedi qui: ${input.loginUrl}`,
    '',
    'Ti consigliamo di modificare la password al primo accesso.',
    '',
    'Team BidPilot'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10243a;max-width:640px;margin:0 auto;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 12px;">Account BidPilot attivato</h1>
      <p style="margin:0 0 16px;">Ciao ${escapeHtml(input.contactName)}, il tuo account e pronto.</p>
      <div style="background:#f2f6fa;border:1px solid #d8e2ec;border-radius:12px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;"><strong>Azienda:</strong> ${escapeHtml(input.companyName)}</p>
        <p style="margin:0 0 8px;"><strong>Username:</strong> ${escapeHtml(input.username)}</p>
        <p style="margin:0;"><strong>Password temporanea:</strong> ${escapeHtml(input.tempPassword)}</p>
      </div>
      <p style="margin:0 0 16px;">Ti consigliamo di modificare la password al primo accesso.</p>
      <a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;background:#0a2540;color:#ffffff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;">Accedi alla dashboard</a>
      <p style="margin:16px 0 0;font-size:12px;color:#5f7388;">Team BidPilot</p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [input.toEmail],
        subject,
        text,
        html
      })
    });

    const rawResponse = await response.text();
    let parsedResponse: ResendResponse = {};
    try {
      const parsedUnknown: unknown = rawResponse ? JSON.parse(rawResponse) : {};
      if (parsedUnknown && typeof parsedUnknown === 'object') {
        parsedResponse = parsedUnknown as ResendResponse;
      }
    } catch {
      parsedResponse = {};
    }

    if (!response.ok) {
      return {
        sent: false,
        error: `Resend error ${response.status}: ${rawResponse.slice(0, 250)}`
      };
    }

    return {
      sent: true,
      providerMessageId:
        typeof parsedResponse?.id === 'string' ? (parsedResponse.id as string) : undefined
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Unknown email transport error.'
    };
  }
}
