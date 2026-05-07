'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { Sparkles, UserCircle, Video, ShieldCheck, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { APP_URL } from '@/shared/lib';

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
      'Consulente BNDO dedicato',
      'Supporto personalizzato completo',
      'Review documentale approfondita',
      'Affiancamento fino all\'erogazione',
    ],
  },
  videocall: {
    title: 'Videochiamata gratuita',
    price: 'Gratuita',
    icon: Video,
    features: [
      '15 minuti con un consulente',
      'Valutazione preliminare del progetto',
      'Risposte alle tue domande',
      'Nessun impegno',
    ],
  },
};

export default function AvvioPraticaPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('email');
  const quizId = searchParams.get('quiz_id');
  const nome = searchParams.get('nome');

  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);

  const handlePlanClick = useCallback(
    (plan: PlanKey) => {
      setSelectedPlan(plan);
      if (!email) {
        router.push('/quiz');
        return;
      }
      setShowPasswordModal(true);
    },
    [email, router]
  );

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
            ? '/dashboard/new-practice?mode=consultant'
            : '/dashboard/pratiche';
        window.location.href = target;
      }, 1500);
    } catch {
      setPasswordError('Errore di connessione. Riprova.');
      setIsCreatingAccount(false);
    }
  }, [email, password, confirmPassword, nome, quizId, selectedPlan]);

  return (
    <div className="avvio-pratica-page">
      <div className="avvio-pratica-header">
        <h1 className="avvio-pratica-title">
          {nome ? `Ciao ${nome},` : 'Benvenuto su BNDO'}
        </h1>
        <p className="avvio-pratica-subtitle">
          Scegli come vuoi avviare la tua pratica per ottenere fino a <strong>200.000€ a fondo perduto</strong>
        </p>
      </div>

      <div className="avvio-pratica-plans">
        {(Object.entries(PLAN_DATA) as [PlanKey, typeof PLAN_DATA['agent']][]).map(([key, plan]) => {
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
                <span>Scegli</span>
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
          color: var(--color-text, #111);
          margin: 0 0 12px;
        }
        .avvio-pratica-subtitle {
          font-size: 16px;
          color: var(--color-text-secondary, #555);
          margin: 0;
          line-height: 1.5;
        }
        .avvio-pratica-plans {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        .avvio-pratica-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 32px 24px;
          border-radius: 16px;
          border: 2px solid var(--color-border, #e5e7eb);
          background: var(--color-surface, #fff);
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
          width: 100%;
        }
        .avvio-pratica-card:hover {
          border-color: var(--color-accent, #6366f1);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.1);
          transform: translateY(-2px);
        }
        .avvio-pratica-card.is-selected {
          border-color: var(--color-accent, #6366f1);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        .avvio-pratica-card-badge {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-accent-light, #eef2ff);
          color: var(--color-accent, #6366f1);
          margin-bottom: 16px;
        }
        .avvio-pratica-card-title {
          font-size: 17px;
          font-weight: 600;
          color: var(--color-text, #111);
          margin: 0 0 8px;
          line-height: 1.3;
        }
        .avvio-pratica-card-price {
          font-size: 28px;
          font-weight: 700;
          color: var(--color-accent, #6366f1);
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
          color: var(--color-text-secondary, #555);
          text-align: left;
        }
        .avvio-pratica-card-features li svg {
          flex-shrink: 0;
          color: #22c55e;
        }
        .avvio-pratica-card-action {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 600;
          color: var(--color-accent, #6366f1);
          margin-top: auto;
        }
        .avvio-pratica-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 40px;
          font-size: 13px;
          color: var(--color-text-secondary, #888);
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
          background: var(--color-surface, #fff);
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
          color: var(--color-text-secondary, #555);
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
          color: var(--color-text, #111);
        }
        .avvio-pratica-modal-field input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid var(--color-border, #d1d5db);
          font-size: 15px;
          background: var(--color-surface, #fff);
          color: var(--color-text, #111);
          outline: none;
          transition: border-color 0.15s ease;
          box-sizing: border-box;
        }
        .avvio-pratica-modal-field input:focus {
          border-color: var(--color-accent, #6366f1);
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
          background: var(--color-accent, #6366f1);
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
          color: #22c55e;
          margin-bottom: 16px;
        }
        .avvio-pratica-modal-success h3 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 8px;
        }
        .avvio-pratica-modal-success p {
          font-size: 14px;
          color: var(--color-text-secondary, #555);
          margin: 0;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
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
