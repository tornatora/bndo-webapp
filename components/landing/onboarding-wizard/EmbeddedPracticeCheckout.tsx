'use client';

import { useEffect, useRef, useState } from 'react';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Loader2 } from 'lucide-react';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type EmbeddedPracticeCheckoutProps = {
  clientSecret: string;
  sessionId?: string | null;
  amountLabel?: string;
  onComplete: () => void;
  onError: (message: string) => void;
};

function readError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

export function EmbeddedPracticeCheckout({
  clientSecret,
  sessionId,
  amountLabel = 'Paga 50,00 €',
  onComplete,
  onError,
}: EmbeddedPracticeCheckoutProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mounting, setMounting] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const mountNodeRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const completeRef = useRef(onComplete);
  const errorRef = useRef(onError);

  useEffect(() => {
    completeRef.current = onComplete;
    errorRef.current = onError;
  }, [onComplete, onError]);

  useEffect(() => {
    if (!stripePromise) {
      const message = 'Pagamento non disponibile: manca NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.';
      setLocalError(message);
      setMounting(false);
      errorRef.current(message);
      return;
    }

    let cancelled = false;
    async function mountPaymentElement() {
      setMounting(true);
      setLocalError(null);
      try {
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error('Stripe non disponibile nel browser.');
        }
        if (!mountNodeRef.current) {
          throw new Error('Container checkout non disponibile.');
        }
        const elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: 'stripe',
          },
        });
        const paymentElement = elements.create('payment', {
          layout: {
            type: 'tabs',
            defaultCollapsed: false,
          },
          paymentMethodOrder: ['card', 'paypal'],
          wallets: {
            applePay: 'never',
            googlePay: 'never',
          },
          fields: {
            billingDetails: {
              name: 'never',
              email: 'never',
              phone: 'never',
            },
          } as any,
        });
        paymentElement.mount(mountNodeRef.current);
        if (cancelled) {
          paymentElement.destroy();
          return;
        }
        stripeRef.current = stripe;
        elementsRef.current = elements;
        paymentElementRef.current = paymentElement;
      } catch (error) {
        const message = readError(error, 'Impossibile inizializzare Stripe Payment Element.');
        setLocalError(message);
        errorRef.current(message);
      } finally {
        if (!cancelled) setMounting(false);
      }
    }

    void mountPaymentElement();

    return () => {
      cancelled = true;
      paymentElementRef.current?.destroy();
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [clientSecret]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!normalizedFirstName || !normalizedLastName || !isEmailValid) {
      const message = 'Inserisci nome, cognome ed email validi.';
      setLocalError(message);
      errorRef.current(message);
      return;
    }

    if (!stripeRef.current || !elementsRef.current) {
      const message = 'Pagamento non pronto. Attendi il caricamento e riprova.';
      setLocalError(message);
      errorRef.current(message);
      return;
    }
    setConfirming(true);
    setLocalError(null);
    try {
      if (sessionId?.startsWith('pi_')) {
        const attachResponse = await fetch('/api/payments/attach-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: sessionId,
            email: normalizedEmail,
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
          }),
        });
        const attachPayload = (await attachResponse.json().catch(() => null)) as { error?: string } | null;
        if (!attachResponse.ok) {
          const message =
            typeof attachPayload?.error === 'string' && attachPayload.error.trim()
              ? attachPayload.error.trim()
              : 'Impossibile salvare i dati cliente del pagamento.';
          setLocalError(message);
          errorRef.current(message);
          return;
        }
      }

      const submitResult = await elementsRef.current.submit();
      if (submitResult.error) {
        const message = readError(submitResult.error, 'Controlla i dati inseriti e riprova.');
        setLocalError(message);
        errorRef.current(message);
        return;
      }

      const returnUrl = new URL(window.location.href);
      if (sessionId) {
        returnUrl.searchParams.set('session_id', sessionId);
      }
      const result = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: {
          return_url: returnUrl.toString(),
          receipt_email: normalizedEmail,
          payment_method_data: {
            billing_details: {
              name: `${normalizedFirstName} ${normalizedLastName}`,
              email: normalizedEmail,
            },
          },
        } as any,
        redirect: 'if_required',
      });
      if (result.error) {
        const message = readError(result.error, 'Pagamento non riuscito. Controlla i dati e riprova.');
        setLocalError(message);
        errorRef.current(message);
        return;
      }
      completeRef.current();
    } catch (error) {
      const message = readError(error, 'Impossibile confermare il pagamento.');
      setLocalError(message);
      errorRef.current(message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <form className="wizard7-embeddedCheckoutShell" onSubmit={onSubmit}>
      <div className="wizard7-checkoutIdentity">
        <label className="wizard7-checkoutField">
          <span>Nome *</span>
          <input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className="wizard7-checkoutInput"
            placeholder="Nome"
            autoComplete="given-name"
          />
        </label>
        <label className="wizard7-checkoutField">
          <span>Cognome *</span>
          <input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className="wizard7-checkoutInput"
            placeholder="Cognome"
            autoComplete="family-name"
          />
        </label>
        <label className="wizard7-checkoutField">
          <span>Email *</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="wizard7-checkoutInput"
            placeholder="nome@email.it"
            inputMode="email"
            autoComplete="email"
          />
        </label>
      </div>

      <div className="wizard7-embeddedCheckoutMount" ref={mountNodeRef} />
      {mounting ? (
        <div className="wizard7-embeddedOverlay">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento modulo pagamento...
        </div>
      ) : null}
      <button
        type="submit"
        className="wizard7-stripeSubmitBtn"
        disabled={mounting || confirming}
      >
        {confirming ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Conferma pagamento...
          </>
        ) : (
          amountLabel
        )}
      </button>
      {localError ? <p className="wizard7-inlineError wizard7-inlineError--embedded">{localError}</p> : null}
    </form>
  );
}
