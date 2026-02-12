'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type TabItem = {
  href: string;
  key: 'pratiche' | 'documenti' | 'messaggi' | 'password';
  icon: string;
  label: string;
};

const TABS: TabItem[] = [
  { href: '/dashboard#pratiche', key: 'pratiche', icon: '📋', label: 'Pratiche' },
  { href: '/dashboard#documenti', key: 'documenti', icon: '📄', label: 'Documenti' },
  { href: '/dashboard#messaggi', key: 'messaggi', icon: '💬', label: 'Messaggi' },
  { href: '/dashboard/password', key: 'password', icon: '🔐', label: 'Password' }
];

export function DashboardTabs() {
  const pathname = usePathname();
  const [activeHash, setActiveHash] = useState('pratiche');

  function activatePanel(tabKey: string) {
    if (typeof window === 'undefined') return;
    const panels = document.querySelectorAll<HTMLElement>('.tab-panel');
    panels.forEach((panel) => panel.classList.remove('active'));

    const target = document.getElementById(`tab-${tabKey}`) ?? document.getElementById('tab-pratiche');
    target?.classList.add('active');
  }

  useEffect(() => {
    if (pathname !== '/dashboard') {
      setActiveHash(pathname === '/dashboard/password' ? 'password' : 'pratiche');
      return;
    }

    const syncHash = () => {
      const hash = window.location.hash.replace('#', '').trim();
      const safeHash = hash === 'documenti' || hash === 'messaggi' || hash === 'pratiche' ? hash : 'pratiche';
      setActiveHash(safeHash);
      activatePanel(safeHash);
    };

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => {
      window.removeEventListener('hashchange', syncHash);
    };
  }, [pathname]);

  return (
    <nav className="main-tabs">
      <div className="main-tabs-container">
        {TABS.map((tab) => {
          const isActive =
            tab.key === 'password'
              ? pathname === '/dashboard/password'
              : pathname === '/dashboard' && activeHash === tab.key;

          return (
            <Link key={tab.key} className={`main-tab ${isActive ? 'active' : ''}`} href={tab.href}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
