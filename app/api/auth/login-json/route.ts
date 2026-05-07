import { NextRequest, NextResponse } from 'next/server';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp, rejectCrossSiteMutation } from '@/lib/security/http';

function readBody(request: NextRequest) {
  return request.json().catch(() => null) as Promise<{
    identifier?: unknown;
    password?: unknown;
    next?: unknown;
  } | null>;
}

function sanitizeNext(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '/dashboard/pratiche';
  if (!raw.startsWith('/')) return '/dashboard/pratiche';
  if (raw.startsWith('//')) return '/dashboard/pratiche';
  if (raw.includes('://')) return '/dashboard/pratiche';
  return raw;
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;

  const body = await readBody(request);
  const identifier = String(body?.identifier ?? '').trim();
  const password = String(body?.password ?? '');
  const next = sanitizeNext(body?.next);

  if (!identifier || !password) {
    return NextResponse.json({ error: 'Credenziali obbligatorie.' }, { status: 422 });
  }

  const rateLimit = enforceRateLimit({
    namespace: 'auth-login-json',
    key: `${getClientIp(request)}:${identifier.toLowerCase()}`,
    limit: 20,
    windowMs: 60_000,
    message: 'Troppi tentativi. Riprova tra poco.'
  });
  if (rateLimit) return rateLimit;

  const supabaseAdmin = hasRealServiceRoleKey() ? getSupabaseAdmin() : null;
  let email = identifier;

  if (!identifier.includes('@')) {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Inserisci email oppure abilita SERVICE_ROLE per login con username.' }, { status: 422 });
    }
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('username', identifier)
      .maybeSingle();
    if (!profile?.email) {
      return NextResponse.json({ error: 'Username non trovato.' }, { status: 404 });
    }
    email = profile.email;
  }

  const cookieCarrier = NextResponse.next();
  const supabase = createRouteHandlerClient(request, cookieCarrier);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: 'Credenziali non valide.' }, { status: 401 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sessione non disponibile.' }, { status: 500 });
  }

  // Build response with auth cookies copied from carrier
  const { data: signedProfile } = supabaseAdmin
    ? await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

  function jsonOk(data: Record<string, unknown>): NextResponse {
    const res = NextResponse.json({ ok: true, ...data });
    const stored = cookieCarrier.cookies.getAll();
    for (const cookie of stored) {
      try {
        res.cookies.set(cookie.name, cookie.value, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
      } catch {
        // skip
      }
    }
    return res;
  }

  if (signedProfile?.role && hasAdminAccess(signedProfile.role)) {
    return jsonOk({ next: '/admin' });
  }
  if (signedProfile?.role && hasConsultantAccess(signedProfile.role)) {
    return jsonOk({ next: '/consultant' });
  }

  return jsonOk({ next });
}
