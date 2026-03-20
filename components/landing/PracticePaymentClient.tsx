'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileText,
  KeyRound,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';
import { EmbeddedPracticeCheckout } from '@/components/landing/onboarding-wizard/EmbeddedPracticeCheckout';

type PracticePaymentClientProps = {
  grantSlug: string;
  grantTitle: string;
  quizSubmissionId?: string;
  cancelled?: boolean;
};

type StartPracticeStatusResponse = {
  ok?: boolean;
  error?: string;
  alreadyPaid?: boolean;
  status?: 'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
  nextUrl?: string;
  url?: string;
  sessionId?: string;
  paymentIntentId?: string;
  paymentMode?: 'payment_element';
  clientSecret?: string;
};

const PAYMENT_FLOW_STEPS = [
  { id: 1, title: 'Pagamento', description: 'Completa il pagamento per avviare la pratica', icon: CreditCard },
  { id: 2, title: 'Benvenuto', description: 'Conferma l’avvio della tua pratica', icon: UserCircle2 },
  { id: 3, title: 'Account dashboard', description: 'Crea le credenziali di accesso', icon: KeyRound },
  { id: 4, title: 'PEC e firma digitale', description: 'Inserisci i dati operativi richiesti', icon: BadgeCheck },
  { id: 5, title: 'Documenti obbligatori', description: 'Carica documento, codice fiscale e DID', icon: FileCheck2 },
  { id: 6, title: 'Preventivi', description: 'Carica i preventivi o alternativa testo', icon: FileText },
  { id: 7, title: 'Conferme finali', description: 'Accetta i consensi e completa il setup', icon: ShieldCheck },
] as const;

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
  return fallback;
}

export function PracticePaymentClient(props: PracticePaymentClientProps) {
  const { grantSlug, grantTitle, quizSubmissionId, cancelled } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded'>('unpaid');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [embeddedBooted, setEmbeddedBooted] = useState(false);

  const paymentDone = status === 'paid';

  async function verifyStatus() {
    try {
      if (!paymentSessionId) {
        setStatus('unpaid');
        setError(null);
        return;
      }

      const params = new URLSearchParams({ session_id: paymentSessionId, grantSlug });
      if (quizSubmissionId) params.set('quizSubmissionId', quizSubmissionId);
      const response = await fetch(`/api/payments/session-status?${params.toString()}`, { cache: 'no-store' });
      const payload = (await response.json()) as StartPracticeStatusResponse;
      if (!response.ok) throw new Error(readError(payload, 'Impossibile verificare lo stato della pratica.'));

      setStatus((payload.status as typeof status) ?? 'unpaid');
      if (payload.alreadyPaid && payload.nextUrl) {
        window.location.href = payload.nextUrl;
        return;
      }
      setError(null);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Errore verifica pagamento.');
    }
  }

  useEffect(() => {
    void verifyStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantSlug, quizSubmissionId, paymentSessionId]);

  useEffect(() => {
    if (embeddedBooted || clientSecret || loading) return;
    setEmbeddedBooted(true);
    void startCheckout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedBooted, clientSecret, loading]);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantSlug,
          quizSubmissionId: quizSubmissionId ?? undefined,
        }),
      });
      const payload = (await response.json()) as StartPracticeStatusResponse;
      if (!response.ok) throw new Error(readError(payload, 'Impossibile avviare il pagamento Stripe.'));

      if (payload.alreadyPaid) {
        if (payload.nextUrl) {
          window.location.href = payload.nextUrl;
          return;
        }
        await verifyStatus();
        return;
      }

      const paymentIdentifier = payload.paymentIntentId ?? payload.sessionId ?? null;
      if (payload.paymentMode === 'payment_element' && payload.clientSecret && paymentIdentifier) {
        setPaymentSessionId(paymentIdentifier);
        setClientSecret(payload.clientSecret);
        return;
      }
      throw new Error('Pagamento non disponibile in questo momento.');
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Errore avvio checkout.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="paymentref-page">
      <section className="paymentref-card">
        <aside className="paymentref-sidebar">
          <div className="paymentref-brandRow">
            <Image src="/Logo-BNDO-header.png" alt="BNDO" width={128} height={34} className="paymentref-logo" priority />
          </div>

          <ol className="paymentref-stepList" aria-label="Progressione onboarding">
            {PAYMENT_FLOW_STEPS.map((entry) => {
              const Icon = entry.icon;
              const stepState: 'completed' | 'active' | 'upcoming' = paymentDone
                ? 'completed'
                : entry.id === 1
                  ? 'active'
                  : 'upcoming';
              return (
                <li key={entry.id} className={`paymentref-step is-${stepState}`}>
                  <span className="paymentref-stepRail" aria-hidden="true" />
                  <span className="paymentref-stepIcon" aria-hidden="true">
                    {stepState === 'completed' ? <CheckCircle2 size={12} /> : <Icon size={12} />}
                  </span>
                  <div className="paymentref-stepBody">
                    <p className="paymentref-stepTitle">{entry.title}</p>
                    <p className="paymentref-stepDescription">{entry.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        <article className="paymentref-content">
          <div className="paymentref-backRow">
            <button type="button" className="paymentref-backBtn" onClick={() => window.history.back()}>
              ← Back
            </button>
          </div>

          <div className="paymentref-contentInner">
            <h2 className="paymentref-heading">Completa il pagamento BNDO per {grantTitle} e avvia la pratica.</h2>

            <section className="paymentref-payCard">
              <div className="paymentref-checkoutMount">
                {clientSecret ? (
                  <EmbeddedPracticeCheckout
                    clientSecret={clientSecret}
                    sessionId={paymentSessionId}
                    onComplete={() => void verifyStatus()}
                    onError={(message) => setError(message)}
                  />
                ) : (
                  <p className="paymentref-embeddedHint">
                    Preparazione checkout Stripe embedded…
                  </p>
                )}
              </div>

              <p className="paymentref-poweredBy">Powered by Stripe</p>
            </section>

            <button
              type="button"
              className="paymentref-manualBtn"
              onClick={() => {
                const params = new URLSearchParams();
                const onboardingBando =
                  grantSlug === 'autoimpiego-centro-nord' ? 'autoimpiego_centro_nord' : 'resto_sud_2_0';
                params.set('bando', onboardingBando);
                if (quizSubmissionId) params.set('quiz', quizSubmissionId);
                params.set('skip_payment', '1');
                window.location.href = `/onboarding?${params.toString()}`;
              }}
            >
              Pago dopo la verifica dei requisiti da parte di un consulente umano
            </button>

            <p className="paymentref-manualNotice">
              Se paghi dopo la verifica, non salti la fila e i tempi di risposta saranno più lunghi.
            </p>

            {(cancelled || error) && (
              <p className="paymentref-error">
                {cancelled
                  ? 'Pagamento annullato. Nessun addebito effettuato: puoi riprovare quando vuoi.'
                  : error}
              </p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
