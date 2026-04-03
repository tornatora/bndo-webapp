export const config = {
  schedule: '0 3 * * *'
};

function resolveBaseUrl() {
  const raw =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    '';

  const value = String(raw).trim();
  if (!value) {
    throw new Error('Base URL Netlify non disponibile per il refresh bandi.');
  }

  return value.replace(/\/+$/, '');
}

export async function handler() {
  const baseUrl = resolveBaseUrl();
  const endpoint = `${baseUrl}/api/jobs/refresh-bandi`;
  const secret = String(process.env.CRON_SECRET || '').trim();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...(secret ? { 'x-cron-secret': secret } : {})
    }
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Refresh bandi fallito (${response.status}): ${body.slice(0, 400)}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      endpoint,
      body: body.slice(0, 400)
    })
  };
}
