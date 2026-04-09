'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PROGRESS_STEPS, computeProgressBar, type ProgressStepKey } from '@/lib/admin/practice-progress';

export function ConsultantPracticeProgressPanel({
  applicationId,
  initialStep
}: {
  applicationId: string;
  initialStep: ProgressStepKey;
}) {
  const router = useRouter();
  const [step, setStep] = useState<ProgressStepKey>(initialStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const bar = useMemo(() => computeProgressBar(step), [step]);
  const stepLabel = useMemo(() => PROGRESS_STEPS.find((s) => s.key === step)?.label ?? step, [step]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/consultant/practices/${applicationId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepKey: step })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Aggiornamento avanzamento non riuscito.');
      }
      setSavedAt(new Date().toLocaleString('it-IT'));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aggiornamento avanzamento non riuscito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section-card">
      <div className="section-title">
        <span>📈</span>
        <span>Aggiorna avanzamento pratica</span>
      </div>
      <div className="admin-item-sub" style={{ marginTop: 4 }}>
        Questo aggiornamento viene inviato anche al cliente.
      </div>

      <div className="admin-progress" style={{ marginTop: 12 }}>
        <div className="admin-progress-header">
          <div className="admin-progress-title">Stato corrente</div>
          <div className="admin-progress-step">
            Step {bar.stepIndex + 1}/{PROGRESS_STEPS.length}: {stepLabel}
          </div>
        </div>
        <div className="admin-progress-bar">
          <div className="admin-progress-fill" style={{ width: `${bar.pct}%` }} />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <select
          className="modal-select"
          value={step}
          onChange={(event) => setStep(event.target.value as ProgressStepKey)}
          disabled={saving}
        >
          {PROGRESS_STEPS.map((progressStep) => (
            <option key={progressStep.key} value={progressStep.key}>
              {progressStep.label}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-action" disabled={saving} onClick={() => void save()}>
            {saving ? 'Aggiornamento…' : 'Aggiorna cliente'}
          </button>
        </div>
      </div>

      {savedAt ? (
        <div className="admin-item-sub" style={{ marginTop: 10, color: '#065F46', fontWeight: 700 }}>
          Ultimo aggiornamento inviato: {savedAt}
        </div>
      ) : null}
      {error ? (
        <div className="admin-item-sub" style={{ marginTop: 10, color: '#B91C1C', fontWeight: 700 }}>
          {error}
        </div>
      ) : null}
    </section>
  );
}
