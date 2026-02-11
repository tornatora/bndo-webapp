'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

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
    <button
      type="button"
      onClick={() => onPick(value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-brand.mint hover:bg-brand.mint/5"
    >
      {text}
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
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 sm:py-10">
      <section className="panel p-5 sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm font-semibold text-brand.steel">
            Torna al sito
          </Link>
          <Link href="/login" className="text-sm font-semibold text-brand.steel">
            Area clienti
          </Link>
        </div>

        {step !== 'intro' ? (
          <div className="mb-6">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand.mint transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Progress: {progress}%</p>
          </div>
        ) : null}

        {step === 'intro' ? (
          <div className="space-y-5 text-center">
            <p className="badge badge-new">Verifica requisiti in 2 minuti</p>
            <h1 className="text-3xl font-extrabold text-brand.navy sm:text-4xl">
              Scopri subito se puoi accedere ai bandi attivi.
            </h1>
            <p className="text-sm text-slate-600 sm:text-base">
              Ti faremo poche domande guidate e al termine salveremo il tuo esito per richiamarti con un consulente.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setStep('q1')}>
              Inizia verifica
            </button>
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
          <QuestionLayout title="In quale regione aprirai l'attivita?" subtitle="Domanda 3 di 12">
            <select
              className="input"
              value={answers.q3 ?? ''}
              onChange={(event) => setAnswers((previous) => ({ ...previous, q3: event.target.value }))}
            >
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
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-muted flex-1" onClick={goBack}>
                Indietro
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={handleRegionNext} disabled={!answers.q3}>
                Avanti
              </button>
            </div>
          </QuestionLayout>
        ) : null}

        {step === 'q4' ? (
          <QuestionLayout title="Sei residente nella regione in cui aprirai l'attivita?" subtitle="Domanda 4 di 12">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q4', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q4', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q4b' ? (
          <QuestionLayout title="Sei disposto a trasferire la residenza prima dell'erogazione?" subtitle="Domanda 4-B">
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
          <QuestionLayout title="Sei disposto a chiudere P.IVA o contratto prima dell'erogazione?" subtitle="Domanda 5-B">
            <OptionButton text="Si" value="A" onPick={(value) => handleAnswer('q5b', value)} />
            <OptionButton text="No" value="B" onPick={(value) => handleAnswer('q5b', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q5c' ? (
          <QuestionLayout title="Sei disposto a dimetterti prima dell'erogazione?" subtitle="Domanda 5-C">
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
          <QuestionLayout title="Come intendi avviare l'attivita?" subtitle="Domanda 7 di 12">
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
          <QuestionLayout title="Qual e lo stato dell'attivita?" subtitle="Domanda 9 di 12">
            <OptionButton text="Non ancora avviata" value="A" onPick={(value) => handleAnswer('q9', value)} />
            <OptionButton text="Avviata da meno di 1 mese" value="B" onPick={(value) => handleAnswer('q9', value)} />
            <OptionButton text="Avviata da piu di 1 mese" value="C" onPick={(value) => handleAnswer('q9', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q10' ? (
          <QuestionLayout title="Qual e l'investimento complessivo previsto?" subtitle="Domanda 10 di 12">
            {investmentOptions.map((option) => (
              <OptionButton key={option.value} text={option.text} value={option.value} onPick={(value) => handleAnswer('q10', value)} />
            ))}
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q11' ? (
          <QuestionLayout title="Quante risorse personali puoi dimostrare di avere disponibili?" subtitle="Domanda 11 di 12">
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              E una garanzia minima indicativa: non significa che dovrai spendere l importo dichiarato.
            </p>
            <OptionButton text="Meno del 10%" value="A" onPick={(value) => handleAnswer('q11', value)} />
            <OptionButton text="Circa il 10%" value="B" onPick={(value) => handleAnswer('q11', value)} />
            <OptionButton text="Oltre il 10%" value="C" onPick={(value) => handleAnswer('q11', value)} />
            <BackRow onBack={goBack} />
          </QuestionLayout>
        ) : null}

        {step === 'q12' ? (
          <QuestionLayout title="Inserisci i tuoi dati per finalizzare la verifica" subtitle="Domanda 12 di 12">
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Nome"
                value={contact.firstName}
                onChange={(event) => setContact((previous) => ({ ...previous, firstName: event.target.value }))}
              />
              <input
                className="input"
                placeholder="Cognome"
                value={contact.lastName}
                onChange={(event) => setContact((previous) => ({ ...previous, lastName: event.target.value }))}
              />
              <input
                type="email"
                className="input"
                placeholder="Email"
                value={contact.email}
                onChange={(event) => setContact((previous) => ({ ...previous, email: event.target.value }))}
              />
              <input
                className="input"
                placeholder="Telefono"
                value={contact.phone}
                onChange={(event) => setContact((previous) => ({ ...previous, phone: event.target.value }))}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-muted flex-1" onClick={goBack}>
                Indietro
              </button>
              <button type="button" className="btn btn-primary flex-1" disabled={submitting} onClick={submitQuiz}>
                {submitting ? 'Invio...' : 'Invia'}
              </button>
            </div>
            {submissionError ? <p className="mt-2 text-sm font-semibold text-red-700">{submissionError}</p> : null}
          </QuestionLayout>
        ) : null}

        {step === 'blocked' ? (
          <div className="space-y-4 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-red-700">Esito non idoneo</p>
            <h2 className="text-2xl font-extrabold text-brand.navy">Al momento non risulti idoneo</h2>
            <p className="text-sm text-slate-600">
              Possiamo comunque analizzare alternative su misura. Lascia i tuoi contatti e ti richiamiamo.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-muted" onClick={restart}>
                Rifai il quiz
              </button>
              <a href="https://wa.me/393471234567" target="_blank" rel="noreferrer" className="btn btn-primary">
                Parla con un consulente
              </a>
            </div>
          </div>
        ) : null}

        {step === 'success' ? (
          <div className="space-y-4 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-brand.steel">Esito positivo</p>
            <h2 className="text-2xl font-extrabold text-brand.navy">Idoneita confermata</h2>
            <p className="text-sm text-slate-600">
              Hai i requisiti per {isSouth ? 'Resto al Sud 2.0' : 'Autoimpiego Centro-Nord'}.
            </p>
            <div className="rounded-xl bg-brand.mint/10 p-4 text-sm text-slate-700">
              I tuoi dati sono stati salvati. Un consulente ti contattera con i prossimi passi operativi.
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/login" className="btn btn-primary">
                Accedi all area clienti
              </Link>
              <button type="button" className="btn btn-muted" onClick={restart}>
                Nuova verifica
              </button>
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
      <p className="text-xs font-semibold uppercase tracking-wide text-brand.steel">{subtitle}</p>
      <h1 className="mt-2 text-2xl font-extrabold text-brand.navy">{title}</h1>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn btn-muted mt-2" onClick={onBack}>
      Indietro
    </button>
  );
}
