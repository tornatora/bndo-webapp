'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appendMockMessage } from '@/lib/mock/chat';
import { PROGRESS_STEPS, type ProgressStepKey, computeProgressBar } from '@/lib/admin/practice-progress';

type Props = {
  applicationId: string;
  initialStep: ProgressStepKey;
  threadId: string | null;
  toEmail: string | null;
  companyName: string;
  practiceTitle: string;
  isMock: boolean;
};

export function AdminPracticeProgress({
  applicationId,
  initialStep,
  threadId,
  toEmail,
  companyName,
  practiceTitle,
  isMock
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<ProgressStepKey>(initialStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const bar = useMemo(() => computeProgressBar(step), [step]);
  const stepLabel = useMemo(() => PROGRESS_STEPS.find((s) => s.key === step)?.label ?? step, [step]);

  async function save(next: ProgressStepKey) {
    if (saving) return;
    if (!threadId || !toEmail) return;
    setSaving(true);
    setError(null);

    try {
      if (isMock && threadId.startsWith('mock-thread-')) {
        appendMockMessage(threadId, {
          thread_id: threadId,
          sender_profile_id: 'mock-admin',
          body: ['[AGGIORNAMENTO PRATICA]', `Pratica: ${practiceTitle}`, `Stato avanzamento: ${stepLabel}`, '', '(Mock) Notifica inviata.'].join('\n')
        });
        setSavedAt(new Date().toLocaleString('it-IT'));
        document.dispatchEvent(new CustomEvent('bndo:practice-progress', { detail: { applicationId, step: next } }));
        router.refresh();
        return;
      }

      const res = await fetch('/api/admin/practice-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          threadId,
          toEmail,
          companyName,
          practiceTitle,
          stepKey: next
        })
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Aggiornamento fallito.');

      setSavedAt(new Date().toLocaleString('it-IT'));
      document.dispatchEvent(new CustomEvent('bndo:practice-progress', { detail: { applicationId, step: next } }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aggiornamento fallito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-progress">
      <div className="admin-progress-header">
        <div className="admin-progress-title">Avanzamento lavori</div>
        <div className="admin-progress-step">
          Step {bar.stepIndex + 1}/{PROGRESS_STEPS.length}: {stepLabel}
        </div>
      </div>
      <div className="admin-progress-bar">
        <div className="admin-progress-fill" style={{ width: `${bar.pct}%` }} />
      </div>
      <div className="admin-progress-legend">
        <span>{PROGRESS_STEPS[0].label}</span>
        <span>{PROGRESS_STEPS[2].label}</span>
        <span>{PROGRESS_STEPS[4].label}</span>
        <span>{PROGRESS_STEPS[5].label}</span>
      </div>

      <div className="admin-progress-controls">
        <select
          className="admin-progress-select"
          value={step}
          onChange={(e) => {
            const next = e.target.value as ProgressStepKey;
            setStep(next);
          }}
          disabled={saving}
        >
          {PROGRESS_STEPS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-action primary"
          onClick={() => void save(step)}
          disabled={saving || !threadId || !toEmail}
          title={!threadId || !toEmail ? 'Email o thread non disponibili' : 'Aggiorna e notifica cliente'}
        >
          {saving ? 'Aggiorno…' : 'Aggiorna cliente'}
        </button>
        {savedAt ? <span className="admin-progress-saved">Ultimo invio: {savedAt}</span> : null}
        {error ? <span className="admin-progress-error">{error}</span> : null}
      </div>
    </div>
  );
}
