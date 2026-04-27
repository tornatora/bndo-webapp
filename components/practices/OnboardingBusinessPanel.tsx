'use client';

import { useEffect, useMemo, useState } from 'react';

type Payload = {
  ok: boolean;
  applicationId: string;
  fields: {
    pec: string;
    digitalSignature: 'yes' | 'no' | '';
    quotesText: string;
  };
  onboarding: {
    status: 'draft' | 'completed' | null;
    currentStep: number | null;
    completedSteps: number[];
    updatedAt: string | null;
    completedAt: string | null;
    documents: Array<{
      id: string;
      fileName: string;
      requirementKey: string | null;
      createdAt: string;
      source: 'save_progress' | 'complete';
    }>;
  };
  meta: {
    history: Array<{
      at: string;
      action: 'save_progress' | 'complete' | 'edit_fields';
      actorProfileId: string | null;
      actorRole: string | null;
      changes: Record<string, unknown>;
    }>;
    onboardingDocumentIds: string[];
  } | null;
};

type Props = {
  applicationId: string;
  title?: string | null;
  canEdit?: boolean;
  renderMode?: 'section' | 'embedded';
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT');
}

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const candidates = [record.error, record.message, record.detail];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

export function OnboardingBusinessPanel({
  applicationId,
  title = 'Dati pratica',
  canEdit = true,
  renderMode = 'section'
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<number>(0);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [pec, setPec] = useState('');
  const [digitalSignature, setDigitalSignature] = useState<'yes' | 'no' | ''>('');
  const [quotesText, setQuotesText] = useState('');

  const canShowAdminMeta = Boolean(payload?.meta);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/practices/${applicationId}/onboarding-business`, { cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as Payload | { error?: string } | null;
      if (!response.ok) {
        throw new Error(readError(body, 'Impossibile caricare i dati onboarding.'));
      }
      const parsed = body as Payload;
      setPayload(parsed);
      setPec(parsed.fields.pec ?? '');
      setDigitalSignature(parsed.fields.digitalSignature ?? '');
      setQuotesText(parsed.fields.quotesText ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore caricamento dati onboarding.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const hasDiff = useMemo(() => {
    if (!payload) return false;
    return (
      (payload.fields.pec ?? '') !== pec ||
      (payload.fields.digitalSignature ?? '') !== digitalSignature ||
      (payload.fields.quotesText ?? '') !== quotesText
    );
  }, [payload, pec, digitalSignature, quotesText]);

  async function save(options?: { silent?: boolean }) {
    if (!canEdit || !hasDiff) return;
    setSaving(true);
    setError(null);
    if (!options?.silent) setNotice(null);
    try {
      const response = await fetch(`/api/practices/${applicationId}/onboarding-business`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pec,
          digitalSignature,
          quotesText
        })
      });
      const body = (await response.json().catch(() => null)) as Payload | { error?: string } | null;
      if (!response.ok) {
        throw new Error(readError(body, 'Impossibile aggiornare i dati onboarding.'));
      }
      const parsed = body as Payload;
      setPayload(parsed);
      setPec(parsed.fields.pec ?? '');
      setDigitalSignature(parsed.fields.digitalSignature ?? '');
      setQuotesText(parsed.fields.quotesText ?? '');
      if (!options?.silent) {
        setNotice('Dati pratica aggiornati.');
      } else {
        setNotice('Salvataggio automatico completato.');
      }
      setLastAutoSaveAt(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore aggiornamento dati onboarding.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!canEdit) return;
    if (!hasDiff) return;

    const now = Date.now();
    if (now - lastAutoSaveAt < 500) return;

    const timer = window.setTimeout(() => {
      void save({ silent: true });
    }, 900);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pec, digitalSignature, quotesText, hasDiff, canEdit]);

  const content = (
    <>
      {loading ? <div className="admin-item-sub" style={{ marginTop: 10 }}>Caricamento dati pratica...</div> : null}
      {error ? <div className="form-error" style={{ marginTop: 10 }}>{error}</div> : null}
      {notice ? <div className="admin-item-sub" style={{ marginTop: 10, color: '#0f766e', fontWeight: 700 }}>{notice}</div> : null}

      {!loading && payload ? (
        <div style={{ display: 'grid', gap: 12, marginTop: renderMode === 'embedded' ? 0 : 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <label className="wizard7-field">
              <span>PEC</span>
              <input className="wizard7-input" value={pec} onChange={(event) => setPec(event.target.value)} disabled={!canEdit || saving} />
            </label>

            <label className="wizard7-field">
              <span>Firma digitale</span>
              <select
                className="wizard7-input"
                value={digitalSignature}
                onChange={(event) => setDigitalSignature(event.target.value as 'yes' | 'no' | '')}
                disabled={!canEdit || saving}
              >
                <option value="">Seleziona</option>
                <option value="yes">In possesso</option>
                <option value="no">Non in possesso</option>
              </select>
            </label>
          </div>

          <label className="wizard7-field">
            <span>Preventivi (testo)</span>
            <textarea
              className="wizard7-input"
              rows={4}
              value={quotesText}
              onChange={(event) => setQuotesText(event.target.value)}
              disabled={!canEdit || saving}
            />
          </label>

          {canEdit ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="wizard7-btn wizard7-btn-primary" onClick={() => void save({ silent: false })} disabled={!hasDiff || saving}>
                {saving ? 'Salvataggio...' : 'Salva ora'}
              </button>
            </div>
          ) : null}

          {canShowAdminMeta ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="admin-item-sub" style={{ fontWeight: 700, color: '#0B1136' }}>Storico modifiche (admin)</div>
              {payload.meta?.history?.length ? (
                <div className="admin-table">
                  {payload.meta.history.slice(0, 12).map((entry, index) => (
                    <div key={`${entry.at}-${index}`} className="admin-table-row">
                      <div className="admin-table-main">
                        <div className="admin-table-name">{entry.action}</div>
                        <div className="admin-table-meta">
                          {formatDateTime(entry.at)} · {entry.actorRole ?? 'N/D'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-item-sub">Nessuna modifica tracciata.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (renderMode === 'embedded') {
    return <div style={{ display: 'grid', gap: 8 }}>{content}</div>;
  }

  return (
    <section className="admin-practice-crm" style={{ marginTop: 16 }}>
      {title ? (
        <div className="section-title">
          <span>🧾</span>
          <span>{title}</span>
        </div>
      ) : null}
      {content}
    </section>
  );
}
