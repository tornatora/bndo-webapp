'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MARKETING_URL } from '@/lib/site-urls';
import { BandoDashboardPreview } from '@/components/landing/BandoOnboardingLayout';

type Props = {
  sessionId: string;
  grantSlug: string;
  quizSubmissionId?: string;
};

type SessionStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
  ready?: boolean;
  nextUrl?: string;
  onboardingStatus?: 'not_started' | 'in_progress' | 'completed';
};

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
  return fallback;
}

export function PracticePaymentSuccessClient({ sessionId, grantSlug, quizSubmissionId }: Props) {
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<string>('pending');
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('session_id', sessionId);
    params.set('grantSlug', grantSlug);
    if (quizSubmissionId) params.set('quizSubmissionId', quizSubmissionId);
    return params.toString();
  }, [grantSlug, quizSubmissionId, sessionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function checkStatus() {
      if (cancelled) return;
      try {
        setChecking(true);
        const response = await fetch(`/api/payments/session-status?${query}`, { cache: 'no-store' });
        const payload = (await response.json()) as SessionStatusResponse;
        if (!response.ok) throw new Error(readError(payload, 'Impossibile verificare il pagamento.'));

        const nextStatus = payload.status ?? 'pending';
        setStatus(nextStatus);

        if (payload.ready && payload.nextUrl) {
          window.location.href = payload.nextUrl;
          return;
        }

        if (nextStatus === 'failed' || nextStatus === 'canceled' || nextStatus === 'refunded') {
          setChecking(false);
          return;
        }

        attempts += 1;
        if (attempts < 20) {
          timer = setTimeout(() => void checkStatus(), 1500);
          return;
        }

        setChecking(false);
      } catch (statusError) {
        setChecking(false);
        setError(statusError instanceof Error ? statusError.message : 'Errore verifica pagamento.');
      }
    }

    void checkStatus();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [query]);

  return (
    <main className="bndo-payment-page">
      <section className="bndo-payment-shell">
        <article className="bndo-payment-left">
          <div className="bndo-split-head">
            <div className="bndo-split-brand" aria-label="BNDO">
              <Image src="/Logo-BNDO-wordmark.svg" alt="BNDO" width={110} height={28} priority />
            </div>
            <a href={MARKETING_URL} className="bndo-split-back">
              Torna al sito
            </a>
          </div>

          <div className="bndo-split-leftBody">
            <h1 className="bndo-payment-title">Stiamo attivando la tua pratica</h1>
            <p className="bndo-payment-subtitle">
              Verifichiamo la conferma Stripe e ti reindirizziamo automaticamente all&apos;onboarding.
            </p>

            {checking ? (
              <div className="bndo-payment-status">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifica pagamento in corso...
              </div>
            ) : (
              <div className="bndo-payment-priceCard">
                <div className="bndo-payment-priceLabel">Stato sessione</div>
                <div className="bndo-payment-priceValue bndo-payment-priceValue--status">{status}</div>
                <div className="bndo-payment-priceMeta">
                  Se lo stato è <strong>paid</strong>, il redirect verso onboarding parte automaticamente.
                </div>
              </div>
            )}

            {error ? <div className="bndo-payment-error">{error}</div> : null}

            {!checking ? (
              <div className="bndo-payment-actions">
                <button type="button" className="bndo-payment-cta" onClick={() => window.location.reload()}>
                  Riprova verifica
                </button>
                <a className="bndo-payment-secondary" href={`/payment/${grantSlug}${quizSubmissionId ? `?quiz=${quizSubmissionId}` : ''}`}>
                  Torna al pagamento
                </a>
              </div>
            ) : null}
          </div>
        </article>

        <aside className="bndo-payment-right">
          <div className="bndo-auth-rightContent">
            <div className="bndo-auth-rightEyebrow">Dashboard BNDO</div>
            <h2 className="bando-onboarding-rightTitle">L’attivazione è in corso</h2>
            <p className="bando-onboarding-rightDescription">
              Dopo la conferma pagamento, la sessione viene associata alla tua pratica e viene abilitato il flusso onboarding.
            </p>
            <div className="bndo-auth-previewWrap">
              <BandoDashboardPreview />
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
