'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveAppAuthOrigin } from '@/shared/config';

type NavItem = {
  id: string;
  label: string;
  icon: 'home' | 'chat' | 'search' | 'practice';
  onClick?: () => void;
};

function Icon({ name }: { name: NavItem['icon'] }) {
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
  if (name === 'chat') {
    return (
      <svg {...common}>
        <path {...stroke} d="M7 18l-3 3V6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v7A3.5 3.5 0 0 1 16.5 17H7Z" />
        <path {...stroke} d="M8 8h8M8 11.5h6" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg {...common}>
        <path {...stroke} d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
        <path {...stroke} d="M16.5 16.5 21 21" />
      </svg>
    );
  }
  if (name === 'practice') {
    return (
      <svg {...common}>
        <path {...stroke} d="M8 4h8M9 4v4h6V4" />
        <path {...stroke} d="M7 7.5h10A3 3 0 0 1 20 10.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8.5a3 3 0 0 1 3-3Z" />
        <path {...stroke} d="M8 12h8M8 15.5h6" />
      </svg>
    );
  }
  return null;
}

type AuthState = 'loading' | 'guest' | 'authenticated';

type SessionPayload = {
  authenticated?: boolean;
  email?: string | null;
};

export function Sidebar({
  open,
  onToggle,
  onNewChat,
  items,
  recent
}: {
  open: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  items?: NavItem[];
  recent?: Array<{ id: string; label: string; onClick?: () => void }>;
}) {
  const [authState, setAuthState] = useState<AuthState>('guest');
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState('https://bndo.it/');
  const authAppOrigin = resolveAppAuthOrigin();

  useEffect(() => {
    setRedirectTarget(`${window.location.origin}/`);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const readSession = async () => {
      try {
        const response = await fetch(`${authAppOrigin}/api/auth/session`, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
          headers: {
            Accept: 'application/json'
          }
        });

        if (!response.ok) {
          if (active) setAuthState('guest');
          return;
        }

        const json = (await response.json()) as SessionPayload;
        if (active) {
          setAuthState(json.authenticated ? 'authenticated' : 'guest');
          setAuthEmail(json.authenticated ? json.email ?? null : null);
        }
      } catch {
        if (active) {
          setAuthState('guest');
          setAuthEmail(null);
        }
      }
    };

    void readSession();

    return () => {
      active = false;
      controller.abort();
    };
  }, [authAppOrigin]);

  const topItems = useMemo<NavItem[]>(
    () =>
      items ?? [
        { id: 'chat', label: 'Chat', icon: 'chat', onClick: onNewChat },
        { id: 'search', label: 'Cerca', icon: 'search' }
      ],
    [items, onNewChat]
  );

  const recents = recent ?? [];
  const guestCard = authState !== 'authenticated';
  const loginUrl = `${authAppOrigin}/login`;
  const dashboardUrl = `${authAppOrigin}/dashboard`;
  const logoutUrl = `${authAppOrigin}/api/auth/logout?redirect=${encodeURIComponent(redirectTarget)}`;
  const collapsedActionUrl = authState === 'authenticated' ? dashboardUrl : loginUrl;

  const onItemClick = (it: NavItem) => {
    it.onClick?.();
  };

  return (
    <aside className={open ? 'sidebar is-open' : 'sidebar'} aria-label="Menu">
      <div className="sidebar-top">
        <button type="button" className="sidebar-iconbtn" onClick={onToggle} aria-label={open ? 'Chiudi menu' : 'Apri menu'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {/* Sidebar toggle icon (matches provided reference) */}
            <rect x="3.5" y="4.5" width="17" height="15" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M10 5.5v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Azioni">
        {topItems.map((it) => (
          <button key={it.id} type="button" className="sidebar-item" onClick={() => onItemClick(it)}>
            <span className="sidebar-ico" aria-hidden="true">
              <Icon name={it.icon} />
            </span>
            {open ? (
              <span className="sidebar-label">{it.label}</span>
            ) : (
              <span className="sidebar-tip" aria-hidden="true">
                {it.label}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className={`${open ? 'sidebar-user sidebar-user-open' : 'sidebar-user'}${guestCard ? ' sidebar-user-guest' : ''}`}>
          <a
            className="sidebar-avatar sidebar-avatar-link"
            aria-label={authState === 'guest' ? 'Login a BNDO Assistant' : 'Apri dashboard BNDO Assistant'}
            href={collapsedActionUrl}
            data-tip={authState === 'guest' ? 'Login su app.bndo.it' : 'Apri dashboard'}
          >
            B
          </a>
          {open ? (
            <div className="sidebar-user-meta">
              <div className="sidebar-user-sub">
                {authState === 'authenticated' ? (
                  authEmail ? (
                    <span className="sidebar-user-substack">
                      <span className="sidebar-user-sub-label">Utente</span>
                      <span className="sidebar-user-sub-email">{authEmail}</span>
                    </span>
                  ) : (
                    'Connesso'
                  )
                ) : authState === 'loading' ? (
                  'Verifica sessione…'
                ) : (
                  'Non connesso'
                )}
              </div>
              <div className="sidebar-auth-actions">
                <a className="sidebar-auth-btn" href={authState === 'authenticated' ? dashboardUrl : loginUrl}>
                  {authState === 'authenticated' ? 'Dashboard' : 'Login'}
                </a>
                {authState === 'authenticated' ? (
                  <a className="sidebar-auth-btn sidebar-auth-btn-ghost" href={logoutUrl}>
                    Logout
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
