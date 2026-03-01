'use client';

import { useEffect, useMemo, useState } from 'react';

export function FullScreenScannerOverlay({ open }: { open: boolean }) {
  const steps = useMemo(
    () => [
      'Sto cercando tra i bandi appena pubblicati…',
      'Sto filtrando per requisiti e territorio…',
      'Sto valutando settore, finalita e beneficiari…',
      'Sto selezionando i match piu forti…',
      'Quasi pronto…'
    ],
    []
  );

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % steps.length);
    }, 900);
    return () => clearInterval(id);
  }, [open, steps.length]);

  if (!open) return null;

  return (
    <div className="scan-overlay" role="status" aria-live="polite" aria-label="Ricerca bandi in corso">
      <div className="scan-overlay-inner">
        <div className="scan-orb" aria-hidden="true" />
        <div className="scan-title">Sto ricercando il BNDO giusto per te</div>
        <div className="scan-sub">{steps[idx] ?? steps[0]}</div>
        <div className="scan-dots" aria-hidden="true">
          <span className="scan-dot" />
          <span className="scan-dot" />
          <span className="scan-dot" />
        </div>
      </div>
    </div>
  );
}

