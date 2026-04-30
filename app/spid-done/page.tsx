'use client';

import { useEffect } from 'react';

export default function SpidDonePage() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"',
        background: '#0f172a',
        color: '#e2e8f0',
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.08, textTransform: 'uppercase', opacity: 0.85 }}>
          browser.bndo.it
        </div>
        <div style={{ marginTop: 10, fontSize: 22, fontWeight: 900 }}>
          Accesso completato
        </div>
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>
          Puoi chiudere questa finestra. La compilazione continua in background nella dashboard BNDO.
        </div>
      </div>
    </main>
  );
}
