'use client';

import { useCallback, useState, useRef } from 'react';
import { Loader2, UploadCloud, FileText, AlertCircle } from 'lucide-react';
import type { ExtractedData } from '../lib/types';

type UploadState = 'idle' | 'uploading' | 'error';

export function PdfUploader({ onExtracted }: { onExtracted: (data: ExtractedData) => void }) {
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf') {
        setError('Il file deve essere un PDF.');
        setState('error');
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        setError('Il file supera i 12 MB.');
        setState('error');
        return;
      }
      setState('uploading');
      setError(null);

      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/estrattore/extract', {
          method: 'POST',
          body: form,
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || 'Errore estrazione.');
        }
        onExtracted({
          original_filename: file.name,
          ...json.extracted,
        });
      } catch (e) {
        setState('error');
        setError(e instanceof Error ? e.message : 'Errore sconosciuto.');
      }
    },
    [onExtracted]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragOver
            ? 'border-[#0f1f52] bg-[#f2f5fa]'
            : 'border-[#d7e2f2] bg-white hover:border-[#b6c7df]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onInputChange}
        />
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f2f5fa]">
          {state === 'uploading' ? (
            <Loader2 className="h-6 w-6 animate-spin text-[#0f1f52]" />
          ) : (
            <UploadCloud className="h-6 w-6 text-[#0f1f52]" />
          )}
        </div>
        <p className="text-sm font-semibold text-[#0b1136]">
          {state === 'uploading' ? 'Estrazione in corso…' : 'Trascina qui il PDF o clicca per selezionarlo'}
        </p>
        <p className="mt-1 text-xs text-[#64748b]">Visure camerali in formato PDF, massimo 12 MB</p>
      </div>

      {state === 'error' && error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
