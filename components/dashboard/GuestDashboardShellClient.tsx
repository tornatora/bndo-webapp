'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useEffect, memo } from 'react';
import { LogIn } from 'lucide-react';
import {
  getGuestShellItems,
  resolveDashboardNavKey,
  type DashboardShellItem,
} from '@/shared/config';
import { APP_URL } from '@/shared/lib';

type GuestDashboardShellClientProps = {
  children: React.ReactNode;
};

const Icon = memo(function Icon({ name }: { name: DashboardShellItem['icon'] }) {
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
        <rect x="2" y="4" width="20" height="16" rx="2" {...stroke} />
        <path {...stroke} d="M22 6l-10 7L2 6" />
      </svg>
    );
  }
  if (name === 'chat_bubble') {
    return (
      <svg {...common}>
        <path {...stroke} d="M7 18l-3 3V6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v7A3.5 3.5 0 0 1 16.5 17H7Z" />
        <path {...stroke} d="M8 8h8M8 11.5h6" />
      </svg>
    );
  }
  if (name === 'new_practice') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" {...stroke} />
        <path {...stroke} d="M12 8v8M8 12h8" />
      </svg>
    );
  }
  if (name === 'avvio_pratica') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" {...stroke} />
        <path {...stroke} d="M8 12h7M12 8.5l3.5 3.5-3.5 3.5" />
      </svg>
    );
  }
  if (name === 'monitor') {
    return (
      <svg {...common}>
        <rect x="2" y="4" width="20" height="13" rx="2" {...stroke} />
        <path {...stroke} d="M8 21h8" />
        <path {...stroke} d="M12 17v4" />
      </svg>
    );
  }
  if (name === 'chat_ai') {
    return (
      <svg {...common} stroke="none">
        {/* Antenna */}
        <path d="M12 1.5v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="1.5" r="1.3" fill="currentColor" />
        {/* Head */}
        <rect x="4" y="4.5" width="16" height="11" rx="3.5" stroke="currentColor" strokeWidth="2" fill="none" />
        {/* Eyes */}
        <circle cx="9" cy="9.5" r="2.2" fill="currentColor" />
        <circle cx="15" cy="9.5" r="2.2" fill="currentColor" />
        {/* Eye shine */}
        <circle cx="8.2" cy="8.7" r="0.7" fill="white" />
        <circle cx="14.2" cy="8.7" r="0.7" fill="white" />
        {/* Mouth */}
        <path d="M10 12.5a3 3 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        {/* Ears */}
        <rect x="2.5" y="8" width="2" height="4.5" rx="0.8" fill="currentColor" />
        <rect x="19.5" y="8" width="2" height="4.5" rx="0.8" fill="currentColor" />
        {/* Neck */}
        <rect x="10.5" y="15" width="3" height="1.5" rx="0.3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        {/* Body */}
        <path d="M7.5 16.5h9a1 1 0 0 1 1 1v4.5H6.5v-4.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        {/* Chest LED */}
        <circle cx="12" cy="19.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (name === 'catalogo_bandi') {
    return (
      <svg {...common}>
        <path {...stroke} d="M7 4.5h10a2.5 2.5 0 0 1 2.5 2.5v12H9.7A2.7 2.7 0 0 0 7 21.7V4.5Z" />
        <path {...stroke} d="M7 19h12.5" />
        <path {...stroke} d="M10 9h6.5M10 12h6.5M10 15h4.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path {...stroke} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path {...stroke} d="M4.5 21a7.5 7.5 0 1 1 15 0" />
    </svg>
  );
});

export function GuestDashboardShellClient({ children }: GuestDashboardShellClientProps) {
  const pathname = usePathname();
  const activeKey = resolveDashboardNavKey(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const [hasEmailFromQuiz, setHasEmailFromQuiz] = useState(false);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      setNavReady(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setHasEmailFromQuiz(Boolean(params.get('email')));
    }
  }, []);

  const items = useMemo<DashboardShellItem[]>(() => getGuestShellItems(), []);

  const renderShellItem = (item: DashboardShellItem) =>
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
    );

  const rootShellClass = `${
    sidebarOpen ? 'bndo-shell with-sidebar sidebar-open dashboard-auth-shell' : 'bndo-shell with-sidebar dashboard-auth-shell'
  }`;

  return (
    <div className={rootShellClass}>
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

        <nav className={navReady ? 'sidebar-nav sidebar-nav-ready' : 'sidebar-nav sidebar-nav-boot'} aria-label="Voci dashboard">
          {items.map(renderShellItem)}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen ? (
            <div className="guest-sidebar-info sidebar-user sidebar-user-open">
              <div className="sidebar-user-meta">
                <div className="sidebar-user-name">BNDO</div>
                <div className="sidebar-user-sub">Finanza agevolata</div>
              </div>

              <div className="guest-sidebar-explanations">
                <h4>Le tue opzioni</h4>

                <div className="guest-sidebar-plan">
                  <strong>🤖 Agente AI — 200€</strong>
                  <p>Assistente AI dedicato, compilazione automatica, verifica requisiti in tempo reale. Tutto online, senza attese.</p>
                </div>

                <div className="guest-sidebar-plan">
                  <strong>👨‍💼 Consulente BNDO — 400€</strong>
                  <p>Consulente dedicato dalla verifica all&apos;erogazione. Supporto personalizzato completo, review documentale e affiancamento continuo.</p>
                </div>

                <div className="guest-sidebar-plan">
                  <strong>📹 Videochiamata gratuita</strong>
                  <p>15 minuti con un consulente. Valutazione preliminare del progetto, risposte alle tue domande, nessun impegno.</p>
                </div>

                <div className="guest-sidebar-summary">
                  <p><strong>📍 Fino a 200.000€ a fondo perduto</strong><br />Voucher 100% a fondo perduto per investimenti in attrezzature, macchinari, software, arredi e consulenze tecnico-specialistiche.</p>
                </div>
              </div>

              <Link
                href={`${APP_URL}/login`}
                className="guest-sidebar-cta"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: '#22c55f',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '13px',
                  textDecoration: 'none',
                  marginTop: '12px',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                <LogIn size={14} />
                {hasEmailFromQuiz ? 'Imposta password per continuare' : 'Accedi'}
              </Link>
            </div>
          ) : (
            <div className="sidebar-user-container">
              <Link
                href={`${APP_URL}/login`}
                className="sidebar-user sidebar-user-profile"
                title="Accedi"
                style={{ textDecoration: 'none' }}
              >
                <span className="sidebar-avatar sidebar-avatar-link" aria-hidden="true">
                  <LogIn size={16} />
                </span>
              </Link>
            </div>
          )}
        </div>
      </aside>

      <section className="mainpane">
        <header className="topbar">
          <a className="topbar-logo" href={APP_URL} aria-label="BNDO Home">
            <Image src="/Logo-BNDO-header.png" alt="BNDO" width={170} height={44} priority />
          </a>
          <div className="nav-actions">
            <Link
              href={`${APP_URL}/login`}
              className="guest-login-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#22c55f',
                color: '#fff',
                fontWeight: 600,
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              <LogIn size={16} />
              Accedi
            </Link>
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
            <a key={item.key} className={`mobile-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href} title={item.label}>
              <span className="mobile-tab-icon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
            </a>
          ) : (
            <Link key={item.key} className={`mobile-tab ${activeKey === item.key ? 'active' : ''}`} href={item.href} title={item.label}>
              <span className="mobile-tab-icon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
            </Link>
          )
        )}
      </nav>

      <style>{`
        .guest-sidebar-explanations {
          padding: 12px 0;
          border-top: 1px solid rgba(255,255,255,0.08);
          margin-top: 8px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }
        .guest-sidebar-explanations h4 {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-light);
          margin: 0 0 10px;
          padding: 0 16px;
        }
        .guest-sidebar-plan {
          padding: 10px 16px;
          margin-bottom: 2px;
        }
        .guest-sidebar-plan strong {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 3px;
        }
        .guest-sidebar-plan p {
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-light);
          margin: 0;
        }
        .guest-sidebar-summary {
          padding: 12px 16px;
          margin: 8px 12px 0;
          border-radius: 8px;
          background: rgba(34, 197, 94, 0.1);
        }
        .guest-sidebar-summary p {
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-light);
          margin: 0;
        }
        .sidebar-bottom {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        .guest-sidebar-info.sidebar-user-open {
          flex-direction: column;
          min-height: 0;
          height: 100%;
          display: flex;
          overflow: hidden;
        }
        .guest-login-btn:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
