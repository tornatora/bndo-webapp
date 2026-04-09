import { NextResponse } from 'next/server';
import { buildChatThreadContext, type ChatViewerProfile } from '@/lib/dashboard/chat-thread-context';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const CHAT_BACKEND_PROXY_MODE_RAW = (process.env.CHAT_BACKEND_PROXY_MODE ?? 'on').trim().toLowerCase();
const CHAT_BACKEND_PROXY_MODE =
  CHAT_BACKEND_PROXY_MODE_RAW === 'on' ||
  CHAT_BACKEND_PROXY_MODE_RAW === 'true' ||
  CHAT_BACKEND_PROXY_MODE_RAW === '1' ||
  CHAT_BACKEND_PROXY_MODE_RAW === 'yes';
const CHAT_PROXY_BASE_URL =
  (process.env.CHAT_PROXY_BASE_URL || 'https://69ce95a19126a43a447cb472--cheerful-cobbler-f23efc.netlify.app').replace(
    /\/+$/,
    ''
  );
const CHAT_PROXY_TIMEOUT_MS = Number.parseInt(process.env.CHAT_PROXY_TIMEOUT_MS || '30000', 10);

async function proxySyncRequest(request: Request) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(CHAT_PROXY_TIMEOUT_MS) && CHAT_PROXY_TIMEOUT_MS > 0 ? CHAT_PROXY_TIMEOUT_MS : 30_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const rawBody = await request.text();
    const headers = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) headers.set('cookie', cookieHeader);
    const userAgent = request.headers.get('user-agent');
    if (userAgent) headers.set('user-agent', userAgent);
    const accept = request.headers.get('accept');
    if (accept) headers.set('accept', accept);

    const upstream = await fetch(`${CHAT_PROXY_BASE_URL}/api/chat/sync`, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    });

    const responseHeaders = new Headers({
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    });
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) responseHeaders.append('set-cookie', setCookie);
    const text = await upstream.text();
    return new NextResponse(text, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "Mmm, c'è un piccolo intoppo nella connessione. Riprova tra un istante." }, { status: 503 });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });
  const typedProfile = profile as ChatViewerProfile;
  const context = await buildChatThreadContext({
    supabase,
    profile: typedProfile,
    includeMessages: true,
    messagesLimit: 80,
  });
  return NextResponse.json(context.payload, { status: context.status });
}

export async function POST(request: Request) {
  if (!CHAT_BACKEND_PROXY_MODE) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return proxySyncRequest(request);
}
