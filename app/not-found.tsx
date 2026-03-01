import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page-shell">
      <div className="bndo-shell">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 18px' }}>
          <div style={{ textAlign: 'center', maxWidth: 520 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'rgba(100, 116, 139, 0.95)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Pagina non trovata
            </div>
            <div style={{ marginTop: 10, fontSize: 38, fontWeight: 900, color: 'rgba(11, 17, 54, 0.95)', letterSpacing: '-0.03em' }}>
              Torniamo alla chat
            </div>
            <div style={{ marginTop: 10, fontSize: 15, fontWeight: 650, color: 'rgba(100, 116, 139, 0.95)', lineHeight: 1.6 }}>
              Il link che hai aperto non esiste. Puoi ripartire dallo scanner bandi o dalla chat principale.
            </div>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
              <Link
                href="/"
                style={{
                  minHeight: 44,
                  padding: '12px 18px',
                  borderRadius: 14,
                  border: '1px solid rgba(0,0,0,0.06)',
                  background: 'linear-gradient(135deg, rgba(11, 17, 54, 0.98), #0a2540 55%, rgba(11, 17, 54, 0.98))',
                  color: '#fff',
                  fontWeight: 900,
                  boxShadow: '0 18px 44px rgba(11, 17, 54, 0.16)',
                  textDecoration: 'none'
                }}
              >
                Apri BNDO Assistant
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

