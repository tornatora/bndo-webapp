'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, type MouseEvent } from 'react';
import { NotificationsBell } from '@/components/dashboard/NotificationsBell';
import {
  buildLogoutPath,
  getDashboardShellItems,
  resolveAssistantHomeUrl,
  resolveDashboardNavKey,
  type DashboardShellItem,
} from '@/shared/config';
import { MARKETING_URL } from '@/shared/lib';

type DashboardShellClientProps = {
  children: React.ReactNode;
  username: string;
  viewerProfileId: string;
};

function Icon({ name }: { name: DashboardShellItem['icon'] }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (name === 'home') {
    return (
      <svg {...common}>
        <path {...stroke} d="M4 10.5 12 4l8 6.5" />
        <path {...stroke} d="M6.5 10.5V20h11V10.5" />
      </svg>
    );
  }
  if (name === 'pratiche') {
    return (
      <svg {...common}>
        <path {...stroke} d="M8 4h8M9 4v4h6V4" />
        <path {...stroke} d="M7 7.5h10A3 3 0 0 1 20 10.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8.5a3 3 0 0 1 3-3Z" />
        <path {...stroke} d="M8 12h8M8 15.5h6" />
      </svg>
    );
  }
  if (name === 'documenti') {
    return (
      <svg {...common}>
        <path {...stroke} d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 20V5A1.5 1.5 0 0 1 8.5 3.5Z" />
        <path {...stroke} d="M14 3.5v4h4" />
        <path {...stroke} d="M10 12h6M10 15h6" />
      </svg>
    );
  }
  if (name === 'messaggi') {
    return (
      <svg {...common}>
        <path {...stroke} d="M7 18l-3 3V6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v7A3.5 3.5 0 0 1 16.5 17H7Z" />
        <path {...stroke} d="M8 8h8M8 11.5h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path {...stroke} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path {...stroke} d="M4.5 21a7.5 7.5 0 1 1 15 0" />
    </svg>
  );
}

export function DashboardShellClient({ children, username, viewerProfileId }: DashboardShellClientProps) {
  const pathname = usePathname();
  const activeKey = resolveDashboardNavKey(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const logoutUrl = buildLogoutPath(resolveAssistantHomeUrl());

  const items = useMemo<DashboardShellItem[]>(() => getDashboardShellItems(), []);

  const onLogoutIntent = (event: MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm('Vuoi effettuare il logout dal tuo account?');
    if (!ok) {
      event.preventDefault();
    }
  };

  return (
    <div className={sidebarOpen ? 'bndo-shell with-sidebar sidebar-open dashboard-auth-shell' : 'bndo-shell with-sidebar dashboard-auth-shell'}>
      <aside className={sidebarOpen ? 'sidebar is-open' : 'sidebar'} aria-label="Menu dashboard">
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

        <nav className="sidebar-nav" aria-label="Voci dashboard">
          {items.map((item) =>
            item.external ? (
              <a key={item.key} className="sidebar-item" href={item.href} title={item.label}>
                <span className="sidebar-ico" aria-hidden="true">
                  <Icon name={item.icon} />
                </span>
                {sidebarOpen ? (
                  <span className="sidebar-label">{item.label}</span>
                ) : (
                  <span className="sidebar-tip" aria-hidden="true">
                    {item.label}
                  </span>
                )}
              </a>
            ) : (
              <Link
                key={item.key}
                className={`sidebar-item ${activeKey === item.key ? 'active' : ''}`}
                href={item.href}
                title={item.label}
              >
                <span className="sidebar-ico" aria-hidden="true">
                  <Icon name={item.icon} />
                </span>
                {sidebarOpen ? (
                  <span className="sidebar-label">{item.label}</span>
                ) : (
                  <span className="sidebar-tip" aria-hidden="true">
                    {item.label}
                  </span>
                )}
              </Link>
            )
          )}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen ? (
            <>
              <Link className="sidebar-user sidebar-user-open sidebar-user-profile" href="/dashboard/profile" title="Apri profilo">
                <span className="sidebar-avatar" aria-hidden="true">
                  B
                </span>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">@{username}</div>
                  <div className="sidebar-user-sub">Utente</div>
                </div>
              </Link>
              <a className="sidebar-logout-box" href={logoutUrl} onClick={onLogoutIntent}>
                Logout
              </a>
            </>
          ) : (
            <Link className="sidebar-user sidebar-user-profile" href="/dashboard/profile" title="Apri profilo">
              <span className="sidebar-avatar sidebar-avatar-link" data-tip="Profilo" aria-hidden="true">
                B
              </span>
            </Link>
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
            <span className="nav-user" id="userName">
              @{username}
            </span>
          </div>
        </header>

        <main className="dashboard-content dashboard-content-client">
          {children}
          <div className="mobile-content-spacer" aria-hidden="true" />
        </main>
      </section>

      <nav className="mobile-tabs" aria-label="Navigazione mobile dashboard">
        {items.map((item) =>
          item.external ? (
            <a key={item.key} className="mobile-tab" href={item.href}>
              <span className="mobile-tab-icon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              <span className="mobile-tab-label">{item.label}</span>
            </a>
          ) : (
            <Link key={item.key} className={`mobile-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href}>
              <span className="mobile-tab-icon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              <span className="mobile-tab-label">{item.label}</span>
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
