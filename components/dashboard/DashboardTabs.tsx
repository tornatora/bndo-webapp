'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type DashboardNavItem = {
  href: string;
  label: string;
  icon: string;
  key: 'pratiche' | 'documenti' | 'messaggi' | 'profilo';
};

const NAV_ITEMS: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Pratiche', icon: '📋', key: 'pratiche' },
  { href: '/dashboard/documents', label: 'Documenti', icon: '📄', key: 'documenti' },
  { href: '/dashboard/messages', label: 'Messaggi', icon: '💬', key: 'messaggi' },
  { href: '/dashboard/profile', label: 'Profilo', icon: '👤', key: 'profilo' }
];

function getActiveKey(pathname: string) {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/tenders')) return 'pratiche';
  if (pathname.startsWith('/dashboard/documents')) return 'documenti';
  if (pathname.startsWith('/dashboard/messages')) return 'messaggi';
  if (pathname.startsWith('/dashboard/profile') || pathname.startsWith('/dashboard/password')) return 'profilo';
  return 'pratiche';
}

export function DashboardTabs() {
  const pathname = usePathname();
  const activeKey = getActiveKey(pathname);

  return (
    <nav className="main-tabs" aria-label="Navigazione dashboard">
      <div className="main-tabs-container">
        {NAV_ITEMS.map((item) => (
          <Link key={item.key} className={`main-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
