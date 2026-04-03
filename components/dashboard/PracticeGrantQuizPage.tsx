'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { practiceTypeFromGrantSlug } from '@/lib/bandi';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import '@/app/quiz/quiz.css';

import type { PracticeQuizQuestion } from '@/components/dashboard/PracticeEligibilityQuiz';

type PracticeEligibility = 'eligible' | 'not_eligible' | 'needs_review';
type SourceChannel = 'scanner' | 'chat' | 'direct' | 'admin';
type AnswerValue = string | number | boolean | null;

type PracticeFlowState = {
  applicationId: string;
  tenderId?: string;
  grantExternalId?: string;
  grantTitle: string;
  grantSlug: string;
  sourceChannel: SourceChannel;
  questions: PracticeQuizQuestion[];
};

type LatestSubmission = {
  id: string;
  eligibility: PracticeEligibility;
  completedAt?: string | null;
};

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOURCE_BACK_PATH: Record<SourceChannel, string> = {
  scanner: '/dashboard/new-practice?mode=scanner#scanner-results',
  chat: '/dashboard/new-practice?mode=chat',
  direct: '/dashboard/new-practice',
  admin: '/dashboard/new-practice'
};

function isPublicFlowApplicationId(applicationId: string) {
  return applicationId.startsWith('public-');
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function toBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const token = normalizeToken(value);
  if (!token) return null;
  if (['yes', 'si', 'true', '1', 'y', 'vero'].includes(token)) return true;
  if (['no', 'false', '0', 'n', 'falso'].includes(token)) return false;
  return null;
}

function parseExpectedChoiceSet(value: string | null | undefined) {
  const token = normalizeToken(value ?? '');
  if (!token) return new Set<string>();
  return new Set(
    token
      .split(/[|,]/g)
      .map((item) => normalizeToken(item))
      .filter(Boolean)
  );
}

function readRuleStrength(question: PracticeQuizQuestion): 'hard' | 'soft' {
  const metadata =
    question.metadata && typeof question.metadata === 'object'
      ? (question.metadata as Record<string, unknown>)
      : null;
  const token = normalizeToken(metadata?.ruleStrength ?? '');
  if (token === 'hard') return 'hard';
  if (token === 'soft') return 'soft';

  const ruleKind = normalizeToken((question as { rule?: { kind?: string } }).rule?.kind ?? '');
  if (['critical_boolean', 'choice_in_set', 'ateco_validation', 'geographic_validation'].includes(ruleKind)) {
    return 'hard';
  }
  return 'soft';
}

function isQuestionVisible(
  question: PracticeQuizQuestion,
  allQuestions: PracticeQuizQuestion[],
  answers: Record<string, AnswerValue>
) {
  const metadata =
    question.metadata && typeof question.metadata === 'object'
      ? (question.metadata as Record<string, unknown>)
      : null;
  const rawShowIf = metadata?.showIf;
  if (!rawShowIf || typeof rawShowIf !== 'object') return true;

  const showIf = rawShowIf as Record<string, unknown>;
  const questionKey = typeof showIf.questionKey === 'string' ? showIf.questionKey.trim() : '';
  if (!questionKey) return true;

  const parentQuestion = allQuestions.find((item) => item.questionKey === questionKey);
  if (!parentQuestion) return true;

  const rawAnswer = answers[questionKey];
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return false;

  const normalized = normalizeChoiceAgainstOptions(rawAnswer, parentQuestion.options ?? []);
  const equals = typeof showIf.equals === 'string' ? normalizeToken(showIf.equals) : '';
  const anyOf = Array.isArray(showIf.anyOf) ? showIf.anyOf.map((value) => normalizeToken(value)).filter(Boolean) : [];
  const noneOf = Array.isArray(showIf.noneOf)
    ? showIf.noneOf.map((value) => normalizeToken(value)).filter(Boolean)
    : [];

  if (equals && normalized !== equals) return false;
  if (anyOf.length > 0 && !anyOf.includes(normalized)) return false;
  if (noneOf.length > 0 && noneOf.includes(normalized)) return false;
  return true;
}

function normalizeChoiceAgainstOptions(
  value: unknown,
  options: Array<{ value: string; label: string }>
) {
  const token = normalizeToken(value);
  if (!token) return '';
  for (const option of options) {
    const optionValue = normalizeToken(option.value);
    const optionLabel = normalizeToken(option.label);
    if (token === optionValue || token === optionLabel) return optionValue || optionLabel || token;
  }
  return token;
}

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const values = [record.error, record.message, record.detail];
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function normalizeQuizErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const raw = error.message?.trim() || '';
    if (/failed to fetch/i.test(raw)) {
      return 'Connessione temporaneamente instabile durante il caricamento del quiz. Riprova tra pochi secondi.';
    }
    if (raw) return raw;
  }
  return fallback;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function buildOnboardingHref(args: {
  flow: PracticeFlowState;
  submissionId: string | null;
}) {
  const knownPracticeType = practiceTypeFromGrantSlug(args.flow.grantSlug) ?? 'generic';
  const query = new URLSearchParams();
  query.set('practice', knownPracticeType);
  if (!isPublicFlowApplicationId(args.flow.applicationId)) {
    query.set('applicationId', args.flow.applicationId);
  }
  query.set('skip_payment', '1');
  query.set('onboarding_mode', 'dashboard_client');
  if (args.submissionId) query.set('quiz', args.submissionId);
  if (args.flow.grantExternalId) query.set('grantId', args.flow.grantExternalId);
  if (args.flow.grantSlug) query.set('grantSlug', args.flow.grantSlug);
  query.set('source', args.flow.sourceChannel);
  return `/onboarding?${query.toString()}`;
}

export function PracticeGrantQuizPage({
  grantId,
  sourceChannel
}: {
  grantId: string;
  sourceChannel: SourceChannel;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewChatError, setReviewChatError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentStep, setCurrentStep] = useState(0);

  const [flow, setFlow] = useState<PracticeFlowState | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<LatestSubmission | null>(null);
  const [outcome, setOutcome] = useState<PracticeEligibility | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [reviewReasons, setReviewReasons] = useState<string[]>([]);
  const [blockedQuestionKey, setBlockedQuestionKey] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [contactingConsultant, setContactingConsultant] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'initial' | 'analysis' | 'finalizing'>('initial');
  const submitLockRef = useRef(false);
  const advanceTimerRef = useRef<number | null>(null);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const forceTopPosition = () => {
      const pane = document.querySelector('.mainpane');
      if (pane instanceof HTMLElement) {
        pane.scrollTop = 0;
        pane.scrollTo({ top: 0, behavior: 'auto' });
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    };

    forceTopPosition();
    const raf = window.requestAnimationFrame(forceTopPosition);
    const timeoutId = window.setTimeout(forceTopPosition, 140);

    return () => {
      clearAdvanceTimer();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
    };
  }, [grantId, sourceChannel, clearAdvanceTimer]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setLoadingStage('initial');
    setError(null);
    setFormError(null);
    setReviewChatError(null);
    setFlow(null);
    setLatestSubmission(null);
    setOutcome(null);
    setNextPath(null);
    setReviewReasons([]);
    setAnswers({});
    setCurrentStep(0);
    setBlockedQuestionKey(null);
    setShowConfetti(false);
    clearAdvanceTimer();

    (async () => {
      const attemptStartFlow = async () => {
        const maxAttempts = 4;
        const baseBackoffMs = 450;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const response = await fetch('/api/practices/flow/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                grantId,
                sourceChannel
              })
            });
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string;
              flow?: PracticeFlowState;
              latestSubmission?: LatestSubmission | null;
            };
            if (!response.ok) {
              throw new Error(readError(payload, 'Impossibile avviare il quiz requisiti.'));
            }
            return payload;
          } catch (error) {
            lastError = new Error(normalizeQuizErrorMessage(error, 'Errore caricamento quiz.'));
            if (attempt < maxAttempts) {
              const jitter = Math.floor(Math.random() * 220);
              const backoff = baseBackoffMs * attempt + jitter;
              await sleep(backoff);
              continue;
            }
            throw lastError;
          }
        }

        throw lastError ?? new Error('Errore caricamento quiz.');
      };

      try {
        const payload = await attemptStartFlow();
        if (aborted) return;

        const loadedFlow = payload.flow ?? null;
        const loadedLatest = payload.latestSubmission ?? null;
        setFlow(loadedFlow);
        // Richiesta prodotto: il quiz deve sempre ripartire dalle domande, senza mostrare l'esito precedente.
        void loadedLatest;
        setLatestSubmission(null);
        setOutcome(null);
        setNextPath(null);
      } catch (fetchError) {
        if (aborted) return;
        setError(normalizeQuizErrorMessage(fetchError, 'Errore caricamento quiz.'));
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
      clearAdvanceTimer();
    };
  }, [grantId, sourceChannel, clearAdvanceTimer]);

  useEffect(() => {
    if (!loading) {
      setLoadingStage('initial');
      return;
    }

    const analysisTimer = window.setTimeout(() => setLoadingStage('analysis'), 2200);
    const finalizeTimer = window.setTimeout(() => setLoadingStage('finalizing'), 7600);

    return () => {
      window.clearTimeout(analysisTimer);
      window.clearTimeout(finalizeTimer);
    };
  }, [loading]);

  useEffect(() => {
    if (!showConfetti) return;

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
  }, [showConfetti]);

  const visibleQuestions = useMemo(() => {
    if (!flow) return [] as PracticeQuizQuestion[];
    return flow.questions.filter((question) => isQuestionVisible(question, flow.questions, answers));
  }, [flow, answers]);
  const activeQuestion = visibleQuestions[currentStep] ?? null;

  useEffect(() => {
    setCurrentStep((previous) => {
      if (visibleQuestions.length === 0) return 0;
      return Math.min(previous, visibleQuestions.length - 1);
    });
  }, [visibleQuestions.length]);

  const progress = visibleQuestions.length
    ? Math.round((currentStep / visibleQuestions.length) * 100)
    : 0;

  const backPath = SOURCE_BACK_PATH[sourceChannel];
  const successPath = flow
    ? buildOnboardingHref({
        flow,
        submissionId: latestSubmission?.id ?? null
      })
    : '/dashboard/new-practice';

  async function submitQuiz(event?: React.FormEvent<HTMLFormElement>, overrideAnswers?: Record<string, unknown>) {
    if (event) event.preventDefault();
    if (!flow) return;
    if (submitLockRef.current) return;
    clearAdvanceTimer();
    
    const finalAnswers = overrideAnswers ?? answers;

    const missingQuestion = visibleQuestions
      .filter((question) => question.isRequired)
      .find((question) => {
        const value = finalAnswers[question.questionKey];
        return value === undefined || value === null || value === '';
      });

    if (missingQuestion) {
      const missingIndex = visibleQuestions.findIndex((question) => question.questionKey === missingQuestion.questionKey);
      if (missingIndex >= 0) {
        setCurrentStep(missingIndex);
      }
      setFormError(`Completa il campo obbligatorio: ${missingQuestion.label}`);
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setFormError(null);
    setReviewChatError(null);
    setError(null);

    try {
      const response = await fetch(`/api/practices/flow/${encodeURIComponent(flow.applicationId)}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: finalAnswers,
          questionKeys: visibleQuestions.map((question) => question.questionKey),
          questionSnapshot: visibleQuestions.map((question) => ({
            questionKey: question.questionKey,
            label: question.label,
            isRequired: Boolean(question.isRequired),
            questionType: question.questionType,
            options: question.options,
            validation: ((question as any).validation as Record<string, unknown> | undefined) ?? {},
            rule: ((question as any).rule as { kind?: string; expected?: string | null } | undefined) ?? {
              kind: 'none',
              expected: null
            },
            metadata: ((question as any).metadata as Record<string, unknown> | undefined) ?? {}
          }))
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        submissionId?: string;
        eligibility?: PracticeEligibility;
        nextPath?: string | null;
        reviewReasons?: string[];
      };
      if (!response.ok) {
        throw new Error(readError(payload, 'Impossibile completare il quiz requisiti.'));
      }

      const eligibility = payload.eligibility ?? null;
      const submissionId =
        typeof payload.submissionId === 'string' && UUID_LIKE.test(payload.submissionId)
          ? payload.submissionId
          : null;
      const normalizedReviewReasons = Array.isArray(payload.reviewReasons)
        ? Array.from(
            new Set(
              payload.reviewReasons
                .map((item) => String(item ?? '').trim())
                .filter(Boolean)
                .filter((reason) => !/^risposta mancante\s*:/i.test(reason))
            )
          )
        : [];
      setOutcome(eligibility);
      setReviewReasons(normalizedReviewReasons);
      setLatestSubmission(
        submissionId && eligibility
          ? {
              id: submissionId,
              eligibility,
              completedAt: new Date().toISOString()
            }
          : null
      );

      if (eligibility === 'eligible') {
        setNextPath(payload.nextPath ?? `/dashboard/practices/${flow.applicationId}?docs=missing`);
        setShowConfetti(true);
      } else {
        setNextPath(null);
      }
    } catch (submitError) {
      setError(normalizeQuizErrorMessage(submitError, 'Errore durante il salvataggio del quiz.'));
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  async function openDashboardConsultantChat() {
    if (!flow || contactingConsultant) return;
    setContactingConsultant(true);
    setReviewChatError(null);

    try {
      const syncResponse = await fetch('/api/chat/sync', { cache: 'no-store' });
      const syncPayload = (await syncResponse.json().catch(() => ({}))) as {
        threadId?: string | null;
        error?: string;
      };

      if (!syncResponse.ok || !syncPayload.threadId) {
        throw new Error(readError(syncPayload, 'Impossibile aprire la chat dashboard.'));
      }

      const reasons = reviewReasons.length > 0 ? reviewReasons : ['Alcuni requisiti richiedono verifica umana.'];
      const rawBody = [
        'Richiesta approfondimento quiz requisiti.',
        `Bando: ${flow.grantTitle}.`,
        `Pratica: ${flow.applicationId}.`,
        'Motivi da approfondire:',
        ...reasons.map((reason, idx) => `${idx + 1}. ${reason}`),
        'Potete verificare e indicarmi come procedere?'
      ].join('\n');
      const body = rawBody.length > 1180 ? `${rawBody.slice(0, 1177)}...` : rawBody;

      const messageResponse = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: syncPayload.threadId,
          body
        })
      });
      const messagePayload = await messageResponse.json().catch(() => ({}));

      if (!messageResponse.ok) {
        throw new Error(readError(messagePayload, 'Messaggio non inviato in chat dashboard.'));
      }

      window.location.href = '/dashboard/messages';
    } catch (chatError) {
      setReviewChatError(chatError instanceof Error ? chatError.message : 'Errore apertura chat consulente.');
    } finally {
      setContactingConsultant(false);
    }
  }

  return (
    <div className="quiz-page">
      <div className="container">
        <div className="top-links">
          <Link href={backPath}>← Torna ai risultati</Link>
          <span className="quiz-top-label">Quiz verifica requisiti</span>
        </div>

        {flow && !outcome ? (
          <div className="progress-bar" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        ) : null}

        {loading ? (
          <section className="quiz-ai-loader" role="status" aria-live="polite">
            <div className="quiz-ai-loader-icon-wrap" aria-hidden="true">
              <Bot className="quiz-ai-loader-bot" size={24} />
            </div>
            <h2 className="quiz-ai-loader-title">L’AI sta generando la verifica requisiti</h2>
            <p className="quiz-ai-loader-subtitle">
              {loadingStage === 'initial'
                ? 'Sto preparando domande personalizzate per questo bando.'
                : loadingStage === 'analysis'
                  ? 'Sto analizzando i criteri ufficiali e i requisiti obbligatori.'
                  : 'Quasi pronto: controllo finale in corso.'}
            </p>
            <div className="quiz-ai-loader-track" aria-hidden="true">
              <span className="quiz-ai-loader-track-fill" />
            </div>
            <div className="quiz-ai-loader-status">
              <Loader2 size={14} />
              <span>Generazione quiz in corso</span>
            </div>
          </section>
        ) : null}
        {error ? (
          <div className="info-box" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Errore caricamento quiz</div>
            <div style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</div>
            <Link 
              href={backPath}
              style={{ 
                display: 'inline-block', 
                background: '#EF4444', 
                color: '#fff', 
                padding: '8px 16px', 
                borderRadius: '8px', 
                fontSize: '0.9rem', 
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              Torna ai risultati
            </Link>
          </div>
        ) : null}

        {!loading && flow && !outcome ? (
          <form onSubmit={submitQuiz}>
            <h1>{flow.grantTitle}</h1>
            <p className="subtitle">Rispondi alle domande per verificare l’idoneità prima dell’avvio pratica.</p>
            {activeQuestion?.reasoning ? (
              <div className="quiz-requirement-note">
                <span className="quiz-requirement-note-title">Nota requisito</span>
                <p>{activeQuestion.reasoning}</p>
              </div>
            ) : null}

            {(() => {
              const question = visibleQuestions[currentStep];
              if (!question) return null;

              const value = answers[question.questionKey];
              const isChoiceQuestion = question.questionType === 'single_select' || question.questionType === 'boolean';
              const isLastStep = currentStep >= visibleQuestions.length - 1;
              const ruleStrength = readRuleStrength(question);
              const options =
                question.questionType === 'boolean' && question.options.length === 0
                  ? [
                      { value: 'yes', label: 'Sì' },
                      { value: 'no', label: 'No' }
                    ]
                  : question.options;

              const handleNextStep = () => {
                clearAdvanceTimer();
                if (question.isRequired && (value === undefined || value === null || value === '')) {
                  setFormError(`Completa il campo obbligatorio: ${question.label}`);
                  return;
                }
                setFormError(null);
                if (isLastStep) {
                  void submitQuiz();
                  return;
                }
                setCurrentStep((prev) => prev + 1);
              };

              return (
                <div key={question.questionKey} className="input-group">
                  <div className="question">
                    {currentStep + 1}. {question.label}
                    {question.isRequired ? ' *' : ''}
                  </div>
                  {question.description ? <div className="subtitle" style={{ marginBottom: 10 }}>{question.description}</div> : null}
                  {(question.questionType === 'single_select' || question.questionType === 'boolean') && (
                    <div>
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={value === option.value ? 'option selected' : 'option'}
                          onClick={() => {
                            if (submitting || submitLockRef.current) return;
                            clearAdvanceTimer();
                            const newAnswers = {
                              ...answers,
                              [question.questionKey]: option.value
                            };
                            setAnswers(newAnswers);
                            setFormError(null);
                            
                            const rule = (question as any).rule;
                            if (
                              ruleStrength === 'hard' &&
                              rule?.kind === 'critical_boolean' &&
                              question.questionType === 'boolean'
                            ) {
                              const selected = toBooleanLike(option.value);
                              const expected = toBooleanLike(rule?.expected);
                              if (selected !== null && expected !== null && selected !== expected) {
                                setBlockedQuestionKey(question.questionKey);
                                setOutcome('not_eligible');
                                return;
                              }
                            }

                            if (ruleStrength === 'hard' && rule?.kind === 'choice_in_set') {
                              const selected = normalizeChoiceAgainstOptions(option.value, options);
                              const allowed = parseExpectedChoiceSet(
                                typeof rule?.expected === 'string' ? rule.expected : null
                              );
                              if (selected && allowed.size > 0 && !allowed.has(selected)) {
                                setBlockedQuestionKey(question.questionKey);
                                setOutcome('not_eligible');
                                return;
                              }
                            }

                            if (isLastStep) {
                              void submitQuiz(undefined, newAnswers);
                              return;
                            }

                            advanceTimerRef.current = window.setTimeout(() => {
                              setCurrentStep((prev) => {
                                return prev < visibleQuestions.length - 1 ? prev + 1 : prev;
                              });
                              advanceTimerRef.current = null;
                            }, 350);
                          }}
                        >
                          <div className="option-content">{option.label}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {question.questionType === 'number' ? (
                    <input
                      type="number"
                      value={typeof value === 'number' ? value : value ? Number(value) : ''}
                      onChange={(event) =>
                        setAnswers((previous) => ({
                          ...previous,
                          [question.questionKey]:
                            event.target.value.trim() === '' ? null : Number(event.target.value)
                        }))
                      }
                      placeholder="Inserisci importo"
                    />
                  ) : null}

                  {question.questionType === 'text' ? (
                    <input
                      type="text"
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        setAnswers((previous) => ({
                          ...previous,
                          [question.questionKey]: event.target.value
                        }))
                      }
                      placeholder="Aggiungi una nota"
                    />
                  ) : null}

                  {formError ? <div className="info-box" style={{ marginTop: 20 }}>{formError}</div> : null}

                  <div className="buttons" style={{ marginTop: 30 }}>
                    {currentStep > 0 ? (
                      <button
                        type="button"
                        className="btn-back"
                        onClick={() => {
                          clearAdvanceTimer();
                          setCurrentStep((prev) => prev - 1);
                        }}
                      >
                        Indietro
                      </button>
                    ) : (
                      <Link className="btn-back" href={backPath}>
                        Indietro
                      </Link>
                    )}

                    {currentStep < visibleQuestions.length - 1 ? (
                      <button type="button" className="btn-next" onClick={handleNextStep}>
                        Continua
                      </button>
                    ) : (
                      <button className="btn-next" type="button" disabled={submitting} onClick={handleNextStep}>
                        {submitting ? 'Verifica in corso...' : isChoiceQuestion ? 'Seleziona una risposta' : 'Continua'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </form>
        ) : null}

        {!loading && flow && outcome === 'eligible' ? (
          <div className="success-page">
            <div className="success-icon">🎉</div>
            <h1>Perfetto, sei idoneo</h1>
            <p className="subtitle">
              Il tuo profilo rispetta i requisiti base per procedere con il bando <strong>{flow.grantTitle}</strong>.
            </p>
            <div className="buttons buttons--eligible" style={{ marginTop: '32px' }}>
              <Link className="btn-next btn-next-eligible" href={successPath}>
                <span>Avvia la pratica con BNDO</span>
                <span className="btn-next-eligible-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ) : null}



        {!loading && flow && outcome === 'needs_review' ? (
          <div className="final-page">
            <div className="error-icon" style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}>ℹ️</div>
            <h2>Esito da approfondire</h2>
            <p>Alcuni requisiti richiedono una verifica umana prima di procedere.</p>
            {reviewReasons.length > 0 ? (
              <div className="quiz-outcome-reasons">
                <div className="quiz-outcome-reasons-title">Cosa va approfondito</div>
                <ol className="quiz-outcome-reasons-list">
                  {reviewReasons.map((reason, index) => (
                    <li key={`${index}-${reason}`}>{reason}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            <div className="buttons">
              <button
                type="button"
                className="btn-back"
                onClick={() => {
                  window.location.href = backPath;
                }}
              >
                Torna ai risultati
              </button>
              <button
                type="button"
                className="btn-next"
                disabled={contactingConsultant}
                onClick={() => {
                  void openDashboardConsultantChat();
                }}
              >
                {contactingConsultant ? 'Apro chat dashboard...' : 'Chat con il consulente'}
              </button>
            </div>
            {reviewChatError ? (
              <div className="quiz-chat-review-error">{reviewChatError}</div>
            ) : null}
          </div>
        ) : null}

        {!loading && flow && outcome === 'not_eligible' ? (
          <div className="final-page">
            <div className="error-icon" style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}>⚠️</div>
            <h2 style={{ textAlign: 'center' }}>Purtroppo non sei idoneo</h2>
            <p style={{ textAlign: 'center' }}>Con i dati inseriti non hai i requisiti per questo bando.</p>
            {blockedQuestionKey && flow.questions.find((question) => question.questionKey === blockedQuestionKey)?.reasoning && (
              <div className="quiz-outcome-exclusion">
                <strong>Motivo dell&apos;esclusione:</strong>{' '}
                {flow.questions.find((question) => question.questionKey === blockedQuestionKey)?.reasoning}
              </div>
            )}
            <p style={{ textAlign: 'center' }}>
              <strong>Ma non preoccuparti!</strong> Contattaci per scoprire altre opportunita:
            </p>
            <div className="buttons" style={{ marginTop: '30px' }}>
              <button
                type="button"
                className="btn-back"
                onClick={() => {
                  if (blockedQuestionKey) {
                    const retryIndex = visibleQuestions.findIndex(
                      (question) => question.questionKey === blockedQuestionKey
                    );
                    setOutcome(null);
                    setCurrentStep(retryIndex >= 0 ? retryIndex : 0);
                    setBlockedQuestionKey(null);
                  } else {
                    window.location.href = backPath;
                  }
                }}
              >
                Indietro
              </button>
              <button
                type="button"
                className="btn-next"
                onClick={() => window.open(SUPPORT_WHATSAPP_URL, '_blank')}
              >
                Contattaci
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
