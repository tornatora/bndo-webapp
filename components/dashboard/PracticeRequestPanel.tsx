'use client';

import Link from 'next/link';
import { useState } from 'react';

type PracticeRequestPanelProps = {
  quizCompleted: boolean;
  quizEligible: boolean;
  quizType: string | null;
  quizCompletedAt: string | null;
};

type PracticeType = 'resto_sud_2_0' | 'autoimpiego_centro_nord';

type RequestResponse = {
  error?: string;
  message?: string;
};

const PRACTICES: Array<{ key: PracticeType; title: string; subtitle: string }> = [
  {
    key: 'resto_sud_2_0',
    title: 'Resto al Sud 2.0',
    subtitle: 'Avvia una nuova pratica dedicata al bando Resto al Sud 2.0'
  },
  {
    key: 'autoimpiego_centro_nord',
    title: 'Autoimpiego Centro Nord',
    subtitle: 'Avvia una nuova pratica dedicata al bando Autoimpiego Centro Nord'
  }
];

function formatDate(value: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export function PracticeRequestPanel({ quizCompleted, quizEligible, quizType, quizCompletedAt }: PracticeRequestPanelProps) {
  const [loadingType, setLoadingType] = useState<PracticeType | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);

  async function requestPractice(type: PracticeType) {
    setFeedback(null);
    setLoadingType(type);

    try {
      const response = await fetch('/api/practices/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ practiceType: type })
      });

      const payload = (await response.json().catch(() => ({}))) as RequestResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'Richiesta non completata.');
      }

      setFeedback({
        error: false,
        message: payload.message ?? 'Richiesta inviata con successo. Un consulente ti contattera a breve.'
      });
    } catch (error) {
      setFeedback({
        error: true,
        message: error instanceof Error ? error.message : 'Richiesta non completata.'
      });
    } finally {
      setLoadingType(null);
    }
  }

  const quizDate = formatDate(quizCompletedAt);
  const preferred: PracticeType | null =
    quizType === 'sud' ? 'resto_sud_2_0' : quizType === 'centro_nord' ? 'autoimpiego_centro_nord' : null;
  const orderedPractices = [...PRACTICES].sort((a, b) => {
    if (!preferred) return 0;
    if (a.key === preferred) return -1;
    if (b.key === preferred) return 1;
    return 0;
  });

  return (
    <section className="section-card">
      <h2 className="section-title">Richiedi una nuova pratica</h2>
      <p className="welcome-subtitle" style={{ marginBottom: 12 }}>
        Scegli il bando che vuoi avviare. Il quiz requisiti è consigliato, ma non è obbligatorio.
      </p>

      {quizCompleted ? (
        <p className="document-date" style={{ marginBottom: 18 }}>
          Ultimo quiz: {quizType ?? 'N/D'}{quizDate ? ` · ${quizDate}` : ''}{!quizEligible ? ' · esito: non idoneo' : ''}
        </p>
      ) : null}

      <div className="practice-request-grid">
        {orderedPractices.map((practice) => (
          <article key={practice.key} className="practice-request-card">
            <h3 className="pratica-title" style={{ fontSize: 20, marginBottom: 6 }}>
              {practice.title}
            </h3>
            <p className="pratica-type" style={{ marginBottom: 14 }}>
              {practice.subtitle}
            </p>

            <button
              type="button"
              className="btn-action primary"
              onClick={() => void requestPractice(practice.key)}
              disabled={loadingType !== null}
            >
              <span>{loadingType === practice.key ? '⏳' : '📨'}</span>
              <span>{loadingType === practice.key ? 'Invio richiesta...' : 'Richiedi pratica'}</span>
            </button>

            {!quizCompleted ? (
              <div className="document-date" style={{ marginTop: 10, marginBottom: 0 }}>
                Consigliato: <Link href={`/quiz/autoimpiego`}>compila il quiz requisiti</Link>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {feedback ? (
        <p
          style={{
            marginTop: 16,
            fontSize: '14px',
            fontWeight: 600,
            color: feedback.error ? '#b91c1c' : '#15803d'
          }}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
