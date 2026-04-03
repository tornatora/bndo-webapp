'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatQuizAnswerValue, getQuizQuestions, safeAnswersRecord } from '@/lib/quiz/quiz-map';
import type { Json } from '@/lib/supabase/database.types';

type QuizBandoType = 'sud' | 'centro_nord';
type Eligibility = 'eligible' | 'not_eligible';

type QuizSubmission = {
  id: string;
  created_at: string;
  eligibility: Eligibility;
  bando_type: QuizBandoType | null;
  answers: unknown;
  region: string | null;
  phone: string | null;
  full_name: string | null;
  email: string | null;
};

const QUIZ_TYPES: Array<{ key: QuizBandoType; label: string }> = [
  { key: 'sud', label: 'Quiz Autoimpiego (Resto al Sud)' },
  { key: 'centro_nord', label: 'Quiz Autoimpiego Centro-Nord' },
];

export function AdminQuizResponsesClient() {
  const [activeBando, setActiveBando] = useState<QuizBandoType | null>(null);
  const [activeTab, setActiveTab] = useState<'eligible' | 'not_eligible'>('eligible');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<QuizSubmission[]>([]);
  const [notEligible, setNotEligible] = useState<QuizSubmission[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async (bando: QuizBandoType) => {
    setLoading(true);
    setError(null);
    setEligible([]);
    setNotEligible([]);
    setExpandedId(null);
    try {
      const res = await fetch(`/api/admin/quiz-submissions?bando_type=${encodeURIComponent(bando)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Errore caricamento.');
      setEligible(json.eligible ?? []);
      setNotEligible(json.notEligible ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento.');
    } finally {
      setLoading(false);
    }
  }, []);

  function selectBando(bando: QuizBandoType) {
    setActiveBando(bando);
    setActiveTab('eligible');
    setSearch('');
    fetchSubmissions(bando);
  }

  // Filter submissions by search
  const currentList = activeTab === 'eligible' ? eligible : notEligible;
  const filtered = useMemo(() => {
    if (!search.trim()) return currentList;
    const s = search.toLowerCase();
    return currentList.filter(sub =>
      (sub.full_name || '').toLowerCase().includes(s) ||
      (sub.email || '').toLowerCase().includes(s) ||
      (sub.phone || '').toLowerCase().includes(s)
    );
  }, [currentList, search]);

  return (
    <section className="section-card" style={{ maxWidth: 900 }}>
      <div className="section-title">
        <span>🧩</span>
        <span>Risposte Quiz</span>
      </div>

      {/* Quiz type buttons */}
      {!activeBando ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          {QUIZ_TYPES.map(qt => (
            <button
              key={qt.key}
              type="button"
              className="btn-action"
              onClick={() => selectBando(qt.key)}
              style={{ minWidth: 200 }}
            >
              {qt.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Back button */}
          <button
            type="button"
            className="btn-action"
            onClick={() => { setActiveBando(null); setSearch(''); }}
            style={{ marginBottom: 16, fontSize: 13 }}
          >
            ← Torna ai quiz
          </button>

          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
            {QUIZ_TYPES.find(q => q.key === activeBando)?.label}
          </div>

          {/* Tabs: Idonei / Non Idonei */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #E2E8F0' }}>
            <button
              type="button"
              onClick={() => { setActiveTab('eligible'); setExpandedId(null); }}
              style={{
                padding: '8px 20px',
                fontWeight: activeTab === 'eligible' ? 700 : 400,
                color: activeTab === 'eligible' ? '#22C55F' : '#64748B',
                borderBottom: activeTab === 'eligible' ? '3px solid #22C55F' : '3px solid transparent',
                background: 'none',
                border: 'none',
                borderBottomWidth: 3,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === 'eligible' ? '#22C55F' : 'transparent',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              ✅ Idonei ({eligible.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('not_eligible'); setExpandedId(null); }}
              style={{
                padding: '8px 20px',
                fontWeight: activeTab === 'not_eligible' ? 700 : 400,
                color: activeTab === 'not_eligible' ? '#EF4444' : '#64748B',
                background: 'none',
                border: 'none',
                borderBottomWidth: 3,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === 'not_eligible' ? '#EF4444' : 'transparent',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              ❌ Non idonei ({notEligible.length})
            </button>
          </div>

          {/* Search bar */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="🔍 Cerca per nome, email o telefono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-search-input"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {loading ? <div className="admin-item-sub">Caricamento…</div> : null}
          {error ? <div className="admin-item-sub" style={{ color: '#B91C1C', fontWeight: 500 }}>{error}</div> : null}

          {/* User cards */}
          {!loading && !error && filtered.length === 0 ? (
            <div className="admin-item-sub" style={{ color: '#94A3B8' }}>
              {search ? 'Nessun risultato per la ricerca.' : 'Nessuna compilazione per questo quiz.'}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(sub => (
              <SubmissionCard
                key={sub.id}
                submission={sub}
                expanded={expandedId === sub.id}
                onToggle={() => setExpandedId(prev => prev === sub.id ? null : sub.id)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SubmissionCard({
  submission: sub,
  expanded,
  onToggle,
}: {
  submission: QuizSubmission;
  expanded: boolean;
  onToggle: () => void;
}) {
  const submittedAt = new Date(sub.created_at);
  const submittedAtLabel = Number.isNaN(submittedAt.getTime())
    ? 'N/D'
    : submittedAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  const nameParts = (sub.full_name || 'N/D').split(' ');
  const firstName = nameParts[0] || 'N/D';
  const lastName = nameParts.slice(1).join(' ') || '';

  return (
    <div
      style={{
        border: '1px solid #E2E8F0',
        borderRadius: 10,
        padding: '12px 16px',
        background: expanded ? '#F8FAFC' : '#FFF',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1136' }}>
            {firstName} {lastName}
          </div>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            📧 {sub.email || 'N/D'} &nbsp;|&nbsp; 📞 {sub.phone || 'N/D'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sub.region ? <span style={{ fontSize: 12, color: '#64748B', background: '#F1F5F9', borderRadius: 4, padding: '2px 8px' }}>{sub.region}</span> : null}
          <span style={{ fontSize: 12, color: '#94A3B8' }}>
            {submittedAtLabel}
          </span>
          <span style={{ fontSize: 14 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded ? <SubmissionDetails submission={sub} /> : null}
    </div>
  );
}

function SubmissionDetails({ submission: sub }: { submission: QuizSubmission }) {
  const submittedAt = new Date(sub.created_at);
  const submittedAtLabel = Number.isNaN(submittedAt.getTime())
    ? 'N/D'
    : submittedAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  const questions = useMemo(() => getQuizQuestions(sub.bando_type), [sub.bando_type]);
  const answersRecord = useMemo(() => safeAnswersRecord(sub.answers as unknown as Json), [sub.answers]);
  const blockedStep = typeof answersRecord._blocked_from_step === 'string' ? answersRecord._blocked_from_step : null;
  const blockedQuestion = typeof answersRecord._blocked_question === 'string' ? answersRecord._blocked_question : null;

  const rows = useMemo(() => {
    const knownIds = new Set(questions.map(q => q.id));
    const out: Array<{ key: string; question: string; answer: string }> = [];

    for (const question of questions) {
      const raw = answersRecord[question.id];
      const value = formatQuizAnswerValue(question, raw);
      if (!value) continue;
      out.push({ key: question.id, question: question.title, answer: value });
    }

    for (const [key, raw] of Object.entries(answersRecord)) {
      if (knownIds.has(key)) continue;
      if (key.startsWith('_legal_')) continue;
      if (raw == null || raw === '') continue;
      const answer = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
        ? String(raw)
        : JSON.stringify(raw);
      out.push({ key, question: key, answer });
    }
    return out;
  }, [answersRecord, questions]);

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#64748B', fontWeight: 600 }}>
        Inviato il: {submittedAtLabel}
      </div>
      {sub.eligibility === 'not_eligible' && blockedQuestion ? (
        <div
          style={{
            marginBottom: 10,
            fontSize: 13,
            color: '#991B1B',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '8px 10px',
            fontWeight: 600
          }}
        >
          Domanda bloccante: {blockedQuestion} in quanto con questa caratteristica non puoi partecipare al bando in questione.
          {blockedStep ? ` (${blockedStep})` : ''}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 13 }}>Nessuna risposta disponibile.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(row => (
            <div key={row.key} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <div style={{ color: '#64748B', fontWeight: 500, minWidth: 200 }}>{row.question}</div>
              <div style={{ color: '#0B1136', fontWeight: 600 }}>{row.answer}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
