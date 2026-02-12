'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

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

  function handleSelectTab(tabKey: 'pratiche' | 'documenti' | 'messaggi') {
    if (pathname !== '/dashboard' || typeof window === 'undefined') return;
    setActiveHash(tabKey);
    activatePanel(tabKey);

    const nextHash = `#${tabKey}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${nextHash}`);
    }
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
        <button
          type="button"
          className={`main-tab ${pathname === '/dashboard' && activeHash === 'pratiche' ? 'active' : ''}`}
          onClick={() => handleSelectTab('pratiche')}
        >
          <span>📋</span>
          <span>Pratiche</span>
        </button>

        <button
          type="button"
          className={`main-tab ${pathname === '/dashboard' && activeHash === 'documenti' ? 'active' : ''}`}
          onClick={() => handleSelectTab('documenti')}
        >
          <span>📄</span>
          <span>Documenti</span>
        </button>

        <button
          type="button"
          className={`main-tab ${pathname === '/dashboard' && activeHash === 'messaggi' ? 'active' : ''}`}
          onClick={() => handleSelectTab('messaggi')}
        >
          <span>💬</span>
          <span>Messaggi</span>
        </button>

        <Link className={`main-tab ${pathname === '/dashboard/password' ? 'active' : ''}`} href="/dashboard/password">
          <span>🔐</span>
          <span>Password</span>
        </Link>
      </div>
    </nav>
  );
}
