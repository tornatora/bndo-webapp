import Link from 'next/link';

export default function LoginPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  return (
    <section id="loginScreen" className="login-hero">
      <div className="login-content">
        <div className="login-header">
          <div className="login-badge">
            <span>👤</span>
            <span>Area Cliente</span>
          </div>
          <h1 className="login-title">Bentornato</h1>
          <p className="login-subtitle">Accedi alla tua area personale BNDO</p>
        </div>

        <form action="/api/auth/login" method="post" className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="identifier">
              Username o Email
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              className="form-input"
              placeholder="Inserisci username o email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              placeholder="Inserisci password"
              required
            />
          </div>

          {searchParams.error ? (
            <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>{searchParams.error}</p>
          ) : null}

          <button type="submit" className="btn-login">
            <span>Accedi alla Dashboard →</span>
          </button>

          <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--text-light)' }}>
            Non hai ancora un account?{' '}
            <Link href="/" style={{ color: 'var(--navy)', fontWeight: 600 }}>
              Attiva il servizio
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
