'use client';

import { useEffect, useState, useCallback } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { EXTRACTION_STEPS } from '../lib/demoData';
import type { ExtractedData, UploadedFile } from '../lib/types';
import s from '../styles/compila-bando.module.css';

type Props = {
  onComplete: (data: ExtractedData) => void;
  demoData: ExtractedData;
  visura: UploadedFile | null;
  cartaIdentita: UploadedFile | null;
};

type StepState = 'pending' | 'active' | 'done';
type ApiStatus = 'calling' | 'success' | 'error' | null;

export function Step5Estrazione({ onComplete, demoData, visura, cartaIdentita }: Props) {
  const [stepStates, setStepStates] = useState<StepState[]>(
    EXTRACTION_STEPS.map(() => 'pending')
  );
  const [progress, setProgress] = useState(0);
  const [showData, setShowData] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData>(demoData);
  const [apiStatus, setApiStatus] = useState<ApiStatus>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const callApi = useCallback(async () => {
    setApiStatus('calling');

    const formData = new FormData();
    if (visura?.file) formData.append('visura', visura.file);
    if (cartaIdentita?.file) formData.append('carta_identita', cartaIdentita.file);

    // Se non ci sono file reali, usa demo data
    if (!visura?.file && !cartaIdentita?.file) {
      setApiStatus('success');
      return demoData;
    }

    try {
      const res = await fetch('/api/compila-bando/extract', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(err.error || `Errore ${res.status}`);
      }

      const json = await res.json();
      const data = json.extracted as Record<string, string | null>;

      const merged: ExtractedData = {
        ragione_sociale: data.ragione_sociale || '',
        sede_legale: data.sede_legale || '',
        codice_fiscale: data.codice_fiscale || '',
        partita_iva: data.partita_iva || '',
        rea: data.rea || '',
        forma_giuridica: data.forma_giuridica || '',
        nome_legale_rappresentante: data.nome_legale_rappresentante || '',
        email_pec: data.email_pec || '',
        telefono: data.telefono || '',
      };

      setExtractedData(merged);
      setApiStatus('success');
      return merged;
    } catch (e) {
      setApiStatus('error');
      setErrorMessage(e instanceof Error ? e.message : 'Errore di connessione');
      setExtractedData(demoData);
      return demoData;
    }
  }, [visura, cartaIdentita, demoData]);

  const runExtraction = useCallback(async () => {
    const steps = EXTRACTION_STEPS;

    // Mostra animazione step mentre chiama API
    for (let i = 0; i < steps.length; i++) {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          setStepStates((prev) => {
            const next = [...prev];
            next[i] = 'active';
            return next;
          });
          setProgress(((i + 0.5) / steps.length) * 100);
          resolve();
        }, i * 400);
      });

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          setStepStates((prev) => {
            const next = [...prev];
            next[i] = 'done';
            return next;
          });
          setProgress(((i + 1) / steps.length) * 100);
          resolve();
        }, i * 400 + 300);
      });
    }

    // Chiamata API reale
    const result = await callApi();

    if (result) {
      setTimeout(() => {
        setShowData(true);
        setTimeout(() => onComplete(result), 2000);
      }, 400);
    }
  }, [callApi, demoData, onComplete]);

  useEffect(() => {
    const t = setTimeout(runExtraction, 400);
    return () => clearTimeout(t);
  }, [runExtraction]);

  const dataEntries = Object.entries(extractedData).filter(
    ([key, val]) => val && key !== 'original_filename'
  );

  return (
    <div className={s.cbExtractOverlay}>
      <h2 className={s.cbExtractTitle}>Estrazione Dati in Corso</h2>
      <p className={s.cbExtractSubtitle}>
        Il nostro estrattore sta analizzando i documenti caricati...
      </p>

      {apiStatus === 'error' && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertCircle size={16} color="#ef4444" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>{errorMessage || 'Errore estrazione. Uso dati demo.'}</span>
        </div>
      )}

      <div className={s.cbExtractSteps}>
        {EXTRACTION_STEPS.map((text, i) => {
          const status = stepStates[i];
          return (
            <div key={i} className={s.cbExtractStep}>
              <div
                className={`${s.cbExtractStepIcon} ${
                  status === 'done'
                    ? s.cbExtractStepIconDone
                    : status === 'active'
                    ? s.cbExtractStepIconActive
                    : s.cbExtractStepIconPending
                }`}
              >
                {status === 'done' ? (
                  <Check size={14} strokeWidth={3} />
                ) : status === 'active' ? (
                  <Loader2 size={14} className={s.cbSpinner} />
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                )}
              </div>
              <span
                className={`${s.cbExtractStepText} ${
                  status === 'active'
                    ? s.cbExtractStepTextActive
                    : status === 'done'
                    ? s.cbExtractStepTextDone
                    : ''
                }`}
              >
                {text}
              </span>
            </div>
          );
        })}
      </div>

      <div className={s.cbExtractProgressBar}>
        <div
          className={s.cbExtractProgressFill}
          style={{ width: `${progress}%` }}
        />
      </div>

      {showData && (
        <div className={s.cbDataReveal}>
          {dataEntries.map(([key, val], i) => {
            const label =
              key === 'ragione_sociale'
                ? 'Ragione Sociale'
                : key === 'sede_legale'
                ? 'Sede Legale'
                : key === 'codice_fiscale'
                ? 'Codice Fiscale'
                : key === 'partita_iva'
                ? 'Partita IVA'
                : key === 'rea'
                ? 'REA'
                : key === 'forma_giuridica'
                ? 'Forma Giuridica'
                : key === 'nome_legale_rappresentante'
                ? 'Legale Rappresentante'
                : key === 'email_pec'
                ? 'Email PEC'
                : key === 'telefono'
                ? 'Telefono'
                : key;
            return (
              <div
                key={key}
                className={s.cbDataRow}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <Check size={14} color="#22c55f" />
                <span className={s.cbDataRowLabel}>{label}</span>
                <span className={s.cbDataRowValue}>{val}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
