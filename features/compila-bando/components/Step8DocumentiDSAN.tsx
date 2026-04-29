'use client';

import { FileDown, Check, Loader2 } from 'lucide-react';
import s from '../styles/compila-bando.module.css';

type DocItem = { key: string; fileName: string; mimeType: string };

type Props = {
  generatedDocs: DocItem[];
  docxBlob: Blob | null;
  docxStatus: 'generating' | 'ready' | 'error';
  docxError: string;
};

export function Step8DocumentiDSAN({ generatedDocs, docxBlob, docxStatus, docxError }: Props) {
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Documenti DSAN Allegati
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 24 }}>
        Ecco i 5 documenti precompilati pronti per il download.
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {generatedDocs.map((doc) => (
          <div
            key={doc.key}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: docxStatus === 'ready' ? '#dcfce7' : '#f1f5f9',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {docxStatus === 'ready' ? (
                  <Check size={16} color="#16a34a" />
                ) : docxStatus === 'error' ? (
                  <span style={{ color: '#ef4444', fontSize: 12 }}>!</span>
                ) : (
                  <Loader2 size={16} className={s.cbSpinner} color="#64748b" />
                )}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0b1136' }}>
                  {doc.fileName}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                  {docxStatus === 'ready' ? 'Pronto per il download' : docxStatus === 'error' ? 'Errore generazione' : 'In generazione...'}
                </p>
              </div>
            </div>
            {docxStatus === 'ready' && (
              <button
                className={s.cbBtnMuted}
                onClick={() => docxBlob && downloadBlob(docxBlob, doc.fileName)}
                type="button"
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                <FileDown size={14} />
                Scarica
              </button>
            )}
          </div>
        ))}
      </div>

      {docxStatus === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ fontSize: 13, color: '#991b1b' }}>Errore: {docxError}</span>
        </div>
      )}
    </div>
  );
}
