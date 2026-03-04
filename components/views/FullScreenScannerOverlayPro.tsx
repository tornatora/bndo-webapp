'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export function FullScreenScannerOverlayPro({ open }: { open: boolean }) {
  const steps = useMemo(
    () => [
      'Scansione fonti ufficiali nazionali',
      'Scansione fonti regionali e Camere di Commercio',
      'Scansione fonti locali e territoriali',
      'Verifica requisiti obbligatori del tuo profilo',
      'Ranking finale e priorità dei bandi migliori',
    ],
    [],
  );

  const minDurationMs = 5600;
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const startAtRef = useRef<number>(0);

  useEffect(() => {
    if (!open) return;
    startAtRef.current = Date.now();
    setIdx(0);
    setProgress(0);

    const progressId = setInterval(() => {
      const elapsed = Date.now() - startAtRef.current;
      const next = Math.max(0, Math.min(100, (elapsed / minDurationMs) * 100));
      setProgress(next);
      const stepIndex = Math.min(steps.length - 1, Math.floor((next / 100) * steps.length));
      setIdx(stepIndex);
    }, 90);

    return () => {
      clearInterval(progressId);
    };
  }, [open, steps.length]);

  if (!open) return null;

  const stepStatus = (stepIndex: number): 'done' | 'active' | 'pending' => {
    if (stepIndex < idx) return 'done';
    if (stepIndex === idx) return 'active';
    return 'pending';
  };

  return (
    <div className="scan-overlay" role="status" aria-live="polite" aria-label="Ricerca bandi in corso">
      <div className="scan-overlay-inner scan-overlay-inner--minimal">
        <div className="scan-panel-glow" aria-hidden="true" />
        <div className="scan-ai-stars" aria-hidden="true">
          <span className="scan-ai-star scan-ai-star-a">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" />
            </svg>
          </span>
          <span className="scan-ai-star scan-ai-star-b">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3.5L14.1 9.9L20.5 12L14.1 14.1L12 20.5L9.9 14.1L3.5 12L9.9 9.9L12 3.5Z" />
            </svg>
          </span>
          <span className="scan-ai-star scan-ai-star-c">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5L13.8 10.2L19 12L13.8 13.8L12 19L10.2 13.8L5 12L10.2 10.2L12 5Z" />
            </svg>
          </span>
        </div>

        <header className="scan-head">
          <div className="scan-badge-row">
            <span className="scan-ai-tag">Analisi Bandi con AI</span>
          </div>
          <h2 className="scan-title">
            <span>Sto cercando i bandi migliori</span>
            <span className="scan-title-break">per te</span>
          </h2>
        </header>

        <div className="scan-step-list">
          {steps.map((step, stepIndex) => {
            const status = stepStatus(stepIndex);
            const statusLabel = status === 'done' ? 'OK' : status === 'active' ? 'In corso' : 'Attesa';
            return (
              <div key={step} className={`scan-step-row scan-step-row--${status}`}>
                <span className="scan-step-text">{step}</span>
                <span className="scan-step-state">{statusLabel}</span>
              </div>
            );
          })}
        </div>

        <div className="scan-foot">
          <div className="scan-progress-wrap" aria-hidden="true">
            <span className="scan-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="scan-progress-label">{Math.round(progress)}%</span>
        </div>

        <div className="scan-sub">Fase in corso: {steps[idx] ?? steps[0]}</div>
      </div>
    </div>
  );
}
