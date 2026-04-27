'use client';

import { useState, useCallback, useRef } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import type { UploadedFile } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  files: UploadedFile[];
  onAdd: (f: UploadedFile) => void;
  onRemove: (index: number) => void;
};

export function Step4AltriDocumenti({ files, onAdd, onRemove }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      Array.from(fileList).forEach((f) => {
        onAdd({ name: f.name, size: f.size, type: f.type, file: f });
      });
    },
    [onAdd]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Altri Documenti
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 20 }}>
        Carica eventuali documenti aggiuntivi: preventivi, certificazioni, visure
        aggiuntive, DURC.
      </p>

      <div
        className={`${s.cbDropzone} ${dragOver ? s.cbDropzoneDrag : ''}`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,.doc,.docx"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
          }}
        />
        <div className={s.cbDropzoneIcon}>
          <UploadCloud size={24} />
        </div>
        <p className={s.cbDropzoneTitle}>Trascina qui i documenti aggiuntivi</p>
        <p className={s.cbDropzoneHint}>
          oppure clicca per selezionare — PDF, immagini, documenti Word
        </p>
      </div>

      {files.length > 0 && (
        <div className={s.cbFileList}>
          {files.map((f, i) => (
            <div key={i} className={s.cbFileItem}>
              <FileText size={16} className={s.cbFileItemIcon} />
              <span className={s.cbFileItemName}>{f.name}</span>
              <span className={s.cbFileItemSize}>{(f.size / 1024).toFixed(0)} KB</span>
              <button
                className={s.cbFileItemRemove}
                onClick={() => onRemove(i)}
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
