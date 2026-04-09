'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PracticeEligibilityQuiz, type PracticeQuizQuestion } from '@/components/dashboard/PracticeEligibilityQuiz';
import { ScannerBandiProView } from '@/components/views/ScannerBandiProView';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { GrantDetailProView } from '@/components/views/GrantDetailProView';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';

type PracticeEligibility = 'eligible' | 'likely_eligible' | 'not_eligible' | 'needs_review';

type PracticeFlowState = {
  applicationId: string;
  grantTitle: string;
  sourceChannel: 'scanner' | 'chat' | 'direct' | 'admin';
  questions: PracticeQuizQuestion[];
  requirements: Array<{
    requirementKey: string;
    label: string;
    description: string | null;
    isRequired: boolean;
  }>;
};

type LatestSubmission = {
  id: string;
  eligibility: PracticeEligibility;
  completedAt?: string | null;
};

type PracticeLaunchHubProps = {
  initialGrantId: string | null;
  initialSource: 'scanner' | 'chat' | 'direct' | 'admin';
  initialEntryPoint: 'choice' | 'scanner' | 'chat' | 'detail';
};

export function PracticeLaunchHub({ initialGrantId, initialSource, initialEntryPoint }: PracticeLaunchHubProps) {
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
  const shouldUseLegacyQuiz = (grantId: string) => {
    const raw = String(grantId || '').trim();
    if (!raw) return false;
    if (LEGACY_AUTOIMPIEGO_QUIZ_IDS.has(raw)) return true;
    const normalized = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.includes('resto al sud 2 0') || normalized.includes('autoimpiego centro nord');
  };

  const router = useRouter();
  const [grantId, setGrantId] = useState(initialGrantId);
  const [sourceChannel, setSourceChannel] = useState(initialSource);
  const [entryPoint, setEntryPoint] = useState<'choice' | 'scanner' | 'chat' | 'detail'>(initialEntryPoint);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<PracticeFlowState | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<LatestSubmission | null>(null);
  const [quizOutcome, setQuizOutcome] = useState<PracticeEligibility | null>(null);
  const [showSuccessConfetti, setShowSuccessConfetti] = useState(false);
  const shouldForwardToQuiz = Boolean(grantId && entryPoint !== 'detail');

  useEffect(() => {
    setGrantId(initialGrantId);
  }, [initialGrantId]);

  useEffect(() => {
    setSourceChannel(initialSource);
  }, [initialSource]);

  useEffect(() => {
    setEntryPoint(initialEntryPoint);
  }, [initialEntryPoint]);

  useEffect(() => {
    if (!showSuccessConfetti) return;

    let animationId: number | null = null;
    let cancelled = false;
    let canvasEl: HTMLCanvasElement | null = null;

    const timer = window.setTimeout(async () => {
      const confettiModule = await import('canvas-confetti');
      if (cancelled) return;

      canvasEl = document.createElement('canvas');
      canvasEl.style.position = 'fixed';
      canvasEl.style.top = '0';
      canvasEl.style.left = '0';
      canvasEl.style.width = '100vw';
      canvasEl.style.height = '100vh';
      canvasEl.style.pointerEvents = 'none';
      canvasEl.style.zIndex = '9999';
      canvasEl.width = window.innerWidth;
      canvasEl.height = window.innerHeight;
      document.body.appendChild(canvasEl);

      const confetti = confettiModule.create(canvasEl, { resize: true, useWorker: false });
      const end = Date.now() + 2600;

      const burst = () => {
        if (cancelled) return;

        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#22C55F', '#0B1136', '#FFF']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#22C55F', '#0B1136', '#FFF']
        });

        if (Date.now() < end) {
          animationId = window.requestAnimationFrame(burst);
          return;
        }

        window.setTimeout(() => {
          if (canvasEl && canvasEl.parentNode) {
            canvasEl.parentNode.removeChild(canvasEl);
          }
        }, 1200);
      };

      burst();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (animationId !== null) {
        window.cancelAnimationFrame(animationId);
      }
      if (canvasEl && canvasEl.parentNode) {
        canvasEl.parentNode.removeChild(canvasEl);
      }
    };
  }, [showSuccessConfetti]);

  useEffect(() => {
    if (!shouldForwardToQuiz || !grantId) return;
    if (shouldUseLegacyQuiz(grantId)) {
      window.location.href = LEGACY_AUTOIMPIEGO_QUIZ_URL;
      return;
    }
    const source = sourceChannel || 'direct';
    router.replace(`/dashboard/new-practice/quiz?grantId=${encodeURIComponent(grantId)}&source=${source}`);
  }, [grantId, router, shouldForwardToQuiz, sourceChannel]);

  useEffect(() => {
    if (!grantId || entryPoint === 'detail') return;

    let aborted = false;
    setLoading(true);
    setError(null);
    setFlow(null);
    setNextPath(null);
    setLatestSubmission(null);
    setQuizOutcome(null);
    setShowSuccessConfetti(false);

    (async () => {
      try {
        const res = await fetch('/api/practices/flow/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grantId, sourceChannel })
        });
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          flow?: PracticeFlowState;
          latestSubmission?: LatestSubmission | null;
        };
        if (!res.ok) {
          throw new Error(payload.error ?? 'Impossibile inizializzare il flusso pratica.');
        }
        if (aborted) return;

        const loadedFlow = payload.flow ?? null;
        const loadedLatest = payload.latestSubmission ?? null;
        setFlow(loadedFlow);
        setLatestSubmission(loadedLatest);
        setQuizOutcome(loadedLatest?.eligibility ?? null);

        if (loadedFlow && loadedLatest?.eligibility && loadedLatest.eligibility !== 'not_eligible') {
          setNextPath(`/dashboard/practices/${loadedFlow.applicationId}?docs=missing`);
        }
      } catch (fetchError) {
        if (aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Errore caricamento pratica.');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [grantId, sourceChannel, entryPoint]);

  const requirementsPreview = useMemo(() => (flow?.requirements ?? []).slice(0, 6), [flow?.requirements]);

  async function submitPracticeQuiz(answers: Record<string, string | number | boolean | null>) {
    if (!flow) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/practices/flow/${encodeURIComponent(flow.applicationId)}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        submissionId?: string;
        eligibility?: PracticeEligibility;
        nextPath?: string | null;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? 'Impossibile completare il quiz requisiti.');
      }

      const outcome = payload.eligibility ?? null;
      setLatestSubmission(
        payload.submissionId && outcome
          ? {
              id: payload.submissionId,
              eligibility: outcome,
              completedAt: new Date().toISOString()
            }
          : null
      );
      setQuizOutcome(outcome);

      if (outcome && outcome !== 'not_eligible') {
        setNextPath(payload.nextPath ?? `/dashboard/practices/${flow.applicationId}?docs=missing`);
        if (outcome === 'eligible' || outcome === 'likely_eligible') {
          setShowSuccessConfetti(true);
        }
        return;
      }

      setNextPath(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Errore durante il salvataggio del quiz.');
    } finally {
      setSubmitting(false);
    }
  }

  const resetToChoice = () => {
    setGrantId(null);
    setFlow(null);
    setError(null);
    setNextPath(null);
    setLatestSubmission(null);
    setQuizOutcome(null);
    setShowSuccessConfetti(false);
    setEntryPoint('choice');
    router.replace('/dashboard/new-practice');
  };

  const openGrantQuizFromDetail = (selectedGrantId: string) => {
    if (shouldUseLegacyQuiz(selectedGrantId)) {
      window.location.href = LEGACY_AUTOIMPIEGO_QUIZ_URL;
      return;
    }
    const source = sourceChannel || 'direct';
    setGrantId(selectedGrantId);
    setEntryPoint('choice');
    router.replace(`/dashboard/new-practice/quiz?grantId=${encodeURIComponent(selectedGrantId)}&source=${source}`);
  };

  if (shouldForwardToQuiz) {
    return (
      <section className="section-card" style={{ maxWidth: 1000 }}>
        <div className="admin-item-sub">Apertura quiz requisiti in corso...</div>
      </section>
    );
  }

  if (!grantId) {
    const openEntryPoint = (next: 'choice' | 'scanner' | 'chat') => {
      setEntryPoint(next);
      const target = next === 'choice' ? '/dashboard/new-practice' : `/dashboard/new-practice?mode=${next}`;
      router.replace(target);
    };

    const onGrantSelected = (selectedGrantId: string, source: 'scanner' | 'chat') => {
      if (shouldUseLegacyQuiz(selectedGrantId)) {
        window.location.href = LEGACY_AUTOIMPIEGO_QUIZ_URL;
        return;
      }
      setSourceChannel(source);
      setGrantId(selectedGrantId);
      setEntryPoint('choice');
      router.replace(`/dashboard/new-practice/quiz?grantId=${encodeURIComponent(selectedGrantId)}&source=${source}`);
    };

    const onGrantDetailSelected = (selectedGrantId: string, source: 'scanner' | 'chat') => {
      setSourceChannel(source);
      setGrantId(selectedGrantId);
      setEntryPoint('detail');
      router.replace(`/dashboard/new-practice?mode=detail&grantId=${encodeURIComponent(selectedGrantId)}&source=${source}`);
    };

    if (entryPoint === 'scanner') {
      return (
        <div className="practice-launch-full">
          <ScannerBandiProView
            onGrantSelect={(selectedGrantId) => onGrantSelected(selectedGrantId, 'scanner')}
            onGrantDetail={(selectedGrantId) => onGrantDetailSelected(selectedGrantId, 'scanner')}
          />
        </div>
      );
    }

    if (entryPoint === 'chat') {
      return (
        <div className="practice-launch-full">
          <ChatWindow
            initialView="chat"
            embedded
            practiceLaunchMode
            onPracticeGrantSelect={onGrantSelected}
            onPracticeGrantOpenDetail={onGrantDetailSelected}
          />
        </div>
      );
    }

    return (
      <section className="section-card" style={{ maxWidth: 920 }}>
        <div className="section-title">
          <span>+</span>
          <span>Nuova pratica</span>
        </div>
        <p className="admin-item-sub" style={{ marginTop: 6 }}>
          Scegli come trovare il bando e avviare il flusso pratica senza uscire dalla dashboard.
        </p>
        <div className="action-buttons" style={{ marginTop: 14 }}>
          <button type="button" className="btn-action" onClick={() => openEntryPoint('scanner')}>
            Scanner Bandi
          </button>
          <button type="button" className="btn-action secondary" onClick={() => openEntryPoint('chat')}>
            Chat Intelligente
          </button>
        </div>
      </section>
    );
  }

  if (entryPoint === 'detail') {
    return (
      <div className="practice-launch-full">
        <GrantDetailProView
          grantId={grantId}
          sourceChannel={sourceChannel}
          onVerify={openGrantQuizFromDetail}
        />
      </div>
    );
  }

  const showEligibleSuccess = Boolean((quizOutcome === 'eligible' || quizOutcome === 'likely_eligible') && nextPath);
  const showReviewOutcome = Boolean(quizOutcome === 'needs_review' && nextPath);
  const showNegativeOutcome = quizOutcome === 'not_eligible';

  return (
    <div className="space-y-4">
      <section className="section-card" style={{ maxWidth: 1000 }}>
        <div className="section-title">
          <span>🧭</span>
          <span>Avvio nuova pratica</span>
        </div>
        {flow?.grantTitle ? (
          <p className="admin-item-sub" style={{ marginTop: 6 }}>
            Bando selezionato: <strong>{flow.grantTitle}</strong>
          </p>
        ) : null}
        <div className="action-buttons" style={{ marginTop: 12 }}>
          <button type="button" className="btn-action secondary" onClick={resetToChoice}>
            Cambia bando
          </button>
          {flow ? (
            <Link href={`/dashboard/practices/${flow.applicationId}?docs=missing`} className="btn-action">
              Vai alla pratica
            </Link>
          ) : null}
        </div>
      </section>

      {loading ? (
        <section className="section-card" style={{ maxWidth: 1000 }}>
          <div className="admin-item-sub">Caricamento flusso pratica in corso...</div>
        </section>
      ) : null}

      {error ? (
        <section className="section-card" style={{ maxWidth: 1000 }}>
          <div className="form-error">{error}</div>
        </section>
      ) : null}

      {!loading && flow && !latestSubmission ? (
        <PracticeEligibilityQuiz questions={flow.questions} onSubmit={submitPracticeQuiz} submitting={submitting} />
      ) : null}

      {!loading && flow && showEligibleSuccess ? (
        <section className="section-card" style={{ maxWidth: 1000 }}>
          <div className="section-title">
            <span>🎉</span>
            <span>
              Quiz requisiti completato: {quizOutcome === 'likely_eligible' ? 'probabilmente idoneo' : 'idoneo'}
            </span>
          </div>
          <p className="admin-item-sub" style={{ marginTop: 8 }}>
            {quizOutcome === 'likely_eligible'
              ? 'Il profilo risulta compatibile con i requisiti principali: prosegui con l’onboarding per la verifica documentale finale.'
              : 'Ottimo, possiedi i requisiti preliminari per questo bando. Puoi avviare subito la pratica online.'}
          </p>
          <div className="action-buttons" style={{ marginTop: 12 }}>
            <Link href={nextPath!} className="btn-action">
              Avvia la pratica Online con Bndo
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && flow && showReviewOutcome ? (
        <section className="section-card" style={{ maxWidth: 1000 }}>
          <div className="section-title">
            <span>🟡</span>
            <span>Esito da approfondire</span>
          </div>
          <p className="admin-item-sub" style={{ marginTop: 8 }}>
            Alcuni punti richiedono verifica consulenziale, ma puoi già procedere con l’onboarding documentale.
          </p>
          <div className="action-buttons" style={{ marginTop: 12 }}>
            <Link href={nextPath!} className="btn-action">
              Continua con onboarding
            </Link>
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="btn-action secondary">
              Parla con un consulente BNDO
            </a>
          </div>
        </section>
      ) : null}

      {!loading && flow && showNegativeOutcome ? (
        <section className="section-card" style={{ maxWidth: 1000 }}>
          <div className="section-title">
            <span>🔴</span>
            <span>Al momento non idoneo</span>
          </div>
          <p className="admin-item-sub" style={{ marginTop: 8 }}>
            Dalle risposte inserite non risultano i requisiti minimi per avviare la pratica online.
          </p>
          <div className="action-buttons" style={{ marginTop: 12 }}>
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="btn-action secondary">
              Parla con un consulente BNDO
            </a>
          </div>
        </section>
      ) : null}

      {!loading && flow && requirementsPreview.length > 0 ? (
        <section className="section-card" style={{ maxWidth: 1000 }}>
          <div className="section-title">
            <span>📎</span>
            <span>Checklist documentale iniziale</span>
          </div>
          <ul className="admin-checklist" style={{ marginTop: 10 }}>
            {requirementsPreview.map((requirement) => (
              <li key={requirement.requirementKey} className="admin-checklist-item is-missing">
                <span className="admin-check is-missing" aria-hidden="true" />
                <span>{requirement.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
