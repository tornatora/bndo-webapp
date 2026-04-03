import { redirect } from 'next/navigation';
import { cache } from 'react';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';
import { ADMIN_URL } from '@/lib/site-urls';
import { createClient } from '@/lib/supabase/server';

export const getOptionalUserProfile = cache(async () => {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, username, email, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) {
    return null;
  }

  return { user, profile };
});

export const requireUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return user;
});

export const requireUserProfile = cache(async () => {
  const profileBundle = await getOptionalUserProfile();
  if (!profileBundle) {
    redirect('/api/auth/logout?redirect=/login?error=profile_not_found');
  }

  return profileBundle;
});

export async function requireOpsProfile() {
  const { user, profile } = await requireUserProfile();

  if (!hasAdminAccess(profile.role)) {
    const logoutUrl = new URL('/api/auth/logout', `${ADMIN_URL}/`);
    logoutUrl.searchParams.set('redirect', '/login?mode=admin&error=Serve un account admin');
    redirect(logoutUrl.toString());
  }

  return { user, profile };
}

export async function requireConsultantProfile() {
  const { user, profile } = await requireUserProfile();
  if (!hasConsultantAccess(profile.role)) {
    redirect('/login?error=Serve%20un%20account%20consulente');
  }
  return { user, profile };
}

export async function requireOpsOrConsultantProfile() {
  const { user, profile } = await requireUserProfile();
  if (!hasAdminAccess(profile.role) && !hasConsultantAccess(profile.role)) {
    redirect('/login?error=Accesso%20non%20consentito');
  }
  return { user, profile };
}
