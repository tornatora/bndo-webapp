export const runtime = 'nodejs';

function resolveUpstream(reqUrl: string) {
  const requestUrl = new URL(reqUrl);
  const fallback = new URL('/landing', requestUrl.origin).toString();
  const raw = process.env.NEXT_PUBLIC_HOME_EMBED_URL?.trim() || fallback;

  try {
    const upstream = new URL(raw, requestUrl.origin);
    const selfRoute = new URL('/embed/landing', requestUrl.origin);
    if (upstream.origin === selfRoute.origin && upstream.pathname === selfRoute.pathname) {
      return fallback;
    }
    return upstream.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function rewriteHtml(html: string, base: string) {
  let out = html;
  out = out.replaceAll('href="/', `href="${base}/`);
  out = out.replaceAll("href='/", `href='${base}/`);
  out = out.replaceAll('src="/', `src="${base}/`);
  out = out.replaceAll("src='/", `src='${base}/`);
  out = out.replaceAll('srcSet="/', `srcSet="${base}/`);
  out = out.replaceAll('srcset="/', `srcset="${base}/`);
  out = out.replaceAll('action="/', `action="${base}/`);
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('embed') !== '1') {
    return new Response(null, { status: 307, headers: { Location: '/' } });
  }

  const upstream = resolveUpstream(req.url);
  const upstreamUrl = new URL(upstream);
  const base = `${upstreamUrl.protocol}//${upstreamUrl.host}`;

  try {
    const res = await fetch(upstream, {
      method: 'GET',
      headers: { 'User-Agent': 'BNDO-Assistant-Embed/0.1' },
      cache: 'no-store'
    });

    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    const html = await res.text();
    const rewritten = rewriteHtml(html, base);

    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Embed error', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}
