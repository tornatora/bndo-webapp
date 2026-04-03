'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { NotificationsBell } from '@/components/dashboard/NotificationsBell';
import { buildLogoutPath, resolveAssistantHomeUrl } from '@/shared/config';
import { MARKETING_URL } from '@/shared/lib';

type ConsultantShellClientProps = {
  children: React.ReactNode;
  username: string;
  viewerProfileId: string;
  showAdminLink?: boolean;
};

type ConsultantItem = {
  key: string;
  label: string;
  href: string;
  icon: 'pratiche' | 'admin';
};

function Icon({ name }: { name: ConsultantItem['icon'] }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'admin') {
    return (
      <svg {...common}>
        <path {...stroke} d="M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4Z" />
        <path {...stroke} d="M9.5 12.5 11.2 14l3.3-3.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path {...stroke} d="M8 4h8M9 4v4h6V4" />
      <path {...stroke} d="M7 7.5h10A3 3 0 0 1 20 10.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8.5a3 3 0 0 1 3-3Z" />
      <path {...stroke} d="M8 12h8M8 15.5h6" />
    </svg>
  );
}

export function ConsultantShellClient({ children, username, viewerProfileId, showAdminLink = false }: ConsultantShellClientProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarUserMenuOpen, setSidebarUserMenuOpen] = useState(false);
  const [topbarUserMenuOpen, setTopbarUserMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const topbarMenuRef = useRef<HTMLDivElement>(null);
  const logoutUrl = buildLogoutPath(resolveAssistantHomeUrl());

  const items: ConsultantItem[] = [
    { key: 'consultant', label: 'Pratiche assegnate', href: '/consultant', icon: 'pratiche' },
    ...(showAdminLink ? [{ key: 'admin', label: 'Vista admin', href: '/admin', icon: 'admin' as const }] : []),
  ];

  const activeKey = pathname?.startsWith('/admin') ? 'admin' : 'consultant';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | any) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setSidebarUserMenuOpen(false);
      }
      if (topbarMenuRef.current && !topbarMenuRef.current.contains(event.target)) {
        setTopbarUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onLogoutIntent = (event: MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('Vuoi effettuare il logout dal tuo account?')) {
      event.preventDefault();
    }
  };

  return (
    <div className={sidebarOpen ? 'bndo-shell with-sidebar sidebar-open dashboard-auth-shell' : 'bndo-shell with-sidebar dashboard-auth-shell'}>
      <aside className={sidebarOpen ? 'sidebar is-open' : 'sidebar'} aria-label="Menu consulente">
        <div className="sidebar-top">
          <button
            type="button"
            className="sidebar-iconbtn"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? 'Chiudi menu' : 'Apri menu'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M10 5.5v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav sidebar-nav-ready" aria-label="Voci consulente">
          {items.map((item) => (
            <Link
              key={item.key}
              className={`sidebar-item ${activeKey === item.key ? 'active' : ''}`}
              href={item.href}
              title={item.label}
            >
              <span className="sidebar-ico" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              {sidebarOpen ? <span className="sidebar-label">{item.label}</span> : <span className="sidebar-tip">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen ? (
            <a className="sidebar-user sidebar-logout-card" href={logoutUrl} onClick={onLogoutIntent}>
              <span className="sidebar-avatar" aria-hidden="true">
                <LogOut size={16} />
              </span>
              <div className="sidebar-user-meta">
                <div className="sidebar-user-name">Logout</div>
                <div className="sidebar-user-sub">Esci dal tuo account</div>
              </div>
            </a>
          ) : (
            <div className="sidebar-user-container" ref={profileMenuRef}>
              <button
                type="button"
                className={`sidebar-user sidebar-user-profile ${sidebarUserMenuOpen ? 'is-active' : ''}`}
                title="Profilo & Logout"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarUserMenuOpen(!sidebarUserMenuOpen);
                }}
              >
                <span className="sidebar-avatar sidebar-avatar-link" aria-hidden="true">
                  {username.charAt(0).toUpperCase()}
                </span>
              </button>
              {sidebarUserMenuOpen ? (
                <div className="sidebar-profile-dropdown">
                  <div className="dropdown-header">@{username}</div>
                  <a href={logoutUrl} className="dropdown-item is-logout" onClick={onLogoutIntent}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>

      <section className="mainpane">
        <header className="topbar">
          <a className="topbar-logo" href={MARKETING_URL} aria-label="BNDO Home">
            <Image src="/Logo-BNDO-header.png" alt="BNDO" width={170} height={44} priority />
          </a>
          <div className="nav-actions">
            <NotificationsBell viewerProfileId={viewerProfileId} />
            <div className="nav-user-container" ref={topbarMenuRef}>
              <button
                type="button"
                className={`nav-user-toggle ${topbarUserMenuOpen ? 'is-active' : ''}`}
                id="userName"
                onClick={(e) => {
                  e.stopPropagation();
                  setTopbarUserMenuOpen(!topbarUserMenuOpen);
                }}
              >
                <span className="nav-user-avatar">{username.charAt(0).toUpperCase()}</span>
                <span className="nav-user-name">@{username}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${topbarUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {topbarUserMenuOpen ? (
                <div className="topbar-profile-dropdown">
                  <div className="dropdown-header">Area consulente</div>
                  <a href={logoutUrl} className="dropdown-item is-logout" onClick={onLogoutIntent}>
                    <LogOut className="h-4 w-4" />
                    Esci (Logout)
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="dashboard-content dashboard-content-client">
          {children}
          <div className="mobile-content-spacer" aria-hidden="true" />
        </main>
      </section>

      <nav className="mobile-tabs" aria-label="Navigazione mobile consulente">
        {items.map((item) => (
          <Link key={item.key} className={`mobile-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href}>
            <span className="mobile-tab-icon" aria-hidden="true">
              <Icon name={item.icon} />
            </span>
            <span className="mobile-tab-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

