import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_URL, APP_URL, MARKETING_URL, hostFromBaseUrl } from '@/lib/site-urls';

function resolveAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const allowedHosts = new Set([hostFromBaseUrl(APP_URL), hostFromBaseUrl(MARKETING_URL), hostFromBaseUrl(ADMIN_URL)]);
    if (
      originHost === 'localhost:3000' ||
      originHost === '127.0.0.1:3000' ||
      originHost === 'localhost:3200' ||
      originHost === '127.0.0.1:3200' ||
      originHost === 'localhost:3300' ||
      originHost === '127.0.0.1:3300' ||
      originHost === 'localhost:3400' ||
      originHost === '127.0.0.1:3400'
    ) {
      allowedHosts.add(originHost);
    }

    return allowedHosts.has(originHost) ? origin : null;
  } catch {
    return null;
  }
}

function withCors(response: NextResponse, origin: string | null) {
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

export async function OPTIONS(request: NextRequest) {
  const origin = resolveAllowedOrigin(request);
  return withCors(new NextResponse(null, { status: 204 }), origin);
}

export async function GET(request: NextRequest) {
  const origin = resolveAllowedOrigin(request);
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return withCors(
    NextResponse.json({
      authenticated: Boolean(user),
      email: user?.email ?? null
    }),
    origin
  );
}
