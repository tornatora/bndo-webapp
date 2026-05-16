import { redirect } from 'next/navigation';
import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { AdminShellClient } from '@/components/admin/AdminShellClient';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Auth check — guaranteed to never throw
  let profileBundle = null;
  try {
    profileBundle = await getOptionalUserProfile();
  } catch {
    // If it throws, redirect to login
    redirect('/login?mode=admin&error=Errore%20autenticazione');
    return;
  }

  if (!profileBundle) {
    redirect('/login?mode=admin&error=Utente%20non%20autenticato');
    return;
  }

  const { profile } = profileBundle;
  if (!hasAdminAccess(profile.role)) {
    redirect('/dashboard/pratiche');
    return;
  }

  const username = String(profile.full_name ?? '').toLowerCase().replace(/\s+/g, '') || 'admin';

  return (
    <AdminShellClient username={username} viewerProfileId={profile.id}>
      {children}
    </AdminShellClient>
  );
}
