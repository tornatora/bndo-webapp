import Link from 'next/link';

export default function ForbiddenPage({
  searchParams
}: {
  searchParams?: { reason?: string | string[] };
}) {
  const reason = Array.isArray(searchParams?.reason) ? searchParams?.reason[0] : searchParams?.reason;
  const adminMessage =
    reason === 'admin_only'
      ? 'Questo account non ha permessi admin. Usa un account ops_admin/consultant per accedere al pannello amministrativo.'
      : 'Non hai i permessi necessari per visualizzare questa area.';

  return (
    <section className="login-hero">
      <div className="login-content">
        <div className="login-header">
          <div className="login-badge">
            <span>⛔</span>
            <span>Accesso negato</span>
          </div>
          <h1 className="login-title">Permessi insufficienti</h1>
          <p className="login-subtitle">{adminMessage}</p>
        </div>

        <div className="login-form">
          <div className="action-buttons">
            <Link href="/dashboard" className="btn-action secondary" style={{ width: '100%', justifyContent: 'center' }}>
              Vai alla dashboard cliente
            </Link>
            <Link href="/login" className="btn-action primary" style={{ width: '100%', justifyContent: 'center' }}>
              Accedi con altro account
            </Link>
          </div>
          <p style={{ marginTop: 16, fontSize: '14px', color: 'var(--text-light)' }}>
            Se devi entrare in admin, aggiorna il ruolo utente in Supabase (`ops_admin` o `consultant`).
          </p>
        </div>
      </div>
    </section>
  );
}
