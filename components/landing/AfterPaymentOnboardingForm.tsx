'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { OnboardingCredentialsCard } from '@/components/landing/OnboardingCredentialsCard';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import type { PracticeType } from '@/lib/bandi';

type StripeSessionPayload = {
  ok?: boolean;
  error?: string;
  session?: {
    id: string;
    payment_status: string | null;
    customer_email: string | null;
    customer_name: string | null;
    amount_total: number | null;
    currency: string | null;
    created_at: string | null;
  };
};

type CompletePayload = {
  ok?: boolean;
  error?: string;
  sessionId?: string;
  practiceType?: string;
  applicationId?: string;
  alreadyProvisioned?: boolean;
};

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || !currency) return null;
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

function moneyFromStripe(amountTotal: number | null | undefined, currency: string | null | undefined) {
  if (!amountTotal || !currency) return null;
  const isZeroDecimal = new Set(['jpy', 'krw', 'vnd']).has(currency.toLowerCase());
  return isZeroDecimal ? amountTotal : amountTotal / 100;
}

export function AfterPaymentOnboardingForm({ sessionId, practiceType }: { sessionId?: string; practiceType?: PracticeType }) {
  const effectiveSessionId =
    sessionId && sessionId !== 'CHECKOUT_SESSION_ID' && !sessionId.includes('{CHECKOUT_SESSION_ID}')
      ? sessionId
      : undefined;

  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<StripeSessionPayload['session'] | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [pec, setPec] = useState('');
  const [digitalSignature, setDigitalSignature] = useState<'yes' | 'no'>('no');

  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [taxCodeDocument, setTaxCodeDocument] = useState<File | null>(null);
  const [didDocument, setDidDocument] = useState<File | null>(null);
  const [quotes, setQuotes] = useState<File[]>([]);
  const [quotesText, setQuotesText] = useState('');

  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [consentStorage, setConsentStorage] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletePayload | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const stepTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!effectiveSessionId) {
        setSession(null);
        setSessionError(null);
        setLoadingSession(false);
        return;
      }
      setLoadingSession(true);
      setSessionError(null);
      try {
        const res = await fetch(`/api/stripe/checkout-session?session_id=${encodeURIComponent(effectiveSessionId)}`, {
          cache: 'no-store'
        });
        const json = (await res.json()) as StripeSessionPayload;
        if (!res.ok) throw new Error(json?.error ?? 'Impossibile verificare il pagamento.');
        if (!cancelled) {
          setSession(json.session ?? null);
          const stripeEmail = json.session?.customer_email ?? '';
          if (stripeEmail && !email) setEmail(stripeEmail);
        }
      } catch (e) {
        if (!cancelled) setSessionError(e instanceof Error ? e.message : 'Errore verifica pagamento.');
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [effectiveSessionId, email]);

  useEffect(() => {
    // Keep the wizard usable on mobile: always jump back to the top when switching steps.
    stepTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  const paidAmount = useMemo(
    () => moneyFromStripe(session?.amount_total ?? null, session?.currency ?? null),
    [session?.amount_total, session?.currency]
  );

  const paidLabel = useMemo(
    () => (paidAmount !== null ? formatMoney(paidAmount, session?.currency ?? null) : null),
    [paidAmount, session?.currency]
  );

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!email.trim()) return false;
    // If this comes from Stripe redirect, we expect a paid session. Manual flow can proceed without Stripe.
    if (effectiveSessionId && session && session.payment_status && session.payment_status !== 'paid') return false;
    if (!idDocument || !taxCodeDocument) return false;
    if (!pec.trim()) return false;
    if (!didDocument) return false;
    if (!quotes.length && !quotesText.trim()) return false;
    if (!acceptPrivacy || !acceptTerms || !consentStorage) return false;
    return true;
  }, [
    acceptPrivacy,
    acceptTerms,
    consentStorage,
    didDocument,
    email,
    effectiveSessionId,
    idDocument,
    pec,
    quotes.length,
    quotesText,
    session,
    submitting,
    taxCodeDocument
  ]);

  const canProceed = useMemo(() => {
    if (step === 1) return Boolean(email.trim() && pec.trim());
    if (step === 2) return Boolean(idDocument && taxCodeDocument && didDocument);
    return canSubmit;
  }, [canSubmit, didDocument, email, idDocument, pec, step, taxCodeDocument]);

  function validateStep(targetStep: 1 | 2 | 3): string | null {
    if (targetStep === 1) {
      if (!email.trim()) return 'Inserisci la tua email.';
      if (!pec.trim()) return 'Inserisci la PEC.';
      return null;
    }
    if (targetStep === 2) {
      if (!idDocument || !taxCodeDocument) return 'Carica documento di identita e codice fiscale.';
      if (!didDocument) return 'Carica la certificazione DID.';
      return null;
    }
    if (!quotes.length && !quotesText.trim()) {
      return 'Carica almeno un preventivo oppure inserisci bene/servizio + prezzo + IVA.';
    }
    if (!acceptPrivacy) return 'Devi accettare la Privacy Policy.';
    if (!acceptTerms) return 'Devi accettare i Termini e Condizioni.';
    if (!consentStorage) return 'Devi autorizzare la conservazione dei dati e dei documenti per la pratica.';
    // Final safety: this also covers Stripe-paid sessions.
    if (!canSubmit) return 'Completa tutti i campi obbligatori prima di inviare.';
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    try {
      const stepError = validateStep(step);
      if (stepError) throw new Error(stepError);

      if (step < 3) {
        setStep((prev) => ((prev + 1) as 1 | 2 | 3));
        return;
      }

      setSubmitting(true);

      if (!email.trim()) throw new Error('Inserisci la tua email.');
      if (!idDocument || !taxCodeDocument) throw new Error('Carica documento identita e codice fiscale.');
      if (!pec.trim()) throw new Error('Inserisci la PEC.');
      if (!didDocument) throw new Error('Carica la certificazione DID.');
      if (!quotes.length && !quotesText.trim()) {
        throw new Error('Carica almeno un preventivo oppure inserisci i dati (bene/servizio + prezzo + IVA).');
      }
      if (!acceptPrivacy) throw new Error('Devi accettare la Privacy Policy.');
      if (!acceptTerms) throw new Error('Devi accettare i Termini e Condizioni.');
      if (!consentStorage) throw new Error('Devi autorizzare la conservazione dei dati e dei documenti per la pratica.');

      const fd = new FormData();
      if (effectiveSessionId) fd.set('sessionId', effectiveSessionId);
      fd.set('email', email.trim());
      if (practiceType) fd.set('practiceType', practiceType);
      fd.set('pec', pec.trim());
      fd.set('digitalSignature', digitalSignature);
      fd.set('idDocument', idDocument);
      fd.set('taxCodeDocument', taxCodeDocument);
      fd.set('didDocument', didDocument);
      for (const file of quotes) fd.append('quotes', file);
      fd.set('quotesText', quotesText.trim());
      fd.set('acceptPrivacy', acceptPrivacy ? 'yes' : 'no');
      fd.set('acceptTerms', acceptTerms ? 'yes' : 'no');
      fd.set('consentStorage', consentStorage ? 'yes' : 'no');

      const res = await fetch('/api/onboarding/after-payment/complete', {
        method: 'POST',
        body: fd
      });

      const json = (await res.json()) as CompletePayload;
      if (!res.ok) throw new Error(json?.error ?? 'Onboarding non riuscito.');

      setCompleted(json);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Errore onboarding.');
    } finally {
      setSubmitting(false);
    }
  }

  if (completed?.ok) {
    return (
      <div className="space-y-4">
        <div className="panel p-6 sm:p-8">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand.steel">
            <ShieldCheck className="h-4 w-4 text-brand.mint" />
            Documenti ricevuti
          </div>
          <p className="text-sm text-slate-700">
            Perfetto: abbiamo ricevuto i documenti base. Ora stiamo attivando la tua dashboard e ti invieremo le
            credenziali via email.
          </p>
        </div>

        {effectiveSessionId ? <OnboardingCredentialsCard sessionId={effectiveSessionId} /> : null}
      </div>
    );
  }

  return (
    <form className="panel p-6 sm:p-8" onSubmit={onSubmit}>
      <div ref={stepTopRef} />
      <div className="mb-1 text-sm font-semibold text-slate-500">Caricamento documenti</div>
      <h2 className="text-2xl font-extrabold text-brand.navy">Attiva la dashboard</h2>
      <p className="mt-2 text-sm text-slate-600">Completa questi 3 step per attivare la tua area cliente.</p>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span className={step >= 1 ? 'text-brand.navy' : ''}>1. Dati</span>
          <span className={step >= 2 ? 'text-brand.navy' : ''}>2. Documenti</span>
          <span className={step >= 3 ? 'text-brand.navy' : ''}>3. Conferma</span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round((step / 3) * 100)}%`,
              background: 'linear-gradient(90deg, rgba(11,17,54,0.92), rgba(34,197,95,0.35))'
            }}
          />
        </div>
      </div>

      {step === 1 ? (
        <>
          <div className="mt-5">
            <label className="label" htmlFor="email">
              Email (login) *
            </label>
            <input
              id="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@email.it"
              inputMode="email"
              required
              autoComplete="email"
            />
            <p className="mt-2 text-xs text-slate-500">
              Userai questa email per accedere alla dashboard. Riceverai una password temporanea via email.
            </p>
          </div>

          {loadingSession ? (
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifica pagamento in corso...
            </div>
          ) : sessionError ? (
            <div className="mt-3 text-sm font-semibold text-red-700">
              {sessionError}
              <div className="mt-1 text-xs font-normal text-slate-600">
                Se hai pagato offline e ti abbiamo inviato questo link, puoi continuare comunque.
              </div>
            </div>
          ) : effectiveSessionId && session?.payment_status && session.payment_status !== 'paid' ? (
            <div className="mt-3 text-sm font-semibold text-red-700">
              Pagamento non risultante completato. Se hai pagato offline e ti abbiamo inviato questo link, continua senza
              sessione Stripe.
            </div>
          ) : effectiveSessionId ? (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Pagamento verificato{paidLabel ? `: ${paidLabel}` : ''}. Email Stripe:{' '}
              <strong>{session?.customer_email ?? 'N/D'}</strong>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pec">
                PEC *
              </label>
              <input
                id="pec"
                className="input"
                value={pec}
                onChange={(e) => setPec(e.target.value)}
                placeholder="nome@pec.it"
                inputMode="email"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="digitalSignature">
                Firma digitale *
              </label>
              <select
                id="digitalSignature"
                className="input"
                value={digitalSignature}
                onChange={(e) => setDigitalSignature(e.target.value as 'yes' | 'no')}
              >
                <option value="no">Non in possesso</option>
                <option value="yes">In possesso</option>
              </select>
            </div>
          </div>

        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <div className="font-semibold text-brand.navy">Documenti base</div>
            <div className="mt-1 text-slate-600">
              Carica i documenti obbligatori. Formati ammessi: PDF, JPG, PNG.
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="idDocument">
                Documento di identita *
              </label>
              <input
                id="idDocument"
                className="input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
                onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)}
                required
              />
              {idDocument ? <div className="mt-2 text-xs text-slate-500">{idDocument.name}</div> : null}
            </div>

            <div>
              <label className="label" htmlFor="taxCodeDocument">
                Codice fiscale *
              </label>
              <input
                id="taxCodeDocument"
                className="input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
                onChange={(e) => setTaxCodeDocument(e.target.files?.[0] ?? null)}
                required
              />
              {taxCodeDocument ? <div className="mt-2 text-xs text-slate-500">{taxCodeDocument.name}</div> : null}
            </div>
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="didDocument">
              Certificazione DID *{' '}
              <span className="text-slate-500">
                (reperibile online oppure presso il Centro per l&apos;Impiego piu vicino)
              </span>
            </label>
            <input
              id="didDocument"
              className="input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
              onChange={(e) => setDidDocument(e.target.files?.[0] ?? null)}
              required
            />
            {didDocument ? <div className="mt-2 text-xs text-slate-500">{didDocument.name}</div> : null}
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className="mt-5">
            <label className="label" htmlFor="quotes">
              Preventivi di spesa * <span className="text-slate-500">(puoi allegarne piu di uno)</span>
            </label>
            <input
              id="quotes"
              className="input"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.zip,application/pdf,image/*,application/zip"
              onChange={(e) => setQuotes(Array.from(e.target.files ?? []))}
            />
            {quotes.length ? (
              <div className="mt-2 text-xs text-slate-500">
                {quotes.length} file selezionati: {quotes.map((f) => f.name).join(', ')}
              </div>
            ) : null}
            <div className="mt-3">
              <label className="label" htmlFor="quotesText">
                Se non hai ancora i preventivi ufficiali, inserisci qui{' '}
                <span className="text-slate-500">(uno per riga)</span>: <span className="text-slate-500">bene/servizio + prezzo + IVA</span>
              </label>
              <textarea
                id="quotesText"
                className="input min-h-28"
                value={quotesText}
                onChange={(e) => setQuotesText(e.target.value)}
                placeholder={
                  "Esempio:\\n- PC portatile: 1.200 + IVA\\n- Sito web: 900 + IVA\\n- Arredi ufficio: 2.500 + IVA"
                }
                maxLength={2000}
              />
              <div className="mt-2 text-xs text-slate-500">
                Puoi inserire tutte le spese che vuoi. Basta una riga per ogni spesa.
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-brand.navy">Consensi</div>
            <div className="mt-3 space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                />
                <span className="leading-relaxed text-slate-700">
                  Ho letto e accetto la{' '}
                  <Link href="/privacy" className="font-semibold text-brand.navy underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                />
                <span className="leading-relaxed text-slate-700">
                  Accetto i{' '}
                  <Link href="/termini" className="font-semibold text-brand.navy underline">
                    Termini e Condizioni
                  </Link>
                  .
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={consentStorage}
                  onChange={(e) => setConsentStorage(e.target.checked)}
                />
                <span className="leading-relaxed text-slate-700">
                  Autorizzo {`BNDO`} a trattare e conservare i miei dati e i documenti caricati (storage) per la gestione
                  della pratica e gli adempimenti connessi, come descritto nella Privacy Policy.
                </span>
              </label>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <div className="font-semibold text-brand.navy">Problemi con la documentazione?</div>
            <div className="mt-1 text-slate-600">Scrivici su WhatsApp e ti aiutiamo passo-passo.</div>
            <a className="btn btn-muted mt-3 inline-flex" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
              Scrivi su WhatsApp
            </a>
          </div>
        </>
      ) : null}

      {submitError ? <p className="mt-4 text-sm font-semibold text-red-700">{submitError}</p> : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {step > 1 ? (
          <button
            type="button"
            className="btn btn-muted w-full sm:w-auto"
            onClick={() => {
              setSubmitError(null);
              setStep((prev) => ((prev - 1) as 1 | 2 | 3));
            }}
          >
            Indietro
          </button>
        ) : (
          <div />
        )}

        <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={!canProceed}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Invio documenti...
            </>
          ) : step < 3 ? (
            'Continua'
          ) : (
            'Invia documenti e attiva dashboard'
          )}
        </button>
      </div>

      {step === 3 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          I documenti caricati saranno visibili al nostro team e verranno associati automaticamente alla tua pratica.
          Potrai sempre esercitare i tuoi diritti (GDPR) come indicato nella Privacy Policy.
        </p>
      ) : null}
    </form>
  );
}
