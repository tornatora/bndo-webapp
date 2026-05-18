'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { Sparkles, UserCircle, Video, ShieldCheck, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { APP_URL } from '@/shared/lib';

const BANDO_OPTIONS = [
  { id: 'resto-al-sud-2-0', label: 'Resto al Sud 2.0', desc: 'Per nuove imprese in Abruzzo, Basilicata, Calabria, Campania, Molise, Puglia, Sardegna, Sicilia' },
  { id: 'autoimpiego-centro-nord', label: 'Autoimpiego Centro Nord', desc: 'Per nuove imprese in Centro e Nord Italia' },
] as const;

type PlanKey = 'agent' | 'consultant' | 'videocall';

const PLAN_DATA: Record<PlanKey, { title: string; price: string; icon: typeof Sparkles; features: string[] }> = {
  agent: {
    title: 'Avviare pratica con Agente AI',
    price: '200 €',
    icon: Sparkles,
    features: [
      'Assistenza AI dedicata 24/7',
      'Compilazione automatica modulistica',
      'Verifica requisiti in tempo reale',
      'Risposte immediate',
    ],
  },
  consultant: {
    title: 'Avviare pratica con Consulente BNDO',
    price: '400 €',
    icon: UserCircle,
    features: [
      'Consulente BNDO dedicato al tuo progetto',
      'Analisi approfondita dei requisiti del bando scelto',
      'Compilazione e revisione di tutta la documentazione necessaria',
      'Supporto nella preparazione del business plan',
      'Assistenza nella raccolta degli allegati richiesti dal bando',
      'Affiancamento continuo fino all\'erogazione del contributo',
    ],
  },
  videocall: {
    title: 'Videochiamata gratuita',
    price: 'Gratuita',
    icon: Video,
    features: [
      '30 minuti di consulenza individuale con un esperto BNDO',
      'Valutazione preliminare del tuo progetto e delle tue idee',
      'Analisi dei bandi più adatti al tuo profilo e alla tua regione',
      'Spiegazione dettagliata del processo di richiesta contributo',
      'Risposte personalizzate a tutte le tue domande',
      'Nessun impegno: decidi tu se e come procedere dopo la call',
    ],
  },
};

export default function AvvioPraticaPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const email = sp.get('email');
  const quizId = sp.get('quiz_id');
  const nome = sp.get('nome');
  const bandoParam = sp.get('bando');

  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.resolve(null)))
      .then((data) => {
        setAuthenticated(data?.authenticated === true);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setAuthLoading(false));
  }, []);

  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showBandoChoice, setShowBandoChoice] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);

  const handlePlanClick = useCallback(
    (plan: PlanKey) => {
      if (plan === 'videocall') {
        window.open('https://calendly.com/admin-bndo/30min', '_blank');
        return;
      }
      setSelectedPlan(plan);
      if (!email) {
        // Dashboard user (already authenticated)
        if (plan === 'consultant') {
          setShowBandoChoice(true);
          return;
        }
        router.push('/quiz');
        return;
      }
      setShowPasswordModal(true);
    },
    [email, router]
  );

  const handleBandoSelect = useCallback((bandoId: string) => {
    setShowBandoChoice(false);
    router.push(`/dashboard/pia-flow?bando=${bandoId}`);
  }, [router]);

  const handleCreateAccount = useCallback(async () => {
    setPasswordError(null);

    if (password.length < 8) {
      setPasswordError('La password deve essere di almeno 8 caratteri.');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Le password non corrispondono.');
      return;
    }

    setIsCreatingAccount(true);
    try {
      const res = await fetch('/api/auth/create-from-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nome, quiz_id: quizId, plan: selectedPlan }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || 'Errore durante la creazione dell\'account.');
        setIsCreatingAccount(false);
        return;
      }

      setAccountCreated(true);
      setIsCreatingAccount(false);

      // Redirect after brief success state
      setTimeout(() => {
        const target = selectedPlan === 'agent'
          ? '/dashboard/new-practice?mode=chat'
          : selectedPlan === 'consultant'
            ? `/dashboard/pia-flow?bando=${bandoParam || 'resto-al-sud-2-0'}`
            : '/dashboard/pratiche';
        window.location.href = target;
      }, 1500);
    } catch {
      setPasswordError('Errore di connessione. Riprova.');
      setIsCreatingAccount(false);
    }
  }, [email, password, confirmPassword, nome, quizId, selectedPlan, bandoParam]);

  return (
    <div className="avvio-pratica-page">
      <div className="avvio-pratica-header">
        <h1 className="avvio-pratica-title">
          {nome ? `Ciao ${nome},` : 'Benvenuto su BNDO'}
        </h1>
        <p className="avvio-pratica-subtitle">
          Scegli come vuoi avviare la tua pratica per ottenere fino a <strong>200.000€ a fondo perduto</strong>
        </p>

        {!authenticated && !authLoading && (
          <div className="avvio-pratica-actions">
            <a href={`/login${email ? `?next=/dashboard/avviopratica?email=${encodeURIComponent(email)}${bandoParam ? `&bando=${encodeURIComponent(bandoParam)}` : ''}` : ''}`} className="avvio-btn avvio-btn--primary">
              Accedi
            </a>
            <a href="/esplora" className="avvio-btn avvio-btn--ghost">
              Esplora piattaforma
            </a>
          </div>
        )}
      </div>

      <div className="avvio-pratica-plans">
        {(Object.entries(PLAN_DATA) as [PlanKey, typeof PLAN_DATA['agent']][]).filter(([key]) => key !== 'agent').map(([key, plan]) => {
          const Icon = plan.icon;
          const isSelected = selectedPlan === key;
          return (
            <button
              key={key}
              type="button"
              className={`avvio-pratica-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() => handlePlanClick(key)}
            >
              <div className="avvio-pratica-card-badge">
                {key === 'agent' && <Sparkles size={20} />}
                {key === 'consultant' && <UserCircle size={20} />}
                {key === 'videocall' && <Video size={20} />}
              </div>
              <h2 className="avvio-pratica-card-title">{plan.title}</h2>
              <div className="avvio-pratica-card-price">{plan.price}</div>
              <ul className="avvio-pratica-card-features">
                {plan.features.map((f, i) => (
                  <li key={i}>
                    <CheckCircle size={14} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="avvio-pratica-card-action">
                <span>{key === 'videocall' ? 'Prenota call' : 'Scegli'}</span>
                <ArrowRight size={16} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="avvio-pratica-footer">
        <ShieldCheck size={16} />
        <span>
          I tuoi dati sono protetti. BNDO utilizza crittografia end-to-end per tutte le comunicazioni.
        </span>
      </div>

      {/* Password creation modal */}
      {showPasswordModal && !accountCreated && (
        <div className="avvio-pratica-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="avvio-pratica-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="avvio-pratica-modal-title">Crea il tuo account</h3>
            <p className="avvio-pratica-modal-desc">
              Imposta una password per <strong>{email}</strong> e accedi subito a BNDO.
            </p>

            <div className="avvio-pratica-modal-field">
              <label htmlFor="ap-password">Password</label>
              <input
                id="ap-password"
                type="password"
                placeholder="Minimo 8 caratteri"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="avvio-pratica-modal-field">
              <label htmlFor="ap-confirm">Conferma password</label>
              <input
                id="ap-confirm"
                type="password"
                placeholder="Ripeti la password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {passwordError && <div className="avvio-pratica-modal-error">{passwordError}</div>}

            <button
              type="button"
              className="avvio-pratica-modal-btn"
              onClick={handleCreateAccount}
              disabled={isCreatingAccount}
            >
              {isCreatingAccount ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Creazione account...
                </>
              ) : (
                'Crea account e accedi'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Bando selection modal for dashboard users */}
      {showBandoChoice && (
        <div className="avvio-pratica-overlay" onClick={() => setShowBandoChoice(false)}>
          <div className="avvio-pratica-modal avvio-bando-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="avvio-pratica-modal-title">Scegli il bando</h3>
            <p className="avvio-pratica-modal-desc">
              Seleziona per quale bando vuoi avviare la pratica con un consulente BNDO.
            </p>
            <div className="avvio-bando-options">
              {BANDO_OPTIONS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="avvio-bando-card"
                  onClick={() => handleBandoSelect(b.id)}
                >
                  <div className="avvio-bando-card-title">{b.label}</div>
                  <div className="avvio-bando-card-desc">{b.desc}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="avvio-bando-cancel"
              onClick={() => setShowBandoChoice(false)}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Success state */}
      {accountCreated && (
        <div className="avvio-pratica-overlay">
          <div className="avvio-pratica-modal avvio-pratica-modal-success">
            <CheckCircle size={48} />
            <h3>Account creato con successo!</h3>
            <p>Stiamo reindirizzandoti alla dashboard...</p>
          </div>
        </div>
      )}

      <style>{`
        .avvio-pratica-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 48px 24px 64px;
        }
        .avvio-pratica-header {
          text-align: center;
          margin-bottom: 48px;
        }
        .avvio-pratica-title {
          font-size: 28px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 12px;
        }
        .avvio-pratica-subtitle {
          font-size: 16px;
          color: var(--text-light);
          margin: 0;
          line-height: 1.5;
        }
        .avvio-pratica-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 20px;
        }
        .avvio-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 24px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .avvio-btn--primary {
          background: #0b1136;
          color: #fff;
          border: none;
        }
        .avvio-btn--primary:hover {
          background: #1a2460;
        }
        .avvio-btn--ghost {
          background: transparent;
          color: #0b1136;
          border: 1.5px solid #0b1136;
        }
        .avvio-btn--ghost:hover {
          background: rgba(11,17,54,0.05);
        }
        .avvio-pratica-plans {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
          max-width: 720px;
          margin: 0 auto;
        }
        .avvio-pratica-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 32px 24px;
          border-radius: 16px;
          border: 2px solid var(--border);
          background: var(--bg);
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
          width: 100%;
        }
        .avvio-pratica-card:hover {
          border-color: #22c55f;
          box-shadow: 0 4px 20px rgba(34, 197, 94, 0.1);
          transform: translateY(-2px);
        }
        .avvio-pratica-card.is-selected {
          border-color: #22c55f;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
        }
        .avvio-pratica-card-badge {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(34, 197, 94, 0.1);
          color: #22c55f;
          margin-bottom: 16px;
        }
        .avvio-pratica-card-title {
          font-size: 17px;
          font-weight: 600;
          color: var(--text);
          margin: 0 0 8px;
          line-height: 1.3;
        }
        .avvio-pratica-card-price {
          font-size: 28px;
          font-weight: 700;
          color: #22c55f;
          margin-bottom: 16px;
        }
        .avvio-pratica-card-features {
          list-style: none;
          padding: 0;
          margin: 0 0 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }
        .avvio-pratica-card-features li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-light);
          text-align: left;
        }
        .avvio-pratica-card-features li svg {
          flex-shrink: 0;
          color: var(--green);
        }
        .avvio-pratica-card-action {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 600;
          color: #22c55f;
          margin-top: auto;
        }
        .avvio-pratica-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 40px;
          font-size: 13px;
          color: var(--text-light);
        }

        /* Modal */
        .avvio-pratica-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 24px;
        }
        .avvio-pratica-modal {
          background: var(--bg);
          border-radius: 16px;
          padding: 32px;
          max-width: 420px;
          width: 100%;
        }
        .avvio-pratica-modal-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 8px;
        }
        .avvio-pratica-modal-desc {
          font-size: 14px;
          color: var(--text-light);
          margin: 0 0 24px;
          line-height: 1.5;
        }
        .avvio-pratica-modal-field {
          margin-bottom: 16px;
        }
        .avvio-pratica-modal-field label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 6px;
          color: var(--text);
        }
        .avvio-pratica-modal-field input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid var(--border);
          font-size: 15px;
          background: var(--bg);
          color: var(--text);
          outline: none;
          transition: border-color 0.15s ease;
          box-sizing: border-box;
        }
        .avvio-pratica-modal-field input:focus {
          border-color: #22c55f;
        }
        .avvio-pratica-modal-error {
          font-size: 13px;
          color: #ef4444;
          margin-bottom: 16px;
        }
        .avvio-pratica-modal-btn {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: none;
          background: #22c55f;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.15s ease;
          font-family: inherit;
        }
        .avvio-pratica-modal-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .avvio-pratica-modal-btn:not(:disabled):hover {
          opacity: 0.9;
        }
        .avvio-pratica-modal-success {
          text-align: center;
        }
        .avvio-pratica-modal-success svg {
          color: var(--green);
          margin-bottom: 16px;
        }
        .avvio-pratica-modal-success h3 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 8px;
        }
        .avvio-pratica-modal-success p {
          font-size: 14px;
          color: var(--text-light);
          margin: 0;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Bando selection */
        .avvio-bando-modal {
          max-width: 480px;
        }
        .avvio-bando-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }
        .avvio-bando-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 20px;
          border-radius: 12px;
          border: 1.5px solid var(--border, #e5e7eb);
          background: var(--bg, #fff);
          cursor: pointer;
          transition: all .2s ease;
          font-family: inherit;
          text-align: left;
          width: 100%;
        }
        .avvio-bando-card:hover {
          border-color: #0acf83;
          box-shadow: 0 2px 12px rgba(10,207,131,.12);
        }
        .avvio-bando-card:active {
          transform: scale(.98);
        }
        .avvio-bando-card-title {
          font-size: 15px;
          font-weight: 600;
          color: #0B1136;
        }
        .avvio-bando-card-desc {
          font-size: 12px;
          color: rgba(11,17,54,.55);
          line-height: 1.5;
        }
        .avvio-bando-cancel {
          background: none;
          border: none;
          color: rgba(11,17,54,.4);
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          text-decoration: underline;
          width: 100%;
          text-align: center;
          padding: 8px;
        }
        .avvio-bando-cancel:hover {
          color: rgba(11,17,54,.6);
        }

        @media (max-width: 768px) {
          .avvio-pratica-plans {
            grid-template-columns: 1fr;
            max-width: 400px;
            margin: 0 auto;
          }
          .avvio-pratica-title {
            font-size: 22px;
          }
          .avvio-pratica-page {
            padding: 32px 16px 48px;
          }
        }
      `}</style>
    </div>
  );
}
