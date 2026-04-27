'use client';

import { useEffect, useMemo, useState, memo } from 'react';
import Link from 'next/link';

type NavItem = {
  id: string;
  label: string;
  icon: 'home' | 'chat' | 'search' | 'practice' | 'favorite';
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
        <path
          {...stroke}
          d="M6.75 18.5 4.5 20.75v-12A3.25 3.25 0 0 1 7.75 5.5h7.75a3.25 3.25 0 0 1 3.25 3.25v4.5a3.25 3.25 0 0 1-3.25 3.25H6.75Z"
        />
        <path {...stroke} d="M8.25 9.25h4.75M8.25 12h6.5" />
        <path {...stroke} d="M18.75 2.75 19.65 5.35 22.25 6.25 19.65 7.15 18.75 9.75 17.85 7.15 15.25 6.25 17.85 5.35 18.75 2.75Z" />
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
  if (name === 'favorite') {
    return (
      <svg {...common}>
        {/* Catalog icon style (compact, same stroke weight) */}
        <path {...stroke} d="M7 4.5h10a2.5 2.5 0 0 1 2.5 2.5v12H9.7A2.7 2.7 0 0 0 7 21.7V4.5Z" />
        <path {...stroke} d="M7 19h12.5" />
        <path {...stroke} d="M10 9h6.5M10 12h6.5M10 15h4.5" />
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

export const Sidebar = memo(function Sidebar({
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
  const [redirectTarget, setRedirectTarget] = useState('/');
  const [showLegalInfo, setShowLegalInfo] = useState(false);

  useEffect(() => {
    setRedirectTarget(`${window.location.origin}/`);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const readSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
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
  }, []);

  const topItems = useMemo<NavItem[]>(
    () =>
      items ?? [
        { id: 'chat', label: 'Consulente AI', icon: 'chat', onClick: onNewChat },
        { id: 'search', label: 'Cerca', icon: 'search' }
      ],
    [items, onNewChat]
  );

  const recents = recent ?? [];
  const guestCard = authState !== 'authenticated';
  const loginUrl = '/login';
  const dashboardUrl = '/dashboard/pratiche';
  const logoutUrl = `/api/auth/logout?redirect=${encodeURIComponent(redirectTarget)}`;
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
        <div className="sidebar-bottom-stack">
          <button
            type="button"
            className={`sidebar-legal-trigger${showLegalInfo ? ' is-open' : ''}`}
            aria-label="Informazioni legali BNDO"
            aria-expanded={showLegalInfo}
            onClick={() => setShowLegalInfo((prev) => !prev)}
          >
            i
          </button>
          {showLegalInfo ? (
            <div className="sidebar-legal-popover" role="note">
              BNDO È UN PRODOTTO TCONSULTING P.IVA 03166440805 - TUTTI I DIRITTI SONO RISERVATI
            </div>
          ) : null}
          <div className={`${open ? 'sidebar-user sidebar-user-open' : 'sidebar-user'}${guestCard ? ' sidebar-user-guest' : ''}`}>
            <Link
              className="sidebar-avatar sidebar-avatar-link"
              aria-label={authState === 'guest' ? 'Login a BNDO Assistant' : 'Apri dashboard BNDO Assistant'}
              href={collapsedActionUrl}
              data-tip={authState === 'guest' ? 'Login area clienti' : 'Apri dashboard'}
            >
              B
            </Link>
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
      </div>
    </aside>
  );
});
