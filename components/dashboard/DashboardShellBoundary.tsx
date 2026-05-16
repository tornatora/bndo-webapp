'use client';

import { usePathname } from 'next/navigation';
import { DashboardShellClient } from '@/components/dashboard/DashboardShellClient';
import { GuestDashboardShellClient } from '@/components/dashboard/GuestDashboardShellClient';
import { isPublicDashboardShellPath } from '@/shared/config';

type DashboardShellBoundaryProps = {
  children: React.ReactNode;
  shellProfile: {
    username: string;
    viewerProfileId: string;
  } | null;
};

export function DashboardShellBoundary({ children, shellProfile }: DashboardShellBoundaryProps) {
  const pathname = usePathname();
  if (!shellProfile) {
    return <GuestDashboardShellClient>{children}</GuestDashboardShellClient>;
  }

  if (isPublicDashboardShellPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <DashboardShellClient username={shellProfile.username} viewerProfileId={shellProfile.viewerProfileId}>
      {children}
    </DashboardShellClient>
  );
}
