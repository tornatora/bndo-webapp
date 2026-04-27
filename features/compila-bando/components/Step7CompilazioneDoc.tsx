'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileDown, Loader2, Check, AlertCircle } from 'lucide-react';
import { generatePDF } from '../lib/pdfGenerator';
import type { ExtractedData, CustomField } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  extracted: ExtractedData;
  customFields: CustomField[];
  onPdfBlob: (blob: Blob) => void;
  onDocxBlob: (blob: Blob) => void;
};

type DocStatus = 'generating' | 'ready' | 'error';

export function Step7CompilazioneDoc({
  extracted,
  customFields,
  onPdfBlob,
  onDocxBlob,
}: Props) {
  const [pdfStatus, setPdfStatus] = useState<DocStatus>('generating');
  const [docxStatus, setDocxStatus] = useState<DocStatus>('generating');
  const [pdfBlob, setPdfBlobLocal] = useState<Blob | null>(null);
  const [docxBlob, setDocxBlobLocal] = useState<Blob | null>(null);
  const [docxError, setDocxError] = useState('');

  const generate = useCallback(async () => {
    // Generate PDF (client-side, sempre funziona)
    try {
      const blob = generatePDF(extracted, customFields);
      setPdfBlobLocal(blob);
      onPdfBlob(blob);
      setPdfStatus('ready');
    } catch {
      setPdfStatus('ready');
    }

    // Generate DOCX via API
    setTimeout(async () => {
      try {
        const res = await fetch('/api/compila-bando/generate-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: extracted }),
        });

        if (!res.ok) {
          throw new Error(`Errore ${res.status}`);
        }

        const blob = await res.blob();
        setDocxBlobLocal(blob);
        onDocxBlob(blob);
        setDocxStatus('ready');
      } catch (e) {
        setDocxError(e instanceof Error ? e.message : 'Errore generazione DOCX');
        setDocxStatus('error');
      }
    }, 800);
  }, [extracted, customFields, onPdfBlob, onDocxBlob]);

  useEffect(() => {
    const t = setTimeout(generate, 600);
    return () => clearTimeout(t);
  }, [generate]);

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
        Compilazione Documenti
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 24 }}>
        Stiamo generando i documenti compilati con i tuoi dati.
      </p>

      {docxStatus === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertCircle size={16} color="#ef4444" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>DOCX: {docxError}</span>
        </div>
      )}

      <div className={s.cbTwoCol}>
        {/* PDF Card */}
        <div
            className={`${s.cbDocCard} ${
            pdfStatus === 'ready' ? s.cbDocCardReady : s.cbDocCardGenerating
          }`}
        >
          <div
            className={`${s.cbDocCardIcon} ${
              pdfStatus === 'ready'
                ? s.cbDocCardIconReady
                : s.cbDocCardIconGenerating
            }`}
          >
            {pdfStatus === 'ready' ? (
              <Check size={24} />
            ) : (
              <Loader2 size={24} className={s.cbSpinner} />
            )}
          </div>
          <h3 className={s.cbDocCardTitle}>Scheda Aziendale</h3>
          <p
            className={`${s.cbDocCardStatus} ${
              pdfStatus === 'ready'
                ? s.cbDocCardStatusReady
                : s.cbDocCardStatusGenerating
            }`}
          >
            {pdfStatus === 'ready' ? 'Pronto' : 'In generazione...'}
          </p>
          {pdfStatus === 'ready' && (
            <button
              className={s.cbBtnPrimary}
              onClick={() => pdfBlob && downloadBlob(pdfBlob, 'Scheda-Aziendale-BNDO.pdf')}
              type="button"
            >
              <FileDown size={14} />
              Scarica PDF
            </button>
          )}
        </div>

        {/* DOCX Card */}
        <div
            className={`${s.cbDocCard} ${
            docxStatus === 'ready' ? s.cbDocCardReady : s.cbDocCardGenerating
          }`}
        >
          <div
            className={`${s.cbDocCardIcon} ${
              docxStatus === 'ready'
                ? s.cbDocCardIconReady
                : s.cbDocCardIconGenerating
            }`}
          >
            {docxStatus === 'ready' ? (
              <Check size={24} />
            ) : (
              <Loader2 size={24} className={s.cbSpinner} />
            )}
          </div>
          <h3 className={s.cbDocCardTitle}>Documento Anagrafico</h3>
          <p
            className={`${s.cbDocCardStatus} ${
              docxStatus === 'ready'
                ? s.cbDocCardStatusReady
                : s.cbDocCardStatusGenerating
            }`}
          >
            {docxStatus === 'ready' ? 'Pronto' : docxStatus === 'error' ? 'Errore' : 'In generazione...'}
          </p>
          {docxStatus === 'ready' && (
            <button
              className={s.cbBtnMuted}
              onClick={() => docxBlob && downloadBlob(docxBlob, 'Documento-Anagrafico-BNDO.docx')}
              type="button"
            >
              <FileDown size={14} />
              Scarica DOCX
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
