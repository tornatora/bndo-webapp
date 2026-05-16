'use client';

type PiaWelcomeProps = {
  bandoTitle: string;
  onStart: () => void;
};

export function PiaWelcome({ bandoTitle, onStart }: PiaWelcomeProps) {
  return (
    <div className="pia-welcome">
      <div className="pia-welcome-left">
        <div className="pia-wl-content">
          <div className="pia-wi-icon">&#10024;</div>
          <h1>Pronto per la<br />tua richiesta</h1>
          <p>
            Stai per inviare la tua richiesta per i contributi <strong>{bandoTitle}</strong> con il nostro servizio di compilazione assistita.
          </p>
          <p>
            Prima devi caricare i tuoi documenti e rispondere a qualche domanda.<br />
            Ci vorr&agrave; <span className="pia-green-highlight">meno di 1 minuto</span>.
          </p>
          <button className="pia-btn-primary" onClick={onStart}>
            <span>Iniziamo &rarr;</span>
          </button>
        </div>
      </div>

      <div className="pia-welcome-right">
        <div className="pia-tech-ring r1"></div>
        <div className="pia-tech-ring r2"></div>
        <div className="pia-wr-content">
          <div className="pia-wr-label">&#128221; Documenti necessari</div>
          <div className="pia-wr-intro">Per procedere ti serviranno i seguenti documenti:</div>
          <div className="pia-wr-divider"></div>

          <div className="pia-wr-item">
            <span className="pia-wr-dot"></span>
            <span className="pia-wr-body">Documento Identit&agrave;</span>
            <span className="pia-wr-tag req">Obbligatorio</span>
          </div>
          <div className="pia-wr-item">
            <span className="pia-wr-dot"></span>
            <span className="pia-wr-body">Visura Camerale / P.IVA</span>
            <span className="pia-wr-tag req">Obbligatorio</span>
          </div>
          <div className="pia-wr-item">
            <span className="pia-wr-dot"></span>
            <span className="pia-wr-body">DID &mdash; Dichiarazione Disponibilit&agrave;</span>
            <span className="pia-wr-tag req">Obbligatorio</span>
          </div>

          <div className="pia-wr-divider"></div>

          <div className="pia-wr-item">
            <span className="pia-wr-dot"></span>
            <span className="pia-wr-body">Curriculum Vitae</span>
            <span className="pia-wr-tag opt">Facoltativo</span>
          </div>

          <div className="pia-wr-footnote">&#9888;&#65039; Se non hai un documento facoltativo, ti faremo 2 domande in pi&ugrave;.</div>
        </div>
      </div>

      <style>{`
        .pia-welcome {
          flex: 1;
          display: flex;
          flex-direction: row;
          width: 100%;
          min-height: calc(100vh - 120px);
        }
        .pia-welcome-left {
          flex: 0 0 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 72px;
          position: relative;
          overflow: hidden;
          background: radial-gradient(circle at 20% 80%, rgba(11,17,54,.03) 0%, transparent 50%);
        }
        .pia-welcome-right {
          flex: 0 0 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 72px;
          background: var(--navy, #0B1136);
          position: relative;
          overflow: hidden;
          background-image: linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .pia-welcome-right::before {
          content: '';
          position: absolute;
          top: -15%;
          left: -8%;
          width: 400px;
          height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(10,207,131,.05) 0%, transparent 60%);
          pointer-events: none;
        }
        .pia-welcome-right::after {
          content: '';
          position: absolute;
          bottom: -15%;
          right: -8%;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.03) 0%, transparent 60%);
          pointer-events: none;
        }
        .pia-tech-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,.04);
          pointer-events: none;
        }
        .pia-tech-ring.r1 { top: 40px; right: 50px; width: 70px; height: 70px; }
        .pia-tech-ring.r2 { top: 46px; right: 56px; width: 104px; height: 104px; }
        .pia-wl-content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pia-wi-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(10,207,131,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          margin-bottom: -2px;
        }
        .pia-wl-content h1 {
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.03em;
          color: var(--navy, #0B1136);
          line-height: 1.15;
          margin: 0;
        }
        .pia-wl-content p {
          font-size: 13px;
          color: rgba(11,17,54,0.6);
          line-height: 1.7;
          letter-spacing: -0.01em;
          max-width: 360px;
          margin: 0;
        }
        .pia-wl-content p strong { color: var(--navy, #0B1136); font-weight: 700; }
        .pia-green-highlight { color: var(--green-dark, #16a34a); font-weight: 700; }
        .pia-btn-primary {
          margin-top: 8px;
          min-width: 200px;
          font-weight: 500;
          padding: 16px 32px;
          border: none;
          border-radius: 12px;
          background: var(--navy, #0B1136);
          color: #fff;
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          letter-spacing: -0.01em;
          min-height: 48px;
          transition: all .25s;
          position: relative;
          overflow: hidden;
          white-space: nowrap;
          align-self: flex-start;
        }
        .pia-btn-primary:hover {
          background: linear-gradient(135deg, var(--green, #0acf83), var(--green-dark, #16a34a));
        }
        .pia-btn-primary:active { transform: scale(.97); }
        .pia-btn-primary span { position: relative; z-index: 1; }

        .pia-wr-content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pia-wr-label {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: #fff;
        }
        .pia-wr-intro {
          font-size: 11.1px;
          color: rgba(255,255,255,.45);
          line-height: 1.55;
          letter-spacing: -0.01em;
          margin-bottom: 2px;
        }
        .pia-wr-divider {
          height: 0.5px;
          background: rgba(255,255,255,.08);
          margin: 4px 0;
        }
        .pia-wr-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 0;
        }
        .pia-wr-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,.3);
          flex-shrink: 0;
        }
        .pia-wr-body {
          flex: 1;
          min-width: 0;
          font-size: 11.1px;
          color: rgba(255,255,255,.85);
          letter-spacing: -0.01em;
          line-height: 1.4;
        }
        .pia-wr-tag {
          font-size: 8px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 999px;
          flex-shrink: 0;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }
        .pia-wr-tag.req {
          background: rgba(255,255,255,.12);
          color: rgba(255,255,255,.7);
        }
        .pia-wr-tag.opt {
          background: rgba(217,119,6,.2);
          color: #FBBF24;
        }
        .pia-wr-footnote {
          font-size: 9px;
          color: rgba(255,255,255,.4);
          line-height: 1.5;
          letter-spacing: -0.01em;
          margin-top: 2px;
        }

        @media (max-width: 768px) {
          .pia-welcome { flex-direction: column; }
          .pia-welcome-left {
            flex: none;
            padding: 44px 28px 28px;
          }
          .pia-wl-content { gap: 16px; }
          .pia-wi-icon { width: 40px; height: 40px; font-size: 18px; }
          .pia-wl-content h1 { font-size: 24px; }
          .pia-wl-content p { font-size: 12px; max-width: 100%; }
          .pia-welcome-right {
            flex: none;
            padding: 36px 28px;
          }
          .pia-tech-ring { display: none; }
        }
      `}</style>
    </div>
  );
}
