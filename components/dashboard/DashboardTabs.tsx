'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  buildLogoutPath,
  getDashboardShellItems,
  resolveAssistantHomeUrl,
  resolveDashboardNavKey,
  type DashboardShellItem,
} from '@/shared/config';

function DashboardIcon({ name }: { name: DashboardShellItem['icon'] }) {
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
  if (name === 'catalogo_bandi') {
    return (
      <svg {...common}>
        <path
          {...stroke}
          d="M12 20s-6.5-3.9-8.4-7.6C2.2 9.9 3.3 7 5.9 6.2A4.7 4.7 0 0 1 12 8.4a4.7 4.7 0 0 1 6.1-2.2c2.6.8 3.7 3.7 2.3 6.2C18.5 16.1 12 20 12 20Z"
        />
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

export function DashboardTabs() {
  const pathname = usePathname();
  const activeKey = resolveDashboardNavKey(pathname);
  const [open, setOpen] = useState(true);
  const items = useMemo<DashboardShellItem[]>(() => getDashboardShellItems(), []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('bndo-dashboard-sidebar-open') : null;
    if (saved === '0') setOpen(false);
    if (saved === '1') setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('bndo-dashboard-sidebar-open', open ? '1' : '0');
  }, [open]);

  return (
    <>
      <nav className={`dashboard-sidebar-np2 ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Navigazione dashboard">
        <div className="dashboard-sidebar-np2-top">
          <button
            type="button"
            className="dashboard-sidebar-np2-toggle"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? 'Chiudi menu' : 'Apri menu'}
            title={open ? 'Chiudi menu' : 'Apri menu'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3.5" y="4.5" width="17" height="15" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M10 5.5v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="dashboard-sidebar-np2-nav">
          {items.map((item) =>
            item.key === 'home' ? (
              <a key={item.key} className="dashboard-sidebar-np2-link" href={item.href} title={item.label}>
                <span className="dashboard-sidebar-np2-icon" aria-hidden="true">
                  <DashboardIcon name={item.icon} />
                </span>
                <span className="dashboard-sidebar-np2-label">{item.label}</span>
              </a>
            ) : (
              <Link
                key={item.key}
                className={`dashboard-sidebar-np2-link ${activeKey === item.key ? 'active' : ''}`}
                href={item.href}
                title={item.label}
              >
                <span className="dashboard-sidebar-np2-icon" aria-hidden="true">
                  <DashboardIcon name={item.icon} />
                </span>
                <span className="dashboard-sidebar-np2-label">{item.label}</span>
              </Link>
            )
          )}
        </div>

        <div className="dashboard-sidebar-np2-bottom">
          <a className="dashboard-sidebar-np2-assistant" href={resolveAssistantHomeUrl()} title="Torna alla chat">
            <span className="dashboard-sidebar-np2-avatar">B</span>
            <span className="dashboard-sidebar-np2-copy">
              <span className="dashboard-sidebar-np2-title">BNDO Assistant</span>
              <span className="dashboard-sidebar-np2-sub">Torna alla chat</span>
            </span>
          </a>
          <a className="dashboard-sidebar-np2-logout" href={buildLogoutPath('/login')}>
            Logout
          </a>
        </div>
      </nav>

      <nav className="mobile-tabs" aria-label="Navigazione mobile dashboard">
        {items.map((item) =>
          item.key === 'home' ? (
            <a key={item.key} className="mobile-tab" href={item.href}>
              <span className="mobile-tab-icon" aria-hidden="true">
                <DashboardIcon name={item.icon} />
              </span>
              <span className="mobile-tab-label">{item.label}</span>
            </a>
          ) : (
            <Link key={item.key} className={`mobile-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href}>
              <span className="mobile-tab-icon" aria-hidden="true">
                <DashboardIcon name={item.icon} />
              </span>
              <span className="mobile-tab-label">{item.label}</span>
            </Link>
          )
        )}
      </nav>
    </>
  );
}
