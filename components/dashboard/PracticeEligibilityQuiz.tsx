'use client';

import { useMemo, useState } from 'react';

export type PracticeQuizQuestion = {
  questionKey: string;
  label: string;
  description: string | null;
  reasoning: string | null;
  questionType: 'single_select' | 'boolean' | 'text' | 'number';
  options: Array<{ value: string; label: string }>;
  isRequired: boolean;
};

type PracticeEligibilityQuizProps = {
  questions: PracticeQuizQuestion[];
  onSubmit: (answers: Record<string, string | number | boolean | null>) => Promise<void>;
  submitting: boolean;
};

export function PracticeEligibilityQuiz({ questions, onSubmit, submitting }: PracticeEligibilityQuizProps) {
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [error, setError] = useState<string | null>(null);

  const missingRequired = useMemo(() => {
    return questions
      .filter((question) => question.isRequired)
      .find((question) => {
        const value = answers[question.questionKey];
        return value === undefined || value === null || value === '';
      });
  }, [answers, questions]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missingRequired) {
      setError(`Completa il campo obbligatorio: ${missingRequired.label}`);
      return;
    }

    setError(null);
    await onSubmit(answers);
  }

  return (
    <form className="panel-card" onSubmit={handleSubmit}>
      <div className="panel-head">
        <div className="panel-title">Quiz requisiti pratica</div>
        <div className="panel-sub">Compila le domande per attivare la checklist documentale della pratica.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {questions.map((question) => {
          const value = answers[question.questionKey];
          const options =
            question.questionType === 'boolean' && question.options.length === 0
              ? [
                  { value: 'yes', label: 'Sì' },
                  { value: 'no', label: 'No' }
                ]
              : question.options;

          return (
            <div key={question.questionKey}>
              <label style={{ display: 'block', fontWeight: 700, color: '#0B1136', marginBottom: 6 }}>
                {question.label}
                {question.isRequired ? ' *' : ''}
              </label>
              {question.description ? (
                <div style={{ fontSize: 13, color: '#64748B', marginBottom: 8 }}>{question.description}</div>
              ) : null}
              {question.reasoning ? (
                <div style={{ fontSize: 12, color: '#0369A1', backgroundColor: '#F0F9FF', padding: '6px 10px', borderRadius: 6, marginBottom: 10, borderLeft: '3px solid #0EA5E9' }}>
                  <strong>Perché è importante:</strong> {question.reasoning}
                </div>
              ) : null}

              {question.questionType === 'single_select' || question.questionType === 'boolean' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {options.map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        background: value === option.value ? '#EEF2FF' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name={question.questionKey}
                        checked={value === option.value}
                        onChange={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [question.questionKey]: option.value
                          }))
                        }
                      />
                      <span style={{ fontSize: 14 }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {question.questionType === 'number' ? (
                <input
                  className="form-control"
                  type="number"
                  value={typeof value === 'number' ? value : value ? Number(value) : ''}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.questionKey]:
                        event.target.value.trim() === '' ? null : Number(event.target.value)
                    }))
                  }
                  placeholder="Inserisci importo"
                />
              ) : null}

              {question.questionType === 'text' ? (
                <textarea
                  className="form-control"
                  value={typeof value === 'string' ? value : ''}
                  rows={4}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.questionKey]: event.target.value
                    }))
                  }
                  placeholder="Aggiungi una nota"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <div className="form-error" style={{ marginTop: 14 }}>{error}</div> : null}

      <div className="journey-actions" style={{ marginTop: 18 }}>
        <button className="form-submit" type="submit" disabled={submitting}>
          {submitting ? 'Salvataggio in corso...' : 'Conferma requisiti e apri onboarding documenti'}
        </button>
      </div>
    </form>
  );
}
