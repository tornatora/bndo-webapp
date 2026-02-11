'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './quiz.css';

declare global {
  interface Window {
    confetti?: (options: {
      particleCount: number;
      angle: number;
      spread: number;
      origin: { x: number };
      colors: string[];
    }) => void;
  }
}

type StepId =
  | 'intro'
  | 'q1'
  | 'q1b'
  | 'q2'
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
  q3: 3,
  q4: 4,
  q4b: 4,
  q5: 5,
  q5b: 5,
  q5c: 5,
  q6: 6,
  q6b: 6,
  q7: 7,
  q8: 8,
  q8b: 8,
  q9: 9,
  q10: 10,
  q11: 11,
  q12: 12,
  blocked: 12,
  success: 12
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
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const progress = Math.round((progressMap[step] / 12) * 100);
  const region = answers.q3 ?? null;
  const bandoType = region ? (southRegions.includes(region) ? 'sud' : 'centro_nord') : null;
  const isSouth = bandoType === 'sud';

  const investmentOptions = useMemo(
    () =>
      isSouth
        ? [
            { value: 'A', text: '0 - 50.000 EUR' },
            { value: 'B', text: '50.000 - 120.000 EUR' },
            { value: 'C', text: '120.000 - 200.000 EUR' }
          ]
        : [
            { value: 'A', text: '0 - 40.000 EUR' },
            { value: 'B', text: '40.000 - 120.000 EUR' },
            { value: 'C', text: '120.000 - 200.000 EUR' }
          ],
    [isSouth]
  );

  useEffect(() => {
    if (step !== 'intro') return;
    const timer = setTimeout(() => {
      setStep('q1');
    }, 2500);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step !== 'success') return;

    let animationId: number | null = null;
    const timer = window.setTimeout(() => {
      const duration = 3000;
      const end = Date.now() + duration;

      const burst = () => {
        window.confetti?.({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#22C55F', '#0B1136', '#FFF']
        });
        window.confetti?.({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#22C55F', '#0B1136', '#FFF']
        });

        if (Date.now() < end) {
          animationId = window.requestAnimationFrame(burst);
        }
      };

      burst();
    }, 300);

    return () => {
      window.clearTimeout(timer);
      if (animationId !== null) {
        window.cancelAnimationFrame(animationId);
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

  function handleAnswer(questionId: string, value: string) {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));

    if (questionId === 'q1') {
      if (value === 'A') return setStep('blocked');
      if (value === 'B') return goTo('q2');
      return goTo('q1b');
    }
    if (questionId === 'q1b') {
      return value === 'A' ? goTo('q2') : setStep('blocked');
    }
    if (questionId === 'q2') {
      return value === 'D' ? setStep('blocked') : goTo('q3');
    }
    if (questionId === 'q4') {
      return value === 'A' ? goTo('q5') : goTo('q4b');
    }
    if (questionId === 'q4b') {
      return value === 'A' ? goTo('q5') : setStep('blocked');
    }
    if (questionId === 'q5') {
      if (['A', 'B', 'C', 'D'].includes(value)) return goTo('q6');
      if (value === 'E' || value === 'G') return goTo('q5b');
      return goTo('q5c');
    }
    if (questionId === 'q5b') {
      return value === 'A' ? goTo('q6') : setStep('blocked');
    }
    if (questionId === 'q5c') {
      return value === 'A' ? goTo('q6') : setStep('blocked');
    }
    if (questionId === 'q6') {
      return value === 'A' || value === 'B' ? goTo('q7') : goTo('q6b');
    }
    if (questionId === 'q6b') {
      return value === 'A' ? goTo('q7') : setStep('blocked');
    }
    if (questionId === 'q7') {
      return value === 'A' || value === 'C' ? goTo('q9') : goTo('q8');
    }
    if (questionId === 'q8') {
      return value === 'A' ? goTo('q9') : goTo('q8b');
    }
    if (questionId === 'q8b') {
      return value === 'A' ? goTo('q9') : setStep('blocked');
    }
    if (questionId === 'q9') {
      return value === 'A' || value === 'B' ? goTo('q10') : setStep('blocked');
    }
    if (questionId === 'q10') {
      return goTo('q11');
    }
    if (questionId === 'q11') {
      return value === 'A' ? setStep('blocked') : goTo('q12');
    }
  }

  function handleRegionNext() {
    if (!answers.q3) return;
    goTo('q4');
  }

  async function submitQuiz() {
    setSubmissionError(null);

    if (!contact.firstName || !contact.lastName || !contact.email || !contact.phone) {
      setSubmissionError('Compila tutti i campi obbligatori.');
      return;
    }

    setSubmitting(true);

    try {
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
          bandoType,
          eligibility: 'eligible',
          answers
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Salvataggio non riuscito.');
      }

      setStep('success');
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Errore invio quiz.');
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setStep('q1');
    setHistory([]);
    setAnswers({});
    setContact(defaultContact);
    setSubmitting(false);
    setSubmissionError(null);
  }

  return (
    <main className="quiz-page">
      <Script
        src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"
        strategy="afterInteractive"
      />

      <section className={`container ${step === 'intro' ? 'intro-container' : ''}`}>
        {step !== 'intro' ? (
          <>
            <div className="top-links">
              <Link href="/">Torna al sito</Link>
              <Link href="/login">Area clienti</Link>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : null}

        {step === 'intro' ? (
          <div className="intro-page">
            <div className="hero-text">
              <span className="word word-1">Verifichiamo</span>{' '}
              <span className="word word-2">in</span>{' '}
              <span className="word word-3">tempo</span>{' '}
              <span className="word word-4">reale</span>{' '}
              <span className="word word-5">se</span>{' '}
              <span className="word word-6">hai</span>{' '}
              <span className="word word-7">i</span>{' '}
              <span className="word word-8 highlight">requisiti</span>{' '}
              <span className="word word-9">per</span>{' '}
              <span className="word word-10">accedere</span>{' '}
              <span className="word word-11">ai bandi</span>
            </div>
            <div className="loader-container">
              <div className="loader-bar">
                <div className="loader-fill" />
              </div>
            </div>
          </div>
        ) : null}

        {step === 'q1' ? (
          <QuestionLayout title="Quanti anni hai?" subtitle="Domanda 1 di 12">
            <OptionButton text="Meno di 18 anni" value="A" onPick={(value) => handleAnswer('q1', value)} />
            <OptionButton text="Tra 18 e 34 anni (inclusi)" value="B" onPick={(value) => handleAnswer('q1', value)} />
            <OptionButton text="35 anni o piu" value="C" onPick={(value) => handleAnswer('q1', value)} />
          </QuestionLayout>
        ) : null}

        {step === 'q1b' ? (
          <QuestionLayout title="Puoi costituire una societa con un socio 18-34 anni al 51%?" subtitle="Domanda 1-B">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q1b', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q1b', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q2' ? (
          <QuestionLayout title="Qual e la tua cittadinanza?" subtitle="Domanda 2 di 12">
            <OptionButton text="Italiana" value="A" onPick={(value) => handleAnswer('q2', value)} />
            <OptionButton text="UE" value="B" onPick={(value) => handleAnswer('q2', value)} />
            <OptionButton
              text="Extra UE con permesso di soggiorno valido"
              value="C"
              onPick={(value) => handleAnswer('q2', value)}
            />
            <OptionButton text="Extra UE senza permesso" value="D" onPick={(value) => handleAnswer('q2', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q3' ? (
          <QuestionLayout title="In quale regione aprirai l&apos;attivita?" subtitle="Domanda 3 di 12">
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
          <QuestionLayout title="Sei residente nella regione in cui aprirai l&apos;attivita?" subtitle="Domanda 4 di 12">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q4', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q4', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q4b' ? (
          <QuestionLayout title="Sei disposto a trasferire la residenza prima dell&apos;erogazione?" subtitle="Domanda 4-B">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q4b', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q4b', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q5' ? (
          <QuestionLayout title="Qual e la tua situazione lavorativa attuale?" subtitle="Domanda 5 di 12">
            <OptionButton text="Disoccupato" value="A" onPick={(value) => handleAnswer('q5', value)} />
            <OptionButton text="Inoccupato" value="B" onPick={(value) => handleAnswer('q5', value)} />
            <OptionButton text="Iscritto Programma GOL" value="C" onPick={(value) => handleAnswer('q5', value)} />
            <OptionButton text="Working poor" value="D" onPick={(value) => handleAnswer('q5', value)} />
            <OptionButton text="Lavoratore a tempo determinato" value="E" onPick={(value) => handleAnswer('q5', value)} />
            <OptionButton text="Lavoratore a tempo indeterminato" value="F" onPick={(value) => handleAnswer('q5', value)} />
            <OptionButton text="Libero professionista / Partita IVA" value="G" onPick={(value) => handleAnswer('q5', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q5b' ? (
          <QuestionLayout title="Sei disposto a chiudere P.IVA o contratto prima dell&apos;erogazione?" subtitle="Domanda 5-B">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q5b', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q5b', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q5c' ? (
          <QuestionLayout title="Sei disposto a dimetterti prima dell&apos;erogazione?" subtitle="Domanda 5-C">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q5c', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q5c', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q6' ? (
          <QuestionLayout title="Hai una Partita IVA attiva o chiusa di recente?" subtitle="Domanda 6 di 12">
            <OptionButton text="No, mai avuta" value="A" onPick={(value) => handleAnswer('q6', value)} />
            <OptionButton text="Si, ma e chiusa" value="B" onPick={(value) => handleAnswer('q6', value)} />
            <OptionButton text="Si, e attiva" value="C" onPick={(value) => handleAnswer('q6', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q6b' ? (
          <QuestionLayout
            title="La nuova attivita ha progetto diverso o primi 3 numeri ATECO diversi?"
            subtitle="Domanda 6-B"
          >
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q6b', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q6b', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q7' ? (
          <QuestionLayout title="Come intendi avviare l&apos;attivita?" subtitle="Domanda 7 di 12">
            <OptionButton text="Ditta individuale" value="A" onPick={(value) => handleAnswer('q7', value)} />
            <OptionButton text="Societa" value="B" onPick={(value) => handleAnswer('q7', value)} />
            <OptionButton text="Attivita professionale" value="C" onPick={(value) => handleAnswer('q7', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q8' ? (
          <QuestionLayout title="Sono presenti soci con 35 anni o piu?" subtitle="Domanda 8 di 12">
            <OptionButton text="No" value="A" onPick={(value) => handleAnswer('q8', value)} />
            <OptionButton text="Si" value="B" onPick={(value) => handleAnswer('q8', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q8b' ? (
          <QuestionLayout title="Il socio 18-34 anni deterra almeno il 51%?" subtitle="Domanda 8-B">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q8b', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q8b', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q9' ? (
          <QuestionLayout title="Qual e lo stato dell&apos;attivita?" subtitle="Domanda 9 di 12">
            <OptionButton text="Non ancora avviata" value="A" onPick={(value) => handleAnswer('q9', value)} />
            <OptionButton text="Avviata da meno di 1 mese" value="B" onPick={(value) => handleAnswer('q9', value)} />
            <OptionButton text="Avviata da piu di 1 mese" value="C" onPick={(value) => handleAnswer('q9', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q10' ? (
          <QuestionLayout title="Qual e l&apos;investimento complessivo previsto?" subtitle="Domanda 10 di 12">
            {investmentOptions.map((option) => (
              <OptionButton key={option.value} text={option.text} value={option.value} onPick={(value) => handleAnswer('q10', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q11' ? (
          <QuestionLayout title="Quante risorse personali puoi dimostrare di avere disponibili?" subtitle="Domanda 11 di 12">
            <p className="info-box">
              ⚠️ <strong>Attenzione:</strong> e una garanzia minima indicativa. Non dovrai spendere questo importo.
            </p>
            <OptionButton text="Meno del 10%" value="A" onPick={(value) => handleAnswer('q11', value)} />
            <OptionButton text="Circa il 10%" value="B" onPick={(value) => handleAnswer('q11', value)} />
            <OptionButton text="Oltre il 10%" value="C" onPick={(value) => handleAnswer('q11', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q12' ? (
          <QuestionLayout title="Inserisci i tuoi dati per finalizzare la verifica" subtitle="Domanda 12 di 12">
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

            <div className="buttons">
              <button type="button" className="btn-back" onClick={goBack}>
                Indietro
              </button>
              <button type="button" className="btn-next" disabled={submitting} onClick={submitQuiz}>
                {submitting ? 'Invio...' : 'Invia'}
              </button>
            </div>
            {submissionError ? <p className="error-text">{submissionError}</p> : null}
          </QuestionLayout>
        ) : null}

        {step === 'blocked' ? (
          <div className="final-page">
            <div className="error-icon">⚠️</div>
            <h2>Purtroppo non sei idoneo</h2>
            <p>Con i dati inseriti non hai i requisiti per questi bandi.</p>
            <div className="buttons">
              <button type="button" className="btn-back" onClick={restart}>
                Rifai il quiz
              </button>
              <a href="https://wa.me/393471234567" target="_blank" rel="noreferrer" className="btn-next">
                Contattaci
              </a>
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
              <div className="option-card">
                <h3>⚡ Accedi subito all&apos;area cliente</h3>
                <p>I tuoi dati sono stati salvati. Puoi continuare il processo operativo dalla dashboard.</p>
                <Link href="/login" className="btn-next" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
                  Vai al login
                </Link>
              </div>

              <div className="option-card">
                <h3>💬 Parla con un consulente</h3>
                <p>Se vuoi supporto immediato, contattaci su WhatsApp.</p>
                <a
                  href="https://wa.me/393471234567"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-back"
                  style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
                >
                  Apri chat WhatsApp
                </a>
              </div>
            </div>

            <div className="process-info">
              <h4>📋 Prossimi passi consigliati</h4>
              <ol>
                <li>Accedi all&apos;area cliente.</li>
                <li>Carica la documentazione richiesta.</li>
                <li>Coordina la pratica con il consulente dedicato via chat.</li>
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
