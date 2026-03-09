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

  return NextResponse.redirect(buildAbsoluteUrl(APP_URL, redirectTo), { status: 303 });
}
