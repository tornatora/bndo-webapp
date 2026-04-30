'use client';

import { FileDown, Check, Loader2, AlertCircle } from 'lucide-react';
import type { GeneratedDoc, DocStatus } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  generatedDocs: GeneratedDoc[];
  dsanStatus: DocStatus;
  dsanError: string;
};

export function Step8DocumentiDSAN({ generatedDocs, dsanStatus, dsanError }: Props) {
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

  const downloadAsPdf = async (docxBlob: Blob, filename: string) => {
    // Prefer server-side DOCX→PDF (CloudConvert) to preserve WYSIWYG templates.
    // Falls back to client-side conversion only if the API is not configured.
    const arrayBuffer = await docxBlob.arrayBuffer();
    const base64 = btoa(
      Array.from(new Uint8Array(arrayBuffer))
        .map((b) => String.fromCharCode(b))
        .join('')
    );

    const res = await fetch('/api/compila-bando/convert-docx-to-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, fileName: filename }),
    });

    if (res.ok) {
      const pdfBlob = await res.blob();
      downloadBlob(pdfBlob, filename.replace(/\.docx$/i, '.pdf'));
      return;
    }

    // Fallback (preview/local) if CloudConvert is not configured.
    const errJson = await res.json().catch(() => null);
    const msg = errJson?.error ? String(errJson.error) : `HTTP ${res.status}`;
    // eslint-disable-next-line no-console
    console.warn('PDF conversion via API failed, fallback to client-side:', msg);

    const [{ default: mammoth }, { default: html2pdf }] = await Promise.all([
      import('mammoth/mammoth.browser'),
      import('html2pdf.js'),
    ]);

    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const container = document.createElement('div');
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '11pt';
    container.style.lineHeight = '1.4';
    container.innerHTML = htmlResult.value || '';

    const targetName = filename.replace(/\.docx$/i, '.pdf');
    await (html2pdf() as any)
      .set({
        margin: 10,
        filename: targetName,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .save();
  };

  return (
    <div>
      <h2 className={s.cbCardTitle} style={{ marginBottom: 4 }}>
        Documenti DSAN Allegati
      </h2>
      <p className={s.cbCardSubtitle} style={{ marginBottom: 24 }}>
        Ecco i 5 documenti DSAN compilati con i template originali Invitalia.
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
                  background: dsanStatus === 'ready' ? '#dcfce7' : dsanStatus === 'error' ? '#fee2e2' : '#f1f5f9',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {dsanStatus === 'ready' ? (
                  <Check size={16} color="#16a34a" />
                ) : dsanStatus === 'error' ? (
                  <AlertCircle size={16} color="#ef4444" />
                ) : (
                  <Loader2 size={16} className={s.cbSpinner} color="#64748b" />
                )}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0b1136' }}>
                  {doc.fileName}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                  {dsanStatus === 'ready' ? 'DOCX compilato con i tuoi dati' : dsanStatus === 'error' ? 'Errore compilazione' : 'Compilazione template originale...'}
                </p>
              </div>
            </div>
            {dsanStatus === 'ready' && doc.blob && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={s.cbBtnMuted}
                  onClick={() => downloadBlob(doc.blob!, doc.fileName)}
                  type="button"
                  style={{ fontSize: 12, padding: '6px 12px' }}
                >
                  <FileDown size={14} />
                  Scarica DOCX
                </button>
                <button
                  className={s.cbBtnPrimary}
                  onClick={() => void downloadAsPdf(doc.blob!, doc.fileName)}
                  type="button"
                  style={{ fontSize: 12, padding: '6px 12px' }}
                  title="Genera PDF in locale (consigliato su Netlify preview)"
                >
                  <FileDown size={14} />
                  Scarica PDF
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {dsanStatus === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertCircle size={16} color="#ef4444" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>Errore: {dsanError}</span>
        </div>
      )}
    </div>
  );
}
