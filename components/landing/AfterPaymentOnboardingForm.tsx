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
  message?: string;
  detail?: string;
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
  message?: string;
  detail?: string;
  sessionId?: string;
  practiceType?: string;
  applicationId?: string;
  alreadyProvisioned?: boolean;
};

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

function readApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const normalize = (value: string) => {
    const text = value.trim();
    const lowered = text.toLowerCase();
    if (!text || lowered === 'bad request' || lowered === 'invalid request') return '';
    if (lowered.includes('invalid api key')) return 'Configurazione pagamento non valida. Contatta supporto BNDO.';
    return text;
  };

  if (typeof record.error === 'string') {
    const normalized = normalize(record.error);
    if (normalized) return normalized;
  }
  if (typeof record.message === 'string') {
    const normalized = normalize(record.message);
    if (normalized) return normalized;
  }
  if (typeof record.detail === 'string') {
    const normalized = normalize(record.detail);
    if (normalized) return normalized;
  }
  return fallback;
}

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

function deriveUsernameFromEmail(email: string) {
  const localPart = email.split('@')[0] ?? 'cliente';
  const normalized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '.')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
  const base = normalized || 'cliente';
  return base.length >= 3 ? base.slice(0, 40) : `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
}

const MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%';
const MATRIX_TOTAL_MS = 620;
const MATRIX_TICK_MS = 52;
const STEP_META: Record<OnboardingStep, { title: string; subtitle: string }> = {
  1: {
    title: 'Benvenuto in BNDO',
    subtitle: 'Attiva la tua dashboard e avvia la pratica in pochi passaggi.',
  },
  2: {
    title: 'Attiva la tua dashboard',
    subtitle: 'Inserisci email e password con cui vuoi accedere.',
  },
  3: {
    title: 'Dati pratica',
    subtitle: 'Inserisci i dati essenziali per attivare la pratica.',
  },
  4: {
    title: 'Documenti obbligatori',
    subtitle: 'Carica documento di identità, codice fiscale e DID.',
  },
  5: {
    title: 'Preventivi',
    subtitle: 'Carica uno o più preventivi o inserisci il dettaglio manualmente.',
  },
  6: {
    title: 'Conferme finali',
    subtitle: 'Accetta i consensi e invia la pratica.',
  },
};

function mergeQuoteFiles(existing: File[], incoming: File[]) {
  const deduped = new Map<string, File>();
  for (const file of [...existing, ...incoming]) {
    deduped.set(`${file.name}-${file.size}-${file.lastModified}`, file);
  }
  return Array.from(deduped.values());
}

function quoteFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function scrambleText(source: string, revealRatio: number) {
  return source
    .split('')
    .map((char, index) => {
      if (char === ' ') return ' ';
      const keepReadable = index % 3 !== 0;
      if (keepReadable) return char;
      const noiseStrength = Math.max(0, 0.4 * (1 - revealRatio));
      if (Math.random() > noiseStrength) return char;
      return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)] ?? char;
    })
    .join('');
}

export function AfterPaymentOnboardingForm({
  sessionId,
  practiceType,
  quizSubmissionId,
}: {
  sessionId?: string;
  practiceType?: PracticeType;
  quizSubmissionId?: string;
}) {
  const effectiveSessionId =
    sessionId && sessionId !== 'CHECKOUT_SESSION_ID' && !sessionId.includes('{CHECKOUT_SESSION_ID}')
      ? sessionId
      : undefined;

  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<StripeSessionPayload['session'] | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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

  const [step, setStep] = useState<OnboardingStep>(1);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const [matrixStep, setMatrixStep] = useState<OnboardingStep | null>(null);
  const [matrixTitle, setMatrixTitle] = useState(STEP_META[1].title);
  const [matrixSubtitle, setMatrixSubtitle] = useState(STEP_META[1].subtitle);
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
        if (!res.ok) throw new Error(readApiError(json, 'Impossibile verificare il pagamento.'));
        if (!cancelled) {
          setSession(json.session ?? null);
          const stripeEmail = json.session?.customer_email ?? '';
          if (stripeEmail) {
            setEmail((prev) => prev || stripeEmail);
          }
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
  }, [effectiveSessionId]);

  useEffect(() => {
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
    if (effectiveSessionId && loadingSession) return false;
    if (!email.trim()) return false;
    if (password.length < 8) return false;
    if (effectiveSessionId && session && session.payment_status && session.payment_status !== 'paid') return false;
    if (!pec.trim()) return false;
    if (!idDocument || !taxCodeDocument || !didDocument) return false;
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
    loadingSession,
    password.length,
    pec,
    quotes.length,
    quotesText,
    session,
    submitting,
    taxCodeDocument
  ]);

  const canProceed = useMemo(() => {
    if (stepTransitioning) return false;
    if (step === 1) return true;
    if (step === 2) return Boolean(email.trim() && password.length >= 8);
    if (step === 3) {
      if (effectiveSessionId && loadingSession) return false;
      if (effectiveSessionId && session && session.payment_status && session.payment_status !== 'paid') return false;
      return Boolean(pec.trim());
    }
    if (step === 4) {
      if (!idDocument || !taxCodeDocument || !didDocument) return false;
      return true;
    }
    if (step === 5) {
      if (!quotes.length && !quotesText.trim()) return false;
      return true;
    }
    return canSubmit;
  }, [
    canSubmit,
    email,
    effectiveSessionId,
    idDocument,
    loadingSession,
    password.length,
    pec,
    quotes.length,
    quotesText,
    session,
    step,
    stepTransitioning,
    taxCodeDocument,
    didDocument,
  ]);

  function validateStep(targetStep: OnboardingStep): string | null {
    if (targetStep === 1) return null;

    if (targetStep === 2) {
      if (!email.trim()) return 'Inserisci la tua email.';
      if (password.length < 8) return 'La password deve essere di almeno 8 caratteri.';
      return null;
    }

    if (targetStep === 3) {
      if (effectiveSessionId && loadingSession) {
        return 'Verifica pagamento in corso, attendi qualche secondo.';
      }
      if (effectiveSessionId && session && session.payment_status && session.payment_status !== 'paid') {
        return 'Pagamento non risultante completato.';
      }
      if (!pec.trim()) return 'Inserisci la PEC.';
      return null;
    }

    if (targetStep === 4) {
      if (!idDocument || !taxCodeDocument) return 'Carica documento di identita e codice fiscale.';
      if (!didDocument) return 'Carica la certificazione DID.';
      return null;
    }

    if (targetStep === 5) {
      if (!quotes.length && !quotesText.trim()) {
        return 'Carica almeno un preventivo oppure inserisci bene/servizio + prezzo + IVA.';
      }
      return null;
    }

    if (!acceptPrivacy) return 'Devi accettare la Privacy Policy.';
    if (!acceptTerms) return 'Devi accettare i Termini e Condizioni.';
    if (!consentStorage) return 'Devi autorizzare la conservazione dei dati.';
    if (!canSubmit) return 'Completa tutti i campi obbligatori prima di inviare.';
    return null;
  }

  async function runMatrixTransition(currentStep: OnboardingStep) {
    const currentMeta = STEP_META[currentStep];
    setStepTransitioning(true);
    setMatrixStep(currentStep);
    setMatrixTitle(currentMeta.title);
    setMatrixSubtitle(currentMeta.subtitle);

    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += MATRIX_TICK_MS;
        const progress = Math.min(elapsed / MATRIX_TOTAL_MS, 1);
        setMatrixTitle(scrambleText(currentMeta.title, progress));
        setMatrixSubtitle(scrambleText(currentMeta.subtitle, progress));
        if (progress >= 1) {
          clearInterval(timer);
          resolve();
        }
      }, MATRIX_TICK_MS);
    });

    setStepTransitioning(false);
    setMatrixStep(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    try {
      const stepError = validateStep(step);
      if (stepError) throw new Error(stepError);

      if (step < 6) {
        await runMatrixTransition(step);
        const nextStep = (step + 1) as OnboardingStep;
        setStep(nextStep);
        setMatrixTitle(STEP_META[nextStep].title);
        setMatrixSubtitle(STEP_META[nextStep].subtitle);
        return;
      }

      setSubmitting(true);
      const normalizedEmail = email.trim().toLowerCase();

      const fd = new FormData();
      if (effectiveSessionId) fd.set('sessionId', effectiveSessionId);
      if (quizSubmissionId) fd.set('quizSubmissionId', quizSubmissionId);
      fd.set('email', normalizedEmail);
      if (practiceType) fd.set('practiceType', practiceType);
      fd.set('pec', pec.trim());
      fd.set('digitalSignature', digitalSignature);
      fd.set('idDocument', idDocument as File);
      fd.set('taxCodeDocument', taxCodeDocument as File);
      fd.set('didDocument', didDocument as File);
      for (const file of quotes) fd.append('quotes', file);
      fd.set('quotesText', quotesText.trim());
      fd.set('acceptPrivacy', acceptPrivacy ? 'yes' : 'no');
      fd.set('acceptTerms', acceptTerms ? 'yes' : 'no');
      fd.set('consentStorage', consentStorage ? 'yes' : 'no');
      fd.set('username', deriveUsernameFromEmail(normalizedEmail));
      fd.set('password', password);

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        body: fd
      });
      const json = (await res.json()) as CompletePayload;
      if (!res.ok) throw new Error(readApiError(json, 'Onboarding non riuscito.'));
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
            Perfetto: abbiamo ricevuto i documenti base. Ora la tua dashboard è attiva: puoi entrare subito con le credenziali impostate.
          </p>
        </div>

        {effectiveSessionId ? <OnboardingCredentialsCard sessionId={effectiveSessionId} /> : null}
      </div>
    );
  }

  const isActiveMatrixStep = stepTransitioning && matrixStep === step;
  const stepTitle = isActiveMatrixStep ? matrixTitle : STEP_META[step].title;
  const stepSubtitle = isActiveMatrixStep ? matrixSubtitle : STEP_META[step].subtitle;

  return (
    <form className={`panel p-6 sm:p-8 onboarding-form-shell ${stepTransitioning ? 'is-matrix-transition' : ''}`} onSubmit={onSubmit}>
      <div ref={stepTopRef} />
      <div className="onboarding-step-indicator">Step {step} di 6</div>

      {step === 1 ? (
        <div className={`onboarding-stepBlock onboarding-stepWelcome ${isActiveMatrixStep ? 'is-matrix' : ''}`}>
          <h2 className="onboarding-form-title">{stepTitle}</h2>
          <p className="onboarding-form-subtitle">{stepSubtitle}</p>
        </div>
      ) : null}

      {step === 2 ? (
        <>
          <div className={`onboarding-stepBlock ${isActiveMatrixStep ? 'is-matrix' : ''}`}>
            <h2 className="onboarding-form-title">{stepTitle}</h2>
            <p className="onboarding-form-subtitle">{stepSubtitle}</p>
          </div>

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
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="password">
              Password *
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Almeno 8 caratteri"
              required
              autoComplete="new-password"
            />
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className={`onboarding-stepBlock ${isActiveMatrixStep ? 'is-matrix' : ''}`}>
            <h2 className="onboarding-form-title">{stepTitle}</h2>
            <p className="onboarding-form-subtitle">{stepSubtitle}</p>
          </div>

          {loadingSession ? (
            <div className="mt-4 flex items-center gap-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifica pagamento in corso...
            </div>
          ) : sessionError ? (
            <div className="mt-4 text-sm font-semibold text-red-700">
              {sessionError}
              <div className="mt-1 text-xs font-normal text-slate-600">
                Se hai pagato offline e ti abbiamo inviato questo link, puoi continuare comunque.
              </div>
            </div>
          ) : effectiveSessionId && session?.payment_status && session.payment_status !== 'paid' ? (
            <div className="mt-4 text-sm font-semibold text-red-700">
              Pagamento non risultante completato. Se hai pagato offline e ti abbiamo inviato questo link, continua senza sessione Stripe.
            </div>
          ) : effectiveSessionId ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Pagamento verificato{paidLabel ? `: ${paidLabel}` : ''}. Email Stripe: <strong>{session?.customer_email ?? 'N/D'}</strong>
            </div>
          ) : null}

          <div className="mt-5">
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

          <div className="mt-4">
            <label className="label" htmlFor="digitalSignature">
              Firma digitale
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
        </>
      ) : null}

      {step === 4 ? (
        <>
          <div className={`onboarding-stepBlock ${isActiveMatrixStep ? 'is-matrix' : ''}`}>
            <h2 className="onboarding-form-title">{stepTitle}</h2>
            <p className="onboarding-form-subtitle">{stepSubtitle}</p>
          </div>

          <p className="onboarding-section-note">Carica i documenti obbligatori. Formati ammessi: PDF, JPG, PNG.</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="idDocument">
                Documento di identità *
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
              <span className="text-slate-500">(reperibile online oppure presso il Centro per l&apos;Impiego più vicino)</span>
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

      {step === 5 ? (
        <>
          <div className={`onboarding-stepBlock ${isActiveMatrixStep ? 'is-matrix' : ''}`}>
            <h2 className="onboarding-form-title">{stepTitle}</h2>
            <p className="onboarding-form-subtitle">{stepSubtitle}</p>
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="quotes">
              Preventivi
            </label>
            <input
              id="quotes"
              className="input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*,.zip"
              multiple
              onChange={(e) => {
                const incoming = Array.from(e.target.files ?? []);
                if (!incoming.length) return;
                setQuotes((prev) => mergeQuoteFiles(prev, incoming));
                e.currentTarget.value = '';
              }}
            />
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="quotesText">
              Se non hai ancora il preventivo indica nome del prodotto/servizio + prezzo + IVA.
            </label>
            <textarea
              id="quotesText"
              className="input min-h-[96px]"
              value={quotesText}
              onChange={(e) => setQuotesText(e.target.value)}
              placeholder="Es. Attrezzature 4.500€ + IVA; Software 1.200€ + IVA"
            />
          </div>

          {quotes.length ? (
            <ul className="quote-files-grid">
              {quotes.map((file) => {
                const key = quoteFileKey(file);
                return (
                  <li key={key} className="quote-file-chip">
                    <span className="quote-file-chipName" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      className="quote-file-chipRemove"
                      aria-label={`Rimuovi ${file.name}`}
                      onClick={() => setQuotes((prev) => prev.filter((item) => quoteFileKey(item) !== key))}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}

      {step === 6 ? (
        <>
          <div className={`onboarding-stepBlock ${isActiveMatrixStep ? 'is-matrix' : ''}`}>
            <h2 className="onboarding-form-title">{stepTitle}</h2>
            <p className="onboarding-form-subtitle">{stepSubtitle}</p>
          </div>

          <div className="mt-5 space-y-3 text-xs text-slate-600">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-[2px]"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
              />
              <span>
                Accetto la <Link className="underline" href="/privacy">Privacy Policy</Link> *
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-[2px]"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <span>
                Accetto i <Link className="underline" href="/termini">Termini e Condizioni</Link> *
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-[2px]"
                checked={consentStorage}
                onChange={(e) => setConsentStorage(e.target.checked)}
              />
              <span>Autorizzo la conservazione di dati e documenti ai fini della pratica *</span>
            </label>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Hai dubbi sui documenti? Contattaci su{' '}
            <a className="underline" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            .
          </p>
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
              setStep((prev) => ((prev - 1) as OnboardingStep));
            }}
          >
            Indietro
          </button>
        ) : (
          <div />
        )}

        <button
          className={`btn btn-primary ${step === 1 ? 'onboarding-primaryCta w-full' : 'w-full sm:w-auto'}`}
          type="submit"
          disabled={!canProceed}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Invio documenti...
            </>
          ) : step === 1 ? (
            'Attiva ora'
          ) : step < 6 ? (
            'Avanti'
          ) : (
            'Invia documenti e attiva dashboard'
          )}
        </button>
      </div>
    </form>
  );
}
