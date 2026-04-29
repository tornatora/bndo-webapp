'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileDown, Loader2, Check, AlertCircle } from 'lucide-react';
import { generatePDF } from '../lib/pdfGenerator';
import type { ExtractedData, CustomField, UploadedFile } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  extracted: ExtractedData;
  customFields: CustomField[];
  otherFiles: UploadedFile[];
  onPdfBlob: (blob: Blob) => void;
  onDocxBlob: (blob: Blob) => void;
};

type DocStatus = 'generating' | 'ready' | 'error';
type GeneratedDoc = { key: string; fileName: string; mimeType: string };
type ReviewField = { key: string; label: string };

const FALLBACK_DOCS: GeneratedDoc[] = [
  { key: 'dsan_antiriciclaggio', fileName: 'DSAN Antiriciclaggio rsud acn.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { key: 'dsan_casellario_liquidatorie', fileName: 'DSAN Casellario e procedure concorsuali liquidatorie.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { key: 'dsan_requisiti_iniziativa', fileName: 'DSAN Possesso requisiti iniziativa economica.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { key: 'dsan_requisiti_soggettivi', fileName: 'DSAN Possesso requisiti soggettivi.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { key: 'descrizione_iniziativa_c2', fileName: 'Descrizione iniziativa economica_attività individuali.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
];

export function Step7CompilazioneDoc({
  extracted,
  customFields,
  otherFiles,
  onPdfBlob,
  onDocxBlob,
}: Props) {
  const [pdfStatus, setPdfStatus] = useState<DocStatus>('generating');
  const [docxStatus, setDocxStatus] = useState<DocStatus>('generating');
  const [pdfBlob, setPdfBlobLocal] = useState<Blob | null>(null);
  const [docxBlob, setDocxBlobLocal] = useState<Blob | null>(null);
  const [docxError, setDocxError] = useState('');
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>(FALLBACK_DOCS);
  const [reviewFields, setReviewFields] = useState<ReviewField[]>([]);
  const [manualFields, setManualFields] = useState<Record<string, string>>({
    luogo_firma: '',
    data_firma: '',
    residenza_legale_rappresentante: '',
    descrizione_iniziativa: '',
    importo_programma: '',
  });

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

    setTimeout(async () => {
      try {
        const manifestRes = await fetch('/api/compila-bando/generate-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: extracted, mode: 'manifest', overrides: manualFields }),
        });

        if (manifestRes.ok) {
          const manifest = (await manifestRes.json()) as {
            ok?: boolean;
            generatedDocs?: GeneratedDoc[];
            reviewRequired?: ReviewField[];
          };
          if (manifest.ok && Array.isArray(manifest.generatedDocs) && manifest.generatedDocs.length > 0) {
            setGeneratedDocs(manifest.generatedDocs);
          }
          if (Array.isArray(manifest.reviewRequired)) {
            setReviewFields(manifest.reviewRequired);
          }
        }

        const res = await fetch('/api/compila-bando/generate-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: extracted, overrides: manualFields }),
        });
        if (!res.ok) throw new Error(`Errore ${res.status}`);

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
        Generiamo i template allegati (DSAN + C2) e ti mostriamo i campi da confermare.
      </p>

      <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0b1136' }}>
          Allegati template inclusi
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {generatedDocs.map((doc) => (
            <div
              key={doc.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: '#0b1136' }}>{doc.fileName}</span>
              <span style={{ color: '#15803d', fontWeight: 700 }}>Prefill</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0b1136' }}>
          Box da confermare/riempire
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { key: 'luogo_firma', label: 'Luogo firma' },
            { key: 'data_firma', label: 'Data firma' },
            { key: 'residenza_legale_rappresentante', label: 'Residenza legale rappresentante' },
            { key: 'importo_programma', label: 'Importo programma' },
          ].map((field) => (
            <label key={field.key} style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
              {field.label}
              <input
                value={manualFields[field.key] || ''}
                onChange={(e) => setManualFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}
              />
            </label>
          ))}
        </div>
        <label style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 12, color: '#334155' }}>
          Descrizione iniziativa (C2)
          <textarea
            value={manualFields.descrizione_iniziativa || ''}
            onChange={(e) => setManualFields((prev) => ({ ...prev, descrizione_iniziativa: e.target.value }))}
            rows={5}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 12, resize: 'vertical' }}
          />
        </label>
        {reviewFields.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#b45309' }}>
            Da confermare: {reviewFields.map((f) => f.label).join(', ')}
          </p>
        )}
      </div>

      {otherFiles.length > 0 && (
        <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0b1136' }}>
            File utente caricati
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {otherFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} style={{ fontSize: 12, color: '#475569' }}>
                {file.name}
              </div>
            ))}
          </div>
        </div>
      )}

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
          <h3 className={s.cbDocCardTitle}>Pacchetto DOCX Allegati</h3>
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
              onClick={() => docxBlob && downloadBlob(docxBlob, 'Allegati-BNDO.docx')}
              type="button"
            >
              <FileDown size={14} />
              Scarica DOCX anteprima
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
