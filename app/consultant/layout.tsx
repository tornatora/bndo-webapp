import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { ConsultantShellClient } from '@/components/consultant/ConsultantShellClient';

export default async function ConsultantLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOpsOrConsultantProfile();
  const emailLocalPart = String(profile.email ?? '')
    .split('@')[0]
    ?.trim();
  const usernameBase = (profile.username ?? emailLocalPart ?? profile.full_name ?? 'consulente').trim();
  const shellUsername = usernameBase.replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();

  return (
    <ConsultantShellClient
      username={shellUsername}
      viewerProfileId={profile.id}
      showAdminLink={profile.role === 'ops_admin'}
    >
      {children}
    </ConsultantShellClient>
  );
}
