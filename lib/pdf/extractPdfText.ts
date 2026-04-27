function getPdfExtractFunctionUrl(): string | null {
  const isNetlify = process.env.NETLIFY === 'true' || process.env.NETLIFY_LOCAL === 'true';
  if (!isNetlify) return null;

  const base = (
    process.env.DEPLOY_PRIME_URL ||
    process.env.URL ||
    (process.env.NETLIFY_LOCAL === 'true' ? 'http://localhost:8888' : '')
  ).trim().replace(/\/+$/, '');

  return base ? `${base}/.netlify/functions/extract-pdf-text` : null;
}

export async function callPdfExtractFunction(buffer: Buffer): Promise<string | null> {
  const functionUrl = getPdfExtractFunctionUrl();
  if (!functionUrl) return null;

  try {
    const formData = new FormData();
    formData.append('pdf', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), 'document.pdf');
    const res = await fetch(functionUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.text && json.text.length >= 80) return json.text;
    return null;
  } catch {
    return null;
  }
}
