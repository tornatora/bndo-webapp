import Link from 'next/link';
import Image from 'next/image';

export function LegalShell({
  title,
  subtitle,
  updatedAtLabel,
  children
}: {
  title: string;
  subtitle?: string;
  updatedAtLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header id="header">
        <nav>
          <div className="logo">
            <Link href="/" aria-label="BNDO">
              <Image src="/Logo-BNDO-header.png" alt="BNDO" width={220} height={64} priority />
            </Link>
          </div>
          <ul className="nav-menu">
            <li>
              <Link href="/#bandi">Bandi</Link>
            </li>
            <li>
              <Link href="/#servizi">Servizi</Link>
            </li>
            <li>
              <Link href="/#processo">Processo</Link>
            </li>
            <li>
              <Link href="/quiz/autoimpiego" className="btn-nav">
                <span>Inizia ora</span>
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main className="legal-main">
        <section className="legal-hero">
          <h1 className="legal-title">{title}</h1>
          {subtitle ? <p className="legal-subtitle">{subtitle}</p> : null}
          {updatedAtLabel ? <div className="legal-updated">{updatedAtLabel}</div> : null}
        </section>

        <section className="legal-content">
          <div className="legal-prose">{children}</div>
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
                <Link href="/#bandi">Resto al Sud 2.0</Link>
              </li>
              <li>
                <Link href="/#bandi">Autoimpiego Centro Nord</Link>
              </li>
              <li>
                <Link href="/#servizi">Servizi</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Processo</h4>
            <ul>
              <li>
                <Link href="/#processo">Come funziona</Link>
              </li>
              <li>
                <Link href="/#servizi">Costi</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Supporto</h4>
            <ul>
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

