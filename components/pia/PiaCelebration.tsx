'use client';

type PiaCelebrationProps = {
  bandoTitle: string;
  onViewPractice: () => void;
};

export function PiaCelebration({ bandoTitle, onViewPractice }: PiaCelebrationProps) {
  return (
    <div className="pia-celebration">
      <div className="pia-cel-content">
        <div className="pia-cel-ring">
          <div className="pia-cel-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0acf83" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        <div className="pia-cel-rings">
          <div className="pia-cel-ring-bg r1"></div>
          <div className="pia-cel-ring-bg r2"></div>
          <div className="pia-cel-ring-bg r3"></div>
        </div>

        <h1>Richiesta inviata!</h1>
        <p className="pia-cel-sub">
          La tua pratica per <strong>{bandoTitle}</strong> &egrave; stata completata con successo.
        </p>

        <div className="pia-cel-info">
          <div className="pia-cel-info-item">
            <span className="pia-cel-info-label">Cosa succede ora?</span>
            <span className="pia-cel-info-value">
              Il nostro team esaminer&agrave; la tua richiesta. Riceverai una notifica non appena sar&agrave; stata presa in carico da un consulente.
            </span>
          </div>
          <div className="pia-cel-info-item">
            <span className="pia-cel-info-label">Tempi previsti</span>
            <span className="pia-cel-info-value">
              Solitamente entro 24-48 ore lavorative.
            </span>
          </div>
        </div>

        <button className="pia-btn-primary" onClick={onViewPractice}>
          Vedi dettagli pratica &rarr;
        </button>
      </div>

      <style>{`
        .pia-celebration {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          width: 100%;
          min-height: calc(100vh - 120px);
          background: radial-gradient(circle at 50% 30%, rgba(10,207,131,.04) 0%, transparent 50%);
        }
        .pia-cel-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 440px;
          position: relative;
          animation: celFadeIn .6s cubic-bezier(.16,1,.3,1);
        }
        @keyframes celFadeIn {
          0%   { opacity: 0; transform: translateY(30px) scale(.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .pia-cel-ring {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: rgba(10,207,131,.1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          position: relative;
          z-index: 1;
        }
        .pia-cel-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #0acf83;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: celPop .5s cubic-bezier(.34,1.56,.64,1) .2s both;
        }
        @keyframes celPop {
          0%   { transform: scale(0); }
          60%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .pia-cel-rings {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 0;
        }
        .pia-cel-ring-bg {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(10,207,131,.15);
          animation: celRingPulse 2.5s ease-in-out infinite;
        }
        .pia-cel-ring-bg.r1 { width: 120px; height: 120px; top: -20px; left: -60px; animation-delay: 0s; }
        .pia-cel-ring-bg.r2 { width: 160px; height: 160px; top: -40px; left: -80px; animation-delay: .4s; }
        .pia-cel-ring-bg.r3 { width: 200px; height: 200px; top: -60px; left: -100px; animation-delay: .8s; }
        @keyframes celRingPulse {
          0%, 100% { transform: scale(1); opacity: .5; }
          50%      { transform: scale(1.05); opacity: 1; }
        }
        .pia-cel-content h1 {
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.03em;
          color: var(--navy, #0B1136);
          margin: 0 0 8px;
          position: relative;
          z-index: 1;
        }
        .pia-cel-sub {
          font-size: 13px;
          color: rgba(11,17,54,0.6);
          line-height: 1.7;
          letter-spacing: -0.01em;
          margin: 0 0 32px;
          position: relative;
          z-index: 1;
        }
        .pia-cel-sub strong { color: var(--navy, #0B1136); font-weight: 700; }
        .pia-cel-info {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          margin-bottom: 32px;
          position: relative;
          z-index: 1;
        }
        .pia-cel-info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px 20px;
          background: #FAFBFC;
          border: 0.5px solid rgba(11,17,54,0.06);
          border-radius: 12px;
          text-align: left;
        }
        .pia-cel-info-label {
          font-size: 10px;
          font-weight: 600;
          color: rgba(11,17,54,0.4);
          letter-spacing: -0.01em;
          text-transform: uppercase;
        }
        .pia-cel-info-value {
          font-size: 12px;
          color: rgba(11,17,54,0.7);
          line-height: 1.6;
          letter-spacing: -0.01em;
        }
        .pia-btn-primary {
          min-width: 220px;
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
          z-index: 1;
          overflow: hidden;
          white-space: nowrap;
        }
        .pia-btn-primary:hover {
          background: linear-gradient(135deg, var(--green, #0acf83), var(--green-dark, #16a34a));
        }
        .pia-btn-primary:active { transform: scale(.97); }

        @media (max-width: 480px) {
          .pia-celebration { padding: 48px 20px; }
          .pia-cel-content h1 { font-size: 24px; }
          .pia-cel-sub { font-size: 12px; }
          .pia-cel-ring { width: 64px; height: 64px; }
          .pia-cel-icon { width: 44px; height: 44px; }
          .pia-cel-icon svg { width: 28px; height: 28px; }
        }
      `}</style>
    </div>
  );
}
