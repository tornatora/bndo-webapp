import { getOptionalUserProfile } from '@/shared/api';
import { DashboardShellBoundary } from '@/shared/layouts';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profileBundle = await getOptionalUserProfile();

  return (
    <DashboardShellBoundary
      shellProfile={
        profileBundle
          ? {
              username: profileBundle.profile.username,
              viewerProfileId: profileBundle.profile.id,
            }
          : null
      }
    >
      {children}
    </DashboardShellBoundary>
  );
}
