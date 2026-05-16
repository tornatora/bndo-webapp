'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { ChevronDown, LogOut, User } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type NavKey = 'home' | 'catalogo_bandi' | 'messaggi' | 'chat_consulente' | 'chat_ai' | 'avvio_pratica' | 'profilo';

interface NavItem {
  key: NavKey;
  label: string;
  icon: NavKey;
}

interface TourStep {
  section: NavKey;
  title: string;
  detail: string;
}

// ─── Nav items identici alla dashboard reale ──────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'catalogo_bandi', label: 'Bandi Disponibili', icon: 'catalogo_bandi' },
  { key: 'messaggi', label: 'Chat con il tuo consulente umano', icon: 'messaggi' },
  { key: 'chat_consulente', label: "Chiedi all'AI", icon: 'chat_ai' },
  { key: 'avvio_pratica', label: 'Avvio pratica', icon: 'avvio_pratica' },
  { key: 'profilo', label: 'Profilo', icon: 'profilo' },
];

// ─── Tour steps ──────────────────────────────────────────────────────────────

const TOUR_STEPS: TourStep[] = [
  {
    section: 'home',
    title: 'Le tue pratiche',
    detail:
      'Qui monitori tutte le tue pratiche in corso. Per ogni domanda vedi lo stato (In compilazione, Documenti richiesti, Inviata), l\'importo finanziato, il tipo di contributo e la percentuale di completamento. Da qui puoi anche caricare documenti mancanti e seguire l\'iter passo dopo passo.',
  },
  {
    section: 'catalogo_bandi',
    title: 'Bandi Disponibili',
    detail:
      'Esplora tutti i bandi attivi per la tua impresa. Ogni scheda mostra ente erogatore, scadenza, regione e importo massimo finanziabile. BNDO evidenzia i bandi più compatibili con il tuo profilo e ti guida nella scelta.',
  },
  {
    section: 'messaggi',
    title: 'Chat con il consulente',
    detail:
      'Qui puoi comunicare direttamente con il consulente BNDO assegnato alla tua pratica. Ogni messaggio viene tracciato e resta visibile nella cronologia. Niente più email perse — tutte le comunicazioni in un unico posto.',
  },
  {
    section: 'chat_consulente',
    title: "Chiedi all'AI",
    detail:
      "L'assistente AI di BNDO è sempre online per rispondere a qualsiasi domanda: requisiti bandi, documentazione necessaria, tempistiche, dubbi sulla compilazione. Risposte immediate in linguaggio naturale, 24 ore su 24.",
  },
  {
    section: 'avvio_pratica',
    title: 'Avvio pratica',
    detail:
      'Tre modalità per iniziare: Agente AI (compilazione automatica con Browserbase), Consulente BNDO (supporto umano completo) o Videochiamata gratuita di 15 minuti per una consulenza preliminare senza impegno.',
  },
  {
    section: 'profilo',
    title: 'Il tuo profilo',
    detail:
      'Gestisci i dati personali e aziendali, le impostazioni di notifica e le preferenze dell\'account. Tutto ciò che serve per tenere in ordine la tua pratica e ricevere aggiornamenti sui bandi.',
  },
];

// ─── Icon (identico a DashboardShellClient) ──────────────────────────────────

function NavIcon({ name }: { name: NavKey }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path {...stroke} d="M4 10.5 12 4l8 6.5" />
          <path {...stroke} d="M6.5 10.5V20h11V10.5" />
        </svg>
      );
    case 'catalogo_bandi':
      return (
        <svg {...common}>
          <path {...stroke} d="M7 4.5h10a2.5 2.5 0 0 1 2.5 2.5v12H9.7A2.7 2.7 0 0 0 7 21.7V4.5Z" />
          <path {...stroke} d="M7 19h12.5" />
          <path {...stroke} d="M10 9h6.5M10 12h6.5M10 15h4.5" />
        </svg>
      );
    case 'messaggi':
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2" {...stroke} />
          <path {...stroke} d="M22 6l-10 7L2 6" />
        </svg>
      );
    case 'chat_ai':
      return (
        <svg {...common} stroke="none">
          <path d="M12 1.5v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="1.5" r="1.3" fill="currentColor" />
          <rect x="4" y="4.5" width="16" height="11" rx="3.5" stroke="currentColor" strokeWidth="2" fill="none" />
          <circle cx="9" cy="9.5" r="2.2" fill="currentColor" />
          <circle cx="15" cy="9.5" r="2.2" fill="currentColor" />
          <circle cx="8.2" cy="8.7" r="0.7" fill="white" />
          <circle cx="14.2" cy="8.7" r="0.7" fill="white" />
          <path d="M10 12.5a3 3 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <rect x="2.5" y="8" width="2" height="4.5" rx="0.8" fill="currentColor" />
          <rect x="19.5" y="8" width="2" height="4.5" rx="0.8" fill="currentColor" />
          <rect x="10.5" y="15" width="3" height="1.5" rx="0.3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M7.5 16.5h9a1 1 0 0 1 1 1v4.5H6.5v-4.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="12" cy="19.5" r="1" fill="currentColor" />
        </svg>
      );
    case 'avvio_pratica':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" {...stroke} />
          <path {...stroke} d="M8 12h7M12 8.5l3.5 3.5-3.5 3.5" />
        </svg>
      );
    case 'profilo':
      return (
        <svg {...common}>
          <path {...stroke} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path {...stroke} d="M4.5 21a7.5 7.5 0 1 1 15 0" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path {...stroke} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path {...stroke} d="M4.5 21a7.5 7.5 0 1 1 15 0" />
        </svg>
      );
  }
}

// ─── Tour Overlay ────────────────────────────────────────────────────────────

function TourOverlay({
  step,
  total,
  onNext,
  onPrev,
  onSkip,
  onFinish,
  highlightedEl,
}: {
  step: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onFinish: () => void;
  highlightedEl: HTMLElement | null;
}) {
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isLast = step === total - 1;

  // Recalculate positions on every render (element may move)
  useEffect(() => {
    if (!highlightedEl) return;

    const rect = highlightedEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4; // px gap between overlay and highlighted element

    // Determine tooltip position based on element location
    const centerY = rect.top + rect.height / 2;
    const centerX = rect.left + rect.width / 2;
    const preferBelow = centerY < vh * 0.45;
    const preferRight = centerX < vw * 0.5;

    const tooltipW = 360;
    const tooltipH = 200;

    if (preferBelow) {
      // Show below the highlighted element
      let left = Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipW / 2, vw - tooltipW - 16));
      setTooltipStyle({
        position: 'fixed',
        top: rect.bottom + gap + 8,
        left,
        zIndex: 1001,
        width: tooltipW,
      });
    } else {
      // Show above
      let left = Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipW / 2, vw - tooltipW - 16));
      setTooltipStyle({
        position: 'fixed',
        top: rect.top - gap - 8 - tooltipH,
        left,
        zIndex: 1001,
        width: tooltipW,
      });
    }
  }, [highlightedEl, step]);

  // Use the element's ref to create overlay panels
  const topH = highlightedEl ? highlightedEl.getBoundingClientRect().top - 4 : 0;
  const bottomT = highlightedEl ? highlightedEl.getBoundingClientRect().bottom + 4 : 0;
  const leftW = highlightedEl ? highlightedEl.getBoundingClientRect().left - 4 : 0;
  const rightL = highlightedEl ? highlightedEl.getBoundingClientRect().right + 4 : 0;

  return (
    <>
      {/* Overlay panels with hole for highlighted element */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 998, pointerEvents: 'none' }}>
        {/* Top */}
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, topH), background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        {/* Bottom */}
        <div style={{ position: 'fixed', top: Math.max(0, bottomT), left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        {/* Left */}
        <div style={{ position: 'fixed', top: Math.max(0, topH), left: 0, width: Math.max(0, leftW), height: Math.max(0, bottomT - topH), background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        {/* Right */}
        <div style={{ position: 'fixed', top: Math.max(0, topH), left: Math.max(0, rightL), right: 0, height: Math.max(0, bottomT - topH), background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
      </div>

      {/* Click outside to skip */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onClick={onSkip}
        style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'pointer' }}
        aria-hidden="true"
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="tour-tooltip"
        style={{
          ...tooltipStyle,
          background: '#0b1136',
          color: '#fff',
          borderRadius: 14,
          padding: '20px 22px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: '#22c55f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {step + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
              {TOUR_STEPS[step]?.title}
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 14 }}>
              {TOUR_STEPS[step]?.detail}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Dots */}
              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                {Array.from({ length: total }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: i === step ? 20 : 7,
                      height: 7,
                      borderRadius: 4,
                      background: i === step ? '#22c55f' : 'rgba(255,255,255,0.15)',
                      transition: 'all 0.3s ease',
                    }}
                  />
                ))}
              </div>
              {step > 0 && (
                <button
                  onClick={onPrev}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '6px 14px',
                    borderRadius: 8,
                  }}
                >
                  Indietro
                </button>
              )}
              <button
                onClick={onSkip}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '4px 8px',
                }}
              >
                Salta
              </button>
              <button
                onClick={isLast ? onFinish : onNext}
                style={{
                  padding: '6px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#22c55f',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                {isLast ? 'Fatto' : 'Avanti'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Post-tour CTA ───────────────────────────────────────────────────────────

function PostTourCTA({
  email,
  onRestart,
}: {
  email: string;
  onRestart: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '40px 36px',
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#dcfce7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#22c55f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 8px' }}>
          Tour completato!
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 28px', lineHeight: 1.6 }}>
          Ora hai visto cosa può fare BNDO per la tua impresa.
          {email && email !== 'guest@email.it'
            ? ` L'account con ${email} è quasi pronto.`
            : ' Crea il tuo account e inizia subito.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {email && email !== 'guest@email.it' ? (
            <a
              href={`/dashboard/avviopratica?email=${encodeURIComponent(email)}`}
              style={{
                display: 'block',
                padding: '13px 24px',
                borderRadius: 12,
                background: '#22c55f',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                textDecoration: 'none',
              }}
            >
              Crea account e inizia
            </a>
          ) : (
            <>
              <a
                href="/register"
                style={{
                  display: 'block',
                  padding: '13px 24px',
                  borderRadius: 12,
                  background: '#22c55f',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: 'none',
                }}
              >
                Crea il tuo account
              </a>
              <a
                href="/login"
                style={{
                  display: 'block',
                  padding: '13px 24px',
                  borderRadius: 12,
                  border: '1.5px solid #e2e8f0',
                  color: '#0b1136',
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: 'none',
                }}
              >
                Accedi
              </a>
            </>
          )}
          <button
            onClick={onRestart}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 13,
              cursor: 'pointer',
              padding: '8px',
              marginTop: 4,
              fontFamily: 'inherit',
            }}
          >
            Rivedi il tour
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

function EsploraPageContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'guest@email.it';
  const displayName = email.split('@')[0];
  const initial = displayName.charAt(0).toUpperCase();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarUserMenuOpen, setSidebarUserMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavKey>('home');
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourDone, setTourDone] = useState(false);

  // Highlight refs for each section element
  const highlightRefs = useRef<Record<number, HTMLElement | null>>({});

  // Scroll to section when nav changes
  useEffect(() => {
    const el = document.querySelector(`[data-section="${activeNav}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeNav]);

  const startTour = useCallback(() => {
    setActiveNav('home');
    setTourStep(0);
    setTourActive(true);
    setTourDone(false);
    // Small delay to let the section render
    setTimeout(() => {
      const firstEl = document.querySelector('[data-tour-step="0"]') as HTMLElement | null;
      if (firstEl) {
        firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }, []);

  const advanceTour = useCallback(() => {
    const next = tourStep + 1;
    if (next >= TOUR_STEPS.length) {
      setTourActive(false);
      setTourDone(true);
      return;
    }
    setTourStep(next);
    setActiveNav(TOUR_STEPS[next].section);
    // Small delay to let section render, then scroll
    setTimeout(() => {
      const el = document.querySelector(`[data-tour-step="${next}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 200);
  }, [tourStep]);

  const prevTour = useCallback(() => {
    if (tourStep <= 0) return;
    const prev = tourStep - 1;
    setTourStep(prev);
    setActiveNav(TOUR_STEPS[prev].section);
    setTimeout(() => {
      const el = document.querySelector(`[data-tour-step="${prev}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }, [tourStep]);

  const skipTour = useCallback(() => {
    setTourActive(false);
  }, []);

  const finishTour = useCallback(() => {
    setTourActive(false);
    setTourDone(true);
  }, []);

  const restartTour = useCallback(() => {
    setTourDone(false);
    startTour();
  }, [startTour]);

  // Navigate to a section (outside of tour)
  const goToNav = useCallback((key: NavKey) => {
    setActiveNav(key);
  }, []);

  // Close post-tour CTA
  const closeCTA = useCallback(() => {
    setTourDone(false);
  }, []);

  // Get highlighted element for current tour step
  const highlightedEl = tourActive
    ? document.querySelector(`[data-tour-step="${tourStep}"]`) as HTMLElement | null
    : null;

  const rootShellClass = `bndo-shell with-sidebar dashboard-auth-shell${sidebarOpen ? ' sidebar-open' : ''}`;

  return (
    <div className={rootShellClass}>
      {/* ── Sidebar ── */}
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

        <nav className="sidebar-nav sidebar-nav-ready" aria-label="Voci dashboard">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => goToNav(item.key)}
                title={item.label}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', position: 'relative', textAlign: 'left' }}
              >
                <span className="sidebar-ico" aria-hidden="true">
                  <NavIcon name={item.icon} />
                </span>
                {sidebarOpen ? (
                  <span className="sidebar-label">{item.label}</span>
                ) : (
                  <span className="sidebar-tip" aria-hidden="true">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen ? (
            <>
              <div
                className="sidebar-user sidebar-user-open sidebar-user-profile"
                style={{ width: '100%' }}
              >
                <span className="sidebar-avatar" aria-hidden="true">{initial}</span>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">@{displayName}</div>
                  <div className="sidebar-user-sub">{email}</div>
                </div>
              </div>
              <a href={`/login?next=/esplora?email=${encodeURIComponent(email)}`} className="sidebar-user sidebar-logout-card">
                <span className="sidebar-avatar" aria-hidden="true">
                  <LogOut size={16} />
                </span>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">Accedi</div>
                  <div className="sidebar-user-sub">Login per continuare</div>
                </div>
              </a>
            </>
          ) : (
            <div className="sidebar-user-container">
              <button
                type="button"
                className={`sidebar-user sidebar-user-profile ${sidebarUserMenuOpen ? 'is-active' : ''}`}
                title="Profilo"
                onClick={(e) => { e.stopPropagation(); setSidebarUserMenuOpen(!sidebarUserMenuOpen); }}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span className="sidebar-avatar sidebar-avatar-link" aria-hidden="true">
                  {initial}
                </span>
              </button>
              {sidebarUserMenuOpen && (
                <div className="sidebar-profile-dropdown">
                  <div className="dropdown-header">@{displayName}</div>
                  <a href={`/login?next=/esplora?email=${encodeURIComponent(email)}`} className="dropdown-item is-logout" onClick={() => setSidebarUserMenuOpen(false)}>
                    <LogOut className="h-4 w-4" />
                    Accedi
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
          <a className="topbar-logo" href="/" aria-label="BNDO Home">
            <Image src="/Logo-BNDO-header.png" alt="BNDO" width={170} height={44} priority />
          </a>
          <div className="nav-actions">
            <button
              type="button"
              onClick={startTour}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 10,
                background: '#0b1136',
                color: '#fff',
                border: 'none',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              Tour guidato
            </button>
            <div className="nav-user-container">
              <div
                className="nav-user-toggle"
                style={{ background: 'none', border: 'none', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span className="nav-user-avatar">{initial}</span>
                <span className="nav-user-name">@{displayName}</span>
                <ChevronDown className="h-4 w-4" />
              </div>
            </div>
          </div>
        </header>

        <main className="dashboard-content dashboard-content-client">
          <ContentSection navKey={activeNav} displayName={displayName} initial={initial} />
          <div className="mobile-content-spacer" aria-hidden="true" />
        </main>
      </section>

      {/* ── Mobile tabs ── */}
      <nav className="mobile-tabs" aria-label="Navigazione mobile dashboard">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mobile-tab ${activeNav === item.key ? 'active' : ''}`}
            onClick={() => goToNav(item.key)}
            title={item.label}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              <NavIcon name={item.icon} />
            </span>
          </button>
        ))}
      </nav>

      {/* ── Tour overlay ── */}
      {tourActive && (
        <TourOverlay
          step={tourStep}
          total={TOUR_STEPS.length}
          onNext={advanceTour}
          onPrev={prevTour}
          onSkip={skipTour}
          onFinish={finishTour}
          highlightedEl={highlightedEl}
        />
      )}

      {/* ── Post-tour CTA ── */}
      {tourDone && (
        <PostTourCTA email={email} onRestart={restartTour} />
      )}

      <style>{`
        @media (max-width: 768px) {
          .tour-tooltip { max-width: calc(100vw - 32px) !important; }
        }
        .sidebar-item.active {
          background: rgba(255,255,255,0.08) !important;
        }
      `}</style>
    </div>
  );
}

// ─── Content sections ─────────────────────────────────────────────────────────

const DEMO_PRATICHE = [
  {
    id: 'resto-al-sud',
    titolo: 'Resto al Sud 2.0',
    desc: 'Agevolazione per nuove imprese in Abruzzo, Basilicata, Calabria, Campania, Molise, Puglia, Sardegna, Sicilia',
    importo: 'fino a 200.000€',
    contributo: '100% fondo perduto',
    stato: 'In compilazione',
    progress: 45,
  },
  {
    id: 'autoimpiego',
    titolo: 'Autoimpiego Centro Nord',
    desc: 'Agevolazione per nuove imprese in Centro e Nord Italia',
    importo: 'fino a 80.000€',
    contributo: '100% fondo perduto',
    stato: 'Documenti richiesti',
    progress: 20,
  },
];

const DEMO_BANDI = [
  { titolo: 'Resto al Sud 2.0', ente: 'Invitalia / MIMIT', scadenza: '31/12/2026', regione: 'Sud Italia', importo: 'fino a 200.000€' },
  { titolo: 'Autoimpiego Centro Nord', ente: 'Invitalia / MIMIT', scadenza: '31/12/2026', regione: 'Centro-Nord', importo: 'fino a 80.000€' },
  { titolo: 'Nuova Impresa a Tasso Zero', ente: 'MIMIT', scadenza: '30/06/2026', regione: 'Nazionale', importo: 'fino a 3.000.000€' },
  { titolo: 'Smart&Start Italia', ente: 'Invitalia', scadenza: '31/12/2026', regione: 'Nazionale', importo: 'fino a 1.500.000€' },
  { titolo: 'ON - Nuove Imprese', ente: 'Invitalia', scadenza: '30/06/2027', regione: 'Nazionale', importo: 'fino a 3.000.000€' },
];

function ContentSection({ navKey, displayName, initial }: { navKey: NavKey; displayName: string; initial: string }) {
  switch (navKey) {
    case 'home':
      return <HomeContent />;
    case 'catalogo_bandi':
      return <BandiContent />;
    case 'messaggi':
      return <MessaggiContent displayName={displayName} initial={initial} />;
    case 'chat_consulente':
      return <ChatAIContent />;
    case 'avvio_pratica':
      return <AvvioContent />;
    case 'profilo':
      return <ProfiloContent displayName={displayName} initial={initial} />;
    default:
      return <HomeContent />;
  }
}

function HomeContent() {
  return (
    <section data-section="home" style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 6px' }}>Le tue pratiche</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>Monitora lo stato delle tue domande di agevolazione.</p>
      {DEMO_PRATICHE.map((p, idx) => (
        <div
          key={p.id}
          data-tour-step={idx === 0 ? 0 : undefined}
          style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            padding: 20,
            marginBottom: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0b1136', margin: '0 0 4px' }}>{p.titolo}</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{p.desc}</p>
            </div>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 20,
              background: p.stato === 'In compilazione' ? '#dbeafe' : '#fef3c7',
              color: p.stato === 'In compilazione' ? '#1d4ed8' : '#92400e',
              whiteSpace: 'nowrap',
            }}>{p.stato}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, color: '#64748b' }}>
            <span><span style={{ color: '#94a3b8' }}>Importo: </span><strong style={{ color: '#0b1136' }}>{p.importo}</strong></span>
            <span><span style={{ color: '#94a3b8' }}>Contributo: </span><strong style={{ color: '#0b1136' }}>{p.contributo}</strong></span>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
              <span>Completamento</span><span>{p.progress}%</span>
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${p.progress}%`, height: '100%', background: '#22c55f', borderRadius: 3 }} />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function BandiContent() {
  return (
    <section data-section="catalogo_bandi" style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 6px' }}>Bandi Disponibili</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>Sfoglia i bandi di finanziamento attivi per la tua impresa.</p>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {DEMO_BANDI.map((b, i) => (
          <div
            key={i}
            data-tour-step={i === 0 ? 1 : undefined}
            style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              position: 'relative',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0b1136', margin: '0 0 10px' }}>{b.titolo}</h3>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 2 }}>
              <div><span style={{ color: '#94a3b8' }}>Ente: </span>{b.ente}</div>
              <div><span style={{ color: '#94a3b8' }}>Scadenza: </span>{b.scadenza}</div>
              <div><span style={{ color: '#94a3b8' }}>Regione: </span>{b.regione}</div>
              <div>
                <span style={{ color: '#94a3b8' }}>Importo: </span>
                <strong style={{ color: '#22c55f' }}>{b.importo}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MessaggiContent({ displayName, initial }: { displayName: string; initial: string }) {
  const messages = [
    { ruolo: 'Consulente BNDO', msg: 'Buongiorno! La sua pratica Resto al Sud 2.0 è in fase di istruttoria. I documenti caricati sono completi, stiamo procedendo con la verifica.', iniziali: 'C', colore: '#dbeafe', coloreTesto: '#1d4ed8', ora: '10:32' },
    { ruolo: 'Tu', msg: 'Grazie, quali sono i prossimi passi? Devo fare altro?', iniziali: initial, colore: '#f1f5f9', coloreTesto: '#64748b', ora: '10:35' },
    { ruolo: 'Consulente BNDO', msg: 'Al momento non serve altro da parte sua. La aggiorneremo non appena l\'istruttoria sarà completata. Di solito ci vogliono 10-15 giorni lavorativi.', iniziali: 'C', colore: '#dbeafe', coloreTesto: '#1d4ed8', ora: '10:38' },
  ];

  return (
    <section data-section="messaggi" style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 6px' }}>Messaggi</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>Comunica con il tuo consulente BNDO dedicato.</p>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            data-tour-step={i === 0 ? 2 : undefined}
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: i < messages.length - 1 ? 16 : 0,
              paddingBottom: i < messages.length - 1 ? 16 : 0,
              borderBottom: i < messages.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: m.colore, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, fontWeight: 700,
              color: m.coloreTesto, flexShrink: 0,
            }}>
              {m.iniziali}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0b1136' }}>{m.ruolo}</div>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 2, lineHeight: 1.5 }}>{m.msg}</div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{m.ora}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChatAIContent() {
  return (
    <section data-section="chat_consulente" style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 6px' }}>Chiedi all&apos;AI</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>L&apos;assistente AI è sempre disponibile per le tue domande.</p>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 }}>
        {/* AI message */}
        <div
          data-tour-step="3"
          style={{
            background: '#f0fdf4',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            maxWidth: '88%',
          }}
        >
          <div style={{ fontSize: 13, color: '#0b1136', fontWeight: 600, marginBottom: 4 }}>BNDO AI</div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            Ciao! Sono l&apos;assistente AI di BNDO. Posso aiutarti a trovare il bando giusto per la tua impresa,
            spiegarti la documentazione necessaria o darti informazioni sullo stato della tua pratica.
            Cosa vuoi sapere?
          </div>
        </div>
        {/* Chat input area simulated */}
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '10px 14px',
        }}>
          <div style={{ flex: 1, fontSize: 13, color: '#94a3b8' }}>Scrivi un messaggio...</div>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#0b1136',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
          }}>
            ↑
          </div>
        </div>
      </div>
    </section>
  );
}

function AvvioContent() {
  const plans = [
    { titolo: 'Agente AI', prezzo: '200 €', desc: 'Compilazione automatica con Browserbase. L\'AI compila la domanda per te.', colore: '#0b1136' },
    { titolo: 'Consulente BNDO', prezzo: '400 €', desc: 'Supporto umano personalizzato dalla A alla Z, fino all\'erogazione.', colore: '#0b1136' },
    { titolo: 'Videochiamata gratuita', prezzo: 'Gratuita', desc: '15 minuti con un consulente per una valutazione preliminare senza impegno.', colore: '#22c55f' },
  ];

  return (
    <section data-section="avvio_pratica" style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 6px' }}>Avvio pratica</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>Scegli come vuoi avviare la tua pratica per ottenere fino a 200.000€ a fondo perduto.</p>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {plans.map((p, i) => (
          <div
            key={i}
            data-tour-step={i === 0 ? 4 : undefined}
            style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              padding: 24,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0b1136', margin: '0 0 6px' }}>{p.titolo}</h3>
            <div style={{ fontSize: 26, fontWeight: 700, color: p.colore, marginBottom: 10 }}>{p.prezzo}</div>
            <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>{p.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfiloContent({ displayName, initial }: { displayName: string; initial: string }) {
  const fields = [
    { label: 'Nome', value: displayName || 'Mario Rossi' },
    { label: 'Email', value: 'mario.rossi@email.it' },
    { label: 'P.IVA', value: '01234567890' },
    { label: 'Telefono', value: '+39 333 1234567' },
  ];

  return (
    <section data-section="profilo" style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 6px' }}>Profilo</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>I tuoi dati e le impostazioni dell&apos;account.</p>
      <div style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #e2e8f0',
        padding: 24,
        display: 'grid',
        gap: 12,
        gridTemplateColumns: '1fr 1fr',
      }}>
        {fields.map((f, i) => (
          <div key={i} data-tour-step={i === 0 ? 5 : undefined}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{f.label}</div>
            <div style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              fontSize: 14,
              color: '#475569',
              background: '#f8fafc',
            }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Export con Suspense boundary ────────────────────────────────────────────

export default function EsploraPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Caricamento...</div>}>
      <EsploraPageContent />
    </Suspense>
  );
}
