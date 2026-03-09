import Link from 'next/link';

export default function RegisterPage({
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
            <span>✅</span>
            <span>Crea Account</span>
          </div>
          <h1 className="login-title">Registrazione</h1>
          <p className="login-subtitle">Crea il tuo account BNDO e accedi subito alla piattaforma.</p>
        </div>

        <form action="/api/auth/register" method="post" className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="fullName">
              Nome e Cognome
            </label>
            <input id="fullName" name="fullName" type="text" className="form-input" placeholder="Mario Rossi" required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="companyName">
              Azienda
            </label>
            <input id="companyName" name="companyName" type="text" className="form-input" placeholder="BNDO SRL" required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" className="form-input" placeholder="nome@azienda.it" required />
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
              placeholder="Almeno 8 caratteri"
              minLength={8}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">
              Conferma Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="form-input"
              placeholder="Ripeti la password"
              minLength={8}
              required
            />
          </div>

          {errorParam ? (
            <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>{errorParam}</p>
          ) : null}

          {successParam ? (
            <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#15803d' }}>{successParam}</p>
          ) : null}

          <button type="submit" className="btn-login">
            <span>Crea account →</span>
          </button>

          <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--text-light)' }}>
            Hai gia un account?{' '}
            <Link href="/login" style={{ color: 'var(--navy)', fontWeight: 600 }}>
              Accedi
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
