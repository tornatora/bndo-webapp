'use client';

import { usePathname } from 'next/navigation';
import { AtomicPageLoader } from '@/components/dashboard/AtomicPageLoader';
import { resolveDashboardLoaderWord } from '@/shared/config';

export function DashboardRouteLoadingState() {
  const pathname = usePathname() ?? '/dashboard';
  return <AtomicPageLoader title="Sto caricando" targetWord={resolveDashboardLoaderWord(pathname)} strictTargetWord />;
}
