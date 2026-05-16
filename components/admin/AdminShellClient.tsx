'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useRef, useEffect, memo, type MouseEvent } from 'react';
import { LogOut, Bell } from 'lucide-react';
import { routes, buildLogoutPath, resolveAssistantHomeUrl } from '@/shared/config';
import { MARKETING_URL } from '@/shared/lib';

type AdminNavKey =
  | 'control_tower'
  | 'clients'
  | 'consultants'
  | 'assignments'
  | 'finance'
  | 'chat_log'
  | 'visits'
  | 'notifications'
  | 'quiz'
  | 'audit';

type AdminNavItem = {
  key: AdminNavKey;
  label: string;
  href: string;
};

type AdminShellClientProps = {
  children: React.ReactNode;
  username: string;
  viewerProfileId: string;
};

/* ── Admin nav items ── */
const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: 'control_tower', label: 'Torre di Controllo', href: routes.admin.root },
  { key: 'clients', label: 'Clienti', href: routes.admin.clients },
  { key: 'consultants', label: 'Consulenti', href: routes.admin.consultants },
  { key: 'assignments', label: 'Assegnazioni', href: routes.admin.assignments },
  { key: 'finance', label: 'Finanza', href: routes.admin.finance },
  { key: 'chat_log', label: 'Chat Log', href: routes.admin.chatLog },
  { key: 'visits', label: 'Visite & Traffico', href: routes.admin.visits },
  { key: 'notifications', label: 'Notifiche', href: routes.admin.notifications },
  { key: 'quiz', label: 'Risposte Quiz', href: routes.admin.quizResponses },
  { key: 'audit', label: 'Audit', href: routes.admin.audit },
];

/* ── Admin nav key resolver ── */
function resolveAdminNavKey(pathname: string): AdminNavKey {
  const p = pathname.replace(/\/+$/, '') || '/';
  for (const item of ADMIN_NAV_ITEMS) {
    if (p === item.href || p.startsWith(item.href + '/')) return item.key;
  }
  return 'control_tower';
}

/* ── Icon component ── */
const AdminIcon = memo(function AdminIcon({ name }: { name: AdminNavKey }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const s = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (name === 'control_tower') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" {...s} />
        <path {...s} d="M8 10v4M12 8v6M16 12v2" />
        <path {...s} d="M3 16h18" />
      </svg>
    );
  }
  if (name === 'clients') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.5" {...s} />
        <path {...s} d="M3 21c0-3.5 2.5-6 6-6s6 2.5 6 6" />
        <path {...s} d="M15.5 7.5a3.5 3.5 0 0 1 0 7" strokeWidth="1.8" />
        <path {...s} d="M19 21c0-2.5-1.5-4.5-3.5-5.5" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === 'consultants') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.5" {...s} />
        <path {...s} d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
        <path {...s} d="M12 14v4M10 16h4" />
      </svg>
    );
  }
  if (name === 'assignments') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" {...s} />
        <path {...s} d="M8 8h8M8 12h8M8 16h4" />
      </svg>
    );
  }
  if (name === 'finance') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" {...s} />
        <path {...s} d="M12 7v10M8 10.5h5.5a2 2 0 0 1 0 4H8" />
      </svg>
    );
  }
  if (name === 'chat_log') {
    return (
      <svg {...common}>
        <path {...s} d="M7 18l-3 3V6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v7A3.5 3.5 0 0 1 16.5 17H7Z" />
        <path {...s} d="M8 8h8M8 11.5h6" />
      </svg>
    );
  }
  if (name === 'visits') {
    return (
      <svg {...common}>
        <path {...s} d="M3 12h3l2-5 3 8 2-4 2 4h6" />
        <path {...s} d="M3 3v18h18" />
      </svg>
    );
  }
  if (name === 'notifications') {
    return (
      <svg {...common}>
        <path {...s} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path {...s} d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }
  if (name === 'quiz') {
    return (
      <svg {...common}>
        <rect x="4" y="2" width="16" height="20" rx="2" {...s} />
        <path {...s} d="M8 7h8M8 11h8M8 15h5" />
        <circle cx="16" cy="17" r="2" fill="currentColor" />
      </svg>
    );
  }
  if (name === 'audit') {
    return (
      <svg {...common}>
        <path {...s} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path {...s} d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" {...s} />
      <path {...s} d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
});

export function AdminShellClient({ children, username, viewerProfileId }: AdminShellClientProps) {
  const pathname = usePathname();
  const activeKey = resolveAdminNavKey(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarUserMenuOpen, setSidebarUserMenuOpen] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const logoutUrl = buildLogoutPath(resolveAssistantHomeUrl());

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setNavReady(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setSidebarUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onLogoutIntent = (event: MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm('Vuoi effettuare il logout?');
    if (!ok) event.preventDefault();
  };

  const rootShellClass = `bndo-shell with-sidebar dashboard-auth-shell admin-shell${
    sidebarOpen ? ' sidebar-open' : ''
  }`;

  return (
    <div className={rootShellClass}>
      {/* ── Sidebar ── */}
      <aside className={sidebarOpen ? 'sidebar is-open' : 'sidebar'} aria-label="Menu admin">
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
          <div className="sidebar-chip">Admin</div>
        </div>

        <nav
          className={navReady ? 'sidebar-nav sidebar-nav-ready' : 'sidebar-nav sidebar-nav-boot'}
          aria-label="Voci admin"
        >
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              className={`sidebar-item ${activeKey === item.key ? 'active' : ''}`}
              href={item.href}
              title={item.label}
            >
              <span className="sidebar-ico" aria-hidden="true">
                <AdminIcon name={item.key} />
              </span>
              {sidebarOpen ? (
                <span className="sidebar-label">{item.label}</span>
              ) : (
                <span className="sidebar-tip" aria-hidden="true">
                  {item.label}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen ? (
            <>
              <div className="sidebar-user sidebar-user-open">
                <span className="sidebar-avatar" aria-hidden="true" style={{ background: '#0acf83', color: '#0B1136' }}>
                  {username.charAt(0).toUpperCase()}
                </span>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">@{username}</div>
                </div>
              </div>
              <a className="sidebar-user sidebar-logout-card" href={logoutUrl} onClick={onLogoutIntent}>
                <span className="sidebar-avatar" aria-hidden="true">
                  <LogOut size={16} />
                </span>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">Logout</div>
                  <div className="sidebar-user-sub">Esci</div>
                </div>
              </a>
            </>
          ) : (
            <div className="sidebar-user-container" ref={profileMenuRef}>
              <button
                type="button"
                className={`sidebar-user sidebar-user-profile ${sidebarUserMenuOpen ? 'is-active' : ''}`}
                title="Profilo & Logout"
                onClick={() => setSidebarUserMenuOpen(!sidebarUserMenuOpen)}
              >
                <span className="sidebar-avatar sidebar-avatar-link" aria-hidden="true" style={{ background: '#0acf83', color: '#0B1136' }}>
                  {username.charAt(0).toUpperCase()}
                </span>
                {!sidebarUserMenuOpen && (
                  <div className="sidebar-hover-logout">
                    <a href={logoutUrl} onClick={onLogoutIntent} className="hover-logout-btn" title="Logout">
                      <LogOut size={14} />
                    </a>
                  </div>
                )}
              </button>
              {sidebarUserMenuOpen && (
                <div className="sidebar-profile-dropdown">
                  <div className="dropdown-header">@{username}</div>
                  <a href={logoutUrl} className="dropdown-item is-logout" onClick={(e) => { setSidebarUserMenuOpen(false); onLogoutIntent(e); }}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main pane ── */}
      <section className="mainpane">
        <header className="topbar">
          <a className="topbar-logo" href={MARKETING_URL} aria-label="BNDO Home">
            <Image src="/Logo-BNDO-header.png" alt="BNDO" width={170} height={44} priority />
          </a>
          <div className="nav-actions">
            <Link href={routes.admin.notifications} className="admin-topbar-btn" title="Notifiche">
              <Bell size={18} />
            </Link>
            <span className="nav-user" id="admin-user-name" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(11,17,54,0.6)' }}>
              @{username}
            </span>
            <a href={logoutUrl} onClick={onLogoutIntent} className="admin-topbar-btn" title="Logout">
              <LogOut size={16} />
            </a>
          </div>
        </header>

        <main className="dashboard-content admin-dashboard-content">
          {children}
        </main>
      </section>

      <style>{`
        .admin-shell .sidebar-chip {
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(255,255,255,0.3);
          padding: 0 16px;
          margin-top: 8px;
        }
        .admin-shell .sidebar-nav {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px 0;
        }
        .admin-shell .sidebar-nav .sidebar-item {
          font-size: 12px;
          transition: all 0.15s;
        }
        .admin-topbar-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          color: rgba(11,17,54,0.5);
          transition: all 0.15s;
          text-decoration: none;
        }
        .admin-topbar-btn:hover {
          background: rgba(11,17,54,0.06);
          color: var(--navy);
        }
      `}</style>
    </div>
  );
}
