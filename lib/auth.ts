import { redirect } from 'next/navigation';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

export async function requireUserProfile() {
  const user = await requireUser();
  const supabase = createClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    redirect('/api/auth/logout?redirect=/login?error=profile_not_found');
  }

  return { user, profile };
}

export async function requireOpsProfile() {
  const { user, profile } = await requireUserProfile();

  if (!hasOpsAccess(profile.role)) {
    redirect('/dashboard?error=access_denied');
  }

  return { user, profile };
}
