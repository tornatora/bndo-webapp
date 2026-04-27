'use client';

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ChevronDown } from 'lucide-react';
import { InputArea } from '@/components/chat/InputArea';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { BandiResults, type BandoResult } from '@/components/chat/BandiResults';
import { ThinkingBubble } from '@/components/chat/ThinkingBubble';
import { TypewriterExamples } from '@/components/chat/TypewriterExamples';
import { Sidebar } from '@/components/chat/Sidebar';
import { BndiHomeView } from '@/components/views/BndiHomeView';
import { FullScreenScannerOverlayPro as FullScreenScannerOverlay, SCAN_OVERLAY_STEPS } from '@/components/views/FullScreenScannerOverlayPro';
import { GrantDetailProView } from '@/components/views/GrantDetailProView';
import { PracticeGrantQuizPage } from '@/components/dashboard/PracticeGrantQuizPage';
import { OnboardingChoiceView } from '@/components/views/OnboardingChoiceView';
import { UserPracticesView } from '@/components/views/UserPracticesView';
import { BandiCatalogView, prefetchCatalogBootstrap } from '@/components/views/BandiCatalogView';
import { PracticeDetailView } from '@/components/views/PracticeDetailView';
import { ScannerBandiProView } from '@/components/views/ScannerBandiProView';
import { buildUnifiedScanRequestBody, selectUnifiedScanStrictness } from '@/lib/matching/scanRequestPolicy';
import { isLimitedReleaseMode, LIMITED_CHAT_SCOPE_NOTICE } from '@/shared/config/release-mode';
import './ThinkingBubble.css';

type UserProfile = {
  activityType?: string | null;
  businessExists?: boolean | null;
  sector?: string | null;
  ateco?: string | null;
  atecoAnswered?: boolean;
  budgetAnswered?: boolean;
  location?: { region?: string | null; municipality?: string | null } | null;
  locationNeedsConfirmation?: boolean;
  age?: number | null;
  ageBand?: 'under35' | 'over35' | null;
  employmentStatus?: string | null;
  legalForm?: string | null;
  employees?: number | null;
  revenueOrBudgetEUR?: number | null;
  requestedContributionEUR?: number | null;
  fundingGoal?: string | null;
  contributionPreference?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  activeMeasureId?: string | null;
  activeMeasureTitle?: string | null;
};

type ConversationResponse = {
  userProfile: UserProfile;
  step:
    | 'activityType'
    | 'sector'
    | 'ateco'
    | 'location'
    | 'employees'
    | 'fundingGoal'
    | 'budget'
    | 'contributionPreference'
    | 'contactEmail'
    | 'contactPhone'
    | 'preScanConfirm'
    | 'ready';
  assistantText: string;
  readyToScan: boolean;
  mode?: 'qa' | 'profiling' | 'handoff' | 'scan_ready';
  nextBestField?:
    | 'activityType'
    | 'sector'
    | 'ateco'
    | 'location'
    | 'employees'
    | 'fundingGoal'
    | 'budget'
    | 'contributionPreference'
    | 'contactEmail'
    | 'contactPhone'
    | null;
  nextQuestionField?:
    | 'activityType'
    | 'sector'
    | 'ateco'
    | 'location'
    | 'employees'
    | 'fundingGoal'
    | 'budget'
    | 'contributionPreference'
    | 'contactEmail'
    | 'contactPhone'
    | null;
  action?:
    | 'ask_clarification'
    | 'run_scan'
    | 'refine_after_scan'
    | 'answer_measure_question'
    | 'answer_general_qa'
    | 'no_result_explanation'
    | 'handoff_human'
    | 'small_talk';
  assistantConfidence?: number;
  needsClarification?: boolean;
  profileCompletenessScore?: number;
  scanReadinessReason?: string;
  scanHash?: string | null;
  error?: string;
  interactionId?: string;
  conversationId?: string;
  modelUsed?: string;
  routingReason?: string;
  confidence?: number;
  citations?: Array<{
    title: string;
    url: string;
    sourceTier: 'official' | 'authoritative' | 'web';
    publishedAt: string | null;
    evidenceSnippet: string;
  }>;
  estimatedWithWarning?: boolean;
};

type SourceChannel = 'scanner' | 'chat' | 'direct' | 'admin';
type SessionPayload = { authenticated?: boolean };

type ScanResponse = {
  phase?: 'fast' | 'full';
  explanation: string;
  results: Array<{
    id: string;
    title: string;
    authorityName: string;
    deadlineAt: string | null;
    sourceUrl: string;
    requirements: string[];
    score?: number;
    matchScore?: number;
    matchReasons?: string[];
    mismatchFlags?: string[];
    aidForm?: string | null;
    aidIntensity?: string | null;
    budgetTotal?: number | null;
    economicOffer?: Record<string, unknown> | null;
    bookingUrl?: string | null;
  }>;
  nearMisses?: BandoResult[];
  qualityBand?: 'high' | 'medium' | 'low';
  refineQuestion?: string;
  strategicAdvice?: string;
  strategicReasoning?: string;
  matchingVersion?: 'v2' | 'v3' | string;
  profilePriorityApplied?: boolean;
  diagnostics?: { rejectedByGate?: Record<string, number>; activeCaseIds?: string[] };
  topPickBandoId: string | null;
  bookingUrl: string;
};

type ChatMessage =
  | { id: string; role: 'assistant' | 'user'; kind: 'text'; body: string; scanToken?: string; footer?: string }
  | {
      id: string;
      role: 'assistant';
      kind: 'results';
      explanation: string;
      results: BandoResult[];
      nearMisses?: BandoResult[];
      scanToken?: string;
      footer?: string;
    }
  ;
const AI_ASSISTANT_DISCLAIMER =
  "Anche se la nostra intelligenza artificiale è specializzata in finanza agevolata, le risposte dell'AI potrebbero contenere errori.\nPer una consulenza specializzata, prenota una consulenza con un consulente BNDO.";
const AI_ASSISTANT_DISCLAIMER_MOBILE =
  "Anche se la nostra intelligenza artificiale è specializzata in finanza agevolata, le risposte dell'AI potrebbero contenere errori.";
const LANDING_TITLE_PREFIX = 'Vorresti partecipare ad un BNDO?';
const LANDING_TECH = ['La nostra AI ti aiuta a trovare il bando giusto, i nostri consulenti umani a vincerlo.'] as const;
const LANDING_ROTATING_FULL = [
  'Parlami di te e del tuo progetto',
  'Parlami di te, della tua idea e dei tuoi obiettivi',
  'Parlami della tua attività e di cosa vuoi realizzare',
  'Parlami del tuo progetto e degli investimenti che vuoi fare',
  'Parlami della tua idea e di cosa vorresti sviluppare',
  'Parlami della tua situazione e dei tuoi piani',
  'Parlami del tuo progetto e di cosa vuoi finanziare',
  'Parlami di chi sei e di cosa vuoi costruire',
  'Parlami della tua attività e di come vuoi farla crescere',
  'Parlami del tuo progetto e di cosa vorresti acquistare',
  'Parlami della tua idea imprenditoriale',
  'Parlami del tuo progetto e dei tuoi obiettivi futuri',
  'Parlami di cosa vuoi realizzare concretamente',
  'Parlami del tuo progetto e delle risorse che ti servono',
  'Parlami della tua attività e dei tuoi piani di sviluppo',
  'Parlami del tuo progetto e delle spese che vuoi sostenere',
  'Parlami di cosa vuoi creare o migliorare',
  'Parlami del tuo progetto imprenditoriale',
  'Parlami di cosa vuoi avviare o espandere'
] as const;
const LEGACY_AUTOIMPIEGO_QUIZ_URL = 'https://bndo.it/quiz/autoimpiego';
const LEGACY_AUTOIMPIEGO_QUIZ_IDS = new Set([
  '769117e6-ab97-4b8a-9ff1-bec0e14879e6',
  'a13a8bde-e544-4a14-b73f-61dd0ca8fe90',
  'strategic-resto-al-sud-20',
  'strategic-autoimpiego-centro-nord',
  'resto-al-sud-20',
  'autoimpiego-centro-nord',
  'autoimpiego',
]);

function stripLeadingParlami(text: string) {
  return text.replace(/^parlami\s+/i, '').trim();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEchoLikeReply(userText: string, assistantText: string) {
  const user = normalizeText(userText);
  const assistant = normalizeText(assistantText);
  if (!user || !assistant) return false;
  if (assistant === user) return true;
  if (assistant.includes(user) && assistant.length <= user.length + 24) return true;
  const echoOpeners = [
    'ok hai scritto',
    'hai scritto',
    'mi hai detto',
    'stai cercando',
    'quindi cerchi',
    'perfetto hai'
  ];
  if (echoOpeners.some((prefix) => assistant.startsWith(prefix)) && assistant.includes(user)) return true;
  return false;
}

function shouldUseLegacyAutoimpiegoQuiz(grantId?: string | null) {
  const raw = String(grantId ?? '').trim();
  if (!raw) return false;
  if (LEGACY_AUTOIMPIEGO_QUIZ_IDS.has(raw)) return true;
  const normalized = normalizeText(raw);
  return (
    normalized.includes('resto al sud 2 0') ||
    normalized.includes('resto al sud 20') ||
    normalized.includes('autoimpiego centro nord')
  );
}


function hasMinimumSignalsForScan(profile: UserProfile) {
  const hasRegion = Boolean(profile.location?.region && String(profile.location.region).trim());
  const hasSectorOrGoal = Boolean(
    (profile.sector && String(profile.sector).trim()) ||
      (profile.fundingGoal && String(profile.fundingGoal).trim()) ||
      (profile.activityType && String(profile.activityType).trim()) ||
      (profile.ateco && String(profile.ateco).trim())
  );
  return hasRegion && hasSectorOrGoal;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function friendlyChatError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : '';
  const normalized = message.toLowerCase();

  if (
    normalized === 'load failed' ||
    normalized === 'failed to fetch' ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed')
  ) {
    return 'Connessione locale persa. Verifica che l’app sia attiva su http://localhost:3300 e ricarica la pagina.';
  }

  return message || fallback;
}

type ChatWindowProps = {
  initialView?: 'chat' | 'home' | 'form' | 'pratiche' | 'grantDetail' | 'choice' | 'quiz' | 'myPractices' | 'practiceDetail';
  initialGrantId?: string | null;
  initialApplicationId?: string | null;
  initialSource?: SourceChannel | null;
  embedded?: boolean;
  practiceLaunchMode?: boolean;
  onPracticeGrantSelect?: (grantId: string, source: 'scanner' | 'chat') => void;
  onPracticeGrantOpenDetail?: (grantId: string, source: 'scanner' | 'chat') => void;
};

function normalizeHashString(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function buildScanProfileHash(profile: UserProfile) {
  const normalized = {
    activityType: normalizeHashString(profile.activityType),
    businessExists: profile.businessExists ?? null,
    sector: normalizeHashString(profile.sector),
    ateco: normalizeHashString(profile.ateco),
    location: {
      region: normalizeHashString(profile.location?.region),
      municipality: normalizeHashString(profile.location?.municipality)
    },
    age: profile.age ?? null,
    ageBand: normalizeHashString(profile.ageBand ?? null),
    employmentStatus: normalizeHashString(profile.employmentStatus),
    revenueOrBudgetEUR: profile.revenueOrBudgetEUR ?? null,
    requestedContributionEUR: profile.requestedContributionEUR ?? null,
    fundingGoal: normalizeHashString(profile.fundingGoal),
    contributionPreference: normalizeHashString(profile.contributionPreference),
  };
  return JSON.stringify(normalized);
}

function buildServerScanHash(profile: UserProfile) {
  const bits = [
    profile.businessExists ?? null,
    profile.location?.region ?? null,
    profile.fundingGoal ?? null,
    profile.sector ?? null,
    profile.budgetAnswered ? (profile.revenueOrBudgetEUR ?? null) : null,
    profile.ageBand ?? null,
    profile.employmentStatus ?? null,
  ];
  return bits.map(String).join('|');
}

function isInformativeRefineAnswer(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (
    /^(ok|okay|okey|si|sì|yes|va bene|perfetto|bene|capito|chiaro|grazie|grazie mille|ottimo|top|ricevuto)[.!?]*$/.test(
      normalized,
    )
  ) {
    return false;
  }

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length >= 4) return true;
  if (/\d/.test(normalized)) return true;
  return /(regione|attivita|impresa|startup|avviare|aprire|settore|ateco|disoccup|occupaz|neet|eta|anni|import|budget|fatturat|fondo perduto|prestito|contribut)/.test(
    normalized,
  );
}

export function ChatWindow({
  initialView = 'chat',
  initialGrantId = null,
  initialApplicationId = null,
  initialSource = 'scanner',
  embedded = false,
  practiceLaunchMode: practiceLaunchModeOverride,
  onPracticeGrantSelect,
  onPracticeGrantOpenDetail
}: ChatWindowProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolvedInitialView: 'chat' | 'home' | 'form' | 'pratiche' | 'grantDetail' | 'choice' | 'quiz' | 'myPractices' | 'practiceDetail' =
    initialView === 'home' || initialView === 'form' || initialView === "pratiche" || initialView === 'grantDetail' || initialView === 'choice' || initialView === 'quiz' || initialView === 'myPractices' || initialView === 'practiceDetail'
      ? initialView
      : 'chat';

  const streamingAssistantBodyRef = useRef('');
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<UserProfile>({});
  const [step, setStep] = useState<ConversationResponse['step']>('location');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [authState, setAuthState] = useState<'loading' | 'guest' | 'authenticated'>('loading');
  const [isScanning, setIsScanning] = useState(false);
  const [scanOverlayProgress, setScanOverlayProgress] = useState(0);
  const [scanOverlayStepIndex, setScanOverlayStepIndex] = useState(0);
  const [rotateIdx, setRotateIdx] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [inputBlurSignal, setInputBlurSignal] = useState(0);
  const [focusResultMessageId, setFocusResultMessageId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [view, setView] = useState<'chat' | 'home' | 'form' | 'pratiche' | 'grantDetail' | 'choice' | 'quiz' | 'myPractices' | 'practiceDetail'>(resolvedInitialView);
  const [viewLoaded, setViewLoaded] = useState<Record<'home' | 'form' | 'pratiche' | 'grantDetail' | 'choice' | 'quiz' | 'myPractices' | 'practiceDetail', boolean>>({
    home: resolvedInitialView === 'home',
    form: resolvedInitialView === 'form',
    pratiche: resolvedInitialView === 'pratiche',
    grantDetail: resolvedInitialView === 'grantDetail',
    choice: resolvedInitialView === 'choice',
    quiz: resolvedInitialView === 'quiz',
    myPractices: resolvedInitialView === 'myPractices',
    practiceDetail: resolvedInitialView === 'practiceDetail'
  });

  useEffect(() => {
    setViewLoaded((prev) => (prev.home ? prev : { ...prev, home: true }));
  }, []);
  const [targetGrantId, setTargetGrantId] = useState<string | null>(initialGrantId || null);
  const [targetApplicationId, setTargetApplicationId] = useState<string | null>(initialApplicationId || null);
  const [sourceChannel, setSourceChannel] = useState<SourceChannel>(initialSource || 'scanner');
  const assistantFooterText = isMobileViewport ? AI_ASSISTANT_DISCLAIMER_MOBILE : AI_ASSISTANT_DISCLAIMER;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fitWrapRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const overlayProgressTimerRef = useRef<number | null>(null);
  const scanOverlayProgressValueRef = useRef(0);
  const scanOverlayProgressStartedAtRef = useRef<number | null>(null);
  const lockAutoBottomScrollRef = useRef(false);
  const messageNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusLockTimerRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);
  const activeScanTokenRef = useRef<string | null>(null);
  const interactionVersionRef = useRef(0);
  const pendingAutoScanTimeoutRef = useRef<number | null>(null);
  const awaitingRefineAnswerRef = useRef(false);
  const lastRenderedScanHashRef = useRef<string | null>(null);
  const lastSuccessfulServerScanHashRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const practiceLaunchMode = practiceLaunchModeOverride ?? searchParams.get('launch') === 'practice';
  const grantFocusMode = searchParams.get('focus') === 'grant';
  const queryGrantTitleRaw = searchParams.get('grantTitle');
  const queryGrantTitle = queryGrantTitleRaw ? queryGrantTitleRaw.trim().slice(0, 180) : null;
  const grantFocusBootRef = useRef<string | null>(null);

  const goHome = useCallback(() => {
    setView('home');
    setViewLoaded((prev) => ({ ...prev, home: true }));
  }, []);

  const goChat = useCallback(() => {
    setView('chat');
    setViewLoaded((prev) => ({ ...prev, chat: true }));
    if (embedded && pathname?.startsWith('/dashboard/new-practice')) {
      router.replace('/dashboard/new-practice?mode=chat', { scroll: false });
    }
  }, [embedded, pathname, router]);

  const goScanner = useCallback(() => {
    setView('form');
    setViewLoaded((prev) => ({ ...prev, form: true }));
    setTargetGrantId(null);
    if (embedded && pathname?.startsWith('/dashboard/new-practice')) {
      router.replace('/dashboard/new-practice?mode=scanner', { scroll: false });
    }
  }, [embedded, pathname, router]);

  const goQuiz = useCallback((grantId?: string, source?: SourceChannel) => {
    if (grantId && shouldUseLegacyAutoimpiegoQuiz(grantId)) {
      window.location.href = LEGACY_AUTOIMPIEGO_QUIZ_URL;
      return;
    }
    if (source) setSourceChannel(source);
    setTargetGrantId(grantId || 'autoimpiego');
    setView('quiz');
    setViewLoaded((prev) => ({ ...prev, quiz: true }));
  }, []);

  const goGrantDetail = useCallback((grantId: string, source?: SourceChannel) => {
    if (source) setSourceChannel(source);
    setTargetGrantId(grantId);
    setView('grantDetail');
    setViewLoaded((prev) => ({ ...prev, grantDetail: true }));
  }, []);

  const goPracticeDetail = useCallback((appId: string) => {
    setTargetApplicationId(appId);
    setView('practiceDetail');
    setViewLoaded((prev) => ({ ...prev, practiceDetail: true }));
  }, []);

  const goMyPractices = useCallback(() => {
    setView('myPractices');
    setViewLoaded((prev) => ({ ...prev, myPractices: true }));
  }, []);

  useEffect(() => {
    if (embedded) return;
    const timer = window.setTimeout(() => {
      void prefetchCatalogBootstrap().catch(() => {});
    }, 160);
    return () => window.clearTimeout(timer);
  }, [embedded]);

  useEffect(() => {
    if (!initialGrantId) return;
    if (!grantFocusMode && !queryGrantTitle) return;

    const focusKey = `${initialGrantId}:${queryGrantTitle ?? ''}`;
    if (grantFocusBootRef.current === focusKey) return;
    grantFocusBootRef.current = focusKey;

    setTargetGrantId(initialGrantId);
    setProfile((prev) => ({
      ...prev,
      activeMeasureId: initialGrantId,
      activeMeasureTitle: queryGrantTitle || prev.activeMeasureTitle || null,
    }));

    setMessages((prev) => {
      if (prev.length > 0) return prev;
      const titleLabel = queryGrantTitle || 'questo bando';
      return [
        {
          id: uid(),
          role: 'assistant',
          kind: 'text',
          body: `Perfetto, ora sono focalizzata su ${titleLabel}. Puoi chiedermi requisiti, spese ammissibili, scadenze, esclusioni e documenti richiesti: ti rispondo in modo specifico su questa misura.`,
        },
      ];
    });
  }, [initialGrantId, grantFocusMode, queryGrantTitle]);

  const onSelectGrantForPractice = useCallback(
    (grantId?: string, source?: 'scanner' | 'chat') => {
      goQuiz(grantId, source);
    },
    [goQuiz]
  );

  const onOpenGrantDetailForPractice = useCallback(
    (grantId: string, source: 'scanner' | 'chat') => {
      goGrantDetail(grantId, source);
    },
    [goGrantDetail]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const viewport = window.visualViewport;
    let raf = 0;

    const isEditableActiveElement = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return false;
      const tag = active.tagName;
      if (tag === 'TEXTAREA') return true;
      if (tag === 'SELECT') return true;
      if (active.isContentEditable) return true;
      if (tag !== 'INPUT') return false;
      const input = active as HTMLInputElement;
      if (input.disabled || input.readOnly) return false;
      const disallowed = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color']);
      return !disallowed.has((input.type || 'text').toLowerCase());
    };

    const syncViewportState = () => {
      const rawViewportHeight = Math.round(viewport?.height ?? window.innerHeight);
      const viewportOffsetTop = Math.round(viewport?.offsetTop ?? 0);
      const effectiveViewportHeight = Math.max(
        0,
        Math.min(window.innerHeight, rawViewportHeight + viewportOffsetTop)
      );

      const mobile = window.matchMedia('(max-width: 899px)').matches;
      const keyboardDelta = window.innerHeight - rawViewportHeight;
      const hasEditableFocus = isEditableActiveElement();
      const viewportShrunk = rawViewportHeight < window.innerHeight - 16;
      const keyboardLikely =
        mobile && (keyboardDelta > 120 || (hasEditableFocus && (keyboardDelta > 0 || viewportShrunk)));
      setIsMobileViewport(mobile);
      setIsKeyboardOpen(
        keyboardLikely ||
          root.classList.contains('keyboard-open') ||
          document.body.classList.contains('keyboard-open') ||
          (mobile && window.innerHeight - effectiveViewportHeight > 120)
      );
    };

    const queueSync = () => {
      cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(syncViewportState);
    };

    syncViewportState();
    window.addEventListener('resize', queueSync);
    window.addEventListener('orientationchange', queueSync);
    window.addEventListener('focus', queueSync, true);
    document.addEventListener('focusin', queueSync);
    document.addEventListener('focusout', queueSync);
    viewport?.addEventListener('resize', queueSync);
    viewport?.addEventListener('scroll', queueSync);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', queueSync);
      window.removeEventListener('orientationchange', queueSync);
      window.removeEventListener('focus', queueSync, true);
      document.removeEventListener('focusin', queueSync);
      document.removeEventListener('focusout', queueSync);
      viewport?.removeEventListener('resize', queueSync);
      viewport?.removeEventListener('scroll', queueSync);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('scanner-overlay-open', isScanning);
    document.documentElement.classList.toggle('scanner-overlay-open', isScanning);
    return () => {
      document.body.classList.remove('scanner-overlay-open');
      document.documentElement.classList.remove('scanner-overlay-open');
    };
  }, [isScanning]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const loadSession = async () => {
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
        const json = (await response.json()) as SessionPayload;
        setAuthState(json.authenticated ? 'authenticated' : 'guest');
      } catch {
        if (mounted) setAuthState('guest');
      }
    };
    void loadSession();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (view === 'chat') return;
    setViewLoaded((prev) => (prev[view] ? prev : { ...prev, [view]: true }));
  }, [view]);


  useEffect(() => {
    setView(resolvedInitialView);
    setViewLoaded((prev) => ({ ...prev, [resolvedInitialView]: true }));
    if (initialGrantId !== undefined) {
      setTargetGrantId(initialGrantId);
    }
    if (initialApplicationId !== undefined) {
      setTargetApplicationId(initialApplicationId);
    }
    if (initialSource !== undefined) {
      setSourceChannel(initialSource || 'scanner');
    }
  }, [resolvedInitialView, initialGrantId, initialApplicationId, initialSource]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onResetNewPractice = () => {
      if (!embedded) return;
      if (!window.location.pathname.startsWith('/dashboard/new-practice')) return;
      setTargetGrantId(null);
      setTargetApplicationId(null);
      setSourceChannel('scanner');
      setView('choice');
      setViewLoaded((prev) => ({ ...prev, choice: true }));
      router.replace('/dashboard/new-practice');
    };

    window.addEventListener('bndo:new-practice-reset', onResetNewPractice as EventListener);
    return () => {
      window.removeEventListener('bndo:new-practice-reset', onResetNewPractice as EventListener);
    };
  }, [embedded, router]);


  useEffect(() => {
    if (viewLoaded.form) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const preload = () => setViewLoaded((prev) => (prev.form ? prev : { ...prev, form: true }));

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
        preload,
        { timeout: 2200 }
      );
    } else {
      timeoutId = setTimeout(preload, 1200);
    }

    return () => {
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [viewLoaded.form]);

  const placeholder = useMemo(() => {
    if (step === 'activityType') return 'Es. PMI, startup, professionista…';
    if (step === 'sector') return 'Es. ICT, turismo, commercio…';
    if (step === 'ateco') return 'Es. 62.01 (oppure “non so” + descrizione)…';
    if (step === 'location') return 'Es. Ho una PMI e voglio contributi per digitalizzazione...';
    if (step === 'employees') return 'Es. 8';
    if (step === 'fundingGoal') return 'Es. macchinari, R&D, digitalizzazione…';
    if (step === 'budget') return 'Es. 50k (oppure “non so”)';
    if (step === 'contributionPreference') return 'Es. fondo perduto, voucher, misto…';
    if (step === 'contactEmail') return 'Es. nome@azienda.it';
    if (step === 'contactPhone') return 'Es. +39 333 1234567';
    return 'Scrivi…';
  }, [step]);

  function stopOverlayProgressLoop() {
    if (overlayProgressTimerRef.current !== null) {
      window.clearInterval(overlayProgressTimerRef.current);
      overlayProgressTimerRef.current = null;
    }
  }

  function startOverlayProgressLoop() {
    stopOverlayProgressLoop();
    scanOverlayProgressStartedAtRef.current = window.performance.now();
    overlayProgressTimerRef.current = window.setInterval(() => {
      setScanOverlayProgress((prev) => {
        if (prev >= 95) return prev;
        const startedAt = scanOverlayProgressStartedAtRef.current ?? window.performance.now();
        const elapsedSeconds = (window.performance.now() - startedAt) / 1000;

        let target = 8;
        if (elapsedSeconds < 3.9) {
          target = 8 + elapsedSeconds * 10.8;
        } else if (elapsedSeconds < 8.6) {
          target = 50.12 + (elapsedSeconds - 3.9) * 6.6;
        } else if (elapsedSeconds < 16.5) {
          target = 81.14 + (elapsedSeconds - 8.6) * 1.75;
        } else {
          target = 95;
        }

        const jitter = elapsedSeconds < 9 ? Math.random() * 0.3 : Math.random() * 0.11;
        const desired = Math.min(95, target + jitter);
        const next = Math.max(prev, desired);
        return Number(next.toFixed(2));
      });
    }, 120);
  }

  async function completeOverlayProgress() {
    stopOverlayProgressLoop();
    scanOverlayProgressStartedAtRef.current = null;
    const from = Math.max(0, Math.min(99.4, scanOverlayProgressValueRef.current));
    const durationMs = from < 90 ? 860 : from < 95 ? 700 : 520;
    const startedAt = window.performance.now();

    while (true) {
      const elapsed = window.performance.now() - startedAt;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (100 - from) * eased;
      setScanOverlayProgress(Number(next.toFixed(2)));
      setScanOverlayStepIndex(4);
      if (t >= 1) break;
      await new Promise((resolve) => window.setTimeout(resolve, 24));
    }

    setScanOverlayProgress(100);
    setScanOverlayStepIndex(4);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  useEffect(() => {
    scanOverlayProgressValueRef.current = scanOverlayProgress;
    const clamped = Math.max(0, Math.min(100, scanOverlayProgress));
    const next = Math.min(4, Math.floor((clamped / 100) * 5));
    setScanOverlayStepIndex(next);
  }, [scanOverlayProgress]);

  useEffect(() => {
    return () => {
      stopOverlayProgressLoop();
      if (focusLockTimerRef.current !== null) {
        window.clearTimeout(focusLockTimerRef.current);
        focusLockTimerRef.current = null;
      }
      if (pendingAutoScanTimeoutRef.current !== null) {
        window.clearTimeout(pendingAutoScanTimeoutRef.current);
        pendingAutoScanTimeoutRef.current = null;
      }
      scanOverlayProgressStartedAtRef.current = null;
    };
  }, []);

  const blurComposerInput = useCallback(() => {
    setInputBlurSignal((prev) => prev + 1);
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.blur();
    }
  }, []);

  const clearPendingAutoScan = useCallback(() => {
    if (pendingAutoScanTimeoutRef.current !== null) {
      window.clearTimeout(pendingAutoScanTimeoutRef.current);
      pendingAutoScanTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!bottomRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Se l'ancora di fondo NON è visibile, mostriamo il pulsante
        // Usiamo un threshold per maggiore reattività
        setShowScrollButton(!entry.isIntersecting);
      },
      {
        root: null, // viewport
        rootMargin: '0px 0px -100px 0px', // Attiva 100px prima di sparire
        threshold: 0
      }
    );

    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [messages.length]); // Re-observe when messages change to ensure anchor is tracked

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    // Cerchiamo l'ultimo messaggio effettivo nella conversazione
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const node = messageNodeRefs.current[lastMsg.id];
      if (node) {
        node.scrollIntoView({ behavior, block: 'center' });
        return;
      }
    }

    // Fallback se non ci sono ancora messaggi o i ref non sono pronti
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  }

  useEffect(() => {
    if (view !== 'chat') return;
    if (lockAutoBottomScrollRef.current) return;
    const lastMessage = messages[messages.length - 1];
    const isResultCluster = lastMessage?.role === 'assistant' && lastMessage.kind === 'results';
    if (isResultCluster) return;
    const behavior: ScrollBehavior = messages.length <= 1 ? 'auto' : 'smooth';
    scrollToBottom(behavior);
  }, [messages, isTyping, isScanning, view]);

  useEffect(() => {
    if (view !== 'chat') return;
    if (!focusResultMessageId) return;
    const node = messageNodeRefs.current[focusResultMessageId];
    if (!node) {
      lockAutoBottomScrollRef.current = false;
      setFocusResultMessageId(null);
      return;
    }

    lockAutoBottomScrollRef.current = true;
    if (isMobileViewport || isKeyboardOpen || isComposerFocused) {
      blurComposerInput();
    }

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.scrollIntoView({ behavior: isMobileViewport ? 'auto' : 'smooth', block: 'start' });
      });
    });
    focusLockTimerRef.current = window.setTimeout(() => {
      lockAutoBottomScrollRef.current = false;
      setFocusResultMessageId((current) => (current === focusResultMessageId ? null : current));
      focusLockTimerRef.current = null;
    }, 1500);

    return () => {
      cancelAnimationFrame(raf);
      if (focusLockTimerRef.current !== null) {
        window.clearTimeout(focusLockTimerRef.current);
        focusLockTimerRef.current = null;
      }
    };
  }, [blurComposerInput, focusResultMessageId, isComposerFocused, isKeyboardOpen, isMobileViewport, messages.length, view]);

  useLayoutEffect(() => {
    if (view !== 'chat') return;
    const el = composerDockRef.current;
    if (!el || typeof window === 'undefined') return;

    const applyHeight = () => {
      const isMobile = window.matchMedia('(max-width: 899px)').matches;
      const h = Math.ceil(el.getBoundingClientRect().height);

      if (isMobile) {
        const mobileMin = isKeyboardOpen ? 108 : 122;
        const mobileBreath = isKeyboardOpen ? 14 : 20;
        const mobileComposerHeight = Math.min(180, Math.max(mobileMin, h + mobileBreath));
        document.documentElement.style.setProperty('--composer-h', `${mobileComposerHeight}px`);
        return;
      }

      const withBreath = Math.min(220, Math.max(96, h + 20));
      document.documentElement.style.setProperty('--composer-h', `${withBreath}px`);
    };

    applyHeight();
    const ro = new ResizeObserver(() => applyHeight());
    ro.observe(el);
    window.addEventListener('resize', applyHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', applyHeight);
    };
  }, [view, messages.length, isTyping, isKeyboardOpen]);

  useEffect(() => {
    if (view !== 'chat') return;
    if (messages.length !== 0) return;
    const tick = () => setRotateIdx((prev) => (prev + 1) % LANDING_ROTATING_FULL.length);
    // Slight jitter so it feels less mechanical.
    let id: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const ms = 2400 + Math.floor(Math.random() * 700);
      id = setTimeout(() => {
        tick();
        schedule();
      }, ms);
    };
    schedule();
    return () => {
      if (id) clearTimeout(id);
    };
  }, [messages.length, view]);

  useLayoutEffect(() => {
    if (view !== 'chat') return;
    if (messages.length !== 0) return;

    const measure = () => {
      const wrap = fitWrapRef.current;
      if (!wrap) return;

      // Compute a scale to keep the whole sentence on one line.
      const wrapW = wrap.clientWidth;
      const textW = wrap.scrollWidth;
      if (wrapW <= 0 || textW <= 0) return;

      const raw = wrapW / textW;
      const next = Math.max(0.62, Math.min(1, raw));
      setFitScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
    };

    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [messages.length, rotateIdx, view]);

  async function runScan(
    nextProfile: UserProfile,
    _refineStep?: ConversationResponse['step'],
    scanProfileHash?: string,
    interactionVersionAtStart?: number,
    serverScanHash?: string | null,
  ) {
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    const scanToken = uid();
    activeScanTokenRef.current = scanToken;
    const resultMessageId = `${scanToken}-results`;
    const followupMessageId = `${scanToken}-followup`;
    const timeoutMessageId = `${scanToken}-timeout`;
    const startInteractionVersion = interactionVersionAtStart ?? interactionVersionRef.current;
    let timedOut = false;
    let timeoutId: number | null = null;

    const appendScanMessages = (payload: ScanResponse) => {
      lockAutoBottomScrollRef.current = true;
      if (isMobileViewport || isKeyboardOpen || isComposerFocused) {
        blurComposerInput();
      }

      const shouldAskTargetedRefine =
        Boolean(payload.refineQuestion) &&
        (payload.qualityBand === 'low' || payload.results.length === 0 || (payload.nearMisses ?? []).length === 0);
      const genericFollowup = 'Questi bandi sono interessanti? Vuoi rispondere ad altre domande così capisco meglio la tua situazione e affino la ricerca?';
      
      let bodyText = '';
      if (payload.strategicAdvice) {
        bodyText += `**Consiglio del Consulente:** ${payload.strategicAdvice}\n\n`;
        if (payload.strategicReasoning) {
            bodyText += `*Perché ti consiglio questo:* ${payload.strategicReasoning}\n\n`;
        }
      }
      bodyText += genericFollowup;
      if (shouldAskTargetedRefine && payload.refineQuestion) {
        bodyText += `\n\n${payload.refineQuestion}`;
      }

      const followupText = bodyText;

      setMessages((prev) => [
        ...prev,
        {
          id: resultMessageId,
          role: 'assistant',
          kind: 'results',
          explanation: payload.explanation,
          results: payload.results,
          nearMisses: payload.nearMisses ?? [],
          scanToken
        },
        {
          id: followupMessageId,
          role: 'assistant',
          kind: 'text',
          body: followupText,
          scanToken
        }
      ]);
      setFocusResultMessageId(resultMessageId);
    };

    const handleNoResults = (payload: ScanResponse) => {
      const refineText =
        payload.refineQuestion?.trim() ||
        "Per essere preciso mi serve un dettaglio in più: settore principale e importo indicativo dell'investimento.";
      
      setMessages((prev) => [
        ...prev,
        {
          id: resultMessageId,
          role: 'assistant',
          kind: 'results',
          explanation: payload.explanation || "Non abbiamo trovato bandi corrispondenti al tuo profilo.",
          results: [],
          nearMisses: payload.nearMisses ?? [],
          scanToken
        },
        {
          id: followupMessageId,
          role: 'assistant',
          kind: 'text',
          body: refineText,
          scanToken,
        },
      ]);
      setFocusResultMessageId(resultMessageId);
      lockAutoBottomScrollRef.current = false;
      awaitingRefineAnswerRef.current = true;
    };

    awaitingRefineAnswerRef.current = false;
    setIsScanning(true);
    if (isMobileViewport || isKeyboardOpen || isComposerFocused) {
      blurComposerInput();
    }
    setScanOverlayProgress(8);
    setScanOverlayStepIndex(0);
    startOverlayProgressLoop();
    timeoutId = window.setTimeout(() => {
      if (activeScanTokenRef.current !== scanToken) return;
      // Non mostrare messaggi brutti di timeout — lasciamo l'animazione andare.
      // Se dopo 25 secondi non ha risposto, interrompiamo in silenzio.
      timedOut = true;
      stopOverlayProgressLoop();
      setIsScanning(false);
      scanInFlightRef.current = false;
      awaitingRefineAnswerRef.current = true;
      setScanOverlayProgress(100);
      setMessages((prev) => [
        ...prev,
        {
          id: timeoutMessageId,
          role: 'assistant',
          kind: 'text',
          body:
            "La ricerca sta richiedendo più tempo del previsto. Sto ancora cercando le opportunità più adatte al tuo profilo.",
          scanToken,
        },
      ]);
    }, 25000);

    const scanProfile = {
      ...nextProfile,
      location: {
        region: nextProfile.location?.region ?? null,
        municipality: nextProfile.location?.municipality ?? null,
      },
      businessExists: nextProfile.businessExists ?? null,
      activityType: nextProfile.activityType ?? null,
      ageBand: nextProfile.ageBand ?? null,
      employmentStatus: nextProfile.employmentStatus ?? null,
    };
    const scanRequestBody = buildUnifiedScanRequestBody({
      userProfile: scanProfile,
      channel: 'chat',
      strictness: selectUnifiedScanStrictness(scanProfile, 'full', null),
      limit: 10,
      mode: null,
    });
    try {
      const scanRes = await fetch('/api/scan-bandi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanRequestBody)
      });
      const scanJson = (await scanRes.json()) as ScanResponse & { error?: string };
      if (activeScanTokenRef.current !== scanToken) return;
      if (!scanRes.ok) throw new Error(scanJson.error ?? 'Scan non riuscito.');
      if (timedOut && interactionVersionRef.current !== startInteractionVersion) {
        activeScanTokenRef.current = null;
        return;
      }

      await completeOverlayProgress();

      if ((scanJson.results?.length ?? 0) === 0) {
        handleNoResults(scanJson);
      } else {
        if (timedOut) {
          setMessages((prev) => prev.filter((msg) => msg.id !== timeoutMessageId));
        }
        appendScanMessages(scanJson);
      }
      lastRenderedScanHashRef.current = scanProfileHash ?? buildScanProfileHash(nextProfile);
      lastSuccessfulServerScanHashRef.current = serverScanHash ?? buildServerScanHash(nextProfile);
      if ((scanJson.results?.length ?? 0) > 0) {
        awaitingRefineAnswerRef.current = true;
      }
    } catch (e) {
      if (activeScanTokenRef.current !== scanToken) return;
      await completeOverlayProgress();
      setMessages((prev) => {
        return [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            kind: 'text',
            body: friendlyChatError(e, 'Errore durante lo scan.')
          }
        ];
      });
      awaitingRefineAnswerRef.current = false;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (activeScanTokenRef.current === scanToken) {
        activeScanTokenRef.current = null;
      }
      setIsScanning(false);
      scanInFlightRef.current = false;
    }
  }

  async function onSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const interactionId = uid();
    interactionVersionRef.current += 1;
    const interactionVersion = interactionVersionRef.current;
    clearPendingAutoScan();

    // Optimistic UI
    setMessages((prev) => [...prev, { id: uid(), role: 'user', kind: 'text', body: trimmed }]);

    setIsTyping(true);
    setIsThinking(true);
    setShowTypingIndicator(true);
    let assistantMessageId = uid();
    streamingAssistantBodyRef.current = '';
    let finalMetadata: ConversationResponse | null = null;
    let hasAddedAssistantPlaceholder = false;

    try {
      const res = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          interactionId,
          conversationId: conversationIdRef.current ?? undefined,
          focusGrantContext: grantFocusMode && Boolean(targetGrantId),
          focusedGrantId: grantFocusMode ? (targetGrantId ?? undefined) : undefined,
          focusedGrantTitle: grantFocusMode ? (queryGrantTitle ?? undefined) : undefined,
        })
      });

      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error ?? 'Conversazione non disponibile.');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Stream non disponibile");

      let sseBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || "";
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
          
          try {
            const dataStr = trimmedLine.slice(6);
            if (dataStr === '[DONE]') break;
            const data = JSON.parse(dataStr);
            
            if (data.type === 'text') {
              const delta = String(data.content ?? '');
              if (!delta) continue;
              streamingAssistantBodyRef.current += delta;
              if (isThinking) setIsThinking(false);
            } else if (data.type === 'thinking') {
              setIsThinking(!!data.content);
            } else if (data.type === 'metadata') {
              finalMetadata = data.content as ConversationResponse;
              if (finalMetadata.conversationId) {
                conversationIdRef.current = finalMetadata.conversationId;
              }
              setProfile(finalMetadata.userProfile);
              setStep(finalMetadata.step);

              const finalText = (streamingAssistantBodyRef.current || finalMetadata.assistantText || '').trim();
              if (finalText && !hasAddedAssistantPlaceholder) {
                setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', kind: 'text', body: finalText }]);
                hasAddedAssistantPlaceholder = true;
                setShowTypingIndicator(false);
              }
            } else if (data.type === 'error') {
              throw new Error(data.content || "Errore durante lo streaming");
            }
          } catch (e) {
            console.warn("Parse error in stream line:", line, e);
          }
        }
      }

      if (finalMetadata) {
        const metadata = finalMetadata;
        const profileHash = buildScanProfileHash(metadata.userProfile);
        const hasProfileDelta = profileHash !== lastRenderedScanHashRef.current;
        const assistantFinalText = (streamingAssistantBodyRef.current || metadata.assistantText || '').trim();
        const canRunFromMetadata =
          (metadata.action === 'run_scan' || metadata.action === 'refine_after_scan') &&
          (lastRenderedScanHashRef.current === null || hasProfileDelta || metadata.readyToScan);

        const shouldRunScan = canRunFromMetadata && !scanInFlightRef.current;

        if (shouldRunScan) {
          await runScan(
            metadata.userProfile,
            metadata.step,
            profileHash,
            interactionVersion,
            metadata.scanHash ?? null,
          );
        }
      }

    } catch (e) {
      console.error("Chat error:", e);
       setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'assistant', kind: 'text', body: friendlyChatError(e, 'Errore conversazione.') }
      ]);
    } finally {
      const assistantTextToCommit = (streamingAssistantBodyRef.current || finalMetadata?.assistantText || '').trim();
      if (!hasAddedAssistantPlaceholder && assistantTextToCommit) {
        setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant', kind: 'text', body: assistantTextToCommit }]);
        hasAddedAssistantPlaceholder = true;
      }
      try {
        if (finalMetadata && assistantTextToCommit) {
          const commitInteractionId = finalMetadata.interactionId || interactionId;
          // Fire-and-forget persistence for server-side memory continuity.
          await fetch('/api/conversation', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              interactionId: commitInteractionId,
              assistantText: assistantTextToCommit,
              userProfile: finalMetadata.userProfile,
              step: finalMetadata.step,
              conversationId: conversationIdRef.current ?? finalMetadata.conversationId ?? undefined,
              ...(lastSuccessfulServerScanHashRef.current
                ? { lastScanHash: lastSuccessfulServerScanHashRef.current }
                : {}),
            })
          });
        }
      } catch {
        // ignore commit errors; chat UX should not be blocked
      }
      setIsTyping(false);
      setIsThinking(false);
      setShowTypingIndicator(false);
    }
  }

  const resetConversation = useCallback(async () => {
    try {
      await fetch('/api/conversation', { method: 'DELETE' });
    } catch {
      // ignore
    }
    stopOverlayProgressLoop();
    clearPendingAutoScan();
    setIsScanning(false);
    setScanOverlayProgress(0);
    setScanOverlayStepIndex(0);
    lockAutoBottomScrollRef.current = false;
    setFocusResultMessageId(null);
    scanInFlightRef.current = false;
    activeScanTokenRef.current = null;
    setMessages([]);
    setProfile({});
    setStep('location');
    setIsTyping(false);
    setIsThinking(false);
    setView('chat');
    setViewLoaded((prev) => ({ ...prev, chat: true }));
    awaitingRefineAnswerRef.current = false;
    conversationIdRef.current = null;
    setSourceChannel('chat'); // Reset to default when resetting conversation
  }, [clearPendingAutoScan]);

  const navItems = useMemo(
    () => {
      const limited = isLimitedReleaseMode();
      const items = [
      {
        id: 'home',
        label: 'Home',
        icon: 'home' as const,
        onClick: () => {
          goHome();
          setSidebarOpen(false);
        }
      },
      {
        id: 'chat',
        label: 'Chat AI',
        icon: 'chat' as const,
        onClick: () => {
          goChat();
          setSidebarOpen(false);
        }
      },
      {
        id: 'form',
        label: 'Scanner bandi',
        icon: 'search' as const,
        onClick: () => {
          goScanner();
          setSidebarOpen(false);
        }
      },
      {
        id: 'pratiche',
        label: 'Catalogo Bandi',
        icon: 'favorite' as const,
        onClick: () => {
          goMyPractices();
          setSidebarOpen(false);
        }
      }
    ];
      return limited ? items.filter((item) => item.id !== 'form') : items;
    },
    [goChat, goHome, goScanner, goMyPractices]
  );

  return (
    <div
      className={
        embedded
          ? 'chat-window-embedded'
          : sidebarOpen
            ? 'bndo-shell with-sidebar sidebar-open'
            : 'bndo-shell with-sidebar'
      }
    >
      {!embedded && sidebarOpen ? (
        <button type="button" className="mobile-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Chiudi menu" />
      ) : null}
      {!embedded ? (
        <button
          type="button"
          className={sidebarOpen ? 'mobile-menu-fab is-open' : 'mobile-menu-fab'}
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? 'Chiudi menu' : 'Apri menu'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M10 5.5v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
      {!embedded ? (
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          onNewChat={resetConversation}
          items={navItems}
          recent={[]}
        />
      ) : null}

      <main className={embedded ? 'mainpane chat-mainpane-embedded' : 'mainpane'}>
        {!embedded && view === 'home' ? null : !embedded ? (
          <div className="topbar">
            <button type="button" className="topbar-logo topbar-logo-btn" onClick={goHome} aria-label="BNDO Home">
              <Image src="/Logo-BNDO-header.png" alt="BNDO" width={98} height={26} priority />
            </button>
          </div>
        ) : null}

        {view === 'quiz' || viewLoaded.quiz ? (
          <div className={view === 'quiz' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'quiz'}>
            {targetGrantId && (
              <PracticeGrantQuizPage grantId={targetGrantId} sourceChannel={sourceChannel} />
            )}
          </div>
        ) : null}

        {view === 'choice' || viewLoaded.choice ? (
          <div className={view === 'choice' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'choice'}>
            <OnboardingChoiceView onStartChat={goChat} onOpenScanner={goScanner} />
          </div>
        ) : null}

        {view === 'home' || viewLoaded.home ? (
          <div className={view === 'home' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'home'}>
            <BndiHomeView onStart={goChat} onOpenScanner={goScanner} onVerify={goQuiz} embedded={embedded} />
          </div>
        ) : null}

        {view === 'form' || viewLoaded.form ? (
          <div className={view === 'form' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'form'}>
            <ScannerBandiProView
              initialGrantId={initialGrantId}
              onGrantSelect={(grantId) => onSelectGrantForPractice(grantId, 'scanner')}
              onGrantDetail={(grantId) => onOpenGrantDetailForPractice(grantId, 'scanner')}
              embedded={embedded}
              guestMobileSafe={!embedded && authState !== 'authenticated'}
            />
          </div>
        ) : null}

        {view === 'grantDetail' || viewLoaded.grantDetail ? (
          <div className={view === 'grantDetail' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'grantDetail'}>
            <div className="scanner-pro-page">
              {targetGrantId ? (
                <GrantDetailProView 
                  grantId={targetGrantId} 
                  onVerify={goQuiz}
                  onBack={goScanner}
                  showGrantAiPopup={false}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {view === 'myPractices' || view === 'pratiche' || viewLoaded.myPractices || viewLoaded.pratiche ? (
          <div className={(view === 'myPractices' || view === 'pratiche') ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'myPractices' && view !== 'pratiche'}>
            <BandiCatalogView
              title="Catalogo Bandi"
              subtitle="Tutti i bandi attivi da fonti italiane"
              onOpenDetail={(grantId) => onOpenGrantDetailForPractice(grantId, 'scanner')}
            />
          </div>
        ) : null}

        {view === 'practiceDetail' || viewLoaded.practiceDetail ? (
          <div className={view === 'practiceDetail' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'practiceDetail'}>
            {targetApplicationId && (
              <PracticeDetailView applicationId={targetApplicationId} onBack={goMyPractices} />
            )}
          </div>
        ) : null}

        {view === 'chat' || messages.length > 0 ? (
          <div className={view === 'chat' ? 'view-pane chat-view-pane' : 'view-pane chat-view-pane is-hidden'} aria-hidden={view !== 'chat'}>
            <div className="chatgpt-stage">
              {isLimitedReleaseMode() && (
                <div className="limited-beta-banner" style={{
                  background: 'linear-gradient(135deg, rgba(11,17,54,0.95), #0a2540)',
                  color: '#fff',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textAlign: 'center',
                  marginBottom: '16px',
                  boxShadow: '0 4px 18px rgba(11,17,54,0.15)',
                }}>
                  <span style={{ marginRight: '6px' }}>🔒</span>
                  Modalità limitata: {LIMITED_CHAT_SCOPE_NOTICE}
                </div>
              )}
              {messages.length === 0 ? (
                <div className="chat-landing">
                  <div className="landing-title">
                    <div className="landing-title-top">{LANDING_TITLE_PREFIX}</div>
                    <div ref={fitWrapRef} className="landing-title-bottom" style={{ ['--fit-scale' as any]: fitScale }}><span className="landing-title-fixed">Parlami</span><span className="landing-rotate" key={rotateIdx}>{stripLeadingParlami(LANDING_ROTATING_FULL[rotateIdx] ?? LANDING_ROTATING_FULL[0])}</span></div>
                  </div>
                  <TypewriterExamples />
                  <div className="chat-tech" aria-hidden="true">
                    {LANDING_TECH.map((tag, i) => (
                      <span key={tag} className={i === 0 ? 'chat-tech-left' : 'chat-tech-right'}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.length > 0 ? (
                <div 
                  ref={scrollRef} 
                  className="chatgpt-messages"
                >
                  {messages.map((m) => {
                    if (m.kind === 'text')
                      return (
                        <div
                          key={m.id}
                          ref={(node) => {
                            messageNodeRefs.current[m.id] = node;
                          }}
                        >
                          <MessageBubble
                            role={m.role}
                            body={m.body}
                            footer={m.role === 'assistant' ? assistantFooterText : undefined}
                          />
                        </div>
                      );
                    if (m.kind === 'results')
                      return (
                        <div
                          key={m.id}
                          ref={(node) => {
                            messageNodeRefs.current[m.id] = node;
                          }}
                        >
                          <MessageBubble role="assistant" footer={assistantFooterText}>
                            <BandiResults
                              explanation={m.explanation}
                              results={m.results}
                              nearMisses={m.nearMisses}
                              onOpenDetail={(grantId) => onOpenGrantDetailForPractice(grantId, 'chat')}
                              onVerifyRequirements={(grantId) => onSelectGrantForPractice(grantId, 'chat')}
                            />
                          </MessageBubble>
                        </div>
                      );
                    return null;
                  })}
                  {isThinking && (
                    <ThinkingBubble />
                  )}
                  {isTyping && !isThinking && showTypingIndicator ? (
                    <MessageBubble role="assistant">
                      <span className="typing" aria-label="Assistant sta scrivendo">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    </MessageBubble>
                  ) : null}
                  <div ref={bottomRef} className="chat-bottom-anchor" />
                </div>
              ) : null}

              {showScrollButton && (
                <button
                  type="button"
                  onClick={() => scrollToBottom()}
                  className="chat-scroll-latest-btn"
                  aria-label="Vai in fondo alla chat"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              )}
            </div>

            <FullScreenScannerOverlay
              open={isScanning}
              progress={scanOverlayProgress}
              activeStepIndex={scanOverlayStepIndex}
              currentStepLabel={SCAN_OVERLAY_STEPS[scanOverlayStepIndex] ?? SCAN_OVERLAY_STEPS[0]}
            />

            <div ref={composerDockRef} className="composer-dock">
              <div className="composer-inner">
                <InputArea
                  placeholder={placeholder}
                  disabled={isTyping || isScanning}
                  onSend={onSend}
                  onReset={resetConversation}
                  focusMode={isMobileViewport ? 'manual' : 'desktop'}
                  blurSignal={inputBlurSignal}
                  onComposerFocusChange={setIsComposerFocused}
                />
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
