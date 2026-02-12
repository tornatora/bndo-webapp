import Link from 'next/link';

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string | string[]; success?: string | string[]; mode?: string | string[]; next?: string | string[] };
}) {
  const errorParam = Array.isArray(searchParams?.error) ? searchParams?.error[0] : searchParams?.error;
  const successParam = Array.isArray(searchParams?.success) ? searchParams?.success[0] : searchParams?.success;
  const modeParam = Array.isArray(searchParams?.mode) ? searchParams?.mode[0] : searchParams?.mode;
  const nextParam = Array.isArray(searchParams?.next) ? searchParams?.next[0] : searchParams?.next;

  const isAdminMode = modeParam === 'admin';
  const badgeIcon = isAdminMode ? '🛡️' : '👤';
  const badgeText = isAdminMode ? 'Area Admin' : 'Area Cliente';
  const titleText = isAdminMode ? 'Accesso Admin' : 'Bentornato';
  const subtitleText = isAdminMode
    ? 'Accedi al pannello amministrativo BNDO'
    : 'Accedi alla tua area personale BNDO';
  const buttonText = isAdminMode ? 'Accedi al pannello Admin →' : 'Accedi alla Dashboard →';

  return (
    <section id="loginScreen" className="login-hero">
      <div className="login-content">
        <div className="login-header">
          <div className="login-badge">
            <span>{badgeIcon}</span>
            <span>{badgeText}</span>
          </div>
          <h1 className="login-title">{titleText}</h1>
          <p className="login-subtitle">{subtitleText}</p>
        </div>

        <form action="/api/auth/login" method="post" className="login-form">
          <input type="hidden" name="mode" value={isAdminMode ? 'admin' : 'user'} />
          {nextParam ? <input type="hidden" name="next" value={nextParam} /> : null}

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

          {errorParam ? (
            <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>{errorParam}</p>
          ) : null}

          {successParam ? (
            <p style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#15803d' }}>{successParam}</p>
          ) : null}

          <button type="submit" className="btn-login">
            <span>{buttonText}</span>
          </button>

          {isAdminMode ? (
            <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-light)' }}>
              Recupero password admin disabilitato in area live.
            </p>
          ) : (
            <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-light)' }}>
              Hai dimenticato la password?{' '}
              <Link href="/forgot-password" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                Recuperala qui
              </Link>
              .
            </p>
          )}

          {!isAdminMode ? (
            <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--text-light)' }}>
              Non hai ancora un account?{' '}
              <Link href="/register" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                Registrati
              </Link>
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
