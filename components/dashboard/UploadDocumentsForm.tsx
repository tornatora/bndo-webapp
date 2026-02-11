'use client';

import { FormEvent, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';

type UploadDocumentsFormProps = {
  tenderId: string;
  applicationId: string;
  defaultNotes: string;
};

export function UploadDocumentsForm({ tenderId, applicationId, defaultNotes }: UploadDocumentsFormProps) {
  const [notes, setNotes] = useState(defaultNotes);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError('Seleziona almeno un documento da caricare.');
      return;
    }

    setError(null);
    setStatus(null);
    setUploading(true);

    const body = new FormData();
    body.append('tenderId', tenderId);
    body.append('applicationId', applicationId);
    body.append('notes', notes);
    body.append('file', file);

    try {
      const response = await fetch('/api/applications/upload', {
        method: 'POST',
        body
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Upload non riuscito.');
      }

      setStatus(payload.message ?? 'Documento caricato con successo.');
      setFile(null);
      setUploading(false);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (uploadError) {
      setUploading(false);
      setError(uploadError instanceof Error ? uploadError.message : 'Errore inatteso in upload.');
    }
  }

  return (
    <form className="panel space-y-4 p-5" onSubmit={onSubmit}>
      <div>
        <label className="label" htmlFor="notes">
          Note per il consulente
        </label>
        <textarea
          id="notes"
          className="input min-h-28"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Specifica eventuali deleghe, certificazioni o scadenze interne."
        />
      </div>

      <div>
        <label className="label" htmlFor="file">
          Carica documento (PDF, DOCX, ZIP)
        </label>
        <input
          id="file"
          type="file"
          className="input"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          accept=".pdf,.doc,.docx,.zip"
          required
        />
      </div>

      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
      {status ? <p className="text-sm font-semibold text-green-700">{status}</p> : null}

      <button type="submit" className="btn btn-primary" disabled={uploading}>
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento...
          </>
        ) : (
          <>
            <UploadCloud className="h-4 w-4" />
            Salva candidatura e carica file
          </>
        )}
      </button>
    </form>
  );
}
