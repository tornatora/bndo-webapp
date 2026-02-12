import { NextRequest, NextResponse } from 'next/server';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_URL, APP_URL, buildAbsoluteUrl } from '@/lib/site-urls';

function redirectWithError(error: string) {
  const url = buildAbsoluteUrl(APP_URL, '/login');
  url.searchParams.set('error', error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!identifier || !password) {
    return redirectWithError('Credenziali obbligatorie');
  }

  const supabaseAdmin = getSupabaseAdmin();
  let email = identifier;

  if (!identifier.includes('@')) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('username', identifier)
      .maybeSingle();

    if (!profile?.email) {
      return redirectWithError('Username non trovato');
    }

    email = profile.email;
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return redirectWithError('Credenziali non valide');
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const { data: signedProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (signedProfile?.role && hasOpsAccess(signedProfile.role)) {
      return NextResponse.redirect(buildAbsoluteUrl(ADMIN_URL, '/admin'), { status: 303 });
    }
  }

  return NextResponse.redirect(buildAbsoluteUrl(APP_URL, '/dashboard'), { status: 303 });
}
