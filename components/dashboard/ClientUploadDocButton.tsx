'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ClientUploadDocButton({
  applicationId,
  documentLabel
}: {
  applicationId: string;
  documentLabel: string;
}) {
  const router = useRouter();
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
      fd.append('documentLabel', documentLabel);
      fd.append('file', file);

      const res = await fetch('/api/practices/upload-document', { method: 'POST', body: fd });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Upload fallito.');

      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fallito.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickFile(f);
        }}
      />
      <button
        type="button"
        className="admin-reminder-btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title={done ? 'Caricato' : 'Carica documento'}
      >
        {uploading ? 'Carico…' : done ? 'Caricato' : 'Carica'}
      </button>
      {error ? <span className="admin-reminder-error">{error}</span> : null}
    </div>
  );
}

