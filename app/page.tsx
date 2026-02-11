'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header id="header" className={scrolled ? 'scrolled' : ''}>
        <nav>
          <div className="logo">
            <a href="#" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--navy)', textDecoration: 'none' }}>
              BNDO
            </a>
          </div>
          <ul className="nav-menu">
            <li>
              <a href="#bandi">Bandi</a>
            </li>
            <li>
              <a href="#servizi">Servizi</a>
            </li>
            <li>
              <a href="#processo">Processo</a>
            </li>
            <li>
              <Link href="/quiz" className="btn-nav">
                <span>Inizia ora</span>
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-content">
            <div className="tag">Piattaforma con esperti reali</div>
            <h1>Partecipare ai bandi non e mai stato cosi semplice</h1>
            <p className="lead">
              Assistenza completa per Resto al Sud 2.0 e Autoimpiego Centro Nord. Presentazione domanda a EUR 500,
              success fee solo se vinci.
            </p>
            <div className="cta-group">
              <Link href="/quiz" className="btn-primary">
                <span>Verifica requisiti gratis</span>
              </Link>
              <a href="#bandi" className="btn-link">
                Scopri i bandi
              </a>
            </div>
          </div>
        </section>

        <section className="stats">
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-value">EUR 500</div>
              <div className="stat-label">Presentazione domanda</div>
            </div>
            <div className="stat">
              <div className="stat-value">&lt;7</div>
              <div className="stat-label">Giorni per invio</div>
            </div>
            <div className="stat">
              <div className="stat-value">&lt;2h</div>
              <div className="stat-label">Tempo di risposta</div>
            </div>
            <div className="stat">
              <div className="stat-value">2%</div>
              <div className="stat-label">Success fee se vinci</div>
            </div>
          </div>
        </section>

        <section className="section" id="bandi">
          <div className="section-header">
            <div className="label">Bandi attivi</div>
            <h2>Scegli il bando giusto per te</h2>
            <p className="section-desc">Verifica i requisiti e scopri a quanto puoi accedere</p>
          </div>

          <div className="grid-2">
            <div className="bando-card">
              <div className="bando-top">
                <h3 className="bando-title">Resto al Sud 2.0</h3>
                <div className="bando-badge">
                  Abruzzo, Basilicata, Calabria, Campania, Molise, Puglia, Sardegna, Sicilia
                </div>
              </div>

              <div className="bando-amount">
                <div className="amount-label">Contributo massimo</div>
                <div className="amount-value">EUR 200k</div>
                <div className="amount-detail">fino al 75% a fondo perduto</div>
              </div>

              <div className="bando-specs">
                <div className="spec-row">
                  <div className="spec-label">Eta</div>
                  <div className="spec-value">18-35 anni non compiuti</div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Requisiti</div>
                  <div className="spec-value">Disoccupato, inoccupato, inattivo, working poor, GOL</div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Voucher</div>
                  <div className="spec-value">
                    <span className="spec-highlight">EUR 40k-50k</span> 100% a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma &lt;=EUR 120k</div>
                  <div className="spec-value">
                    <span className="spec-highlight">75%</span> a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma EUR 120k-200k</div>
                  <div className="spec-value">
                    <span className="spec-highlight">70%</span> a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Settori</div>
                  <div className="spec-value">Tutti (escluso agricoltura/pesca)</div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Scadenza</div>
                  <div className="spec-value">A sportello fino a esaurimento fondi</div>
                </div>
              </div>

              <div className="bando-footer">
                <Link href="/quiz" className="bando-btn">
                  <span>Verifica requisiti</span>
                </Link>
              </div>
            </div>

            <div className="bando-card">
              <div className="bando-top">
                <h3 className="bando-title">Autoimpiego Centro Nord</h3>
                <div className="bando-badge">
                  Piemonte, Valle d'Aosta, Liguria, Lombardia, Veneto, Friuli, Trentino, Emilia-R., Toscana, Lazio,
                  Umbria, Marche
                </div>
              </div>

              <div className="bando-amount">
                <div className="amount-label">Contributo massimo</div>
                <div className="amount-value">EUR 200k</div>
                <div className="amount-detail">fino al 65% a fondo perduto</div>
              </div>

              <div className="bando-specs">
                <div className="spec-row">
                  <div className="spec-label">Eta</div>
                  <div className="spec-value">18-35 anni non compiuti</div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Requisiti</div>
                  <div className="spec-value">Disoccupato, inoccupato, inattivo, working poor, GOL</div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Voucher</div>
                  <div className="spec-value">
                    <span className="spec-highlight">EUR 30k-40k</span> 100% a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma &lt;=EUR 120k</div>
                  <div className="spec-value">
                    <span className="spec-highlight">65%</span> a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma EUR 120k-200k</div>
                  <div className="spec-value">
                    <span className="spec-highlight">60%</span> a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Settori</div>
                  <div className="spec-value">Industria, artigianato, servizi, turismo, commercio</div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Scadenza</div>
                  <div className="spec-value">A sportello fino a esaurimento fondi</div>
                </div>
              </div>

              <div className="bando-footer">
                <Link href="/quiz" className="bando-btn">
                  <span>Verifica requisiti</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="section-bg" id="servizi">
          <div className="section-inner">
            <div className="section-header">
              <div className="label">Come funziona</div>
              <h2>Prezzi chiari e trasparenti</h2>
              <p className="section-desc">
                Paghi solo EUR 500 per la presentazione della domanda, poi success fee solo se vinci il bando
              </p>
            </div>

            <div className="grid-2">
              <div className="servizi-card">
                <h3>Cosa include il servizio</h3>

                <div className="servizi-list">
                  <div className="servizi-item">
                    <div className="servizi-icon">✓</div>
                    <div className="servizi-text">
                      <strong>Verifica requisiti completa</strong> - Analizziamo il tuo profilo e ti diciamo esattamente a
                      quale bando puoi accedere
                    </div>
                  </div>
                  <div className="servizi-item">
                    <div className="servizi-icon">✓</div>
                    <div className="servizi-text">
                      <strong>Business plan professionale</strong> - Creiamo insieme un business plan completo formato
                      Invitalia con previsioni triennali
                    </div>
                  </div>
                  <div className="servizi-item">
                    <div className="servizi-icon">✓</div>
                    <div className="servizi-text">
                      <strong>Compilazione domanda completa</strong> - I nostri consulenti compilano e inviano la domanda
                      per te
                    </div>
                  </div>
                  <div className="servizi-item">
                    <div className="servizi-icon">✓</div>
                    <div className="servizi-text">
                      <strong>Consulente dedicato</strong> - Un esperto reale di finanza agevolata assegnato a te
                    </div>
                  </div>
                </div>
              </div>

              <div className="servizi-card">
                <h3>Struttura dei costi</h3>

                <div className="price-highlight">
                  <div className="price-label-small">Presentazione domanda</div>
                  <div className="price-amount">EUR 500</div>
                  <div className="price-note">Pagamento unico dopo verifica requisiti</div>
                </div>

                <div className="pricing-breakdown">
                  <div className="pricing-row">
                    <div className="pricing-label">Se il bando viene approvato</div>
                    <div className="pricing-value">2% sul contributo</div>
                  </div>
                  <div className="pricing-row">
                    <div className="pricing-label">Assistenza rendicontazione completa</div>
                    <div className="pricing-value">+3% sul contributo</div>
                  </div>
                </div>

                <div style={{ marginTop: 32 }}>
                  <Link href="/quiz" className="bando-btn">
                    <span>Inizia ora</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="section" id="processo">
          <div className="section-header">
            <div className="label">Il processo</div>
            <h2>5 step per ottenere i contributi</h2>
            <p className="section-desc">Un processo chiaro e guidato da esperti reali</p>
          </div>

          <div className="process">
            <div className="step">
              <div className="step-num">01</div>
              <div className="step-content">
                <h3>Verifica requisiti</h3>
                <p>Compila il form rapido e scopri subito se hai i requisiti per partecipare ai bandi disponibili.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <div className="step-content">
                <h3>Raccolta documenti</h3>
                <p>Il tuo consulente dedicato ti guida nella raccolta e preparazione di tutti i documenti necessari.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <div className="step-content">
                <h3>Business plan</h3>
                <p>Prepariamo insieme business plan e pratica secondo il formato richiesto da Invitalia.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">04</div>
              <div className="step-content">
                <h3>Invio domanda</h3>
                <p>Procediamo all'invio della domanda e monitoriamo eventuali integrazioni richieste.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">05</div>
              <div className="step-content">
                <h3>Post-approvazione</h3>
                <p>Supporto fino all'erogazione finale, incluse rendicontazione e comunicazioni operative.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-content">
            <h2>Inizia ora la tua pratica</h2>
            <p>Verifica gratuitamente se hai i requisiti per i bandi</p>
            <Link href="/quiz" className="btn-primary btn-primary-white">
              <span>Verifica requisiti gratis</span>
            </Link>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-grid">
          <div className="footer-col">
            <h4>BNDO</h4>
            <p>La piattaforma con esperti reali per i bandi pubblici Resto al Sud 2.0 e Autoimpiego Centro Nord</p>
          </div>
          <div className="footer-col">
            <h4>Bandi</h4>
            <ul>
              <li>
                <a href="#bandi">Resto al Sud 2.0</a>
              </li>
              <li>
                <a href="#bandi">Autoimpiego Centro Nord</a>
              </li>
              <li>
                <a href="#servizi">Servizi</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Processo</h4>
            <ul>
              <li>
                <a href="#processo">Come funziona</a>
              </li>
              <li>
                <a href="#servizi">Costi</a>
              </li>
              <li>
                <a href="#">FAQ</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Supporto</h4>
            <ul>
              <li>
                <a href="#">Contatti</a>
              </li>
              <li>
                <a href="#">Privacy</a>
              </li>
              <li>
                <a href="#">Termini</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">(c) 2026 BNDO</div>
      </footer>
    </>
  );
}
