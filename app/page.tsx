'use client';

import Link from 'next/link';
import Image from 'next/image';
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
            <Image
              src="/Logo-BNDO-header.png"
              alt="BNDO"
              width={220}
              height={64}
              priority
            />
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
            <h1>Partecipare ai bandi non &egrave; mai stato cos&igrave; semplice</h1>
            <p className="lead">
              Assistenza completa per Resto al Sud 2.0 e Autoimpiego Centro Nord. Presentazione domanda a &euro;500,
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
              <div className="stat-value">&euro;500</div>
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
                <div className="amount-value">&euro;200k</div>
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
                    <span className="spec-highlight">&euro;40k-50k</span> 100% a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma &le;&euro;120k</div>
                  <div className="spec-value">
                    <span className="spec-highlight">75%</span> a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma &euro;120k-200k</div>
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
                  Piemonte, Valle d&apos;Aosta, Liguria, Lombardia, Veneto, Friuli, Trentino, Emilia-R., Toscana, Lazio,
                  Umbria, Marche
                </div>
              </div>

              <div className="bando-amount">
                <div className="amount-label">Contributo massimo</div>
                <div className="amount-value">&euro;200k</div>
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
                    <span className="spec-highlight">&euro;30k-40k</span> 100% a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma &le;&euro;120k</div>
                  <div className="spec-value">
                    <span className="spec-highlight">65%</span> a fondo perduto
                  </div>
                </div>
                <div className="spec-row">
                  <div className="spec-label">Programma &euro;120k-200k</div>
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
                Paghi solo &euro;500 per la presentazione della domanda, poi success fee solo se vinci il bando
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
                  <div className="servizi-item">
                    <div className="servizi-icon">✓</div>
                    <div className="servizi-text">
                      <strong>Raccolta documenti assistita</strong> - Ti aiutiamo con P.IVA, conto corrente, SPID, firma
                      digitale e tutta la documentazione
                    </div>
                  </div>
                  <div className="servizi-item">
                    <div className="servizi-icon">✓</div>
                    <div className="servizi-text">
                      <strong>Monitoraggio pratica</strong> - Seguiamo la valutazione e gestiamo eventuali integrazioni
                      richieste da Invitalia
                    </div>
                  </div>
                </div>
              </div>

              <div className="servizi-card">
                <h3>Struttura dei costi</h3>

                <div className="price-highlight">
                  <div className="price-label-small">Presentazione domanda</div>
                  <div className="price-amount">&euro;500</div>
                  <div className="price-note">Pagamento unico dopo verifica requisiti</div>
                </div>

                <div className="pricing-breakdown">
                  <div className="pricing-row">
                    <div className="pricing-label">Se il bando viene approvato</div>
                    <div className="pricing-value">2% sul contributo</div>
                  </div>
                  <div className="pricing-row">
                    <div className="pricing-label">Assistenza rendicontazione completa (fino all&apos;erogazione finale)</div>
                    <div className="pricing-value">+3% sul contributo</div>
                  </div>
                </div>

                <div className="servizi-list">
                  <div className="servizi-item">
                    <div className="servizi-icon">•</div>
                    <div className="servizi-text">Se il bando non viene approvato, paghi solo i &euro;500 iniziali</div>
                  </div>
                  <div className="servizi-item">
                    <div className="servizi-icon">•</div>
                    <div className="servizi-text">Nessun costo nascosto o commissione aggiuntiva</div>
                  </div>
                  <div className="servizi-item">
                    <div className="servizi-icon">•</div>
                    <div className="servizi-text">
                      Assistenza rendicontazione opzionale (gestione spese, erogazioni, comunicazioni Invitalia)
                    </div>
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
                <p>
                  Compila il nostro form rapido e scopri in tempo reale se hai tutti i requisiti per partecipare ai bandi
                  disponibili. Gratuito e senza impegno.
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <div className="step-content">
                <h3>Raccolta documenti</h3>
                <p>
                  Il tuo consulente dedicato ti guida nella raccolta e preparazione di tutti i documenti necessari. Ti
                  aiutiamo con P.IVA, conto corrente, SPID e firma digitale.
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <div className="step-content">
                <h3>Business plan</h3>
                <p>
                  Creiamo insieme un business plan completo con previsioni economico-finanziarie triennali secondo il formato
                  richiesto dal bando Invitalia.
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">04</div>
              <div className="step-content">
                <h3>Invio domanda</h3>
                <p>
                  Dopo il controllo finale, procediamo all&apos;invio della domanda. Monitoriamo costantemente lo stato e
                  gestiamo eventuali integrazioni richieste.
                </p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">05</div>
              <div className="step-content">
                <h3>Post-approvazione (opzionale)</h3>
                <p>
                  Se scegli il pacchetto completo, ti seguiamo anche dopo l&apos;approvazione: gestione rendicontazione,
                  comunicazioni con Invitalia, richieste di erogazione e supporto fino all&apos;erogazione finale.
                </p>
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
                <a href="https://wa.me/393477298671" target="_blank" rel="noreferrer">
                  Contatti
                </a>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/cookie-policy">Cookie</Link>
              </li>
              <li>
                <Link href="/gdpr">GDPR</Link>
              </li>
              <li>
                <Link href="/termini">Termini</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">&copy; 2026 BNDO</div>
      </footer>
    </>
  );
}
