'use client';

import { useRef, useState, useEffect } from 'react';
import styles from './BndiHomeView.module.css';

type Props = {
  onStart: () => void;
  onOpenScanner: () => void;
};

export function BndiHomeView({ onOpenScanner: _onOpenScanner }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const appBase = 'https://bndo.it';
  const quizUrl = `${appBase}/quiz/autoimpiego`;
  const privacyUrl = `${appBase}/privacy`;
  const cookieUrl = `${appBase}/cookie-policy`;
  const gdprUrl = `${appBase}/gdpr`;
  const termsUrl = `${appBase}/termini`;

  const scrollTo = (id: 'bandi' | 'servizi' | 'processo') => {
    const node = document.getElementById(`native-home-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 40);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section className={styles.host}>
      <div ref={frameRef} className={styles.frame}>
        <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
          <nav className={styles.nav}>
            <div className={styles.logo}>
              <img src="/Logo-BNDO-header.png" alt="BNDO" width={220} height={64} />
            </div>
            <ul className={styles.navMenu}>
              <li>
                <button type="button" onClick={() => scrollTo('bandi')}>
                  Bandi
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollTo('servizi')}>
                  Servizi
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollTo('processo')}>
                  Processo
                </button>
              </li>
              <li>
                <a href={quizUrl} className={styles.btnNav}>
                  <span>Inizia ora</span>
                </a>
              </li>
            </ul>
          </nav>
        </header>

        <main className={styles.main}>
          <section className={styles.hero}>
            <div className={styles.heroContent}>
              <div className={styles.tag}>Piattaforma con esperti reali</div>
              <h1>Partecipare ad un BNDO non è mai stato così semplice</h1>
              <p className={styles.lead}>
                Partecipare ad un bando di finanza agevolata in maniera semplice, veloce, ordinata e{' '}
                <span className={styles.leadHighlight}>100% digitale</span>.
              </p>
              <div className={styles.ctaGroup}>
                <button type="button" className={styles.btnPrimary} onClick={() => scrollTo('processo')}>
                  <span>Come Funziona</span>
                </button>
              </div>
            </div>
          </section>

          <section className={styles.stats}>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statValue}>€500</div>
                <div className={styles.statLabel}>Presentazione domanda</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>&lt;7</div>
                <div className={styles.statLabel}>Giorni per invio</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>&lt;2h</div>
                <div className={styles.statLabel}>Tempo di risposta</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>2%</div>
                <div className={styles.statLabel}>Success fee se vinci</div>
              </div>
            </div>
          </section>

          <section className={styles.section} id="native-home-bandi">
            <div className={styles.sectionHeader}>
              <div className={styles.label}>Bandi attivi</div>
              <h2>Scegli il bando giusto per te</h2>
              <p className={styles.sectionDesc}>Verifica i requisiti e scopri a quanto puoi accedere</p>
            </div>

            <div className={styles.grid2}>
              <div className={styles.bandoCard}>
                <div className={styles.bandoTop}>
                  <h3 className={styles.bandoTitle}>Resto al Sud 2.0</h3>
                  <div className={styles.bandoBadge}>
                    Abruzzo, Basilicata, Calabria, Campania, Molise, Puglia, Sardegna, Sicilia
                  </div>
                </div>
                <div className={styles.bandoAmount}>
                  <div className={styles.amountLabel}>Contributo massimo</div>
                  <div className={styles.amountValue}>€200k</div>
                  <div className={styles.amountDetail}>fino al 75% a fondo perduto</div>
                </div>
                <div className={styles.bandoSpecs}>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Età</div>
                    <div className={styles.specValue}>18-35 anni non compiuti</div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Requisiti</div>
                    <div className={styles.specValue}>Disoccupato, inoccupato, inattivo, working poor, GOL</div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Voucher</div>
                    <div className={styles.specValue}>
                      <span className={styles.specHighlight}>€40k-50k</span> 100% a fondo perduto
                    </div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Programma ≤€120k</div>
                    <div className={styles.specValue}>
                      <span className={styles.specHighlight}>75%</span> a fondo perduto
                    </div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Programma €120k-200k</div>
                    <div className={styles.specValue}>
                      <span className={styles.specHighlight}>70%</span> a fondo perduto
                    </div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Settori</div>
                    <div className={styles.specValue}>Tutti (escluso agricoltura/pesca)</div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Scadenza</div>
                    <div className={styles.specValue}>A sportello fino a esaurimento fondi</div>
                  </div>
                </div>
                <div className={styles.bandoFooter}>
                  <a href={quizUrl} className={styles.bandoBtn}>
                    <span>Verifica requisiti</span>
                  </a>
                </div>
              </div>

              <div className={styles.bandoCard}>
                <div className={styles.bandoTop}>
                  <h3 className={styles.bandoTitle}>Autoimpiego Centro Nord</h3>
                  <div className={styles.bandoBadge}>
                    Piemonte, Valle d&apos;Aosta, Liguria, Lombardia, Veneto, Friuli, Trentino, Emilia-R., Toscana, Lazio,
                    Umbria, Marche
                  </div>
                </div>
                <div className={styles.bandoAmount}>
                  <div className={styles.amountLabel}>Contributo massimo</div>
                  <div className={styles.amountValue}>€200k</div>
                  <div className={styles.amountDetail}>fino al 65% a fondo perduto</div>
                </div>
                <div className={styles.bandoSpecs}>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Età</div>
                    <div className={styles.specValue}>18-35 anni non compiuti</div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Requisiti</div>
                    <div className={styles.specValue}>Disoccupato, inoccupato, inattivo, working poor, GOL</div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Voucher</div>
                    <div className={styles.specValue}>
                      <span className={styles.specHighlight}>€30k-40k</span> 100% a fondo perduto
                    </div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Programma ≤€120k</div>
                    <div className={styles.specValue}>
                      <span className={styles.specHighlight}>65%</span> a fondo perduto
                    </div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Programma €120k-200k</div>
                    <div className={styles.specValue}>
                      <span className={styles.specHighlight}>60%</span> a fondo perduto
                    </div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Settori</div>
                    <div className={styles.specValue}>Industria, artigianato, servizi, turismo, commercio</div>
                  </div>
                  <div className={styles.specRow}>
                    <div className={styles.specLabel}>Scadenza</div>
                    <div className={styles.specValue}>A sportello fino a esaurimento fondi</div>
                  </div>
                </div>
                <div className={styles.bandoFooter}>
                  <a href={quizUrl} className={styles.bandoBtn}>
                    <span>Verifica requisiti</span>
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.sectionBg} id="native-home-servizi">
            <div className={styles.sectionInner}>
              <div className={styles.sectionHeader}>
                <div className={styles.label}>Come funziona</div>
                <h2>Prezzi chiari e trasparenti</h2>
                <p className={styles.sectionDesc}>
                  Paghi solo €500 per la presentazione della domanda, poi success fee solo se vinci il bando
                </p>
              </div>
              <div className={styles.grid2}>
                <div className={styles.serviziCard}>
                  <h3>Cosa include il servizio</h3>
                  <div className={styles.serviziList}>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>✓</div>
                      <div className={styles.serviziText}>
                        <strong>Verifica requisiti completa</strong> - Analizziamo il tuo profilo e ti diciamo esattamente a
                        quale bando puoi accedere
                      </div>
                    </div>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>✓</div>
                      <div className={styles.serviziText}>
                        <strong>Business plan professionale</strong> - Creiamo insieme un business plan completo formato
                        Invitalia con previsioni triennali
                      </div>
                    </div>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>✓</div>
                      <div className={styles.serviziText}>
                        <strong>Compilazione domanda completa</strong> - I nostri consulenti compilano e inviano la domanda
                        per te
                      </div>
                    </div>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>✓</div>
                      <div className={styles.serviziText}>
                        <strong>Consulente dedicato</strong> - Un esperto reale di finanza agevolata assegnato a te
                      </div>
                    </div>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>✓</div>
                      <div className={styles.serviziText}>
                        <strong>Raccolta documenti assistita</strong> - Ti aiutiamo con P.IVA, conto corrente, SPID, firma
                        digitale e tutta la documentazione
                      </div>
                    </div>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>✓</div>
                      <div className={styles.serviziText}>
                        <strong>Monitoraggio pratica</strong> - Seguiamo la valutazione e gestiamo eventuali integrazioni
                        richieste da Invitalia
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.serviziCard}>
                  <h3>Struttura dei costi</h3>
                  <div className={styles.priceHighlight}>
                    <div className={styles.priceLabelSmall}>Presentazione domanda</div>
                    <div className={styles.priceAmount}>€500</div>
                    <div className={styles.priceNote}>Pagamento unico dopo verifica requisiti</div>
                  </div>
                  <div className={styles.pricingBreakdown}>
                    <div className={styles.pricingRow}>
                      <div className={styles.pricingLabel}>Se il bando viene approvato</div>
                      <div className={styles.pricingValue}>2% sul contributo</div>
                    </div>
                    <div className={styles.pricingRow}>
                      <div className={styles.pricingLabel}>Assistenza rendicontazione completa</div>
                      <div className={styles.pricingValue}>+3% sul contributo</div>
                    </div>
                  </div>
                  <div className={styles.serviziList}>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>•</div>
                      <div className={styles.serviziText}>Se il bando non viene approvato, paghi solo i €500 iniziali</div>
                    </div>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>•</div>
                      <div className={styles.serviziText}>Nessun costo nascosto o commissione aggiuntiva</div>
                    </div>
                    <div className={styles.serviziItem}>
                      <div className={styles.serviziIcon}>•</div>
                      <div className={styles.serviziText}>
                        Assistenza rendicontazione opzionale (gestione spese, erogazioni, comunicazioni Invitalia)
                      </div>
                    </div>
                  </div>
                  <a href={quizUrl} className={styles.bandoBtn}>
                    <span>Inizia ora</span>
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section} id="native-home-processo">
            <div className={styles.sectionHeader}>
              <div className={styles.label}>Il processo</div>
              <h2>5 step per ottenere i contributi</h2>
              <p className={styles.sectionDesc}>Un processo chiaro e guidato da esperti reali</p>
            </div>
            <div className={styles.process}>
              <div className={styles.step}>
                <div className={styles.stepNum}>01</div>
                <div className={styles.stepContent}>
                  <h3>Verifica requisiti</h3>
                  <p>
                    Compila il nostro form rapido e scopri in tempo reale se hai tutti i requisiti per partecipare ai bandi
                    disponibili. Gratuito e senza impegno.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>02</div>
                <div className={styles.stepContent}>
                  <h3>Raccolta documenti</h3>
                  <p>
                    Il tuo consulente dedicato ti guida nella raccolta e preparazione di tutti i documenti necessari. Ti
                    aiutiamo con P.IVA, conto corrente, SPID e firma digitale.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>03</div>
                <div className={styles.stepContent}>
                  <h3>Business plan</h3>
                  <p>
                    Creiamo insieme un business plan completo con previsioni economico-finanziarie triennali secondo il
                    formato richiesto dal bando Invitalia.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>04</div>
                <div className={styles.stepContent}>
                  <h3>Invio domanda</h3>
                  <p>
                    Dopo il controllo finale, procediamo all&apos;invio della domanda. Monitoriamo costantemente lo stato e
                    gestiamo eventuali integrazioni richieste.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>05</div>
                <div className={styles.stepContent}>
                  <h3>Post-approvazione (opzionale)</h3>
                  <p>
                    Se scegli il pacchetto completo, ti seguiamo anche dopo l&apos;approvazione: gestione rendicontazione,
                    comunicazioni con Invitalia, richieste di erogazione e supporto fino all&apos;erogazione finale.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.ctaSection}>
            <div className={styles.ctaContent}>
              <h2>Inizia ora la tua pratica</h2>
              <p>Verifica gratuitamente se hai i requisiti per i bandi</p>
              <a href={quizUrl} className={`${styles.btnPrimary} ${styles.btnPrimaryWhite}`}>
                <span>Verifica requisiti gratis</span>
              </a>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerGrid}>
            <div className={styles.footerCol}>
              <h4>BNDO</h4>
              <p>La piattaforma con esperti reali per i bandi pubblici Resto al Sud 2.0 e Autoimpiego Centro Nord</p>
            </div>
            <div className={styles.footerCol}>
              <h4>Bandi</h4>
              <ul>
                <li>
                  <button type="button" onClick={() => scrollTo('bandi')}>
                    Resto al Sud 2.0
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollTo('bandi')}>
                    Autoimpiego Centro Nord
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollTo('servizi')}>
                    Servizi
                  </button>
                </li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4>Processo</h4>
              <ul>
                <li>
                  <button type="button" onClick={() => scrollTo('processo')}>
                    Come funziona
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollTo('servizi')}>
                    Costi
                  </button>
                </li>
                <li>
                  <a href="#">FAQ</a>
                </li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4>Supporto</h4>
              <ul>
                <li>
                  <a href="https://wa.me/393477298671" target="_blank" rel="noreferrer">
                    Contatti
                  </a>
                </li>
                <li>
                  <a href={privacyUrl}>Privacy</a>
                </li>
                <li>
                  <a href={cookieUrl}>Cookie</a>
                </li>
                <li>
                  <a href={gdprUrl}>GDPR</a>
                </li>
                <li>
                  <a href={termsUrl}>Termini</a>
                </li>
              </ul>
            </div>
          </div>
          <div className={styles.footerBottom}>© 2026 BNDO</div>
        </footer>
      </div>
    </section>
  );
}
