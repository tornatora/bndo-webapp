import { NextRequest, NextResponse } from 'next/server';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_URL, APP_URL, buildAbsoluteUrl, hostFromBaseUrl } from '@/lib/site-urls';

function resolveSafeRedirect(target: string | null, fallback: URL, allowedHosts: Set<string>) {
  if (!target) return fallback;

  try {
    const resolved = new URL(target, `${APP_URL}/`);
    if (!allowedHosts.has(resolved.host.toLowerCase())) {
      return fallback;
    }

    return resolved;
  } catch {
    return fallback;
  }
}

function redirectWithError(error: string, mode: 'admin' | 'user' = 'user', next: string | null = null) {
  const url = buildAbsoluteUrl(mode === 'admin' ? ADMIN_URL : APP_URL, '/login');
  url.searchParams.set('error', error);
  if (mode === 'admin') {
    url.searchParams.set('mode', 'admin');
  }
  if (next) {
    url.searchParams.set('next', next);
  }
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const mode = String(formData.get('mode') ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  const nextParam = String(formData.get('next') ?? '').trim() || null;
  const adminDefault = buildAbsoluteUrl(ADMIN_URL, '/admin');
  const allowedHosts = new Set([hostFromBaseUrl(APP_URL), hostFromBaseUrl(ADMIN_URL)]);

  if (!identifier || !password) {
    return redirectWithError('Credenziali obbligatorie', mode, nextParam);
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
      return redirectWithError('Username non trovato', mode, nextParam);
    }

    email = profile.email;
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return redirectWithError('Credenziali non valide', mode, nextParam);
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

    const isOps = Boolean(signedProfile?.role && hasOpsAccess(signedProfile.role));

    if (mode === 'admin') {
      if (isOps) {
        const safeTarget = resolveSafeRedirect(nextParam, adminDefault, allowedHosts);
        return NextResponse.redirect(safeTarget, { status: 303 });
      }

      await supabase.auth.signOut();
      return redirectWithError('Questo account non ha accesso admin', 'admin', adminDefault.toString());
    }

    if (isOps) {
      return NextResponse.redirect(adminDefault, { status: 303 });
    }
  }

  return NextResponse.redirect(buildAbsoluteUrl(APP_URL, '/dashboard'), { status: 303 });
}
