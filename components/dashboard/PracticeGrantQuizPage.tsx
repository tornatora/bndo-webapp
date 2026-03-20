'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { practiceTypeFromGrantSlug } from '@/lib/bandi';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';

import type { PracticeQuizQuestion } from '@/components/dashboard/PracticeEligibilityQuiz';

type PracticeEligibility = 'eligible' | 'not_eligible' | 'needs_review';
type SourceChannel = 'scanner' | 'chat' | 'direct' | 'admin';
type AnswerValue = string | number | boolean | null;

type PracticeFlowState = {
  applicationId: string;
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

const SOURCE_BACK_PATH: Record<SourceChannel, string> = {
  scanner: '/dashboard/new-practice?mode=scanner',
  chat: '/dashboard/new-practice?mode=chat',
  direct: '/dashboard/new-practice',
  admin: '/dashboard/new-practice'
};

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const values = [record.error, record.message, record.detail];
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function buildOnboardingHref(args: {
  flow: PracticeFlowState;
  submissionId: string | null;
  nextPath: string | null;
}) {
  const knownPracticeType = practiceTypeFromGrantSlug(args.flow.grantSlug);
  if (knownPracticeType) {
    const query = new URLSearchParams();
    query.set('practice', knownPracticeType);
    query.set('skip_payment', '1');
    query.set('preview_step', '2');
    if (args.submissionId) query.set('quiz', args.submissionId);
    return `/onboarding?${query.toString()}`;
  }

  return args.nextPath ?? `/dashboard/practices/${args.flow.applicationId}?docs=missing`;
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
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentStep, setCurrentStep] = useState(0);

  const [flow, setFlow] = useState<PracticeFlowState | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<LatestSubmission | null>(null);
  const [outcome, setOutcome] = useState<PracticeEligibility | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [blockedFromStep, setBlockedFromStep] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    setFormError(null);
    setFlow(null);
    setLatestSubmission(null);
    setOutcome(null);
    setNextPath(null);
    setShowConfetti(false);

    (async () => {
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
        if (aborted) return;

        const loadedFlow = payload.flow ?? null;
        const loadedLatest = payload.latestSubmission ?? null;
        setFlow(loadedFlow);
        setLatestSubmission(loadedLatest);
        setOutcome(loadedLatest?.eligibility ?? null);

        if (loadedFlow && loadedLatest?.eligibility === 'eligible') {
          setNextPath(`/dashboard/practices/${loadedFlow.applicationId}?docs=missing`);
          setShowConfetti(true);
        }
      } catch (fetchError) {
        if (aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Errore caricamento quiz.');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [grantId, sourceChannel]);

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

  const progress = flow?.questions.length ? Math.round(((currentStep) / flow.questions.length) * 100) : 0;

  const backPath = SOURCE_BACK_PATH[sourceChannel];
  const successPath = flow
    ? buildOnboardingHref({
        flow,
        submissionId: latestSubmission?.id ?? null,
        nextPath
      })
    : '/dashboard/new-practice';

  async function submitQuiz(event?: React.FormEvent<HTMLFormElement>, overrideAnswers?: Record<string, unknown>) {
    if (event) event.preventDefault();
    if (!flow) return;
    
    const finalAnswers = overrideAnswers ?? answers;

    const missingQuestion = flow.questions
      .filter((question) => question.isRequired)
      .find((question) => {
        const value = finalAnswers[question.questionKey];
        return value === undefined || value === null || value === '';
      });

    if (missingQuestion) {
      setFormError(`Completa il campo obbligatorio: ${missingQuestion.label}`);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setError(null);

    try {
      const response = await fetch(`/api/practices/flow/${encodeURIComponent(flow.applicationId)}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        submissionId?: string;
        eligibility?: PracticeEligibility;
        nextPath?: string | null;
      };
      if (!response.ok) {
        throw new Error(readError(payload, 'Impossibile completare il quiz requisiti.'));
      }

      const eligibility = payload.eligibility ?? null;
      setOutcome(eligibility);
      setLatestSubmission(
        payload.submissionId && eligibility
          ? {
              id: payload.submissionId,
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
      setError(submitError instanceof Error ? submitError.message : 'Errore durante il salvataggio del quiz.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="quiz-page">
      <div className="container" style={{ maxWidth: 980 }}>
        <div className="top-links">
          <Link href={backPath}>← Torna ai risultati</Link>
          <span style={{ color: '#64748B', fontWeight: 600 }}>Quiz verifica requisiti</span>
        </div>

        {flow && !outcome ? (
          <div className="progress-bar" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        ) : null}

        {loading ? <p className="subtitle">Sto preparando il quiz del bando selezionato...</p> : null}
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

            {(() => {
              const question = flow.questions[currentStep];
              if (!question) return null;

              const value = answers[question.questionKey];
              const options =
                question.questionType === 'boolean' && question.options.length === 0
                  ? [
                      { value: 'yes', label: 'Sì' },
                      { value: 'no', label: 'No' }
                    ]
                  : question.options;

              const handleNextStep = () => {
                if (question.isRequired && (value === undefined || value === null || value === '')) {
                  setFormError(`Completa il campo obbligatorio: ${question.label}`);
                  return;
                }
                setFormError(null);
                setCurrentStep((prev) => prev + 1);
              };

              return (
                <div key={question.questionKey} className="input-group">
                  <div className="question">
                    {currentStep + 1}. {question.label}
                    {question.isRequired ? ' *' : ''}
                  </div>
                  {question.description ? <div className="subtitle" style={{ marginBottom: 10 }}>{question.description}</div> : null}
                  {question.reasoning ? (
                    <div style={{ fontSize: '13px', color: '#0369A1', backgroundColor: '#F0F9FF', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', borderLeft: '4px solid #0EA5E9' }}>
                      <strong>ℹ️ Perché è importante:</strong> {question.reasoning}
                    </div>
                  ) : null}

                  {(question.questionType === 'single_select' || question.questionType === 'boolean') && (
                    <div>
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={value === option.value ? 'option selected' : 'option'}
                          onClick={() => {
                            const newAnswers = {
                              ...answers,
                              [question.questionKey]: option.value
                            };
                            setAnswers(newAnswers);
                            setFormError(null);
                            
                            const rule = (question as any).rule;
                            if (rule?.kind === 'critical_boolean' && option.value !== rule?.expected) {
                              setBlockedFromStep(currentStep);
                              setOutcome('not_eligible');
                              return;
                            }

                            if (currentStep < flow.questions.length - 1) {
                              setTimeout(() => setCurrentStep((prev) => prev + 1), 350);
                            }
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
                      <button type="button" className="btn-back" onClick={() => setCurrentStep((prev) => prev - 1)}>
                        Indietro
                      </button>
                    ) : (
                      <Link className="btn-back" href={backPath}>
                        Indietro
                      </Link>
                    )}

                    {currentStep < flow.questions.length - 1 ? (
                      <button type="button" className="btn-next" onClick={handleNextStep}>
                        Continua
                      </button>
                    ) : (
                      <button className="btn-next" type="button" disabled={submitting} onClick={() => submitQuiz()}>
                        {submitting ? 'Verifica in corso...' : 'Verifica requisiti'}
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
            <div className="buttons" style={{ marginTop: '32px' }}>
              <Link className="btn-next" href={successPath}>
                Avvia la pratica Online con Bndo
              </Link>
            </div>
          </div>
        ) : null}



        {!loading && flow && outcome === 'needs_review' ? (
          <div className="final-page">
            <div className="error-icon" style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}>ℹ️</div>
            <h2>Esito da approfondire</h2>
            <p>Alcuni requisiti richiedono una verifica umana prima di procedere.</p>
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
                onClick={() => window.open(SUPPORT_WHATSAPP_URL, '_blank')}
              >
                Chat con il consulente
              </button>
            </div>
          </div>
        ) : null}

        {!loading && flow && outcome === 'not_eligible' ? (
          <div className="final-page">
            <div className="error-icon" style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}>⚠️</div>
            <h2 style={{ textAlign: 'center' }}>Purtroppo non sei idoneo</h2>
            <p style={{ textAlign: 'center' }}>Con i dati inseriti non hai i requisiti per questo bando.</p>
            {blockedFromStep !== null && flow.questions[blockedFromStep]?.reasoning && (
              <div style={{ margin: '20px auto', maxWidth: '500px', padding: '15px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#991B1B', fontSize: '14px' }}>
                <strong>Motivo dell&apos;esclusione:</strong> {flow.questions[blockedFromStep].reasoning}
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
                  if (blockedFromStep !== null) {
                    setOutcome(null);
                    setCurrentStep(blockedFromStep);
                    setBlockedFromStep(null);
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

