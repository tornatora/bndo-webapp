import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email: string = (body.email || '').trim().toLowerCase();
    const password: string = body.password || '';
    const nome: string = (body.nome || '').trim();
    const quizId: string = (body.quiz_id || '').trim();
    const plan: string = (body.plan || '').trim();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e password obbligatorie.' }, { status: 422 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La password deve essere di almeno 8 caratteri.' }, { status: 422 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile?.id) {
      return NextResponse.json({ error: 'Un account con questa email esiste già. Effettua il login.' }, { status: 409 });
    }

    const fullName = nome || email.split('@')[0];
    const username = slugify(fullName).slice(0, 18) || `user-${Math.random().toString(36).slice(2, 8)}`;

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        username,
        source: 'quiz',
        quiz_submission_id: quizId || null,
      },
    });

    if (authError) {
      console.error('create-from-quiz auth error:', authError);
      if (authError.message?.toLowerCase().includes('already registered')) {
        return NextResponse.json({ error: 'Un account con questa email esiste già.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Errore creazione account.' }, { status: 500 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Errore creazione utente.' }, { status: 500 });
    }

    // Create company
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({ name: `${fullName} - Bando` })
      .select('id')
      .single();

    if (companyError) {
      console.error('create-from-quiz company error:', companyError);
      // Try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return NextResponse.json({ error: 'Errore creazione profilo.' }, { status: 500 });
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authData.user.id,
      company_id: company.id,
      email,
      full_name: fullName,
      username,
      role: 'client_admin',
    });

    if (profileError) {
      console.error('create-from-quiz profile error:', profileError);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return NextResponse.json({ error: 'Errore creazione profilo.' }, { status: 500 });
    }

    // Sign the user in (cookie carrier pattern)
    const cookieCarrier = NextResponse.next();
    const supabase = createRouteHandlerClient(request, cookieCarrier);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      console.error('create-from-quiz signIn error:', signInError);
      // User created but sign-in failed — they can still login manually
      return NextResponse.json({
        ok: true,
        warning: 'Account creato ma accesso automatico non riuscito. Effettua il login manualmente.',
        username,
        needsManualLogin: true,
      });
    }

    // Build response with auth cookies
    const res = NextResponse.json({
      ok: true,
      username,
      userId: authData.user.id,
    });

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
  } catch (err) {
    console.error('create-from-quiz error:', err);
    return NextResponse.json({ error: 'Errore server.' }, { status: 500 });
  }
}
