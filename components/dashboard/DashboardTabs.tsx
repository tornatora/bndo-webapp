'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type DashboardNavItem = {
  href: string;
  label: string;
  key: 'pratiche' | 'documenti' | 'messaggi' | 'profilo' | 'notifiche';
};

const NAV_ITEMS: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Le tue pratiche', key: 'pratiche' },
  { href: '/dashboard/documents', label: 'I tuoi documenti', key: 'documenti' },
  { href: '/dashboard/messages', label: 'Messaggi', key: 'messaggi' },
  { href: '/dashboard/profile', label: 'Profilo', key: 'profilo' }
];

const MOBILE_NAV_ITEMS: DashboardNavItem[] = [
  ...NAV_ITEMS,
  { href: '/dashboard/notifications', label: 'Notifiche', key: 'notifiche' }
];

function getActiveKey(pathname: string) {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/tenders')) return 'pratiche';
  if (pathname.startsWith('/dashboard/documents')) return 'documenti';
  if (pathname.startsWith('/dashboard/messages')) return 'messaggi';
  if (pathname.startsWith('/dashboard/notifications')) return 'notifiche';
  if (pathname.startsWith('/dashboard/profile') || pathname.startsWith('/dashboard/password')) return 'profilo';
  return 'pratiche';
}

export function DashboardTabs() {
  const pathname = usePathname();
  const activeKey = getActiveKey(pathname);

  return (
    <>
      <nav className="main-tabs" aria-label="Navigazione dashboard">
        <div className="main-tabs-container">
          {NAV_ITEMS.map((item) => (
            <Link key={item.key} className={`main-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href}>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <nav className="mobile-tabs" aria-label="Navigazione mobile dashboard">
        {MOBILE_NAV_ITEMS.map((item) => (
          <Link key={item.key} className={`mobile-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href}>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
