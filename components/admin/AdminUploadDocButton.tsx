'use client';

import { useRef, useState } from 'react';

export function AdminUploadDocButton({
  applicationId,
  companyId,
  documentLabel,
  disabledReason
}: {
  applicationId: string;
  companyId: string;
  documentLabel: string;
  disabledReason?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPickFile(file: File) {
    setUploading(true);
    setError(null);
    setDone(false);

    try {
      const fd = new FormData();
      fd.append('applicationId', applicationId);
      fd.append('companyId', companyId);
      fd.append('documentLabel', documentLabel);
      fd.append('file', file);

      const res = await fetch('/api/admin/applications/upload', { method: 'POST', body: fd });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Upload fallito.');

      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fallito.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const disabled = Boolean(disabledReason) || uploading;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickFile(f);
        }}
      />
      <button
        type="button"
        className="admin-reminder-btn"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title={disabledReason ?? (done ? 'Caricato' : 'Carica documento')}
      >
        {uploading ? 'Carico…' : done ? 'Caricato' : 'Carica'}
      </button>
      {error ? <span className="admin-reminder-error">{error}</span> : null}
    </div>
  );
}

