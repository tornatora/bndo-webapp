type SendOnboardingCredentialsEmailInput = {
  toEmail: string;
  contactName: string;
  companyName: string;
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

type SendDocumentReminderEmailInput = {
  toEmail: string;
  companyName: string;
  practiceTitle: string;
  documentLabel: string;
};

type SendPracticeProgressEmailInput = {
  toEmail: string;
  companyName: string;
  practiceTitle: string;
  stepLabel: string;
};

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

  const subject = `Credenziali accesso BNDO - ${input.companyName}`;

  const text = [
    `Ciao ${input.contactName},`,
    '',
    'il tuo account BNDO e stato attivato con successo.',
    '',
    `Azienda: ${input.companyName}`,
    `Email (login): ${input.toEmail}`,
    `Password temporanea: ${input.tempPassword}`,
    '',
    `Accedi qui: ${input.loginUrl}`,
    '',
    'Ti consigliamo di modificare la password al primo accesso.',
    '',
    'Team BNDO'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10243a;max-width:640px;margin:0 auto;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 12px;">Account BNDO attivato</h1>
      <p style="margin:0 0 16px;">Ciao ${escapeHtml(input.contactName)}, il tuo account e pronto.</p>
      <div style="background:#f2f6fa;border:1px solid #d8e2ec;border-radius:12px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;"><strong>Azienda:</strong> ${escapeHtml(input.companyName)}</p>
        <p style="margin:0 0 8px;"><strong>Email (login):</strong> ${escapeHtml(input.toEmail)}</p>
        <p style="margin:0;"><strong>Password temporanea:</strong> ${escapeHtml(input.tempPassword)}</p>
      </div>
      <p style="margin:0 0 16px;">Ti consigliamo di modificare la password al primo accesso.</p>
      <a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;background:#0a2540;color:#ffffff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;">Accedi alla dashboard</a>
      <p style="margin:16px 0 0;font-size:12px;color:#5f7388;">Team BNDO</p>
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

export async function sendDocumentReminderEmail(input: SendDocumentReminderEmailInput): Promise<SendEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !resendFromEmail) {
    return {
      sent: false,
      skipped: true,
      error: 'Missing RESEND_API_KEY or RESEND_FROM_EMAIL.'
    };
  }

  const subject = `Promemoria documento - ${input.practiceTitle}`;

  const text = [
    `Ciao,`,
    '',
    `per la pratica "${input.practiceTitle}" ci serve ancora questo documento:`,
    `- ${input.documentLabel}`,
    '',
    'Puoi caricarlo dalla tua dashboard.',
    '',
    `Azienda: ${input.companyName}`,
    '',
    'Team BNDO'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10243a;max-width:640px;margin:0 auto;padding:24px;">
      <h1 style="font-size:18px;margin:0 0 10px;">Promemoria documento</h1>
      <p style="margin:0 0 14px;">Per la pratica <strong>${escapeHtml(input.practiceTitle)}</strong> ci serve ancora:</p>
      <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:14px;">
        <strong>${escapeHtml(input.documentLabel)}</strong>
      </div>
      <p style="margin:0 0 14px;">Puoi caricarlo dalla tua dashboard. Se hai dubbi, rispondi direttamente a questa email.</p>
      <p style="margin:0;font-size:12px;color:#5f7388;">Azienda: ${escapeHtml(input.companyName)}<br/>Team BNDO</p>
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
      providerMessageId: typeof parsedResponse?.id === 'string' ? (parsedResponse.id as string) : undefined
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Unknown email transport error.'
    };
  }
}

export async function sendPracticeProgressEmail(input: SendPracticeProgressEmailInput): Promise<SendEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !resendFromEmail) {
    return {
      sent: false,
      skipped: true,
      error: 'Missing RESEND_API_KEY or RESEND_FROM_EMAIL.'
    };
  }

  const subject = `Aggiornamento pratica - ${input.practiceTitle}`;

  const text = [
    `Ciao,`,
    '',
    `La tua pratica "${input.practiceTitle}" ha un aggiornamento:`,
    `${input.stepLabel}`,
    '',
    `Azienda: ${input.companyName}`,
    '',
    'Team BNDO'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10243a;max-width:640px;margin:0 auto;padding:24px;">
      <h1 style="font-size:18px;margin:0 0 10px;">Aggiornamento pratica</h1>
      <p style="margin:0 0 14px;">La tua pratica <strong>${escapeHtml(input.practiceTitle)}</strong> ha un aggiornamento:</p>
      <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:14px;">
        <strong>${escapeHtml(input.stepLabel)}</strong>
      </div>
      <p style="margin:0;font-size:12px;color:#5f7388;">Azienda: ${escapeHtml(input.companyName)}<br/>Team BNDO</p>
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
      providerMessageId: typeof parsedResponse?.id === 'string' ? (parsedResponse.id as string) : undefined
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Unknown email transport error.'
    };
  }
}
