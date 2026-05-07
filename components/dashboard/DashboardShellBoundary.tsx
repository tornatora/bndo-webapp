'use client';

import { usePathname } from 'next/navigation';
import { DashboardShellClient } from '@/components/dashboard/DashboardShellClient';
import { GuestDashboardShellClient } from '@/components/dashboard/GuestDashboardShellClient';
import { isPublicDashboardShellPath, routes } from '@/shared/config';

type DashboardShellBoundaryProps = {
  children: React.ReactNode;
  shellProfile: {
    username: string;
    viewerProfileId: string;
  } | null;
};

export function DashboardShellBoundary({ children, shellProfile }: DashboardShellBoundaryProps) {
  const pathname = usePathname();
  const isGuestAvvioPratica = pathname === routes.dashboard.avvioPratica || pathname.startsWith(routes.dashboard.avvioPratica + '?');

  if (!shellProfile) {
    if (isGuestAvvioPratica) {
      return <GuestDashboardShellClient>{children}</GuestDashboardShellClient>;
    }
    return <>{children}</>;
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
