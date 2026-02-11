import Link from 'next/link';

export default function ForgotPasswordPage({
  searchParams
}: {
  searchParams?: { error?: string | string[]; success?: string | string[] };
}) {
  const errorParam = Array.isArray(searchParams?.error) ? searchParams?.error[0] : searchParams?.error;
  const successParam = Array.isArray(searchParams?.success) ? searchParams?.success[0] : searchParams?.success;

  return (
    <section className="login-hero">
      <div className="login-content">
        <div className="login-header">
          <div className="login-badge">
            <span>🔐</span>
            <span>Recupero password</span>
          </div>
          <h1 className="login-title">Password dimenticata</h1>
          <p className="login-subtitle">Inserisci la tua email e ti inviamo un link per reimpostare la password.</p>
        </div>

        <form action="/api/auth/forgot-password" method="post" className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email account
            </label>
            <input id="email" name="email" type="email" className="form-input" placeholder="nome@azienda.it" required />
          </div>

          {errorParam ? (
            <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>{errorParam}</p>
          ) : null}

          {successParam ? (
            <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#15803d' }}>{successParam}</p>
          ) : null}

          <button type="submit" className="btn-login">
            <span>Invia link di reset →</span>
          </button>

          <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--text-light)' }}>
            Torna al{' '}
            <Link href="/login" style={{ color: 'var(--navy)', fontWeight: 600 }}>
              login
            </Link>
            .
          </p>
        </form>
      </div>
    </section>
  );
}
