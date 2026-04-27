// Standalone Netlify function for PDF text extraction
// Uses pdfjs-dist directly (text extraction only — no canvas/DOM needed)

// Polyfill DOM APIs that pdfjs-dist references at load time on Netlify Lambda
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      if (typeof init === 'string' && init.startsWith('matrix(')) {
        const parts = init.slice(7, -1).split(',').map(Number);
        this.a = parts[0]; this.b = parts[1]; this.c = parts[2];
        this.d = parts[3]; this.e = parts[4]; this.f = parts[5];
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
    }
  };
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {};
}

function extractFilePart(buffer, boundary) {
  const str = buffer.toString('binary');
  const boundaryMarker = `--${boundary}`;
  const parts = str.split(boundaryMarker);

  for (const part of parts) {
    const nameMatch = part.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    let content = part.slice(headerEnd + 4);
    const trailer = `\r\n--${boundary}`;
    const endIdx = content.lastIndexOf(trailer);
    if (endIdx >= 0) content = content.slice(0, endIdx);
    content = content.replace(/\r\n$/, '');
    return { name: nameMatch[1], data: Buffer.from(content, 'binary') };
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const contentType = event.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing boundary' }) };
    }
    const boundary = boundaryMatch[1].replace(/^"|"$/g, '');

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);

    const part = extractFilePart(rawBody, boundary);
    if (!part || part.data.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No PDF file found in request' }) };
    }

    // Dynamic import of ESM pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(part.data),
      disableWorker: true,
      verbosity: 0,
    }).promise;

    const textParts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => it.str ?? '')
        .join(' ');
      textParts.push(pageText);
    }

    await doc.destroy();
    const text = textParts.join('\n').trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'PDF extraction failed' }),
    };
  }
};
