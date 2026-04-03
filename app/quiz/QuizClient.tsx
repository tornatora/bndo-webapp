'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { APP_URL, MARKETING_URL } from '@/lib/site-urls';
import { getQuizQuestions } from '@/lib/quiz/quiz-map';
import { SUPPORT_WHATSAPP_URL, buildEligibleQuizWhatsAppUrl } from '@/lib/support';
import './quiz.css';

type StepId =
  | 'intro'
  | 'q1'
  | 'q1b'
  | 'q2'
  | 'q2_contact'
  | 'q3'
  | 'q4'
  | 'q4b'
  | 'q5'
  | 'q5b'
  | 'q5c'
  | 'q6'
  | 'q6b'
  | 'q7'
  | 'q8'
  | 'q8b'
  | 'q9'
  | 'q10'
  | 'q11'
  | 'q11b'
  | 'q12'
  | 'blocked'
  | 'success';

const southRegions = ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Molise', 'Puglia', 'Sardegna', 'Sicilia'];

type ContactData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const defaultContact: ContactData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: ''
};

const progressMap: Record<StepId, number> = {
  intro: 0,
  q1: 1,
  q1b: 1,
  q2: 2,
  q2_contact: 3,
  q3: 4,
  q4: 5,
  q4b: 5,
  q5: 6,
  q5b: 6,
  q5c: 6,
  q6: 7,
  q6b: 7,
  q7: 8,
  q8: 9,
  q8b: 9,
  q9: 10,
  q10: 11,
  q11: 12,
  q11b: 13,
  q12: 13,
  blocked: 13,
  success: 13
};

function OptionButton({
  text,
  value,
  onPick
}: {
  text: string;
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <button type="button" onClick={() => onPick(value)} className="option">
      <div className="option-content">{text}</div>
    </button>
  );
}

export default function QuizPage() {
  const [step, setStep] = useState<StepId>('intro');
  const [, setHistory] = useState<StepId[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState<ContactData>(defaultContact);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentDataProcessing, setConsentDataProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [latestSubmissionId, setLatestSubmissionId] = useState<string | null>(null);
  const [blockedFromStep, setBlockedFromStep] = useState<StepId | null>(null);
  const [pendingEarlyBlock, setPendingEarlyBlock] = useState<StepId | null>(null);
  const [lastSavedNonEligibleStep, setLastSavedNonEligibleStep] = useState<StepId | null>(null);

  const progress = Math.round((progressMap[step] / 13) * 100);
  const region = answers.q3 ?? null;
  const bandoType = region ? (southRegions.includes(region) ? 'sud' : 'centro_nord') : null;
  const isSouth = bandoType === 'sud';

  const questions = useMemo(() => getQuizQuestions(bandoType), [bandoType]);
  const questionById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const q = (id: string) => questionById.get(id);

  useEffect(() => {
    if (step !== 'intro') return;
    const timer = setTimeout(() => {
      setStep('q1');
    }, 2500);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (step !== 'q1') return;
    const tracker = (window as Window & { bndoTrackEvent?: (eventType: string, payload?: Record<string, unknown>) => void }).bndoTrackEvent;
    tracker?.('quiz_started', {
      pagePath: '/quiz',
      channel: 'quiz_public',
    });
  }, [step]);

  useEffect(() => {
    if (step !== 'success') return;

    let animationId: number | null = null;
    let cancelled = false;
    let canvasEl: HTMLCanvasElement | null = null;

    const timer = window.setTimeout(async () => {
      const confettiModule = await import('canvas-confetti');
      if (cancelled) return;

      // Create a dedicated canvas to avoid CSP blob-worker issues
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

      const duration = 3000;
      const end = Date.now() + duration;

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
        } else {
          // Clean up canvas after animation ends
          setTimeout(() => {
            if (canvasEl && canvasEl.parentNode) {
              canvasEl.parentNode.removeChild(canvasEl);
            }
          }, 2000);
        }
      };

      burst();
    }, 300);

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
  }, [step]);

  function goTo(next: StepId) {
    setHistory((previous) => (step === 'intro' || step === 'blocked' || step === 'success' ? previous : [...previous, step]));
    setStep(next);
  }

  function goBack() {
    setHistory((previous) => {
      if (previous.length === 0) {
        setStep('q1');
        return previous;
      }

      const copy = [...previous];
      const last = copy.pop();
      if (last) setStep(last);
      return copy;
    });
  }

  function showBlocked(fromStep: StepId) {
    setBlockedFromStep(fromStep);
    setPendingEarlyBlock(null);
    setStep('blocked');
    void persistNotEligible(fromStep);
  }

  function handleAnswer(questionId: string, value: string) {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));

    if (questionId === 'q1') {
      if (value === 'A') {
        setPendingEarlyBlock('q1');
        return goTo('q2');
      }
      if (value === 'B') return goTo('q2');
      return goTo('q1b');
    }
    if (questionId === 'q1b') {
      if (value === 'A') return goTo('q2');
      setPendingEarlyBlock('q1b');
      return goTo('q2');
    }
    if (questionId === 'q2') {
      if (value === 'D') {
        setPendingEarlyBlock('q2');
      }
      return goTo('q2_contact');
    }
    if (questionId === 'q4') {
      return value === 'A' ? goTo('q5') : goTo('q4b');
    }
    if (questionId === 'q4b') {
      return value === 'A' ? goTo('q5') : showBlocked('q4b');
    }
    if (questionId === 'q5') {
      if (['A', 'B', 'C', 'D'].includes(value)) return goTo('q6');
      if (value === 'E' || value === 'G') return goTo('q5b');
      return goTo('q5c');
    }
    if (questionId === 'q5b') {
      return value === 'A' ? goTo('q6') : showBlocked('q5b');
    }
    if (questionId === 'q5c') {
      return value === 'A' ? goTo('q6') : showBlocked('q5c');
    }
    if (questionId === 'q6') {
      return value === 'A' || value === 'B' ? goTo('q7') : goTo('q6b');
    }
    if (questionId === 'q6b') {
      return value === 'A' ? goTo('q7') : showBlocked('q6b');
    }
    if (questionId === 'q7') {
      return value === 'A' || value === 'C' ? goTo('q9') : goTo('q8');
    }
    if (questionId === 'q8') {
      return value === 'A' ? goTo('q9') : goTo('q8b');
    }
    if (questionId === 'q8b') {
      return value === 'A' ? goTo('q9') : showBlocked('q8b');
    }
    if (questionId === 'q9') {
      return value === 'A' || value === 'B' ? goTo('q10') : showBlocked('q9');
    }
    if (questionId === 'q10') {
      return goTo('q11');
    }
    if (questionId === 'q11') {
      return value === 'A' ? showBlocked('q11') : goTo('q11b');
    }
    if (questionId === 'q11b') {
      return value === 'C' ? showBlocked('q11b') : goTo('q12');
    }
  }

  function handleRegionNext() {
    if (!answers.q3) return;
    goTo('q4');
  }

  function hasValidLeadData() {
    if (!contact.firstName || !contact.lastName || !contact.email || !contact.phone) {
      setSubmissionError('Compila tutti i campi obbligatori.');
      return false;
    }
    if (!consentPrivacy || !consentTerms || !consentDataProcessing) {
      setSubmissionError('Devi accettare i consensi obbligatori per procedere.');
      return false;
    }
    return true;
  }

  function resolveBandoTypeForSubmission() {
    return bandoType ?? 'centro_nord';
  }

  async function postQuizSubmission(
    eligibility: 'eligible' | 'not_eligible',
    extraAnswers?: Record<string, string>
  ) {
    const response = await fetch('/api/quiz/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        region,
        bandoType: resolveBandoTypeForSubmission(),
        eligibility,
        answers: {
          ...answers,
          ...(extraAnswers ?? {})
        },
        consentPrivacy,
        consentTerms,
        consentDataProcessing
      })
    });

    const payload = (await response.json().catch(() => null)) as { error?: string; submissionId?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? 'Salvataggio non riuscito.');
    }
    return payload?.submissionId ?? null;
  }

  async function persistNotEligible(blockStep: StepId) {
    if (lastSavedNonEligibleStep === blockStep) return;
    if (!hasValidLeadData()) return;
    try {
      const blockedQuestion = q(blockStep)?.title ?? blockStep;
      await postQuizSubmission('not_eligible', {
        _blocked_from_step: blockStep,
        _blocked_question: blockedQuestion,
        _captured_after_question: 'q2'
      });
      setLastSavedNonEligibleStep(blockStep);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Errore invio quiz.');
    }
  }

  async function submitQuiz() {
    setSubmissionError(null);

    if (!hasValidLeadData()) {
      return;
    }

    setSubmitting(true);

    try {
      const submissionId = await postQuizSubmission('eligible');
      setLatestSubmissionId(submissionId);
      setBlockedFromStep(null);
      setPendingEarlyBlock(null);
      setStep('success');
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Errore invio quiz.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleLeadGateNext() {
    setSubmissionError(null);
    if (!hasValidLeadData()) return;
    if (pendingEarlyBlock) {
      const stopAt = pendingEarlyBlock;
      setPendingEarlyBlock(null);
      showBlocked(stopAt);
      return;
    }
    goTo('q3');
  }

  function goToPracticePayment() {
    const practiceType = isSouth ? 'resto_sud_2_0' : 'autoimpiego_centro_nord';
    if (!latestSubmissionId) {
      setSubmissionError('Errore sessione quiz. Riprova l’invio del quiz per procedere al pagamento.');
      return;
    }
    setSubmissionError(null);
    const query = new URLSearchParams();
    query.set('practice', practiceType);
    query.set('quiz', latestSubmissionId);
    query.set('skip_payment', '1');
    query.set('onboarding_mode', 'dashboard_client');
    window.location.href = `/onboarding?${query.toString()}`;
  }

  function openConsultantChat() {
    const practiceType = isSouth ? 'resto_sud_2_0' : 'autoimpiego_centro_nord';
    const whatsappUrl = buildEligibleQuizWhatsAppUrl(practiceType);
    window.open(whatsappUrl, '_blank');
  }

  return (
    <main className="quiz-page">
      <section className={`container ${step === 'intro' ? 'intro-container' : ''}`}>
        {step !== 'intro' ? (
          <>
            <div className="top-links">
              <Link href={MARKETING_URL}>Torna al sito</Link>
              {step !== 'success' && <Link href={`${APP_URL}/login`}>Area clienti</Link>}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : null}

        {step === 'intro' ? (
          <div className="intro-page">
            <div className="hero-text">
              <span className="word word-1">Verifica</span>{' '}
              <span className="word word-2">in</span>{' '}
              <span className="word word-3">
                <span className="highlight">2 minuti</span>
              </span>{' '}
              <span className="word word-4">se</span>{' '}
              <span className="word word-5">puoi</span>{' '}
              <span className="word word-6">accedere</span>{' '}
              <span className="word word-7">a</span>{' '}
              <span className="word word-8">
                <span className="highlight">Resto al Sud 2.0</span>
              </span>{' '}
              <span className="word word-9">e</span>{' '}
              <span className="word word-10">
                <span className="highlight">Autoimpiego</span>
              </span>{' '}
              <span className="word word-11">
                <span className="highlight">Centro-Nord</span>
              </span>
            </div>
            <div className="loader-container">
              <div className="loader-bar">
                <div className="loader-fill" />
              </div>
            </div>
          </div>
        ) : null}

        {step === 'q1' ? (
          <div>
            <div className="tag">Domanda 1 di 13</div>
            <h1>Requisiti Bandi Invitalia</h1>
            <p className="subtitle">Iniziamo con le informazioni di base</p>
            <div className="question">{q('q1')?.title ?? 'Quanti anni hai?'}</div>
            <div className="input-group">
              {(q('q1')?.options ?? []).map((opt) => (
                <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q1', value)} />
              ))}
            </div>
          </div>
        ) : null}

        {step === 'q1b' ? (
          <QuestionLayout
            title={q('q1b')?.title ?? 'Puoi costituire una societa con un socio 18-34 anni al 51%?'}
            subtitle="Domanda 1-B"
          >
            {(q('q1b')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q1b', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q2' ? (
          <QuestionLayout title={q('q2')?.title ?? 'Qual e la tua cittadinanza?'} subtitle="Domanda 2 di 13">
            {(q('q2')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q2', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q2_contact' ? (
          <QuestionLayout title="Inserisci i tuoi dati per continuare" subtitle="Passaggio obbligatorio">
            <div className="quiz-warning-banner">
              <div className="quiz-warning-icon">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="quiz-warning-text">
                Non fare il furbo, se non inserisci i tuoi dati correttamente, non riusciremo a contattarti in caso di esito positivo.
              </div>
            </div>
            <div className="input-group">
              <input
                placeholder="Nome *"
                value={contact.firstName}
                onChange={(event) => setContact((previous) => ({ ...previous, firstName: event.target.value }))}
              />
            </div>
            <div className="input-group">
              <input
                placeholder="Cognome *"
                value={contact.lastName}
                onChange={(event) => setContact((previous) => ({ ...previous, lastName: event.target.value }))}
              />
            </div>
            <div className="input-group">
              <input
                type="email"
                placeholder="Email *"
                value={contact.email}
                onChange={(event) => setContact((previous) => ({ ...previous, email: event.target.value }))}
              />
            </div>
            <div className="input-group">
              <input
                placeholder="Telefono *"
                value={contact.phone}
                onChange={(event) => setContact((previous) => ({ ...previous, phone: event.target.value }))}
              />
            </div>

            <div className="quiz-consents">
              <div className="quiz-consents-title">Consensi obbligatori</div>
              <label className="quiz-consent-row">
                <input type="checkbox" checked={consentPrivacy} onChange={(e) => setConsentPrivacy(e.target.checked)} />
                <span>
                  Ho letto e accetto la <Link href="/privacy">Privacy Policy</Link>.
                </span>
              </label>
              <label className="quiz-consent-row">
                <input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)} />
                <span>
                  Accetto i <Link href="/termini">Termini e Condizioni</Link>.
                </span>
              </label>
              <label className="quiz-consent-row">
                <input
                  type="checkbox"
                  checked={consentDataProcessing}
                  onChange={(e) => setConsentDataProcessing(e.target.checked)}
                />
                <span>Acconsento al trattamento dei dati per la verifica requisiti e per essere ricontattato.</span>
              </label>
            </div>

            <div className="buttons">
              <button type="button" className="btn-back" onClick={goBack}>
                Indietro
              </button>
              <button type="button" className="btn-next" onClick={handleLeadGateNext}>
                Continua quiz
              </button>
            </div>
            {submissionError ? <p className="error-text">{submissionError}</p> : null}
          </QuestionLayout>
        ) : null}

        {step === 'q3' ? (
          <QuestionLayout title={q('q3')?.title ?? "In quale regione aprirai l'attivita?"} subtitle="Domanda 3 di 13">
            <select value={answers.q3 ?? ''} onChange={(event) => setAnswers((previous) => ({ ...previous, q3: event.target.value }))}>
              <option value="">Seleziona una regione...</option>
              {[
                'Abruzzo',
                'Basilicata',
                'Calabria',
                'Campania',
                'Molise',
                'Puglia',
                'Sardegna',
                'Sicilia',
                'Emilia-Romagna',
                'Friuli-Venezia Giulia',
                'Lazio',
                'Liguria',
                'Lombardia',
                'Marche',
                'Piemonte',
                'Toscana',
                'Trentino-Alto Adige',
                'Umbria',
                "Valle d'Aosta",
                'Veneto'
              ].map((regionOption) => (
                <option key={regionOption} value={regionOption}>
                  {regionOption}
                </option>
              ))}
            </select>
            <div className="buttons">
              <button type="button" className="btn-back" onClick={goBack}>
                Indietro
              </button>
              <button type="button" className="btn-next" onClick={handleRegionNext} disabled={!answers.q3}>
                Avanti
              </button>
            </div>
          </QuestionLayout>
        ) : null}

        {step === 'q4' ? (
          <QuestionLayout
            title={q('q4')?.title ?? "Sei residente nella regione in cui aprirai l'attivita?"}
            subtitle="Domanda 4 di 13"
          >
            {(q('q4')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q4', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q4b' ? (
          <QuestionLayout
            title={q('q4b')?.title ?? "Sei disposto a trasferire la residenza prima dell'erogazione?"}
            subtitle="Domanda 4-B"
          >
            {(q('q4b')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q4b', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q5' ? (
          <QuestionLayout title={q('q5')?.title ?? 'Qual e la tua situazione lavorativa attuale?'} subtitle="Domanda 5 di 13">
            {(q('q5')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q5', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q5b' ? (
          <QuestionLayout
            title={q('q5b')?.title ?? "Sei disposto a chiudere P.IVA o contratto prima dell'erogazione?"}
            subtitle="Domanda 5-B"
          >
            {(q('q5b')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q5b', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q5c' ? (
          <QuestionLayout title={q('q5c')?.title ?? "Sei disposto a dimetterti prima dell'erogazione?"} subtitle="Domanda 5-C">
            {(q('q5c')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q5c', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q6' ? (
          <QuestionLayout title={q('q6')?.title ?? 'Hai una Partita IVA attiva o chiusa di recente?'} subtitle="Domanda 6 di 13">
            {(q('q6')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q6', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q6b' ? (
          <QuestionLayout
            title={q('q6b')?.title ?? 'La nuova attivita ha progetto diverso o primi 3 numeri ATECO diversi?'}
            subtitle="Domanda 6-B"
          >
            {(q('q6b')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q6b', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q7' ? (
          <QuestionLayout title={q('q7')?.title ?? "Come intendi avviare l'attivita?"} subtitle="Domanda 7 di 13">
            {(q('q7')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q7', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q8' ? (
          <QuestionLayout title={q('q8')?.title ?? 'Sono presenti soci con 35 anni o piu?'} subtitle="Domanda 8 di 13">
            {(q('q8')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q8', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q8b' ? (
          <QuestionLayout title={q('q8b')?.title ?? 'Il socio 18-34 anni deterra almeno il 51%?'} subtitle="Domanda 8-B">
            {(q('q8b')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q8b', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q9' ? (
          <QuestionLayout title={q('q9')?.title ?? "Qual e lo stato dell'attivita?"} subtitle="Domanda 9 di 13">
            {(q('q9')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q9', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q10' ? (
          <QuestionLayout title={q('q10')?.title ?? "Qual e l'investimento complessivo previsto?"} subtitle="Domanda 10 di 13">
            {(q('q10')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q10', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q11' ? (
          <QuestionLayout title={q('q11')?.title ?? 'Quante risorse personali puoi dimostrare di avere disponibili?'} subtitle="Domanda 11 di 13">
            <p className="info-box">
              ⚠️ <strong>Attenzione:</strong> non dovrai spendere questo importo. E richiesto solo come titolo di garanzia
              (min. 10%) e potra essere svincolato dopo i pagamenti ai fornitori.
            </p>
            {(q('q11')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q11', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q11b' ? (
          <QuestionLayout
            title={q('q11b')?.title ?? "Hai un locale commerciale o un'abitazione accatastata uso ufficio?"}
            subtitle="Domanda 12 di 13"
          >
            <p className="info-box">
              ℹ️ Se non hai un locale ora, puoi comunque proseguire solo se ti impegni a individuarlo: servira contratto di
              affitto o comodato d&apos;uso.
            </p>
            {(q('q11b')?.options ?? []).map((opt) => (
              <OptionButton key={opt.value} text={opt.label} value={opt.value} onPick={(value) => handleAnswer('q11b', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q12' ? (
          <QuestionLayout title="Conferma finale e invio esito" subtitle="Domanda 13 di 13">
            <p className="info-box">
              Dati e consensi sono già stati acquisiti dopo la domanda 2. Conferma per ricevere l&apos;esito finale.
            </p>
            <div className="buttons">
              <button type="button" className="btn-back" onClick={goBack}>
                Indietro
              </button>
              <button type="button" className="btn-next" disabled={submitting} onClick={submitQuiz}>
                {submitting ? 'Invio...' : 'Conferma e invia'}
              </button>
            </div>
            {submissionError ? <p className="error-text">{submissionError}</p> : null}
          </QuestionLayout>
        ) : null}

        {step === 'blocked' ? (
          <div className="final-page">
            <div className="error-icon">⚠️</div>
            <h2>Purtroppo non sei idoneo</h2>
            <p>Con i dati inseriti non hai i requisiti per questi bandi Invitalia.</p>
            {blockedFromStep ? (
              <p className="info-box">
                Domanda bloccante: <strong>{q(blockedFromStep)?.title ?? blockedFromStep}</strong> in quanto con questa caratteristica non puoi partecipare al bando in questione.
              </p>
            ) : null}
            <p>
              <strong>Ma non preoccuparti!</strong> Contattaci per scoprire altre opportunita:
            </p>
            <div className="buttons">
              <button
                type="button"
                className="btn-back"
                onClick={() => {
                  if (blockedFromStep) {
                    setStep(blockedFromStep);
                    return;
                  }
                  goBack();
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

        {step === 'success' ? (
          <div className="success-page">
            <div className="success-icon">🎉</div>
            <h2>Complimenti! Hai tutti i requisiti!</h2>
            <p>In base alle risposte fornite possiedi i requisiti per presentare la domanda.</p>
            <div className="bando-name">{isSouth ? 'Resto al Sud 2.0' : 'Autoimpiego Centro-Nord'}</div>

            <div className="success-options">
              <div
                className="option-card"
                role="button"
                tabIndex={0}
                onClick={goToPracticePayment}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    goToPracticePayment();
                  }
                }}
              >
                <h3>
                  ⚡ Avvia la pratica Online con Bndo
                  <span className="badge badge-premium">Consigliato</span>
                </h3>
                <p>
                  Avvia subito la pratica online: un consulente BNDO ti guiderà in ogni passaggio operativo.
                </p>
                <button type="button" className="btn-premium">
                  Avvia la pratica online
                </button>
              </div>

              <div
                className="option-card"
                role="button"
                tabIndex={0}
                onClick={openConsultantChat}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openConsultantChat();
                  }
                }}
              >
                <h3>
                  💬 Chat con il consulente
                  <span className="badge badge-free">Gratuito</span>
                </h3>
                <p>Chatta con un consulente BNDO per chiarire dubbi e ricevere supporto immediato.</p>
                <button type="button" className="btn-chat">
                  Chatta con un consulente
                </button>
              </div>
            </div>

            {submissionError ? <p className="error-text">{submissionError}</p> : null}

            <div className="process-info">
              <h4>📋 Come funziona dopo l&apos;idoneità:</h4>
              <ol>
                <li>
                  <strong>Invio documenti:</strong> carichi i documenti richiesti per la pratica.
                </li>
                <li>
                  <strong>Verifica esperta:</strong> un consulente BNDO verifica con attenzione la documentazione.
                </li>
                <li>
                  <strong>Contatto consulenziale:</strong> se è tutto OK, un consulente specializzato ti contatterà per
                  spiegarti tutto il procedimento passo dopo passo.
                </li>
              </ol>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function QuestionLayout({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="tag">{subtitle}</div>
      <div className="question">{title}</div>
      <div className="input-group">{children}</div>
    </div>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <div className="buttons">
      <button type="button" className="btn-back" onClick={onBack}>
        Indietro
      </button>
    </div>
  );
}
