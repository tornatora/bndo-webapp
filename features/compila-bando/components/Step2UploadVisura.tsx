'use client';

import { useState, useCallback, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2 } from 'lucide-react';
import type { UploadedFile } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  file: UploadedFile | null;
  onFile: (f: UploadedFile | null) => void;
  onSkip: () => void;
};

export function Step2UploadVisura({ file, onFile, onSkip }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isValidFile = (f: File) =>
    f.type === 'application/pdf' ||
    f.type === '' ||
    f.type === 'application/octet-stream' ||
    f.name.toLowerCase().endsWith('.pdf');

  const handleFile = useCallback(
    (f: File) => {
      if (!isValidFile(f)) return;
      onFile({ name: f.name, size: f.size, type: f.type, file: f });
    },
    [onFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Visura Camerale
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 20 }}>
        Carica la visura camerale della tua impresa in formato PDF.
      </p>

      <div
        className={`${s.cbDropzone} ${dragOver ? s.cbDropzoneDrag : ''} ${file ? s.cbDropzoneHasFile : ''}`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !file && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {file ? (
          <div>
            <div className={s.cbDropzoneIcon} style={{ background: 'rgba(34,197,95,0.08)', color: '#22c55f' }}>
              <CheckCircle2 size={24} />
            </div>
            <p className={s.cbDropzoneTitle}>Documento caricato</p>
            <div className={s.cbDropzoneFileInfo}>
              <FileText size={16} />
              <span>{file.name}</span>
              <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>
                {(file.size / 1024).toFixed(0)} KB
              </span>
            </div>
            <p
              style={{ marginTop: 12, fontSize: 12, color: '#64748b', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onFile(null); }}
            >
              Clicca per sostituire
            </p>
          </div>
        ) : (
          <div>
            <div className={s.cbDropzoneIcon}>
              <UploadCloud size={24} />
            </div>
            <p className={s.cbDropzoneTitle}>Trascina qui la Visura Camerale</p>
            <p className={s.cbDropzoneHint}>oppure clicca per selezionare — PDF, massimo 12 MB</p>
          </div>
        )}
      </div>

      <span className={s.cbSkipLink} onClick={onSkip}>
        Salta (usa dati demo per il test)
      </span>
    </div>
  );
}
