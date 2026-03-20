import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { APP_URL, buildAbsoluteUrl } from '@/lib/site-urls';

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/login';

  if (redirectTo.startsWith('http://') || redirectTo.startsWith('https://')) {
    return NextResponse.redirect(redirectTo, { status: 303 });
  }

  const requestHost = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
  
  const isPreview =
    requestHost.endsWith('.netlify.app') ||
    requestHost.startsWith('localhost') ||
    requestHost.startsWith('127.0.0.1');

  const targetBaseUrl = isPreview ? request.nextUrl.origin : APP_URL;

  return NextResponse.redirect(buildAbsoluteUrl(targetBaseUrl, redirectTo), { status: 303 });
}
