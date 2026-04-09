'use client';
// Force build v1.0.3 - Indexing Fixes


import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  BandoOnboardingFooterActions,
  BandoOnboardingShell,
  BandoOnboardingSidebar,
  BandoOnboardingStepHeader,
  BandoOnboardingStepTransition,
} from '@/components/landing/onboarding-wizard/BandoOnboardingShell';
import {
  DASHBOARD_CLIENT_ONBOARDING_STEPS,
  LEGACY_ONBOARDING_STEPS,
} from '@/components/landing/onboarding-wizard/config';
import {
  StepAccountSetup,
  StepDocuments,
  StepFinalConfirmations,
  StepPayment,
  StepPecFirma,
  StepPreventivi,
  StepWelcome,
} from '@/components/landing/onboarding-wizard/StepViews';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import type { PracticeType } from '@/lib/bandi';
import type {
  OnboardingMode,
  OnboardingDocumentRequirement,
  OnboardingWizardStatePayload,
  OnboardingWizardStep,
} from '@/components/landing/onboarding-wizard/types';

type CompletePayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  detail?: string;
  code?: string;
  sessionId?: string;
  practiceType?: string;
  applicationId?: string;
  alreadyProvisioned?: boolean;
  requiresAutoLogin?: boolean;
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

type SaveProgressResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  detail?: string;
  savedAt?: string;
  uploadedFilesCount?: number;
};

type LocalOnboardingDraft = {
  v: 1;
  savedAt: string;
  currentStep: OnboardingWizardStep;
  completedSteps: OnboardingWizardStep[];
  guestCredentialMode: 'new' | 'existing';
  pec: string;
  digitalSignature: 'yes' | 'no' | '';
  quotesText: string;
  email: string;
  username: string;
  existingIdentifier: string;
  acceptPrivacy: boolean;
  acceptTerms: boolean;
  consentStorage: boolean;
};

const LEGACY_STEP_COPY: Record<OnboardingWizardStep, { title: string; subtitle: string; nextLabel: string }> = {
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

const DASHBOARD_STEP_COPY: Record<1 | 2 | 3 | 4, { title: string; subtitle: string; nextLabel: string }> = {
  1: {
    title: 'Come funziona l’onboarding',
    subtitle: 'Panoramica operativa prima dell’avvio pratica.',
    nextLabel: 'Continua',
  },
  2: {
    title: 'Documenti richiesti',
    subtitle: 'Carica i documenti base e quelli richiesti dal bando selezionato.',
    nextLabel: 'Continua',
  },
  3: {
    title: 'Preventivi/Spese da sostenere',
    subtitle: 'Inserisci i preventivi/spese che vorresti sostenere.',
    nextLabel: 'Continua',
  },
  4: {
    title: 'Conferme finali',
    subtitle: 'Accetta i consensi e invia l’onboarding pratica.',
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

function normalizeSteps(steps: number[], maxStep: OnboardingWizardStep) {
  const unique = new Set<number>();
  for (const step of steps) {
    if (step >= 1 && step <= maxStep) unique.add(step);
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

function isQuoteRequirement(requirement: OnboardingDocumentRequirement) {
  const key = requirement.requirementKey.toLowerCase();
  const label = requirement.label.toLowerCase();
  return (
    key.includes('preventiv') ||
    key.includes('quotaz') ||
    label.includes('preventiv') ||
    label.includes('quotaz')
  );
}

function fallbackDocumentRequirements(didRequired: boolean): OnboardingDocumentRequirement[] {
  const base: OnboardingDocumentRequirement[] = [
    {
      requirementKey: 'documento_identita',
      label: 'Documento di identità',
      description: 'Documento fronte/retro in corso di validità.',
      isRequired: true,
      status: 'missing',
    },
    {
      requirementKey: 'codice_fiscale',
      label: 'Codice fiscale',
      description: 'Tessera sanitaria o documento equivalente.',
      isRequired: true,
      status: 'missing',
    },
  ];
  if (didRequired) {
    base.push({
      requirementKey: 'certificazione_did',
      label: 'Certificazione DID',
      description: 'Documento richiesto dal bando per verifica stato occupazionale.',
      isRequired: true,
      status: 'missing',
    });
  }
  return base;
}

function buildDraftStorageKey(args: {
  mode: OnboardingMode;
  applicationId: string | null;
  grantId?: string;
  grantSlug?: string;
  practiceType?: PracticeType;
}) {
  if (args.mode !== 'dashboard_client') return null;
  const scope =
    args.applicationId ??
    args.grantId ??
    args.grantSlug ??
    args.practiceType ??
    'generic';
  return `bndo:onboarding:draft:${scope}`;
}

function slugifySegment(value: string | undefined, fallback = 'pratica') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function buildShortResumeCode() {
  return `${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-4)}`;
}

function safeParseLocalDraft(raw: string | null): LocalOnboardingDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalOnboardingDraft>;
    if (!parsed || parsed.v !== 1) return null;
    if (!parsed.currentStep || !parsed.completedSteps) return null;
    return {
      v: 1,
      savedAt: String(parsed.savedAt ?? ''),
      currentStep: parsed.currentStep as OnboardingWizardStep,
      completedSteps: parsed.completedSteps as OnboardingWizardStep[],
      guestCredentialMode:
        parsed.guestCredentialMode === 'existing' || parsed.guestCredentialMode === 'new'
          ? parsed.guestCredentialMode
          : 'new',
      pec: String(parsed.pec ?? ''),
      digitalSignature: (parsed.digitalSignature as 'yes' | 'no' | '') ?? '',
      quotesText: String(parsed.quotesText ?? ''),
      email: String(parsed.email ?? ''),
      username: String(parsed.username ?? ''),
      existingIdentifier: String(parsed.existingIdentifier ?? ''),
      acceptPrivacy: Boolean(parsed.acceptPrivacy),
      acceptTerms: Boolean(parsed.acceptTerms),
      consentStorage: Boolean(parsed.consentStorage)
    };
  } catch {
    return null;
  }
}

export function OnboardingWizardClient({
  sessionId,
  practiceType,
  quizSubmissionId,
  applicationId,
  grantId,
  grantSlug,
  source,
  previewStep,
  resumeStep,
  skipPayment,
  onboardingMode,
}: {
  sessionId?: string;
  practiceType?: PracticeType;
  quizSubmissionId?: string;
  applicationId?: string;
  grantId?: string;
  grantSlug?: string;
  source?: 'scanner' | 'chat' | 'direct' | 'admin';
  previewStep?: OnboardingWizardStep;
  resumeStep?: OnboardingWizardStep;
  skipPayment?: boolean;
  onboardingMode?: OnboardingMode;
}) {
  const inferDashboardMode = !sessionId && Boolean(applicationId);
  const resolvedOnboardingMode: OnboardingMode =
    onboardingMode ?? (inferDashboardMode ? 'dashboard_client' : 'legacy');
  const isDashboardMode = resolvedOnboardingMode === 'dashboard_client';
  const maxStep: OnboardingWizardStep = isDashboardMode ? 4 : 7;
  const sidebarSteps = isDashboardMode ? DASHBOARD_CLIENT_ONBOARDING_STEPS : LEGACY_ONBOARDING_STEPS;

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
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(applicationId ?? null);
  const [embeddedCheckoutClientSecret, setEmbeddedCheckoutClientSecret] = useState<string | null>(null);
  const [attemptedAutoPaymentElement, setAttemptedAutoPaymentElement] = useState(false);
  const [paymentDeferred, setPaymentDeferred] = useState(isDashboardMode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [guestCredentialMode, setGuestCredentialMode] = useState<'new' | 'existing'>('new');
  const [existingIdentifier, setExistingIdentifier] = useState('');
  const [existingPassword, setExistingPassword] = useState('');
  const [pec, setPec] = useState('');
  const [digitalSignature, setDigitalSignature] = useState<'yes' | 'no' | ''>(isDashboardMode ? '' : 'no');
  const [documentRequirements, setDocumentRequirements] = useState<OnboardingDocumentRequirement[]>([]);
  const [requirementFiles, setRequirementFiles] = useState<Record<string, File | null>>({});
  const [requirementFileErrors, setRequirementFileErrors] = useState<Record<string, string | null>>({});
  const [removedUploadedKeys, setRemovedUploadedKeys] = useState<Set<string>>(new Set());

  const [quotes, setQuotes] = useState<File[]>([]);
  const [quotesText, setQuotesText] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [consentStorage, setConsentStorage] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [resumeLink, setResumeLink] = useState('');
  const [resumeCode, setResumeCode] = useState('');
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const [completedPayload, setCompletedPayload] = useState<CompletePayload | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'guest' | 'authenticated'>('loading');
  const [restoredDraftKey, setRestoredDraftKey] = useState<string | null>(null);
  const onboardingStartTrackedRef = useRef(false);
  const usernameAutofillLockedRef = useRef(false);

  const paymentStatus = wizardState?.paymentStatus ?? 'unpaid';
  const maxReachableStep = useMemo(() => {
    const maxCompleted = completedSteps.length ? Math.max(...completedSteps) : 0;
    const candidate = Math.max(currentStep, maxCompleted + 1);
    return Math.min(maxStep, Math.max(1, candidate)) as OnboardingWizardStep;
  }, [completedSteps, currentStep, maxStep]);
  const documentUploadRequirements = useMemo(
    () => documentRequirements.filter((requirement) => !isQuoteRequirement(requirement)),
    [documentRequirements],
  );
  const needsGuestCredentials = isDashboardMode && authState !== 'authenticated';
  const draftStorageKey = useMemo(
    () =>
      buildDraftStorageKey({
        mode: resolvedOnboardingMode,
        applicationId: activeApplicationId,
        grantId,
        grantSlug,
        practiceType
      }),
    [resolvedOnboardingMode, activeApplicationId, grantId, grantSlug, practiceType]
  );
  const resumeScope = useMemo(() => {
    return activeApplicationId ?? grantId ?? grantSlug ?? practiceType ?? 'generic';
  }, [activeApplicationId, grantId, grantSlug, practiceType]);

  useEffect(() => {
    if (isDashboardMode) {
      setPaymentDeferred(true);
      setDigitalSignature('');
      return;
    }
    setDigitalSignature((previous) => previous || 'no');
  }, [isDashboardMode]);

  useEffect(() => {
    if (!needsGuestCredentials) return;
    if (guestCredentialMode !== 'new') return;
    if (usernameAutofillLockedRef.current) return;
    if (username.trim().length > 0) return;
    const next = deriveUsernameFromEmail(email.trim().toLowerCase());
    if (next) setUsername(next);
  }, [email, needsGuestCredentials, guestCredentialMode, username]);

  const handleUsernameChange = (value: string) => {
    usernameAutofillLockedRef.current = true;
    setUsername(value);
  };

  useEffect(() => {
    if (!needsGuestCredentials) return;
    if (guestCredentialMode !== 'existing') return;
    if (existingIdentifier.trim()) return;
    if (email.trim()) {
      setExistingIdentifier(email.trim().toLowerCase());
    }
  }, [needsGuestCredentials, guestCredentialMode, existingIdentifier, email]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const loadAuthState = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        if (!mounted) return;
        if (!response.ok) {
          setAuthState('guest');
          return;
        }
        const payload = (await response.json().catch(() => null)) as { authenticated?: boolean } | null;
        setAuthState(payload?.authenticated ? 'authenticated' : 'guest');
      } catch {
        if (mounted) setAuthState('guest');
      }
    };
    void loadAuthState();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  function buildWizardStateSearchParams(sessionOverride?: string | null) {
    const params = new URLSearchParams();
    if (practiceType) params.set('practiceType', practiceType);
    if (quizSubmissionId) params.set('quizSubmissionId', quizSubmissionId);
    if (activeApplicationId) params.set('applicationId', activeApplicationId);
    if (grantId) params.set('grantId', grantId);
    if (grantSlug) params.set('grantSlug', grantSlug);
    if (source) params.set('sourceChannel', source);
    params.set('onboardingMode', resolvedOnboardingMode);
    const querySession = sessionOverride ?? activeSessionId;
    if (querySession) params.set('session_id', querySession);
    return params;
  }

  async function loadWizardState(sessionOverride?: string | null) {
    setBootstrapping(true);
    setBootError(null);
    try {
      const params = buildWizardStateSearchParams(sessionOverride);
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
      const canUsePreviewStep =
        isPreviewHost && previewStep && previewStep >= 1 && previewStep <= maxStep;
      const parsedCurrent = Math.min(maxStep, Math.max(1, parsed.currentStep));
      const parsedCompleted = normalizeSteps(parsed.completedSteps, maxStep);
      const canUseResumeStep =
        !canUsePreviewStep && resumeStep && resumeStep >= 1 && resumeStep <= maxStep;
      const previewCompleted = normalizeSteps(
        Array.from({ length: Math.max(0, (previewStep ?? 1) - 1) }, (_, index) => index + 1),
        maxStep
      );
      const effectiveCompleted = canUsePreviewStep ? previewCompleted : parsedCompleted;
      let effectiveStep = (canUsePreviewStep ? previewStep : parsedCurrent) as OnboardingWizardStep;
      if (canUseResumeStep) {
        const maxCompletedStep = effectiveCompleted.length ? Math.max(...effectiveCompleted) : 0;
        const maxResumeStep = Math.min(maxStep, Math.max(parsedCurrent, maxCompletedStep + 1));
        effectiveStep = Math.min(maxResumeStep, resumeStep as OnboardingWizardStep) as OnboardingWizardStep;
      }

      setWizardState(parsed);
      setCurrentStep(effectiveStep);
      setCompletedSteps(effectiveCompleted);
      if (parsed.sessionId) setActiveSessionId(parsed.sessionId);
      setActiveApplicationId(parsed.applicationId ?? null);

      if (parsed.paymentStatus === 'paid') {
        setEmbeddedCheckoutClientSecret(null);
        if (!isDashboardMode) setPaymentDeferred(false);
      }
      if (parsed.customerEmail) setEmail((prev) => prev || parsed.customerEmail || '');

      const requirements =
        parsed.documentRequirements && parsed.documentRequirements.length > 0
          ? parsed.documentRequirements
          : fallbackDocumentRequirements(Boolean(parsed.didRequired));
      setDocumentRequirements(requirements);
      setRequirementFiles((previous) => {
        const next: Record<string, File | null> = {};
        for (const requirement of requirements) {
          next[requirement.requirementKey] = previous[requirement.requirementKey] ?? null;
        }
        return next;
      });

      setStepError(null);
    } catch (error) {
      setBootError(error instanceof Error ? error.message : 'Errore caricamento onboarding.');
    } finally {
      setBootstrapping(false);
    }
  }

  async function resolveCanonicalApplicationIdForSubmit() {
    if (!isDashboardMode) return activeApplicationId;
    const params = buildWizardStateSearchParams(activeSessionId);
    const response = await fetch(`/api/onboarding/wizard-state?${params.toString()}`, { cache: 'no-store' });
    const payload = (await response.json()) as OnboardingWizardStatePayload | { error?: string };
    if (!response.ok) {
      throw new Error(readApiError(payload, 'Impossibile verificare la pratica prima dell’invio.'));
    }
    const parsed = payload as OnboardingWizardStatePayload;
    const canonicalApplicationId = parsed.applicationId ?? activeApplicationId ?? null;
    if (canonicalApplicationId && canonicalApplicationId !== activeApplicationId) {
      setActiveApplicationId(canonicalApplicationId);
    }
    return canonicalApplicationId;
  }

  useEffect(() => {
    void loadWizardState(sessionId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onboardingStartTrackedRef.current) return;
    if (bootstrapping && !wizardState) return;
    onboardingStartTrackedRef.current = true;
    if (typeof window !== 'undefined' && (window as any).bndoTrackEvent) {
      (window as any).bndoTrackEvent('onboarding_started', {
        onboardingMode: resolvedOnboardingMode,
        applicationId: activeApplicationId ?? null,
        grantId: grantId ?? null,
        grantSlug: grantSlug ?? null,
        practiceType: practiceType ?? null,
      });
    }
  }, [bootstrapping, wizardState, resolvedOnboardingMode, activeApplicationId, grantId, grantSlug, practiceType]);

  useEffect(() => {
    if (applicationId !== undefined) {
      setActiveApplicationId(applicationId ?? null);
    }
  }, [applicationId]);

  useEffect(() => {
    setCurrentStep((previous) => Math.min(previous, maxStep) as OnboardingWizardStep);
    setCompletedSteps((previous) => normalizeSteps(previous, maxStep));
  }, [maxStep]);

  useEffect(() => {
    if (!draftStorageKey) return;
    if (bootstrapping || !wizardState) return;
    if (restoredDraftKey === draftStorageKey) return;
    if (typeof window === 'undefined') return;

    const draft = safeParseLocalDraft(window.localStorage.getItem(draftStorageKey));
    if (!draft) {
      setRestoredDraftKey(draftStorageKey);
      return;
    }

    if (draft.pec) setPec((previous) => previous || draft.pec);
    if (draft.digitalSignature) setDigitalSignature((previous) => previous || draft.digitalSignature);
    if (draft.quotesText) setQuotesText((previous) => previous || draft.quotesText);
    if (draft.email) setEmail((previous) => previous || draft.email);
    if (draft.username) setUsername((previous) => previous || draft.username);
    if (draft.existingIdentifier) setExistingIdentifier((previous) => previous || draft.existingIdentifier);
    if (draft.guestCredentialMode === 'existing' || draft.guestCredentialMode === 'new') {
      setGuestCredentialMode(draft.guestCredentialMode);
    }
    if (!acceptPrivacy && draft.acceptPrivacy) setAcceptPrivacy(true);
    if (!acceptTerms && draft.acceptTerms) setAcceptTerms(true);
    if (!consentStorage && draft.consentStorage) setConsentStorage(true);

    const boundedStep = Math.min(maxStep, Math.max(1, draft.currentStep)) as OnboardingWizardStep;
    setCurrentStep((previous) => Math.max(previous, boundedStep) as OnboardingWizardStep);
    setCompletedSteps((previous) => normalizeSteps([...previous, ...draft.completedSteps], maxStep));
    setRestoredDraftKey(draftStorageKey);
  }, [
    draftStorageKey,
    bootstrapping,
    wizardState,
    restoredDraftKey,
    maxStep,
    acceptPrivacy,
    acceptTerms,
    consentStorage
  ]);

  useEffect(() => {
    if (!draftStorageKey) return;
    if (typeof window === 'undefined') return;
    const payload: LocalOnboardingDraft = {
      v: 1,
      savedAt: new Date().toISOString(),
      currentStep,
      completedSteps,
      guestCredentialMode,
      pec,
      digitalSignature,
      quotesText,
      email,
      username,
      existingIdentifier,
      acceptPrivacy,
      acceptTerms,
      consentStorage
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  }, [
    draftStorageKey,
    currentStep,
    completedSteps,
    pec,
    digitalSignature,
    quotesText,
    email,
    username,
    existingIdentifier,
    guestCredentialMode,
    acceptPrivacy,
    acceptTerms,
    consentStorage
  ]);

  useEffect(() => {
    if (!isDashboardMode && currentStep === 2) return;
    if (step2GuideOpen) setStep2GuideOpen(false);
  }, [isDashboardMode, currentStep, step2GuideOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `bndo:onboarding:resume-code:${resumeScope}`;
    const saved = window.localStorage.getItem(storageKey);
    const normalized = saved && /^[a-z0-9]{6,12}$/i.test(saved) ? saved : buildShortResumeCode();
    if (!saved) {
      window.localStorage.setItem(storageKey, normalized);
    }
    setResumeCode(normalized);
  }, [resumeScope]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (practiceType) url.searchParams.set('practice', practiceType);
    if (activeApplicationId) url.searchParams.set('applicationId', activeApplicationId);
    if (grantId) url.searchParams.set('grantId', grantId);
    if (grantSlug) url.searchParams.set('grantSlug', grantSlug);
    if (source) url.searchParams.set('source', source);
    if (quizSubmissionId) url.searchParams.set('quiz', quizSubmissionId);
    if (resolvedOnboardingMode) url.searchParams.set('onboarding_mode', resolvedOnboardingMode);
    if (skipPayment || isDashboardMode) url.searchParams.set('skip_payment', '1');
    url.searchParams.set('resume_step', String(currentStep));

    if (resumeCode) {
      const segment = slugifySegment(grantSlug ?? practiceType ?? 'pratica', 'pratica');
      const cleanUrl = `${window.location.origin}/onboarding/${segment}/${resumeCode}`;
      setResumeLink(cleanUrl);
      window.localStorage.setItem(
        `bndo:onboarding:resume-map:${resumeCode}`,
        JSON.stringify({
          targetUrl: url.toString(),
          savedAt: new Date().toISOString()
        })
      );
    } else {
      setResumeLink(url.toString());
    }
  }, [
    practiceType,
    activeApplicationId,
    grantId,
    grantSlug,
    source,
    quizSubmissionId,
    resolvedOnboardingMode,
    skipPayment,
    isDashboardMode,
    currentStep,
    resumeCode
  ]);

  useEffect(() => {
    if (isDashboardMode) return;
    if (!skipPayment) return;
    if (paymentStatus === 'paid') return;
    if (currentStep === 1) {
      setPaymentDeferred(true);
      setCurrentStep(2);
      setCompletedSteps((previous) => normalizeSteps([...previous, 1], maxStep));
      setStepError(null);
    }
  }, [isDashboardMode, skipPayment, paymentStatus, currentStep, maxStep]);

  useEffect(() => {
    if (isDashboardMode) return;
    if (currentStep !== 1 || paymentStatus === 'paid') return;
    if (!wizardState?.grantSlug) return;
    if (embeddedCheckoutClientSecret || paymentLoading || attemptedAutoPaymentElement) return;
    setAttemptedAutoPaymentElement(true);
    void startPaymentIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDashboardMode,
    currentStep,
    paymentStatus,
    wizardState?.grantSlug,
    embeddedCheckoutClientSecret,
    paymentLoading,
    attemptedAutoPaymentElement,
  ]);

  async function persistWizardState(nextStep: OnboardingWizardStep, nextCompleted: OnboardingWizardStep[]) {
    if (isDashboardMode) return;
    if (paymentStatus !== 'paid') return;
    try {
      const response = await fetch('/api/onboarding/wizard-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practiceType,
          quizSubmissionId,
          applicationId: activeApplicationId,
          session_id: activeSessionId,
          onboardingMode: resolvedOnboardingMode,
          currentStep: nextStep,
          completedSteps: nextCompleted,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as OnboardingWizardStatePayload;
      setWizardState((prev) => (prev ? { ...prev, ...payload } : payload));
    } catch {
      // Keep flow fluid when wizard state persistence is unavailable.
    }
  }

  async function refreshPaymentStatus(): Promise<
    'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded' | null
  > {
    if (isDashboardMode) return null;

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
      if (activeApplicationId) params.set('applicationId', activeApplicationId);
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
    if (isDashboardMode) return;
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

  const handleRequirementFileChange = useCallback((requirementKey: string, file: File | null) => {
    setRequirementFileErrors((prev) => ({ ...prev, [requirementKey]: null }));
    if (!file) {
      setRequirementFiles((prev) => ({ ...prev, [requirementKey]: null }));
      setRemovedUploadedKeys((prev) => {
        const next = new Set(prev);
        next.add(requirementKey);
        return next;
      });
      return;
    }

    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'zip'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowed.includes(ext)) {
      setRequirementFileErrors((prev) => ({
        ...prev,
        [requirementKey]: `Tipo file non ammessi. Usa PDF, PNG, JPG o JPEG.`
      }));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setRequirementFileErrors((prev) => ({
        ...prev,
        [requirementKey]: `File troppo grande (max 25MB).`
      }));
      return;
    }

    setRequirementFiles((prev) => ({ ...prev, [requirementKey]: file }));
    setRemovedUploadedKeys((prev) => {
      const next = new Set(prev);
      next.delete(requirementKey);
      return next;
    });
  }, []);

  async function startPaymentIntent() {
    if (isDashboardMode) return;
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
          applicationId: activeApplicationId ?? undefined,
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
    if (isDashboardMode) {
      if (target === 1) return null;

      if (target === 2) {
        if (!pec.trim()) return 'Inserisci la PEC.';
        if (!digitalSignature) return 'Conferma se sei in possesso della firma digitale.';
        return null;
      }

      if (target === 3) {
        return null;
      }

      if (needsGuestCredentials) {
        if (guestCredentialMode === 'existing') {
          if (existingIdentifier.trim().length < 3) {
            return 'Inserisci username o email del tuo account esistente.';
          }
          if (!existingPassword.trim()) {
            return 'Inserisci la password del tuo account esistente.';
          }
        } else {
          const normalizedEmail = email.trim().toLowerCase();
          if (!normalizedEmail || !normalizedEmail.includes('@')) {
            return 'Inserisci una email valida per il tuo accesso.';
          }
          if (password.length < 8) {
            return 'La password deve essere di almeno 8 caratteri.';
          }
          if (passwordConfirm !== password) {
            return 'Le password non coincidono.';
          }
        }
      }

      if (!acceptPrivacy) return 'Devi accettare la Privacy Policy.';
      if (!acceptTerms) return 'Devi accettare i Termini e Condizioni.';
      if (!consentStorage) return 'Devi autorizzare la conservazione dei dati.';
      return null;
    }

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
      const missingRequired = documentUploadRequirements
        .filter((requirement) => requirement.isRequired)
        .filter((requirement) => !requirementFiles[requirement.requirementKey] && requirement.status !== 'uploaded');
      if (missingRequired.length > 0) {
        return `Carica i documenti obbligatori mancanti: ${missingRequired.map((requirement) => requirement.label).join(', ')}.`;
      }
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
    const paymentBusy = !isDashboardMode && (paymentLoading || paymentChecking);
    return !validateCurrentStep(target) && !submitting && !savingDraft && !paymentBusy;
  }

  async function goToStep(target: OnboardingWizardStep, direction: 'next' | 'back', markCurrentCompleted: boolean) {
    const boundedTarget = Math.min(maxStep, Math.max(1, target)) as OnboardingWizardStep;
    const nextCompleted = normalizeSteps(markCurrentCompleted ? [...completedSteps, currentStep] : [...completedSteps], maxStep);
    setTransitionDirection(direction);
    setCompletedSteps(nextCompleted);
    setCurrentStep(boundedTarget);
    await persistWizardState(boundedTarget, nextCompleted);
  }

  async function onNext() {
    setStepError(null);
    const validationError = validateCurrentStep(currentStep);
    if (validationError) {
      setStepError(validationError);
      return;
    }

    if (currentStep === maxStep) {
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
    setShowCompletionOverlay(true);
    try {
      let shouldAutoLoginAfterComplete = needsGuestCredentials;
      if (needsGuestCredentials && guestCredentialMode === 'existing') {
        const identifier = existingIdentifier.trim();
        const existingAuthResponse = await fetch('/api/auth/login-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            identifier,
            password: existingPassword,
            next: '/dashboard/pratiche'
          })
        });
        const existingAuthPayload = (await existingAuthResponse.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
        if (!existingAuthResponse.ok || !existingAuthPayload?.ok) {
          throw new Error(readApiError(existingAuthPayload, 'Credenziali non valide. Verifica username/email e password.'));
        }
        let authenticatedSession = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const sessionResponse = await fetch('/api/auth/session', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
            headers: { Accept: 'application/json' }
          });
          const sessionPayload = (await sessionResponse.json().catch(() => null)) as { authenticated?: boolean } | null;
          if (sessionResponse.ok && sessionPayload?.authenticated) {
            authenticatedSession = true;
            break;
          }
          await sleep(120);
        }
        if (!authenticatedSession) {
          throw new Error('Accesso completato ma sessione non pronta. Riprova tra pochi secondi.');
        }
        setAuthState('authenticated');
        shouldAutoLoginAfterComplete = false;
      }

      const canonicalApplicationId = await resolveCanonicalApplicationIdForSubmit();
      if (isDashboardMode && !canonicalApplicationId && !grantId && !grantSlug && !practiceType) {
        throw new Error('Pratica non riconosciuta. Riapri il flusso dalla dashboard e riprova.');
      }

      const normalizedEmail = email.trim().toLowerCase();
      const fd = new FormData();
      fd.set('onboardingMode', resolvedOnboardingMode);
      if (activeSessionId) fd.set('sessionId', activeSessionId);
      if (quizSubmissionId) fd.set('quizSubmissionId', quizSubmissionId);
      if (practiceType) fd.set('practiceType', practiceType);
      if (canonicalApplicationId) fd.set('applicationId', canonicalApplicationId);
      if (grantId) fd.set('grantId', grantId);
      if (grantSlug) fd.set('grantSlug', grantSlug);
      if (source) fd.set('sourceChannel', source);
      if (normalizedEmail) fd.set('email', normalizedEmail);
      fd.set('pec', pec.trim());
      fd.set('digitalSignature', digitalSignature || 'no');

      for (const requirement of documentRequirements) {
        const file = requirementFiles[requirement.requirementKey];
        if (!file) continue;
        fd.append('requirementFiles', file);
        fd.append('requirementFileKeys', requirement.requirementKey);
        fd.append('requirementFileLabels', requirement.label);
      }
      for (const key of removedUploadedKeys) {
        fd.append('removedRequirementKeys', key);
      }

      for (const file of quotes) fd.append('quotes', file);
      fd.set('quotesText', quotesText.trim());
      fd.set('acceptPrivacy', acceptPrivacy ? 'yes' : 'no');
      fd.set('acceptTerms', acceptTerms ? 'yes' : 'no');
      fd.set('consentStorage', consentStorage ? 'yes' : 'no');
      fd.set('paymentDeferred', paymentDeferred ? 'yes' : 'no');
      if (needsGuestCredentials) {
        fd.set('guestCredentialMode', guestCredentialMode);
      }

      const resolvedMode = resolvedOnboardingMode ?? (isDashboardMode ? 'dashboard_client' : 'legacy');
      fd.set('onboardingMode', resolvedMode);
      if (skipPayment || isDashboardMode) {
        fd.set('skipPayment', 'yes');
      }

      if (needsGuestCredentials && guestCredentialMode === 'new') {
        fd.set('password', password);
      } else if (!isDashboardMode) {
        fd.set('username', deriveUsernameFromEmail(normalizedEmail));
        fd.set('password', password);
      }

      const endpoint = new URL('/api/onboarding/complete', window.location.origin);
      if (resolvedMode) endpoint.searchParams.set('onboarding_mode', resolvedMode);
      if ((skipPayment ?? isDashboardMode) || resolvedMode === 'dashboard_client') {
        endpoint.searchParams.set('skip_payment', '1');
      }
      if (activeApplicationId) endpoint.searchParams.set('applicationId', activeApplicationId);
      if (grantId) endpoint.searchParams.set('grantId', grantId);
      if (grantSlug) endpoint.searchParams.set('grantSlug', grantSlug);
      if (practiceType) endpoint.searchParams.set('practice', practiceType);
      const response = await fetch(endpoint.toString(), {
        method: 'POST',
        body: fd,
      });
      const rawBody = await response.text();
      let payload: CompletePayload = {};
      if (rawBody.trim()) {
        try {
          payload = JSON.parse(rawBody) as CompletePayload;
        } catch {
          payload = {
            error: rawBody.length > 240 ? `${rawBody.slice(0, 240)}...` : rawBody,
          };
        }
      }
      if (!response.ok) {
        if (
          response.status === 409 &&
          needsGuestCredentials &&
          guestCredentialMode === 'new' &&
          (payload.code === 'EMAIL_ALREADY_REGISTERED' ||
            /email.*gi[aà]\s+registrat/i.test(readApiError(payload, '')))
        ) {
          setGuestCredentialMode('existing');
          const normalizedExisting = normalizedEmail || email.trim().toLowerCase();
          if (normalizedExisting) setExistingIdentifier(normalizedExisting);
          if (password.trim() && !existingPassword.trim()) setExistingPassword(password);
          setShowCompletionOverlay(false);
          setStepError('Questa email è già registrata: inserisci la password dell’account esistente e completa l’onboarding.');
          return;
        }
        throw new Error(readApiError(payload, `Onboarding non riuscito (HTTP ${response.status}).`));
      }
      if (payload.applicationId) {
        setActiveApplicationId(payload.applicationId);
      }

      if (shouldAutoLoginAfterComplete || payload.requiresAutoLogin) {
        const identifierForAutoLogin =
          needsGuestCredentials && guestCredentialMode === 'existing'
            ? existingIdentifier.trim()
            : email.trim().toLowerCase();
        const passwordForAutoLogin =
          needsGuestCredentials && guestCredentialMode === 'existing'
            ? existingPassword
            : password;
        const authResponse = await fetch('/api/auth/login-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            identifier: identifierForAutoLogin,
            password: passwordForAutoLogin,
            next: '/dashboard/pratiche'
          })
        });
        const authPayload = (await authResponse.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
        if (!authResponse.ok || !authPayload?.ok) {
          throw new Error(readApiError(authPayload, 'Account creato ma login automatico non riuscito. Prova ad accedere manualmente.'));
        }
      }

      if (typeof window !== 'undefined' && (window as any).bndoTrackEvent) {
        (window as any).bndoTrackEvent('onboarding_completed', {
          onboardingMode: resolvedOnboardingMode,
          applicationId: payload.applicationId ?? canonicalApplicationId ?? activeApplicationId ?? null,
          grantId: grantId ?? null,
          grantSlug: grantSlug ?? null,
          practiceType: practiceType ?? null,
          guestFlow: needsGuestCredentials && guestCredentialMode === 'new',
        });
        (window as any).bndoTrackEvent('practice_activated', {
          onboardingMode: resolvedOnboardingMode,
          applicationId: payload.applicationId ?? canonicalApplicationId ?? activeApplicationId ?? null,
          grantId: grantId ?? null,
          grantSlug: grantSlug ?? null,
          practiceType: practiceType ?? null,
          guestFlow: needsGuestCredentials && guestCredentialMode === 'new',
        });
      }

      setRemovedUploadedKeys(new Set());
      setCompletedPayload(payload);
    } catch (error) {
      setShowCompletionOverlay(false);
      setStepError(error instanceof Error ? error.message : 'Errore onboarding.');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!completedPayload?.ok) return;
    if (draftStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(draftStorageKey);
    }
    const timer = window.setTimeout(() => {
      window.location.assign('/dashboard/pratiche');
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [completedPayload?.ok, draftStorageKey]);

  const handleDigitalSignatureChange = (value: 'yes' | 'no' | '') => {
    setDigitalSignature(value);
  };

  if (showCompletionOverlay || completedPayload?.ok) {
    return (
      <main className="fixed inset-0 z-[220] flex min-h-screen items-center justify-center bg-white">
        <section className="flex flex-col items-center gap-5">
          <span
            className="h-12 w-12 animate-spin rounded-full border-2 border-slate-200 border-t-[#23C45F]"
            aria-hidden
          />
          <p className="text-2xl font-semibold tracking-tight text-[#0B1B4D] animate-pulse">
            Stiamo avviando la tua pratica...
          </p>
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

  if (bootstrapping && !wizardState) {
    return (
      <main className="wizard7-page">
        <section className="wizard7-successCard">
          <p className="wizard7-payLaterNotice">Sto preparando l’onboarding della pratica selezionata...</p>
        </section>
      </main>
    );
  }

  const copy = isDashboardMode
    ? DASHBOARD_STEP_COPY[Math.min(currentStep, 4) as 1 | 2 | 3 | 4]
    : LEGACY_STEP_COPY[currentStep];
  const backHandler = currentStep > 1 ? () => void onBack() : undefined;
  const allowPayLaterStep1 = !isDashboardMode && currentStep === 1 && paymentStatus !== 'paid';

  async function payLaterAndContinue() {
    if (isDashboardMode) return;
    setPaymentDeferred(true);
    setStepError(null);
    await goToStep(2, 'next', true);
  }

  async function saveProgressAndExit() {
    setStepError(null);
    setDraftNotice(null);
    setSavingDraft(true);

    try {
      if (!draftStorageKey || typeof window === 'undefined') {
        throw new Error('Salvataggio locale non disponibile.');
      }

      const localDraft: LocalOnboardingDraft = {
        v: 1,
        savedAt: new Date().toISOString(),
        currentStep,
        completedSteps,
        guestCredentialMode,
        pec,
        digitalSignature,
        quotesText,
        email,
        username,
        existingIdentifier,
        acceptPrivacy,
        acceptTerms,
        consentStorage
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(localDraft));

      if (authState === 'authenticated' && activeApplicationId) {
        const fd = new FormData();
        fd.set('applicationId', activeApplicationId);
        fd.set('currentStep', String(currentStep));
        fd.set('completedSteps', JSON.stringify(completedSteps));
        fd.set('pec', pec.trim());
        fd.set('digitalSignature', digitalSignature || '');
        fd.set('quotesText', quotesText.trim());

        for (const requirement of documentRequirements) {
          const file = requirementFiles[requirement.requirementKey];
          if (!file) continue;
          fd.append('requirementFiles', file);
          fd.append('requirementFileKeys', requirement.requirementKey);
          fd.append('requirementFileLabels', requirement.label);
        }
        for (const key of removedUploadedKeys) {
          fd.append('removedRequirementKeys', key);
        }
        for (const file of quotes) fd.append('quotes', file);

        const response = await fetch('/api/onboarding/save-progress', {
          method: 'POST',
          body: fd
        });
        const payload = (await response.json().catch(() => null)) as SaveProgressResponse | null;
        if (!response.ok) {
          throw new Error(readApiError(payload, 'Impossibile salvare i progressi sul server.'));
        }

        setRequirementFiles((previous) => {
          const next: Record<string, File | null> = {};
          Object.keys(previous).forEach((k) => {
            next[k] = null;
          });
          return next;
        });
        setRemovedUploadedKeys(new Set());
        setRequirementFileErrors({});
        setQuotes([]);
        await loadWizardState(activeSessionId);
      }

      setDraftNotice('Progressi salvati. Puoi tornare quando vuoi da questa pratica.');
      const exitUrl = authState === 'authenticated' ? '/dashboard/pratiche' : '/onboarding';
      window.setTimeout(() => {
        window.location.assign(exitUrl);
      }, 300);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Salvataggio progressi non riuscito.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function copyResumeLinkToClipboard() {
    if (!resumeLink) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resumeLink);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = resumeLink;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyNotice('Link copiato.');
      window.setTimeout(() => setCopyNotice(null), 2200);
    } catch {
      setStepError('Impossibile copiare il link. Puoi copiarlo manualmente dal campo.');
    }
  }

  const footerBackHandler = isDashboardMode
    ? backHandler
    : allowPayLaterStep1
      ? () => {
          void payLaterAndContinue();
        }
      : currentStep === 2
        ? () => setStep2GuideOpen((prev) => !prev)
        : backHandler;

  const footerBackLabel = isDashboardMode
    ? 'Indietro'
    : allowPayLaterStep1
      ? 'Pago dopo la verifica requisiti'
      : currentStep === 2
        ? step2GuideOpen
          ? 'Torna al benvenuto'
          : 'Come funziona l’onboarding'
        : 'Indietro';

  const showFooter = isDashboardMode ? true : currentStep !== 1;
  const shellStepMode: 'default' | 'payment' = !isDashboardMode && currentStep === 1 ? 'payment' : 'default';

  return (
    <BandoOnboardingShell
      currentStep={currentStep}
      stepMode={shellStepMode}
      sidebar={
        <BandoOnboardingSidebar
          currentStep={currentStep}
          completedSteps={completedSteps}
          maxReachableStep={maxReachableStep}
          steps={sidebarSteps}
          mode={resolvedOnboardingMode}
          onSelectStep={(step) => void onSelectStep(step)}
        />
      }
    >
      <div
        className={`wizard7-layoutShell ${isDashboardMode && currentStep === 1 ? 'is-dashboard-step1' : ''}`}
        data-step={currentStep}
        data-mode={resolvedOnboardingMode}
      >
        <section className="wizard7-primaryPane">
          <div className="wizard7-mainStack">
            <BandoOnboardingStepHeader title={copy.title} subtitle={copy.subtitle} onBack={backHandler} />

            <BandoOnboardingStepTransition step={currentStep} direction={transitionDirection}>
              {!isDashboardMode && currentStep === 1 ? (
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

              {isDashboardMode && currentStep === 1 ? (
                <StepWelcome
                  mode="dashboard_client"
                  showGuide={false}
                  documentRequirements={documentUploadRequirements}
                  onCloseGuide={() => undefined}
                />
              ) : null}

              {!isDashboardMode && currentStep === 2 ? (
                <StepWelcome
                  mode="legacy"
                  showGuide={step2GuideOpen}
                  documentRequirements={documentUploadRequirements}
                  onCloseGuide={() => setStep2GuideOpen(false)}
                />
              ) : null}

              {!isDashboardMode && currentStep === 3 ? (
                <StepAccountSetup
                  email={email}
                  password={password}
                  onEmailChange={setEmail}
                  onPasswordChange={setPassword}
                />
              ) : null}

              {!isDashboardMode && currentStep === 4 ? (
                <StepPecFirma
                  pec={pec}
                  digitalSignature={digitalSignature}
                  onPecChange={setPec}
                  onSignatureChange={handleDigitalSignatureChange}
                />
              ) : null}

              {!isDashboardMode && currentStep === 5 ? (
                <StepDocuments
                  mode="legacy"
                  applicationId={activeApplicationId}
                  pec={pec}
                  digitalSignature={digitalSignature}
                  onPecChange={setPec}
                  onSignatureChange={handleDigitalSignatureChange}
                  requirements={documentUploadRequirements}
                  requirementFiles={requirementFiles}
                  requirementFileErrors={requirementFileErrors}
                  removedUploadedKeys={removedUploadedKeys}
                  onRequirementFileChange={handleRequirementFileChange}
                />
              ) : null}

              {isDashboardMode && currentStep === 2 ? (
                <StepDocuments
                  mode="dashboard_client"
                  applicationId={activeApplicationId}
                  pec={pec}
                  digitalSignature={digitalSignature}
                  onPecChange={setPec}
                  onSignatureChange={handleDigitalSignatureChange}
                  requirements={documentUploadRequirements}
                  requirementFiles={requirementFiles}
                  requirementFileErrors={requirementFileErrors}
                  removedUploadedKeys={removedUploadedKeys}
                  onRequirementFileChange={handleRequirementFileChange}
                />
              ) : null}

              {((!isDashboardMode && currentStep === 6) || (isDashboardMode && currentStep === 3)) ? (
                <StepPreventivi
                  quotesText={quotesText}
                  quotes={quotes}
                  onQuotesTextChange={setQuotesText}
                  onQuoteFilesAdd={(incoming) => setQuotes((prev) => mergeQuoteFiles(prev, incoming))}
                  onQuoteFileRemove={(key) =>
                    setQuotes((prev) =>
                      prev.filter((item) => `${item.name}-${item.size}-${item.lastModified}` !== key),
                    )
                  }
                />
              ) : null}

              {((!isDashboardMode && currentStep === 7) || (isDashboardMode && currentStep === 4)) ? (
                <StepFinalConfirmations
                  showCredentials={needsGuestCredentials}
                  credentialMode={guestCredentialMode}
                  onCredentialModeChange={setGuestCredentialMode}
                  email={email}
                  username={username}
                  password={password}
                  passwordConfirm={passwordConfirm}
                  existingIdentifier={existingIdentifier}
                  existingPassword={existingPassword}
                  onEmailChange={setEmail}
                  onUsernameChange={handleUsernameChange}
                  onPasswordChange={setPassword}
                  onPasswordConfirmChange={setPasswordConfirm}
                  onExistingIdentifierChange={setExistingIdentifier}
                  onExistingPasswordChange={setExistingPassword}
                  acceptPrivacy={acceptPrivacy}
                  acceptTerms={acceptTerms}
                  consentStorage={consentStorage}
                  onAcceptPrivacyChange={setAcceptPrivacy}
                  onAcceptTermsChange={setAcceptTerms}
                  onConsentStorageChange={setConsentStorage}
                />
              ) : null}
            </BandoOnboardingStepTransition>

            {(isDashboardMode || currentStep !== 1) && stepError ? <p className="wizard7-inlineError">{stepError}</p> : null}
            {draftNotice ? <p className="wizard7-inlineNotice">{draftNotice}</p> : null}
            {copyNotice ? <p className="wizard7-inlineNotice">{copyNotice}</p> : null}

            {!isDashboardMode && currentStep === 7 ? (
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
        </section>

        {isDashboardMode && showFooter ? (
          <section className="wizard7-secondaryPane">
            <section className="wizard7-resumeCard" aria-label="Salvataggio progressi onboarding">
              <p className="wizard7-resumeTitle">Ti manca qualche documento?</p>
              <p className="wizard7-resumeText">
                Salva progressi su questo dispositivo, potrai tornare su questa pagina quando avrai tutti i documenti.
              </p>
              <button
                type="button"
                className="wizard7-btn wizard7-btn-ghost wizard7-resumeSaveBtn"
                onClick={() => void saveProgressAndExit()}
                disabled={savingDraft || submitting}
              >
                {savingDraft ? 'Salvataggio in corso...' : 'Salva progressi su questo dispositivo'}
              </button>
              <div className="wizard7-resumeLinkWrap">
                <label className="wizard7-resumeLinkLabel" htmlFor="wizard7-resume-link-input">
                  Copia il link diretto di questa pagina
                </label>
                <div className="wizard7-resumeLinkRow">
                  <input
                    id="wizard7-resume-link-input"
                    className="wizard7-resumeLinkInput"
                    type="text"
                    readOnly
                    value={resumeLink}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="wizard7-btn wizard7-btn-ghost wizard7-resumeCopyBtn"
                    onClick={() => void copyResumeLinkToClipboard()}
                    disabled={!resumeLink}
                  >
                    Copia link
                  </button>
                </div>
              </div>
            </section>
          </section>
        ) : null}
      </div>
    </BandoOnboardingShell>
  );
}
