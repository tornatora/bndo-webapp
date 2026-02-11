import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/login';
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
