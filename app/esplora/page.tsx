'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { ChevronDown, LogOut } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TourStep {
  title: string;
  detail: string;
}

// ─── Sidebar items (decorative, matching real dashboard) ─────────────────────

const SIDEBAR_DEMO_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'pratiche', label: 'Le tue pratiche' },
  { key: 'documenti', label: 'Documenti' },
  { key: 'chat', label: 'Messaggi' },
  { key: 'avvia', label: 'Avvia pratica' },
];

// ─── Tour steps ──────────────────────────────────────────────────────────────

const TOUR_STEPS: TourStep[] = [
  {
    title: 'La tua Dashboard',
    detail:
      'Qui hai una panoramica completa di tutte le tue pratiche. In alto vedi i KPI principali: quante pratiche hai attive, quanti documenti hai caricato e se ci sono nuovi messaggi dal consulente. Il tutto a colpo d\'occhio, senza perderti tra email e fogli Excel.',
  },
  {
    title: 'Le tue pratiche',
    detail:
      'Ogni pratica ha una scheda dedicata con: nome del bando, stato di avanzamento (In compilazione, Documenti richiesti, Inviata), barra di completamento in percentuale, e il conteggio dei documenti mancanti e caricati. Cliccando su una pratica accedi ai dettagli, carichi documenti e parli col consulente.',
  },
  {
    title: 'Carica documenti e traccia l\'avanzamento',
    detail:
      'Man mano che carichi i documenti richiesti, la barra di avanzamento si riempie e i conteggi si aggiornano automaticamente. Quando tutti i documenti sono pronti, la pratica passa in revisione e un consulente BNDO verifica tutto prima dell\'invio ufficiale.',
  },
];

// ─── Nav icons (matching real DashboardShellClient) ──────────────────────────

function NavIcon({ name }: { name: string }) {
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
  if (name === 'documenti') {
    return (
      <svg {...common}>
        <path {...stroke} d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8.5L14 2Z" />
        <path {...stroke} d="M14 2v6.5h6.5" />
        <path {...stroke} d="M9 12h6M9 16h3" />
      </svg>
    );
  }
  if (name === 'chart') {
    return (
      <svg {...common}>
        <path {...stroke} d="M7 4.5h10a2.5 2.5 0 0 1 2.5 2.5v12H9.7A2.7 2.7 0 0 0 7 21.7V4.5Z" />
        <path {...stroke} d="M7 19h12.5" />
        <path {...stroke} d="M10 9h6.5M10 12h6.5M10 15h4.5" />
      </svg>
    );
  }
  // Default: mail icon
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="16" rx="2" {...stroke} />
      <path {...stroke} d="M22 6l-10 7L2 6" />
    </svg>
  );
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

  useEffect(() => {
    if (!highlightedEl) return;
    const rect = highlightedEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const tooltipW = 360;
    const gap = 12;

    let left = Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipW / 2, vw - tooltipW - 16));
    let top = rect.bottom + gap;

    // If tooltip would go off-screen, place above
    if (top + 210 > window.innerHeight) {
      top = rect.top - gap - 210;
    }

    setTooltipStyle({
      position: 'fixed',
      top,
      left,
      zIndex: 1001,
      width: tooltipW,
    });
  }, [highlightedEl, step]);

  const topH = highlightedEl ? highlightedEl.getBoundingClientRect().top - 4 : 0;
  const bottomT = highlightedEl ? highlightedEl.getBoundingClientRect().bottom + 4 : 0;
  const leftW = highlightedEl ? highlightedEl.getBoundingClientRect().left - 4 : 0;
  const rightL = highlightedEl ? highlightedEl.getBoundingClientRect().right + 4 : 0;

  return (
    <>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 998, pointerEvents: 'none' }}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, topH), background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        <div style={{ position: 'fixed', top: Math.max(0, bottomT), left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        <div style={{ position: 'fixed', top: Math.max(0, topH), left: 0, width: Math.max(0, leftW), height: Math.max(0, bottomT - topH), background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
        <div style={{ position: 'fixed', top: Math.max(0, topH), left: Math.max(0, rightL), right: 0, height: Math.max(0, bottomT - topH), background: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }} />
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div onClick={onSkip} style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'pointer' }} aria-hidden="true" />

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
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#22c55f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            {step + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{TOUR_STEPS[step]?.title}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 14 }}>{TOUR_STEPS[step]?.detail}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                {Array.from({ length: total }).map((_, i) => (
                  <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 4, background: i === step ? '#22c55f' : 'rgba(255,255,255,0.15)', transition: 'all 0.3s ease' }} />
                ))}
              </div>
              {step > 0 && (
                <button onClick={onPrev} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 8 }}>
                  Indietro
                </button>
              )}
              <button onClick={onSkip} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}>
                Salta
              </button>
              <button onClick={isLast ? onFinish : onNext} style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: '#22c55f', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
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

function PostTourCTA({ email, onRestart }: { email: string; onRestart: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#22c55f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0b1136', margin: '0 0 8px' }}>Tour completato!</h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 28px', lineHeight: 1.6 }}>
          Ora hai visto cosa può fare BNDO per la tua impresa.
          {email && email !== 'guest@email.it' ? ` L'account con ${email} è quasi pronto.` : ' Crea il tuo account e inizia subito.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a href="/register" style={{ display: 'block', padding: '13px 24px', borderRadius: 12, background: '#22c55f', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            Crea il tuo account
          </a>
          <a href="/login" style={{ display: 'block', padding: '13px 24px', borderRadius: 12, border: '1.5px solid #e2e8f0', color: '#0b1136', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            Accedi
          </a>
          <button onClick={onRestart} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', padding: '8px', marginTop: 4, fontFamily: 'inherit' }}>
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
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourDone, setTourDone] = useState(false);

  // Start tour if ?tour=1
  useEffect(() => {
    if (searchParams.get('tour') === '1') {
      const timer = setTimeout(() => {
        setTourActive(true);
        setTourStep(0);
        setTourDone(false);
        // Scroll to highlighted element
        setTimeout(() => {
          const el = document.querySelector('[data-tour-step="0"]') as HTMLElement | null;
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startTour = useCallback(() => {
    setTourActive(true);
    setTourStep(0);
    setTourDone(false);
    setTimeout(() => {
      const el = document.querySelector('[data-tour-step="0"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }, []);

  const advanceTour = useCallback(() => {
    const next = tourStep + 1;
    if (next >= TOUR_STEPS.length) {
      setTourActive(false);
      setTourDone(true);
      return;
    }
    setTourStep(next);
    setTimeout(() => {
      const el = document.querySelector(`[data-tour-step="${next}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  }, [tourStep]);

  const prevTour = useCallback(() => {
    if (tourStep <= 0) return;
    const prev = tourStep - 1;
    setTourStep(prev);
    setTimeout(() => {
      const el = document.querySelector(`[data-tour-step="${prev}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }, [tourStep]);

  const skipTour = useCallback(() => setTourActive(false), []);
  const finishTour = useCallback(() => { setTourActive(false); setTourDone(true); }, []);
  const restartTour = useCallback(() => { setTourDone(false); startTour(); }, [startTour]);

  const highlightedEl = tourActive
    ? document.querySelector(`[data-tour-step="${tourStep}"]`) as HTMLElement | null
    : null;

  const rootShellClass = `bndo-shell with-sidebar dashboard-auth-shell${sidebarOpen ? ' sidebar-open' : ''}`;

  return (
    <div className={rootShellClass}>
      {/* ── Sidebar ── */}
      <aside className={sidebarOpen ? 'sidebar is-open' : 'sidebar'} aria-label="Menu dashboard">
        <div className="sidebar-top">
          <button type="button" className="sidebar-iconbtn" onClick={() => setSidebarOpen((prev) => !prev)} aria-label={sidebarOpen ? 'Chiudi menu' : 'Apri menu'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M10 5.5v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav sidebar-nav-ready" aria-label="Voci dashboard">
          {SIDEBAR_DEMO_ITEMS.map((item) => (
            <div key={item.key} className="sidebar-item" title={item.label} style={{ opacity: 0.5, pointerEvents: 'none' }}>
              <span className="sidebar-ico" aria-hidden="true">
                <NavIcon name={item.key === 'documenti' ? 'documenti' : item.key === 'pratiche' ? 'chart' : item.key === 'avvia' ? 'home' : item.key} />
              </span>
              {sidebarOpen ? <span className="sidebar-label">{item.label}</span> : <span className="sidebar-tip" aria-hidden="true">{item.label}</span>}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen ? (
            <>
              <div className="sidebar-user sidebar-user-open sidebar-user-profile" style={{ width: '100%' }}>
                <span className="sidebar-avatar" aria-hidden="true">{initial}</span>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">@{displayName}</div>
                  <div className="sidebar-user-sub">{email}</div>
                </div>
              </div>
              <a href={`/login?next=/esplora?email=${encodeURIComponent(email)}`} className="sidebar-user sidebar-logout-card">
                <span className="sidebar-avatar" aria-hidden="true"><LogOut size={16} /></span>
                <div className="sidebar-user-meta">
                  <div className="sidebar-user-name">Accedi</div>
                  <div className="sidebar-user-sub">Login per continuare</div>
                </div>
              </a>
            </>
          ) : (
            <div className="sidebar-user-container">
              <button type="button" className={`sidebar-user sidebar-user-profile ${sidebarUserMenuOpen ? 'is-active' : ''}`} title="Profilo"
                onClick={(e) => { e.stopPropagation(); setSidebarUserMenuOpen(!sidebarUserMenuOpen); }}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span className="sidebar-avatar sidebar-avatar-link" aria-hidden="true">{initial}</span>
              </button>
              {sidebarUserMenuOpen && (
                <div className="sidebar-profile-dropdown">
                  <div className="dropdown-header">@{displayName}</div>
                  <a href={`/login?next=/esplora?email=${encodeURIComponent(email)}`} className="dropdown-item is-logout" onClick={() => setSidebarUserMenuOpen(false)}>
                    <LogOut className="h-4 w-4" /> Accedi
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
            <button type="button" onClick={startTour} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 10, background: '#0b1136', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              Tour guidato
            </button>
            <div className="nav-user-container">
              <div className="nav-user-toggle" style={{ background: 'none', border: 'none', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="nav-user-avatar">{initial}</span>
                <span className="nav-user-name">@{displayName}</span>
                <ChevronDown className="h-4 w-4" />
              </div>
            </div>
          </div>
        </header>

        {/* ── Dashboard content — IDENTICAL to real dashboard ── */}
        <main className="dashboard-content dashboard-content-client">
          <div className="welcome-section" data-tour-step="0">
            <h1 className="welcome-title">Le tue pratiche</h1>
            <p className="welcome-subtitle">Monitora l&apos;avanzamento delle tue richieste</p>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">2</div>
                <div className="stat-label">Pratiche Attive</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">8</div>
                <div className="stat-label">Documenti Caricati</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">3</div>
                <div className="stat-label">Messaggi Non Letti</div>
              </div>
            </div>
          </div>

          <a className="pratica-card pratica-card-link" data-tour-step="1" style={{ pointerEvents: 'none' }}>
            <div className="pratica-header">
              <div><h2 className="pratica-title">Resto al Sud 2.0</h2></div>
              <span className="badge badge-blue">In compilazione</span>
            </div>
            <div className="progress-section">
              <div className="progress-header">
                <span className="progress-label">Avanzamento pratica</span>
                <span className="progress-value">45%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: '45%' }} />
              </div>
              <div className="document-date" style={{ marginTop: 10, marginBottom: 0 }}>
                Mancanti: <strong>5</strong> · Caricati: <strong>3</strong>
              </div>
            </div>
          </a>

          <a className="pratica-card pratica-card-link" data-tour-step="2" style={{ pointerEvents: 'none' }}>
            <div className="pratica-header">
              <div><h2 className="pratica-title">Autoimpiego Centro Nord</h2></div>
              <span className="badge badge-yellow">Documenti richiesti</span>
            </div>
            <div className="progress-section">
              <div className="progress-header">
                <span className="progress-label">Avanzamento pratica</span>
                <span className="progress-value">20%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: '20%' }} />
              </div>
              <div className="document-date" style={{ marginTop: 10, marginBottom: 0 }}>
                Mancanti: <strong>8</strong> · Caricati: <strong>2</strong>
              </div>
            </div>
          </a>

          <div className="mobile-content-spacer" aria-hidden="true" />
        </main>
      </section>

      {/* ── Mobile tabs (decorative) ── */}
      <nav className="mobile-tabs" aria-label="Navigazione mobile dashboard">
        {SIDEBAR_DEMO_ITEMS.map((item) => (
          <div key={item.key} className="mobile-tab" title={item.label} style={{ opacity: 0.5 }}>
            <span className="mobile-tab-icon" aria-hidden="true">
              <NavIcon name={item.key === 'documenti' ? 'documenti' : item.key === 'pratiche' ? 'chart' : item.key === 'avvia' ? 'home' : item.key} />
            </span>
          </div>
        ))}
      </nav>

      {/* ── Tour overlay ── */}
      {tourActive && (
        <TourOverlay step={tourStep} total={TOUR_STEPS.length} onNext={advanceTour} onPrev={prevTour} onSkip={skipTour} onFinish={finishTour} highlightedEl={highlightedEl} />
      )}

      {/* ── Post-tour CTA ── */}
      {tourDone && <PostTourCTA email={email} onRestart={restartTour} />}

      <style>{`
        @media (max-width: 768px) {
          .tour-tooltip { max-width: calc(100vw - 32px) !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default function EsploraPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Caricamento...</div>}>
      <EsploraPageContent />
    </Suspense>
  );
}
