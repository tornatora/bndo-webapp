'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileDown, Loader2, Check, AlertCircle, RefreshCcw } from 'lucide-react';
import { generatePDF } from '../lib/pdfGenerator';
import type { ExtractedData, CustomField, UploadedFile, GeneratedDoc, DocStatus } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  extracted: ExtractedData;
  customFields: CustomField[];
  otherFiles: UploadedFile[];
  onPdfBlob: (blob: Blob) => void;
  onGeneratedDocs: (docs: GeneratedDoc[]) => void;
  onDsanStatus: (status: DocStatus) => void;
  onDsanError: (error: string) => void;
};

const DSAN_KEYS = [
  { key: 'dsan_antiriciclaggio', fileName: 'DSAN Antiriciclaggio rsud acn.docx', label: 'DSAN Antiriciclaggio' },
  { key: 'dsan_casellario_liquidatorie', fileName: 'DSAN Casellario e procedure concorsuali liquidatorie.docx', label: 'DSAN Casellario' },
  { key: 'dsan_requisiti_iniziativa', fileName: 'DSAN Possesso requisiti iniziativa economica.docx', label: 'DSAN Requisiti Iniziativa' },
  { key: 'dsan_requisiti_soggettivi', fileName: 'DSAN Possesso requisiti soggettivi.docx', label: 'DSAN Requisiti Soggettivi' },
  { key: 'descrizione_iniziativa_c2', fileName: 'Descrizione_iniziativa_economica_attivita_individuali.docx', label: 'Descrizione Iniziativa C2' },
];

export function Step7CompilazioneDoc({
  extracted,
  customFields,
  otherFiles,
  onPdfBlob,
  onGeneratedDocs,
  onDsanStatus,
  onDsanError,
}: Props) {
  const [pdfStatus, setPdfStatus] = useState<DocStatus>('generating');
  const [dsanStatus, setDsanStatusState] = useState<DocStatus>('generating');
  const [pdfBlob, setPdfBlobLocal] = useState<Blob | null>(null);
  const [dsanDocs, setDsanDocs] = useState<GeneratedDoc[]>([]);
  const [dsanError, setDsanErrorState] = useState('');
  const [manualFields, setManualFields] = useState<Record<string, string>>({
    luogo_firma: '',
    data_firma: '',
    residenza_legale_rappresentante: '',
    descrizione_iniziativa: '',
    importo_programma: '',
  });

  // Generate PDF scheda aziendale (client-side)
  useEffect(() => {
    try {
      const blob = generatePDF(extracted, customFields);
      setPdfBlobLocal(blob);
      onPdfBlob(blob);
      setPdfStatus('ready');
    } catch {
      setPdfStatus('error');
    }
  }, [extracted, customFields, onPdfBlob]);

  // Generate DSAN docs via API (server-side with original templates)
  const generateDsanDocs = useCallback(async () => {
    setDsanStatusState('generating');
    onDsanStatus('generating');
    setDsanErrorState('');
    onDsanError('');

    try {
      const docs: GeneratedDoc[] = [];

      for (const item of DSAN_KEYS) {
        const res = await fetch('/api/compila-bando/generate-dsan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc: item.key,
            data: extracted,
            overrides: manualFields,
            mode: 'base64',
            format: 'docx',
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Errore sconosciuto' }));
          throw new Error(`${item.label}: ${err.error || res.status}`);
        }

        const json = await res.json();
        if (!json.ok || !json.base64) {
          throw new Error(`${item.label}: risposta non valida`);
        }

        const binary = atob(json.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: json.mimeType });

        docs.push({
          key: item.key,
          fileName: item.fileName,
          mimeType: json.mimeType,
          blob,
        });
      }

      setDsanDocs(docs);
      onGeneratedDocs(docs);
      setDsanStatusState('ready');
      onDsanStatus('ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore generazione DSAN';
      setDsanErrorState(msg);
      onDsanError(msg);
      setDsanStatusState('error');
      onDsanStatus('error');
    }
  }, [extracted, manualFields, onGeneratedDocs, onDsanStatus, onDsanError]);

  useEffect(() => {
    const t = setTimeout(() => void generateDsanDocs(), 800);
    return () => clearTimeout(t);
  }, [generateDsanDocs]);

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
        Compiliamo i 5 DSAN con i template originali Invitalia e i tuoi dati.
      </p>

      <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0b1136' }}>
          Campi da compilare per i DSAN
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { key: 'luogo_firma', label: 'Luogo firma' },
            { key: 'data_firma', label: 'Data firma' },
            { key: 'residenza_legale_rappresentante', label: 'Residenza legale rappresentante' },
            { key: 'importo_programma', label: 'Importo programma (€)' },
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
          Descrizione iniziativa economica (Allegato C2)
          <textarea
            value={manualFields.descrizione_iniziativa || ''}
            onChange={(e) => setManualFields((prev) => ({ ...prev, descrizione_iniziativa: e.target.value }))}
            rows={5}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 12, resize: 'vertical' }}
          />
        </label>
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

      {dsanStatus === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertCircle size={16} color="#ef4444" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>Errore: {dsanError}</span>
          <button className={s.cbBtnMuted} onClick={() => void generateDsanDocs()} type="button" style={{ marginLeft: 'auto' }}>
            <RefreshCcw size={14} />
            Riprova
          </button>
        </div>
      )}
    </div>
  );
}
