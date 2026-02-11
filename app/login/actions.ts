'use server';

import { redirect } from 'next/navigation';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function loginAction(formData: FormData) {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!identifier || !password) {
    redirect('/login?error=Credenziali%20obbligatorie');
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
      redirect('/login?error=Username%20non%20trovato');
    }

    email = profile.email;
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=Credenziali%20non%20valide');
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
      redirect('/admin');
    }
  }

  redirect('/dashboard');
}
