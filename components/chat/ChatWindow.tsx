'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InputArea } from '@/components/chat/InputArea';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { BandiResults, type BandoResult } from '@/components/chat/BandiResults';
import { TypewriterExamples } from '@/components/chat/TypewriterExamples';
import { Sidebar } from '@/components/chat/Sidebar';
import { BndiHomeView } from '@/components/views/BndiHomeView';
import { FullScreenScannerOverlayPro as FullScreenScannerOverlay, SCAN_OVERLAY_STEPS } from '@/components/views/FullScreenScannerOverlayPro';
import { GrantDetailProView } from '@/components/views/GrantDetailProView';
import { PraticheView } from '@/components/views/PraticheView';
import { ScannerBandiProView } from '@/components/views/ScannerBandiProView';

type UserProfile = {
  activityType?: string | null;
  businessExists?: boolean | null;
  sector?: string | null;
  ateco?: string | null;
  atecoAnswered?: boolean;
  location?: { region?: string | null; municipality?: string | null } | null;
  age?: number | null;
  employmentStatus?: string | null;
  legalForm?: string | null;
  employees?: number | null;
  revenueOrBudgetEUR?: number | null;
  requestedContributionEUR?: number | null;
  fundingGoal?: string | null;
  contributionPreference?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
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
  assistantConfidence?: number;
  needsClarification?: boolean;
  error?: string;
};

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
  }>;
  nearMisses?: BandoResult[];
  qualityBand?: 'high' | 'medium' | 'low';
  refineQuestion?: string;
  topPickBandoId: string | null;
  bookingUrl: string;
};

type ChatMessage =
  | { id: string; role: 'assistant' | 'user'; kind: 'text'; body: string }
  | { id: string; role: 'assistant'; kind: 'results'; explanation: string; results: BandoResult[]; nearMisses?: BandoResult[]; scanToken?: string }
  | { id: string; role: 'assistant'; kind: 'cta'; bookingUrl: string; scanToken?: string };

const CTA_TEXT = 'Vuoi partecipare a questo BANDO con BNDO? Prenota una consulenza con un nostro consulente.';
const LANDING_TITLE_PREFIX = 'Vorresti partecipare ad un BNDO?';
const LANDING_TECH = ['Matching AI', 'Piattaforma con professionisti umani'] as const;
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
  initialView?: 'chat' | 'home' | 'form' | 'pratiche' | 'grantDetail';
  initialGrantId?: string | null;
};

export function ChatWindow({ initialView = 'chat', initialGrantId = null }: ChatWindowProps = {}) {
  const resolvedInitialView: 'chat' | 'home' | 'form' | 'pratiche' | 'grantDetail' =
    initialView === 'home' || initialView === 'form' || initialView === 'pratiche' || initialView === 'grantDetail'
        ? initialView
        : 'chat';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<UserProfile>({});
  const [step, setStep] = useState<ConversationResponse['step']>('location');
  const [isTyping, setIsTyping] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanOverlayProgress, setScanOverlayProgress] = useState(0);
  const [scanOverlayStepIndex, setScanOverlayStepIndex] = useState(0);
  const [rotateIdx, setRotateIdx] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusResultMessageId, setFocusResultMessageId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'home' | 'form' | 'pratiche' | 'grantDetail'>(resolvedInitialView);
  const [viewLoaded, setViewLoaded] = useState<Record<'home' | 'form' | 'pratiche' | 'grantDetail', boolean>>({
    home: resolvedInitialView === 'home',
    form: resolvedInitialView === 'form',
    pratiche: resolvedInitialView === 'pratiche',
    grantDetail: resolvedInitialView === 'grantDetail'
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fitWrapRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const overlayProgressTimerRef = useRef<number | null>(null);
  const lockAutoBottomScrollRef = useRef(false);
  const messageNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const viewport = window.visualViewport;

    const syncViewportHeight = () => {
      const next = Math.round(viewport?.height ?? window.innerHeight);
      root.style.setProperty('--app-height', `${next}px`);
    };

    syncViewportHeight();
    window.addEventListener('resize', syncViewportHeight);
    window.addEventListener('orientationchange', syncViewportHeight);
    viewport?.addEventListener('resize', syncViewportHeight);
    viewport?.addEventListener('scroll', syncViewportHeight);

    return () => {
      window.removeEventListener('resize', syncViewportHeight);
      window.removeEventListener('orientationchange', syncViewportHeight);
      viewport?.removeEventListener('resize', syncViewportHeight);
      viewport?.removeEventListener('scroll', syncViewportHeight);
    };
  }, []);

  useEffect(() => {
    // The UI currently doesn't persist chat history; always start with a clean server session
    // to avoid stale cookies generating incoherent replies (e.g. "Ciao" -> "posso affinare...").
    resetConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (view === 'chat') return;
    setViewLoaded((prev) => (prev[view] ? prev : { ...prev, [view]: true }));
  }, [view]);

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
    overlayProgressTimerRef.current = window.setInterval(() => {
      setScanOverlayProgress((prev) => {
        if (prev >= 92) return prev;
        const baseStep = prev < 26 ? 7.2 : prev < 58 ? 3.8 : prev < 80 ? 1.9 : 0.9;
        const jitter = prev < 80 ? Math.random() : Math.random() * 0.3;
        return Math.min(92, prev + baseStep + jitter);
      });
    }, 110);
  }

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, scanOverlayProgress));
    const next = Math.min(4, Math.floor((clamped / 100) * 5));
    setScanOverlayStepIndex(next);
  }, [scanOverlayProgress]);

  useEffect(() => {
    return () => {
      stopOverlayProgressLoop();
    };
  }, []);

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    // Works whether the scroll container is this div or the document.
    if (!bottomRef.current) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }

  useEffect(() => {
    if (view !== 'chat') return;
    if (lockAutoBottomScrollRef.current) return;
    const lastMessage = messages[messages.length - 1];
    const isResultCluster =
      lastMessage?.role === 'assistant' && (lastMessage.kind === 'results' || lastMessage.kind === 'cta');
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
    const raf = requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const unlockTimer = window.setTimeout(() => {
      lockAutoBottomScrollRef.current = false;
      setFocusResultMessageId((current) => (current === focusResultMessageId ? null : current));
    }, 700);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(unlockTimer);
    };
  }, [focusResultMessageId, messages.length, view]);

  useLayoutEffect(() => {
    if (view !== 'chat') return;
    const el = composerDockRef.current;
    if (!el || typeof window === 'undefined') return;

    const applyHeight = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      const withBreath = Math.max(96, h + 20);
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
  }, [view, messages.length, isTyping]);

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

  function refinePromptFor(step: ConversationResponse['step']) {
    if (step === 'ateco') {
      return 'Per rendere il match ancora piu preciso: hai il codice ATECO? (anche 2 cifre). Se non lo sai, scrivi “non so” + cosa fai in 1 frase.';
    }
    if (step === 'contributionPreference') {
      return 'Preferisci una forma specifica? (fondo perduto / finanziamento agevolato / voucher / credito d’imposta / misto)';
    }
    if (step === 'employees') {
      return 'Quanti dipendenti/addetti avete indicativamente?';
    }
    if (step === 'budget') {
      return 'Hai un budget o fatturato indicativo da considerare? (es. 50k). Se non lo sai: “non so”.';
    }
    if (step === 'sector') {
      return 'In che settore operi? (es. turismo, commercio, manifattura, ICT)';
    }
    return null;
  }

  async function runScan(nextProfile: UserProfile, refineStep?: ConversationResponse['step']) {
    const scanToken = uid();
    const resultMessageId = `${scanToken}-results`;
    const ctaMessageId = `${scanToken}-cta`;

    const upsertScanMessages = (payload: ScanResponse) => {
      lockAutoBottomScrollRef.current = true;
      setMessages((prev) => {
        const withoutCurrentScan = prev.filter((entry) => !(('scanToken' in entry ? entry.scanToken : null) === scanToken));
        const next: ChatMessage[] = [
          ...withoutCurrentScan,
          {
            id: resultMessageId,
            role: 'assistant',
            kind: 'results',
            explanation: payload.explanation,
            results: payload.results,
            nearMisses: payload.nearMisses ?? [],
            scanToken
          }
        ];

        if (payload.topPickBandoId && payload.bookingUrl) {
          next.push({
            id: ctaMessageId,
            role: 'assistant',
            kind: 'cta',
            bookingUrl: payload.bookingUrl,
            scanToken
          });
        }
        return next;
      });
      setFocusResultMessageId(resultMessageId);
    };

    const maybeAskRefinement = (payload: ScanResponse) => {
      const topScore = ((payload.results?.[0] as any)?.matchScore ?? (payload.results?.[0] as any)?.score) as number | undefined;
      const shouldRefine =
        Boolean(payload.refineQuestion) || payload.results.length === 0 || (typeof topScore === 'number' && topScore < 0.66);
      const prompt = refineStep ? refinePromptFor(refineStep) : null;
      if (shouldRefine && prompt && !payload.refineQuestion) {
        setMessages((prev) => [...prev, { id: uid(), role: 'assistant', kind: 'text', body: prompt }]);
      }
      if (payload.refineQuestion) {
        setMessages((prev) => [...prev, { id: uid(), role: 'assistant', kind: 'text', body: payload.refineQuestion! }]);
      }
    };

    setIsScanning(true);
    setScanOverlayProgress(8);
    setScanOverlayStepIndex(0);
    startOverlayProgressLoop();

    try {
      const fastRes = await fetch('/api/scan-bandi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userProfile: nextProfile, limit: 10, mode: 'fast', channel: 'chat', strictness: 'high' })
      });
      const fastJson = (await fastRes.json()) as ScanResponse & { error?: string };
      if (!fastRes.ok) throw new Error(fastJson.error ?? 'Scan non riuscito.');

      stopOverlayProgressLoop();
      setScanOverlayProgress(100);
      setScanOverlayStepIndex(4);
      upsertScanMessages(fastJson);
      await new Promise((resolve) => setTimeout(resolve, 90));

      // Upgrade in background with full precision ordering/data.
      void (async () => {
        try {
          const fullRes = await fetch('/api/scan-bandi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userProfile: nextProfile, limit: 10, mode: 'full', channel: 'chat', strictness: 'high' })
          });
          const fullJson = (await fullRes.json()) as ScanResponse & { error?: string };
          if (!fullRes.ok) return;
          upsertScanMessages(fullJson);
          maybeAskRefinement(fullJson);
        } catch {
          // Ignore background refresh failures, keep fast snapshot.
        }
      })();
    } catch (e) {
      stopOverlayProgressLoop();
      setScanOverlayProgress(100);
      setScanOverlayStepIndex(4);
      await new Promise((resolve) => setTimeout(resolve, 80));
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
    } finally {
      setIsScanning(false);
    }
  }

  async function onSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { id: uid(), role: 'user', kind: 'text', body: trimmed }]);

    setIsTyping(true);
    try {
      const startedAt = Date.now();
      const res = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed })
      });
      const json = (await res.json()) as ConversationResponse;
      if (!res.ok) throw new Error(json.error ?? 'Conversazione non disponibile.');

      // Ensure a modern "typing" feel even when the API is fast.
      const minMs = 700;
      const byLengthMs = Math.min(1100, Math.max(200, Math.round((json.assistantText ?? '').length * 10)));
      const target = minMs + byLengthMs;
      const elapsed = Date.now() - startedAt;
      if (elapsed < target) await new Promise((r) => setTimeout(r, target - elapsed));

      setProfile(json.userProfile);
      setStep(json.step);
      if (!isEchoLikeReply(trimmed, json.assistantText ?? '')) {
        setMessages((prev) => [...prev, { id: uid(), role: 'assistant', kind: 'text', body: json.assistantText }]);
      }

      if (json.readyToScan) {
        await runScan(json.userProfile, json.step);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'assistant', kind: 'text', body: friendlyChatError(e, 'Errore conversazione.') }
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  async function resetConversation() {
    try {
      await fetch('/api/conversation', { method: 'DELETE' });
    } catch {
      // ignore
    }
    stopOverlayProgressLoop();
    setIsScanning(false);
    setScanOverlayProgress(0);
    setScanOverlayStepIndex(0);
    lockAutoBottomScrollRef.current = false;
    setFocusResultMessageId(null);
    setMessages([]);
    setProfile({});
    setStep('location');
  }

  const goHome = useCallback(() => setView('home'), []);
  const goChat = useCallback(() => setView('chat'), []);
  const goScanner = useCallback(() => setView('form'), []);

  const navItems = useMemo(
    () => [
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
        label: 'Chat',
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
        label: 'Pratiche',
        icon: 'practice' as const,
        onClick: () => {
          setView('pratiche');
          setSidebarOpen(false);
        }
      }
    ],
    [goChat, goHome, goScanner]
  );

  return (
    <div className={sidebarOpen ? 'bndo-shell with-sidebar sidebar-open' : 'bndo-shell with-sidebar'}>
      {sidebarOpen ? <button type="button" className="mobile-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Chiudi menu" /> : null}
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
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onNewChat={resetConversation}
        items={navItems}
        recent={[]}
      />

      <main className="mainpane">
        {view === 'home' ? null : (
          <div className="topbar">
            <button type="button" className="topbar-logo topbar-logo-btn" onClick={goHome} aria-label="BNDO Home">
              <img src="/Logo-BNDO-header.png" alt="BNDO" width={98} height={26} />
            </button>
          </div>
        )}

        {view === 'home' || viewLoaded.home ? (
          <div className={view === 'home' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'home'}>
            <BndiHomeView onStart={goChat} onOpenScanner={goScanner} />
          </div>
        ) : null}

        {view === 'form' || viewLoaded.form ? (
          <div className={view === 'form' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'form'}>
            <div className="scanner-pro-page">
              <ScannerBandiProView initialGrantId={initialGrantId} />
            </div>
          </div>
        ) : null}

        {view === 'grantDetail' || viewLoaded.grantDetail ? (
          <div className={view === 'grantDetail' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'grantDetail'}>
            <div className="scanner-pro-page">
              {initialGrantId ? <GrantDetailProView grantId={initialGrantId} /> : null}
            </div>
          </div>
        ) : null}

        {view === 'pratiche' || viewLoaded.pratiche ? (
          <div className={view === 'pratiche' ? 'view-pane' : 'view-pane is-hidden'} aria-hidden={view !== 'pratiche'}>
            <PraticheView />
          </div>
        ) : null}

        {
          <div className={view === 'chat' ? 'view-pane chat-view-pane' : 'view-pane chat-view-pane is-hidden'} aria-hidden={view !== 'chat'}>
            <div className="chatgpt-stage">
              {messages.length === 0 ? (
                <div className="chat-landing">
                  <div className="landing-title">
                    <div className="landing-title-top">{LANDING_TITLE_PREFIX}</div>
                    <div ref={fitWrapRef} className="landing-title-bottom" style={{ ['--fit-scale' as any]: fitScale }}><span className="landing-title-fixed">Parlami</span><span className="landing-rotate" key={rotateIdx}>{stripLeadingParlami(LANDING_ROTATING_FULL[rotateIdx] ?? LANDING_ROTATING_FULL[0])}</span></div>
                  </div>
                  <TypewriterExamples />
                  <div className="chat-tech" aria-hidden="true">
                    <span className="chat-tech-left">{LANDING_TECH[0]}</span>
                    <span className="chat-tech-mid" aria-hidden="true" />
                    <span className="chat-tech-right">{LANDING_TECH[1]}</span>
                  </div>
                </div>
              ) : null}

              {messages.length > 0 ? (
                <div ref={scrollRef} className="chatgpt-messages">
                  {messages.map((m) => {
                    if (m.kind === 'text')
                      return (
                        <div
                          key={m.id}
                          ref={(node) => {
                            messageNodeRefs.current[m.id] = node;
                          }}
                        >
                          <MessageBubble role={m.role} body={m.body} />
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
                          <MessageBubble role="assistant">
                            <BandiResults explanation={m.explanation} results={m.results} nearMisses={m.nearMisses} />
                          </MessageBubble>
                        </div>
                      );
                    if (m.kind === 'cta')
                      return (
                        <div
                          key={m.id}
                          ref={(node) => {
                            messageNodeRefs.current[m.id] = node;
                          }}
                        >
                          <MessageBubble role="assistant">
                            <div className="cta-wrap">
                              <div className="cta-note">{CTA_TEXT}</div>
                              <a className="cta-button" href={m.bookingUrl} target="_blank" rel="noreferrer">
                                Prenota consulenza
                              </a>
                            </div>
                          </MessageBubble>
                        </div>
                      );
                    return null;
                  })}
                  {isTyping ? (
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
                />
              </div>
            </div>
          </div>
        }
      </main>
    </div>
  );
}
