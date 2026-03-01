'use client';

import { useEffect, useMemo, useState } from 'react';

export function ScannerAnimation() {
  const steps = useMemo(
    () => [
      'Scansione bandi nazionali…',
      'Scansione bandi regionali…',
      'Filtraggio per requisiti…',
      'Match in corso…',
      'Ordinamento per scadenza…'
    ],
    []
  );
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % steps.length);
    }, 900);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className="scan-wrap">
      <div className="scan-lens" aria-hidden="true">
        <div className="scan-sweep">
          <div className="scan-line" />
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 900, color: 'var(--navy)' }}>Scanner in corso…</div>
        <div style={{ fontSize: 14, color: 'var(--text-light)', fontWeight: 700 }}>{steps[idx] ?? steps[0]}</div>
      </div>
    </div>
  );
}
