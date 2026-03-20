'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import {
  BandoOnboardingFooterActions,
  BandoOnboardingShell,
  BandoOnboardingSidebar,
  BandoOnboardingStepHeader,
  BandoOnboardingStepTransition,
} from '@/components/landing/onboarding-wizard/BandoOnboardingShell';
import {
  StepAccountSetup,
  StepDocuments,
  StepFinalConfirmations,
  StepPayment,
  StepPecFirma,
  StepPreventivi,
  StepWelcome,
} from '@/components/landing/onboarding-wizard/StepViews';
import { OnboardingCredentialsCard } from '@/components/landing/OnboardingCredentialsCard';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import type { PracticeType } from '@/lib/bandi';
import type { OnboardingWizardStatePayload, OnboardingWizardStep } from '@/components/landing/onboarding-wizard/types';

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

type SessionStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
  ready?: boolean;
  didRequired?: boolean;
  nextUrl: string | null;
};


type CreateIntentResponse = {
  ok?: boolean;
  error?: string;
  url?: string;
  nextUrl?: string;
  alreadyPaid?: boolean;
  status?: 'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
  sessionId?: string;
  paymentIntentId?: string;
  clientSecret?: string;
  paymentMode?: 'payment_element';
};

const STEP_COPY: Record<OnboardingWizardStep, { title: string; subtitle: string; nextLabel: string }> = {
  1: {
    title: 'Checkout e pagamento',
    subtitle: 'Completa il pagamento BNDO per avviare la pratica e sbloccare l’onboarding.',
    nextLabel: 'Continua',
  },
  2: {
    title: 'Benvenuto in BNDO',
    subtitle: '',
    nextLabel: 'Inizia onboarding',
  },
  3: {
    title: 'Configura l’account dashboard',
    subtitle: 'Imposta email e password con cui accederai all’area pratica BNDO.',
    nextLabel: 'Continua',
  },
  4: {
    title: 'PEC e firma digitale',
    subtitle: 'Inserisci i dati operativi necessari per l’avvio pratica.',
    nextLabel: 'Continua',
  },
  5: {
    title: 'Documenti obbligatori',
    subtitle: 'Carica i documenti richiesti per procedere con l’istruttoria.',
    nextLabel: 'Continua',
  },
  6: {
    title: 'Preventivi',
    subtitle: 'Carica i preventivi oppure inserisci i dettagli economici manualmente.',
    nextLabel: 'Continua',
  },
  7: {
    title: 'Conferme finali',
    subtitle: 'Accetta i consensi e conferma l’invio per attivare la dashboard.',
    nextLabel: 'Completa onboarding',
  },
};

function readApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const values = [record.error, record.message, record.detail];
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function mergeQuoteFiles(existing: File[], incoming: File[]) {
  const deduped = new Map<string, File>();
  for (const file of [...existing, ...incoming]) {
    deduped.set(`${file.name}-${file.size}-${file.lastModified}`, file);
  }
  return Array.from(deduped.values());
}

function normalizeSteps(steps: number[]) {
  const allowed = new Set([1, 2, 3, 4, 5, 6, 7]);
  const unique = new Set<number>();
  for (const step of steps) {
    if (allowed.has(step)) unique.add(step);
  }
  return Array.from(unique).sort((a, b) => a - b) as OnboardingWizardStep[];
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

export function OnboardingWizardClient({
  sessionId,
  practiceType,
  quizSubmissionId,
  previewStep,
  skipPayment,
}: {
  sessionId?: string;
  practiceType?: PracticeType;
  quizSubmissionId?: string;
  previewStep?: OnboardingWizardStep;
  skipPayment?: boolean;
}) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [wizardState, setWizardState] = useState<OnboardingWizardStatePayload | null>(null);

  const [currentStep, setCurrentStep] = useState<OnboardingWizardStep>(1);
  const [completedSteps, setCompletedSteps] = useState<OnboardingWizardStep[]>([]);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'back'>('next');
  const [stepError, setStepError] = useState<string | null>(null);
  const [step2GuideOpen, setStep2GuideOpen] = useState(false);

  const [paymentChecking, setPaymentChecking] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId ?? null);
  const [embeddedCheckoutClientSecret, setEmbeddedCheckoutClientSecret] = useState<string | null>(null);
  const [attemptedAutoPaymentElement, setAttemptedAutoPaymentElement] = useState(false);
  const [paymentDeferred, setPaymentDeferred] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pec, setPec] = useState('');
  const [digitalSignature, setDigitalSignature] = useState<'yes' | 'no'>('no');
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [taxCodeDocument, setTaxCodeDocument] = useState<File | null>(null);
  const [didDocument, setDidDocument] = useState<File | null>(null);
  const [didRequired, setDidRequired] = useState(false);


  const [quotes, setQuotes] = useState<File[]>([]);
  const [quotesText, setQuotesText] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [consentStorage, setConsentStorage] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [completedPayload, setCompletedPayload] = useState<CompletePayload | null>(null);

  const paymentStatus = wizardState?.paymentStatus ?? 'unpaid';
  const maxReachableStep = useMemo(() => {
    const maxCompleted = completedSteps.length ? Math.max(...completedSteps) : 0;
    const candidate = Math.max(currentStep, (maxCompleted + 1) as OnboardingWizardStep);
    return Math.min(7, Math.max(1, candidate)) as OnboardingWizardStep;
  }, [completedSteps, currentStep]);

  async function loadWizardState(sessionOverride?: string | null) {
    setBootstrapping(true);
    setBootError(null);
    try {
      const params = new URLSearchParams();
      if (practiceType) params.set('practiceType', practiceType);
      if (quizSubmissionId) params.set('quizSubmissionId', quizSubmissionId);
      const querySession = sessionOverride ?? activeSessionId;
      if (querySession) params.set('session_id', querySession);

      const response = await fetch(`/api/onboarding/wizard-state?${params.toString()}`, { cache: 'no-store' });
      const payload = (await response.json()) as OnboardingWizardStatePayload | { error?: string };
      if (!response.ok) {
        throw new Error(readApiError(payload, 'Impossibile inizializzare l’onboarding.'));
      }

      const parsed = payload as OnboardingWizardStatePayload;
      if (parsed.nextUrl && parsed.onboardingStatus === 'completed') {
        window.location.href = parsed.nextUrl;
        return;
      }

      const isPreviewHost =
        typeof window !== 'undefined' &&
        (window.location.hostname.includes('netlify.app') ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1');
      const canUsePreviewStep = isPreviewHost && previewStep && previewStep >= 1 && previewStep <= 7;
      const effectiveStep = canUsePreviewStep ? previewStep : parsed.currentStep;
      const effectiveCompleted = canUsePreviewStep
        ? normalizeSteps(Array.from({ length: Math.max(0, effectiveStep - 1) }, (_, index) => index + 1))
        : normalizeSteps(parsed.completedSteps);

      setWizardState(parsed);
      setCurrentStep(effectiveStep);
      setCompletedSteps(effectiveCompleted);
      if (parsed.sessionId) setActiveSessionId(parsed.sessionId);
      if (parsed.paymentStatus === 'paid') {
        setEmbeddedCheckoutClientSecret(null);
        setPaymentDeferred(false);
      }
      if (parsed.didRequired) setDidRequired(true);
      if (parsed.customerEmail) setEmail((prev) => prev || parsed.customerEmail || '');

      setStepError(null);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : 'Errore caricamento onboarding.');
    } finally {
      setBootstrapping(false);
    }
  }

  useEffect(() => {
    void loadWizardState(sessionId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentStep !== 2 && step2GuideOpen) {
      setStep2GuideOpen(false);
    }
  }, [currentStep, step2GuideOpen]);

  useEffect(() => {
    if (!skipPayment) return;
    if (paymentStatus === 'paid') return;
    if (currentStep === 1) {
      setPaymentDeferred(true);
      setCurrentStep(2);
      setCompletedSteps((previous) => normalizeSteps([...previous, 1]));
      setStepError(null);
    }
  }, [skipPayment, paymentStatus, currentStep]);

  useEffect(() => {
    if (currentStep !== 1 || paymentStatus === 'paid') return;
    if (!wizardState?.grantSlug) return;
    if (embeddedCheckoutClientSecret || paymentLoading || attemptedAutoPaymentElement) return;
    setAttemptedAutoPaymentElement(true);
    void startPaymentIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, paymentStatus, wizardState?.grantSlug, embeddedCheckoutClientSecret, paymentLoading, attemptedAutoPaymentElement]);

  async function persistWizardState(nextStep: OnboardingWizardStep, nextCompleted: OnboardingWizardStep[]) {
    if (paymentStatus !== 'paid') return;
    try {
      const response = await fetch('/api/onboarding/wizard-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practiceType,
          quizSubmissionId,
          session_id: activeSessionId,
          currentStep: nextStep,
          completedSteps: nextCompleted,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as OnboardingWizardStatePayload;
      setWizardState((prev) => (prev ? { ...prev, ...payload } : payload));
    } catch {
      // Silent fallback to keep flow fluid.
    }
  }

  async function refreshPaymentStatus(): Promise<
    'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded' | null
  > {
    if (!activeSessionId) {
      await loadWizardState(null);
      return wizardState?.paymentStatus ?? null;
    }

    try {
      setPaymentChecking(true);
      const params = new URLSearchParams({
        session_id: activeSessionId,
      });
      if (wizardState?.grantSlug) params.set('grantSlug', wizardState.grantSlug);
      if (quizSubmissionId) params.set('quizSubmissionId', quizSubmissionId);
      const response = await fetch(`/api/payments/session-status?${params.toString()}`, { cache: 'no-store' });
      const payload = (await response.json()) as SessionStatusResponse;
      if (!response.ok) throw new Error(readApiError(payload, 'Impossibile verificare il pagamento.'));
      await loadWizardState(activeSessionId);
      return payload.status ?? null;
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Errore verifica pagamento.');
      return null;
    } finally {
      setPaymentChecking(false);
    }
  }

  async function handleEmbeddedPaymentComplete() {
    setStepError(null);
    const maxAttempts = 7;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const status = await refreshPaymentStatus();
      if (status === 'paid') return;
      if (status === 'failed' || status === 'canceled' || status === 'refunded') return;
      if (attempt < maxAttempts - 1) {
        await sleep(1400);
      }
    }
    setStepError('Pagamento ricevuto, verifica in corso. Clicca "Ho già pagato, verifica" tra pochi secondi.');
  }

  async function startPaymentIntent() {
    if (!wizardState?.grantSlug) {
      setStepError('Pratica non riconosciuta. Torna al quiz o riapri la pagina onboarding.');
      return;
    }

    setPaymentLoading(true);
    setStepError(null);
    try {
      const response = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantSlug: wizardState.grantSlug,
          practiceType: practiceType ?? undefined,
          quizSubmissionId: quizSubmissionId ?? undefined,
        }),
      });
      const payload = (await response.json()) as CreateIntentResponse;
      if (!response.ok) throw new Error(readApiError(payload, 'Impossibile avviare il pagamento Stripe.'));

      if (payload.alreadyPaid) {
        if (payload.sessionId) setActiveSessionId(payload.sessionId);
        setEmbeddedCheckoutClientSecret(null);
        await loadWizardState(payload.sessionId ?? activeSessionId);
        return;
      }

      const paymentIdentifier = payload.paymentIntentId ?? payload.sessionId ?? null;
      if (payload.paymentMode === 'payment_element' && payload.clientSecret && paymentIdentifier) {
        setActiveSessionId(paymentIdentifier);
        setEmbeddedCheckoutClientSecret(payload.clientSecret);
        setPaymentDeferred(false);
        return;
      }

      throw new Error('Pagamento non disponibile in questo momento.');
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Errore avvio checkout.');
    } finally {
      setPaymentLoading(false);
    }
  }

  function validateCurrentStep(target: OnboardingWizardStep): string | null {
    if (target === 1) {
      if (paymentStatus !== 'paid' && !paymentDeferred) {
        return 'Completa il pagamento oppure scegli "Pago dopo la verifica dei requisiti".';
      }
      return null;
    }

    if (target === 2) return null;

    if (target === 3) {
      if (!email.trim()) return 'Inserisci la tua email.';
      if (password.length < 8) return 'La password deve essere di almeno 8 caratteri.';
      return null;
    }

    if (target === 4) {
      if (!pec.trim()) return 'Inserisci la PEC.';
      return null;
    }

    if (target === 5) {
      if (!idDocument || !taxCodeDocument) return 'Carica documento di identità e codice fiscale.';
      if (didRequired && !didDocument) return 'Carica la certificazione DID.';
      return null;
    }



    if (target === 6) {
      if (!quotes.length && !quotesText.trim()) {
        return 'Carica almeno un preventivo oppure inserisci bene/servizio + prezzo + IVA.';
      }
      return null;
    }

    if (!acceptPrivacy) return 'Devi accettare la Privacy Policy.';
    if (!acceptTerms) return 'Devi accettare i Termini e Condizioni.';
    if (!consentStorage) return 'Devi autorizzare la conservazione dei dati.';
    if (paymentStatus !== 'paid' && !paymentDeferred) return 'Pagamento non verificato.';
    return null;
  }

  function canAdvance(target: OnboardingWizardStep) {
    return !validateCurrentStep(target) && !submitting && !paymentLoading && !paymentChecking;
  }

  async function goToStep(target: OnboardingWizardStep, direction: 'next' | 'back', markCurrentCompleted: boolean) {
    const nextCompleted = normalizeSteps(
      markCurrentCompleted ? [...completedSteps, currentStep] : [...completedSteps],
    );
    setTransitionDirection(direction);
    setCompletedSteps(nextCompleted);
    setCurrentStep(target);
    await persistWizardState(target, nextCompleted);
  }

  async function onNext() {
    setStepError(null);
    const validationError = validateCurrentStep(currentStep);
    if (validationError) {
      setStepError(validationError);
      return;
    }

    if (currentStep === 7) {
      await submitOnboarding();
      return;
    }

    await goToStep((currentStep + 1) as OnboardingWizardStep, 'next', true);
  }

  async function onBack() {
    if (currentStep === 1) return;
    setStepError(null);
    await goToStep((currentStep - 1) as OnboardingWizardStep, 'back', false);
  }

  async function onSelectStep(targetStep: OnboardingWizardStep) {
    if (targetStep === currentStep) return;
    if (targetStep > maxReachableStep) return;
    setStepError(null);
    await goToStep(targetStep, targetStep > currentStep ? 'next' : 'back', false);
  }

  async function submitOnboarding() {
    setStepError(null);
    setSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const fd = new FormData();
      if (activeSessionId) fd.set('sessionId', activeSessionId);
      if (quizSubmissionId) fd.set('quizSubmissionId', quizSubmissionId);
      if (practiceType) fd.set('practiceType', practiceType);
      fd.set('email', normalizedEmail);
      fd.set('pec', pec.trim());
      fd.set('digitalSignature', digitalSignature);
      fd.set('idDocument', idDocument as File);
      fd.set('taxCodeDocument', taxCodeDocument as File);
      if (didRequired && didDocument) {
        fd.set('didDocument', didDocument);
      }


      for (const file of quotes) fd.append('quotes', file);
      fd.set('quotesText', quotesText.trim());
      fd.set('acceptPrivacy', acceptPrivacy ? 'yes' : 'no');
      fd.set('acceptTerms', acceptTerms ? 'yes' : 'no');
      fd.set('consentStorage', consentStorage ? 'yes' : 'no');
      fd.set('paymentDeferred', paymentDeferred ? 'yes' : 'no');
      fd.set('username', deriveUsernameFromEmail(normalizedEmail));
      fd.set('password', password);

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        body: fd,
      });
      const payload = (await response.json()) as CompletePayload;
      if (!response.ok) throw new Error(readApiError(payload, 'Onboarding non riuscito.'));
      setCompletedPayload(payload);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Errore onboarding.');
    } finally {
      setSubmitting(false);
    }
  }

  if (completedPayload?.ok) {
    return (
      <main className="wizard7-page">
        <section className="wizard7-successCard">
          <div className="panel p-6 sm:p-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand.steel">
              <ShieldCheck className="h-4 w-4 text-brand.mint" />
              Dashboard attivata
            </div>
            <p className="text-sm text-slate-700">
              Perfetto: onboarding completato e documenti ricevuti. Ora puoi accedere alla dashboard BNDO.
            </p>
          </div>
          {activeSessionId ? <OnboardingCredentialsCard sessionId={activeSessionId} /> : null}
        </section>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="wizard7-page">
        <section className="wizard7-successCard">
          <p className="wizard7-inlineError">{bootError}</p>
          <button className="wizard7-btn wizard7-btn-primary" type="button" onClick={() => void loadWizardState(null)}>
            Riprova
          </button>
        </section>
      </main>
    );
  }

  const copy = STEP_COPY[currentStep];
  const backHandler = currentStep > 1 ? () => void onBack() : undefined;
  const allowPayLaterStep1 = currentStep === 1 && paymentStatus !== 'paid';

  async function payLaterAndContinue() {
    setPaymentDeferred(true);
    setStepError(null);
    await goToStep(2, 'next', true);
  }
  const footerBackHandler =
    allowPayLaterStep1
      ? () => {
          void payLaterAndContinue();
        }
      : currentStep === 2
      ? () => setStep2GuideOpen((prev) => !prev)
      : backHandler;
  const footerBackLabel =
    allowPayLaterStep1
      ? 'Pago dopo la verifica requisiti'
      : currentStep === 2
      ? step2GuideOpen
        ? 'Torna al benvenuto'
        : 'Come funziona l’onboarding'
      : 'Indietro';
  const showFooter = currentStep !== 1;

  return (
    <BandoOnboardingShell
      currentStep={currentStep}
      sidebar={
        <BandoOnboardingSidebar
          currentStep={currentStep}
          completedSteps={completedSteps}
          maxReachableStep={maxReachableStep}
          onSelectStep={(step) => void onSelectStep(step)}
        />
      }
    >
      <div className="wizard7-mainStack">
        <BandoOnboardingStepHeader title={copy.title} subtitle={copy.subtitle} onBack={backHandler} />

        <BandoOnboardingStepTransition step={currentStep} direction={transitionDirection}>
          {currentStep === 1 ? (
            <StepPayment
              clientSecret={embeddedCheckoutClientSecret}
              sessionId={activeSessionId}
              error={stepError}
              checking={paymentChecking}
              loading={paymentLoading}
              onEmbeddedPaymentComplete={() => void handleEmbeddedPaymentComplete()}
              onEmbeddedPaymentError={(message) => setStepError(message)}
              onVerify={() => void refreshPaymentStatus()}
              onPayLater={() => void payLaterAndContinue()}
            />
          ) : null}

          {currentStep === 2 ? (
            <StepWelcome
              showGuide={step2GuideOpen}
              didRequired={didRequired}
              onCloseGuide={() => setStep2GuideOpen(false)}
            />
          ) : null}

          {currentStep === 3 ? (
            <StepAccountSetup
              email={email}
              password={password}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
            />
          ) : null}

          {currentStep === 4 ? (
            <StepPecFirma
              pec={pec}
              digitalSignature={digitalSignature}
              onPecChange={setPec}
              onSignatureChange={setDigitalSignature}
            />
          ) : null}

          {currentStep === 5 ? (
            <StepDocuments
              idDocument={idDocument}
              taxCodeDocument={taxCodeDocument}
              didDocument={didDocument}
              didRequired={didRequired}
              onIdDocumentChange={setIdDocument}
              onTaxCodeDocumentChange={setTaxCodeDocument}
              onDidDocumentChange={setDidDocument}
            />
          ) : null}



          {currentStep === 6 ? (
            <StepPreventivi
              quotesText={quotesText}
              quotes={quotes}
              onQuotesTextChange={setQuotesText}
              onQuoteFilesAdd={(incoming) => setQuotes((prev) => mergeQuoteFiles(prev, incoming))}
              onQuoteFileRemove={(key) => setQuotes((prev) => prev.filter((item) => `${item.name}-${item.size}-${item.lastModified}` !== key))}
            />
          ) : null}

          {currentStep === 7 ? (
            <StepFinalConfirmations
              acceptPrivacy={acceptPrivacy}
              acceptTerms={acceptTerms}
              consentStorage={consentStorage}
              onAcceptPrivacyChange={setAcceptPrivacy}
              onAcceptTermsChange={setAcceptTerms}
              onConsentStorageChange={setConsentStorage}
            />
          ) : null}
        </BandoOnboardingStepTransition>

        {currentStep !== 1 && stepError ? <p className="wizard7-inlineError">{stepError}</p> : null}

        {currentStep === 7 ? (
          <p className="wizard7-helpText">
            Hai dubbi sui documenti? Contattaci su{' '}
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            .
          </p>
        ) : null}

        {showFooter ? (
          <BandoOnboardingFooterActions
            onBack={footerBackHandler}
            backDisabled={false}
            backLabel={footerBackLabel}
            nextDisabled={!canAdvance(currentStep)}
            nextLabel={
              submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                copy.nextLabel
              )
            }
            onNext={() => void onNext()}
          />
        ) : null}
      </div>
    </BandoOnboardingShell>
  );
}
