'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type RequirementOption = {
  key: string;
  label: string;
  status: 'missing' | 'uploaded' | 'waived';
};

type Props = {
  applicationId: string;
  requirements: RequirementOption[];
};

export function ConsultantPracticeDocumentsActions({ applicationId, requirements }: Props) {
  const router = useRouter();
  const [requestLabel, setRequestLabel] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [selectedRequirementKey, setSelectedRequirementKey] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const missingRequirements = useMemo(
    () => requirements.filter((requirement) => requirement.status === 'missing'),
    [requirements]
  );

  async function submitRequestDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = requestLabel.trim();
    if (!label) {
      setError('Inserisci il nome del documento richiesto.');
      return;
    }
    setLoadingRequest(true);
    setError(null);
    setOk(null);

    try {
      const response = await fetch(`/api/consultant/practices/${applicationId}/request-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          description: requestDescription.trim() || null,
          isRequired: true
        })
      });
      const payload = (await response.json()) as { error?: string; notice?: string | null };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Richiesta documento non riuscita.');
      }
      setRequestLabel('');
      setRequestDescription('');
      setOk(payload.notice ?? 'Richiesta documento inviata al cliente.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Richiesta documento non riuscita.');
    } finally {
      setLoadingRequest(false);
    }
  }

  async function submitUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile) {
      setError('Seleziona un file da caricare.');
      return;
    }
    setLoadingUpload(true);
    setError(null);
    setOk(null);

    try {
      const formData = new FormData();
      formData.set('file', uploadFile);
      if (uploadLabel.trim()) {
        formData.set('documentLabel', uploadLabel.trim());
      }
      if (selectedRequirementKey.trim()) {
        formData.set('requirementKey', selectedRequirementKey.trim());
      }

      const response = await fetch(`/api/consultant/practices/${applicationId}/documents`, {
        method: 'POST',
        body: formData
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Upload documento non riuscito.');
      }
      setUploadFile(null);
      setUploadLabel('');
      setSelectedRequirementKey('');
      setOk('Documento caricato e condiviso con il cliente.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload documento non riuscito.');
    } finally {
      setLoadingUpload(false);
    }
  }

  return (
    <section className="section-card">
      <div className="section-title">
        <span>🧾</span>
        <span>Azioni documentali consulente</span>
      </div>
      <div className="admin-item-sub" style={{ marginTop: 4 }}>
        Puoi richiedere documenti aggiuntivi al cliente e caricare documenti da condividere nella sua dashboard.
      </div>

      <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
        <form onSubmit={submitRequestDocument} style={{ display: 'grid', gap: 10 }}>
          <div className="admin-item-sub" style={{ fontWeight: 700, color: '#0B1136' }}>
            Richiedi documento aggiuntivo
          </div>
          <input
            className="modal-input"
            value={requestLabel}
            onChange={(event) => setRequestLabel(event.target.value)}
            placeholder="Es. Visura camerale aggiornata"
            maxLength={160}
          />
          <textarea
            className="modal-textarea"
            value={requestDescription}
            onChange={(event) => setRequestDescription(event.target.value)}
            placeholder="Dettagli utili per il cliente (facoltativo)"
            maxLength={600}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-action secondary" disabled={loadingRequest}>
              {loadingRequest ? 'Invio…' : 'Invia richiesta'}
            </button>
          </div>
        </form>

        <div style={{ height: 1, background: 'rgba(11,17,54,0.1)' }} />

        <form onSubmit={submitUploadDocument} style={{ display: 'grid', gap: 10 }}>
          <div className="admin-item-sub" style={{ fontWeight: 700, color: '#0B1136' }}>
            Carica documento per il cliente
          </div>

          <select
            className="modal-select"
            value={selectedRequirementKey}
            onChange={(event) => setSelectedRequirementKey(event.target.value)}
          >
            <option value="">Nessun requisito specifico</option>
            {missingRequirements.map((requirement) => (
              <option key={requirement.key} value={requirement.key}>
                {requirement.label}
              </option>
            ))}
          </select>

          <input
            className="modal-input"
            value={uploadLabel}
            onChange={(event) => setUploadLabel(event.target.value)}
            placeholder="Etichetta documento (facoltativa)"
            maxLength={80}
          />

          <input
            type="file"
            className="modal-input"
            accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-action" disabled={loadingUpload}>
              {loadingUpload ? 'Caricamento…' : 'Carica documento'}
            </button>
          </div>
        </form>
      </div>

      {ok ? (
        <div className="admin-item-sub" style={{ marginTop: 10, color: '#065F46', fontWeight: 700 }}>
          {ok}
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
