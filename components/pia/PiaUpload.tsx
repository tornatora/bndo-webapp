'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

type PiaUploadProps = {
  applicationId: string;
  onComplete: () => void;
};

type DocInfo = {
  id: string;
  name: string;
  icon: string;
  bg: string;
  req: string;
  why: string;
  required: boolean;
  alert: string | null;
};

const DOCS: DocInfo[] = [
  { id: 'id', name: 'Documento Identità', icon: '👤', bg: '#dbeafe', req: 'Fronte/retro · Obbligatorio', why: 'per verificare la tua identità', required: true, alert: null },
  { id: 'doc', name: 'Visura Camerale / P.IVA', icon: '📋', bg: '#fce8e6', req: 'Certificato camerale · Obbligatorio', why: 'per leggere indirizzo, ATECO e PEC', required: true, alert: null },
  { id: 'did', name: 'DID — Dichiarazione Disponibilità', icon: '📅', bg: '#dcfce7', req: 'Obbligatoria · La ottieni su MyANPAL', why: 'requisito obbligatorio del bando', required: true, alert: null },
  { id: 'cv', name: 'Curriculum Vitae', icon: '📚', bg: '#fef7e0', req: 'Consigliato · Formato europeo', why: 'per leggere titolo di studio ed esperienze', required: false, alert: '⚠ Facoltativo — ti toglie 2 domande se lo carichi' },
];

export function PiaUpload({ applicationId, onComplete }: PiaUploadProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentDoc = DOCS[currentIndex];
  const allRequiredUploaded = DOCS.filter(d => d.required).every(d => uploaded.has(d.id));
  const hasMore = currentIndex < DOCS.length - 1;

  const handleFileSelect = useCallback(async (file: File) => {
    if (!currentDoc) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('applicationId', applicationId);
    formData.append('file', file);
    formData.append('documentLabel', currentDoc.name);
    formData.append('requirementKey', currentDoc.id);

    try {
      const res = await fetch('/api/practices/upload-document', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Errore upload');
        setUploading(false);
        return;
      }

      // Mark as uploaded
      const newUploaded = new Set(uploaded);
      newUploaded.add(currentDoc.id);
      setUploaded(newUploaded);

      // Exit animation
      setVisible(false);
      setTimeout(() => {
        if (hasMore) {
          setCurrentIndex(i => i + 1);
          setVisible(true);
        } else {
          // All done — show summary for a moment then proceed
          onComplete();
        }
      }, 400);
    } catch {
      setError('Errore di connessione durante l\'upload.');
    }
    setUploading(false);
  }, [applicationId, currentDoc, uploaded, hasMore, onComplete]);

  const handleDropClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }, [handleFileSelect]);

  if (!currentDoc) return null;

  return (
    <div className="pia-upload">
      {error && (
        <div className="pia-upload-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>X</button>
        </div>
      )}

      <div className="pia-upload-progress">
        <span className="pia-upload-step-label">
          Documento {currentIndex + 1} di {DOCS.length}
        </span>
        <div className="pia-upload-dots">
          {DOCS.map((doc, i) => (
            <div
              key={doc.id}
              className={`pia-upload-dot ${uploaded.has(doc.id) ? 'done' : i === currentIndex ? 'active' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className={`pia-upload-card ${visible ? 'visible' : 'exit-up'}`}>
        <div className="pia-d-icon-big" style={{ background: currentDoc.bg }}>
          {currentDoc.icon}
        </div>
        <h2>{currentDoc.name}</h2>
        <div className="pia-d-sub">{currentDoc.req}</div>
        {currentDoc.alert && <div className="pia-d-alert">{currentDoc.alert}</div>}
        <div className="pia-d-why">Perché te lo chiedo &rarr; {currentDoc.why}</div>

        <div
          className={`pia-upload-zone ${uploading ? 'uploading' : ''}`}
          onClick={!uploading ? handleDropClick : undefined}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="pia-file-input"
            onChange={handleFileInputChange}
          />
          <div className="pia-uz-icon">&#128194;</div>
          <div className="pia-uz-label">
            {uploading ? 'Caricamento in corso...' : 'Clicca per caricare'}
          </div>
          <div className="pia-uz-sub">PDF, JPG o PNG &middot; Max 25 MB</div>
          <div className="pia-uz-btn">
            {uploading ? '...' : 'Seleziona file'}
          </div>
        </div>

        <div className="pia-upload-skip">
          {!currentDoc.required && !uploaded.has(currentDoc.id) && (
            <button className="pia-skip-btn" onClick={onComplete}>
              Salta (risponderai a 2 domande in più)
            </button>
          )}
        </div>
      </div>

      <style>{`
        .pia-upload {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
        }
        .pia-upload-error {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          background: #FEE2E2;
          color: #DC2626;
          padding: 12px 18px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .pia-upload-error button {
          background: none;
          border: none;
          color: #DC2626;
          cursor: pointer;
          font-weight: 700;
          font-size: 14px;
        }
        .pia-upload-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 40px;
        }
        .pia-upload-step-label {
          font-size: 12px;
          font-weight: 500;
          color: rgba(11,17,54,0.5);
          letter-spacing: -0.01em;
        }
        .pia-upload-dots {
          display: flex;
          gap: 6px;
        }
        .pia-upload-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(11,17,54,0.1);
          transition: all .3s;
        }
        .pia-upload-dot.active {
          background: var(--navy, #0B1136);
          transform: scale(1.3);
        }
        .pia-upload-dot.done {
          background: var(--green, #0acf83);
        }
        .pia-upload-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          width: 100%;
          max-width: 380px;
          transition: all .45s cubic-bezier(.16,1,.3,1);
        }
        .pia-upload-card.visible { opacity: 1; transform: translateY(0); }
        .pia-upload-card.exit-up { opacity: 0; transform: translateY(-24px) scale(.96); }
        .pia-d-icon-big {
          width: 72px; height: 72px;
          border-radius: 20px;
          display: flex;
          align-items: center; justify-content: center;
          font-size: 30px;
          margin-bottom: 16px;
          animation: piaPop .45s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes piaPop {
          0% { transform: scale(0); }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        .pia-upload-card h2 {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.03em;
          margin: 0 0 3px;
          color: var(--navy, #0B1136);
        }
        .pia-d-sub {
          font-size: 11.1px;
          color: rgba(11,17,54,0.6);
          line-height: 1.55;
          letter-spacing: -0.01em;
        }
        .pia-d-why {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 10px;
          border-radius: 999px;
          background: rgba(11,17,54,0.06);
          font-size: 9px;
          font-weight: 500;
          color: rgba(11,17,54,0.6);
          letter-spacing: -0.01em;
          margin-top: 6px;
          margin-bottom: 20px;
        }
        .pia-d-alert {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #FEF3C7;
          color: #D97706;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: -0.01em;
          margin-top: 4px;
          margin-bottom: 16px;
        }
        .pia-upload-zone {
          width: 100%;
          padding: 24px 20px;
          border: 1.5px dashed rgba(11,17,54,0.1);
          border-radius: 16px;
          background: #FAFBFC;
          cursor: pointer;
          transition: all .25s;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          position: relative;
        }
        .pia-upload-zone:hover {
          border-color: var(--navy, #0B1136);
          background: rgba(11,17,54,0.04);
        }
        .pia-upload-zone.uploading {
          opacity: 0.6;
          pointer-events: none;
        }
        .pia-file-input {
          display: none;
        }
        .pia-uz-icon { font-size: 22px; color: rgba(11,17,54,0.6); }
        .pia-uz-label { font-size: 11.1px; font-weight: 600; color: var(--navy, #0B1136); letter-spacing: -0.01em; }
        .pia-uz-sub { font-size: 9px; color: rgba(11,17,54,0.6); letter-spacing: -0.01em; }
        .pia-uz-btn {
          margin-top: 4px;
          padding: 8px 20px;
          border: 0.5px solid var(--navy, #0B1136);
          border-radius: 10px;
          background: #fff;
          color: var(--navy, #0B1136);
          font-size: 11.1px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all .2s;
          letter-spacing: -0.01em;
        }
        .pia-uz-btn:hover { background: var(--navy, #0B1136); color: #fff; }
        .pia-upload-skip {
          margin-top: 16px;
        }
        .pia-skip-btn {
          background: none;
          border: none;
          color: rgba(11,17,54,0.4);
          font-size: 11px;
          cursor: pointer;
          font-family: inherit;
          text-decoration: underline;
          transition: color .2s;
        }
        .pia-skip-btn:hover {
          color: var(--green-dark, #16a34a);
        }

        @media (max-width: 480px) {
          .pia-upload { padding: 32px 16px; }
          .pia-d-icon-big { width: 60px; height: 60px; font-size: 26px; }
          .pia-upload-card h2 { font-size: 16px; }
          .pia-upload-zone { padding: 20px 16px; }
        }
      `}</style>
    </div>
  );
}
