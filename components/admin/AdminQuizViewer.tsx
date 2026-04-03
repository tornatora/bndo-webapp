'use client';

import { useMemo, useState } from 'react';
import { formatQuizAnswerValue, getQuizQuestions, safeAnswersRecord } from '@/lib/quiz/quiz-map';
import type { Json } from '@/lib/supabase/database.types';

type QuizKey = 'resto_sud_2_0' | 'autoimpiego_centro_nord';

type QuizData = {
  created_at: string;
  eligibility: 'eligible' | 'not_eligible';
  bando_type: 'sud' | 'centro_nord' | null;
  answers: unknown;
  region: string | null;
  phone: string | null;
  full_name: string | null;
};

function isQuizData(value: unknown): value is QuizData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.created_at === 'string' && typeof v.eligibility === 'string' && 'answers' in v;
}

function quizTitle(key: QuizKey) {
  return key === 'resto_sud_2_0' ? 'Resto al Sud 2.0' : 'Autoimpiego Centro-Nord';
}

function mockQuizData(key: QuizKey): QuizData {
  const isSud = key === 'resto_sud_2_0';
  const createdAt = new Date(Date.now() - (isSud ? 3 : 5) * 24 * 60 * 60 * 1000).toISOString();
  return {
    created_at: createdAt,
    eligibility: 'eligible',
    bando_type: isSud ? 'sud' : 'centro_nord',
    region: isSud ? 'Campania' : 'Lombardia',
    phone: '+39 347 000 0000',
    full_name: 'DEMO Cliente',
    answers: {
      q1: 'B',
      q1b: 'A',
      q2: 'A',
      q3: isSud ? 'Campania' : 'Lombardia',
      q4: 'A',
      q4b: 'A',
      q5: 'A',
      q5b: 'A',
      q5c: 'A',
      q6: 'A',
      q6b: 'A',
      q7: 'A',
      q8: 'A',
      q8b: 'A',
      q9: 'A',
      q10: isSud ? 'B' : 'A',
      q11: 'B'
    }
  };
}

export function AdminQuizViewer({
  email,
  isMock
}: {
  email: string | null;
  isMock: boolean;
}) {
  const [active, setActive] = useState<QuizKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuizData | null>(null);

  const questions = useMemo(() => getQuizQuestions(data?.bando_type ?? null), [data?.bando_type]);
  const answersRecord = useMemo(() => (data ? safeAnswersRecord(data.answers as unknown as Json) : {}), [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const knownIds = new Set(questions.map((q) => q.id));
    const out: Array<{ key: string; question: string; answer: string }> = [];

    for (const question of questions) {
      const raw = answersRecord[question.id];
      const value = formatQuizAnswerValue(question, raw);
      if (!value) continue;
      out.push({ key: question.id, question: question.title, answer: value });
    }

    // Forward/backward compatibility: show any stored answers not present in the current quiz map.
    for (const [key, raw] of Object.entries(answersRecord)) {
      if (knownIds.has(key)) continue;
      if (key.startsWith('_legal_')) continue;
      if (raw == null || raw === '') continue;
      const answer =
        typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : JSON.stringify(raw);
      const labelByKey: Record<string, string> = {
        _blocked_question: 'Punto di stop (domanda)',
        _blocked_from_step: 'Punto di stop (step)',
        _captured_after_question: 'Contatti raccolti dopo'
      };
      out.push({ key, question: labelByKey[key] ?? key, answer });
    }

    return out;
  }, [answersRecord, data, questions]);

  async function open(key: QuizKey) {
    setActive(key);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      if (!email) throw new Error('Email cliente non disponibile.');
      if (isMock) {
        setData(mockQuizData(key));
        return;
      }

      const res = await fetch(
        `/api/admin/quiz-answers?email=${encodeURIComponent(email)}&bando=${encodeURIComponent(key)}`,
        { cache: 'no-store' }
      );
      const json = (await res.json()) as { error?: string; data?: unknown };
      if (!res.ok) throw new Error(json?.error ?? 'Errore caricamento quiz.');
      if (!json.data) {
        setError('Quiz non compilato per questo bando.');
        setData(null);
        return;
      }
      if (!isQuizData(json.data)) throw new Error('Formato quiz non valido.');
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-card">
      <div className="section-title">
        <span>🧩</span>
        <span>Quiz</span>
      </div>

      <div className="action-buttons">
        <button type="button" className="btn-action" onClick={() => open('resto_sud_2_0')} disabled={loading}>
          Risposte quiz {quizTitle('resto_sud_2_0')}
        </button>
        <button type="button" className="btn-action" onClick={() => open('autoimpiego_centro_nord')} disabled={loading}>
          Risposte quiz {quizTitle('autoimpiego_centro_nord')}
        </button>
      </div>

      {active ? (
        <div className="admin-quiz-panel">
          <div className="admin-docs-panel-head" style={{ padding: 0, border: 0, marginBottom: 12 }}>
            <div className="admin-docs-title">{quizTitle(active)}</div>
            <button type="button" className="admin-docs-back" onClick={() => setActive(null)}>
              Chiudi
            </button>
          </div>

          {loading ? <div className="admin-item-sub">Caricamento…</div> : null}
          {error ? (
            <div className="admin-item-sub" style={{ color: '#B91C1C', fontWeight: 500 }}>
              {error}
            </div>
          ) : null}

          {data ? (
            <>
              <div className="admin-quiz-meta">
                <span className="meta-tag">
                  Compilato: {new Date(data.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
                </span>
                <span className={`meta-tag ${data.eligibility === 'eligible' ? 'tag-ok' : 'tag-warn'}`}>
                  Esito: {data.eligibility === 'eligible' ? 'Idoneo' : 'Non idoneo'}
                </span>
                {data.region ? <span className="meta-tag">Regione: {data.region}</span> : null}
                {data.phone ? <span className="meta-tag">Telefono: {data.phone}</span> : null}
              </div>

              <div className="admin-quiz-qa">
                {rows.length === 0 ? (
                  <div className="admin-panel-empty">Nessuna risposta disponibile.</div>
                ) : (
                  rows.map((row) => (
                    <div key={row.key} className="admin-quiz-row">
                      <div className="admin-quiz-q">{row.question}</div>
                      <div className="admin-quiz-a">{row.answer}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="admin-item-sub">Apri un quiz per vedere le risposte del cliente, in modo ordinato.</div>
      )}
    </section>
  );
}
