import { redirect } from 'next/navigation';
import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { AdminShellClient } from '@/components/admin/AdminShellClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function deriveUsername(profile: { full_name?: string | null; email?: string | null; id: string }) {
  // Use full_name if it looks like a real name (letters + spaces, no numbers/underscores)
  const safe = String(profile.full_name ?? '').trim();
  if (safe && /^[a-zA-ZÀ-ÿ\s'-]+$/.test(safe)) {
    return safe.toLowerCase().replace(/\s+/g, '');
  }
  // Fallback: email prefix (part before @)
  if (profile.email) {
    const prefix = profile.email.split('@')[0];
    if (prefix && prefix.length >= 2) return prefix.toLowerCase();
  }
  // Last resort: profile id prefix
  return profile.id.slice(0, 8);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Auth check — guaranteed to never throw
  let profileBundle = null;
  try {
    profileBundle = await getOptionalUserProfile();
  } catch {
    redirect('/login?mode=admin&error=Errore%20autenticazione');
    return;
  }

  if (!profileBundle) {
    redirect('/login?mode=admin&error=Utente%20non%20autenticato');
    return;
  }

  const { profile } = profileBundle;
  if (!hasAdminAccess(profile.role)) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 700 }}>
        <div style={{
          padding: '40px 32px', borderRadius: 14, background: '#fff',
          border: '0.5px solid rgba(11,17,54,0.06)', textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 8px' }}>
            Accesso non autorizzato
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)', margin: '0 0 8px', lineHeight: 1.6 }}>
            Questa sezione è riservata agli amministratori.<br />
            Sei loggato come <strong>{profile.email || profile.id}</strong> ma il tuo profilo non ha i permessi admin.
          </p>
          <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.35)', margin: '0 0 20px' }}>
            Ruolo attuale: <span style={{ fontWeight: 600, color: 'rgba(11,17,54,0.5)' }}>{profile.role || 'nessuno'}</span>
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/dashboard/pratiche" style={{
              padding: '8px 18px', borderRadius: 8,
              background: '#0B1136', color: '#fff', textDecoration: 'none',
              fontSize: 12, fontWeight: 600,
            }}>
              Vai alla dashboard
            </Link>
            <Link href="/api/auth/logout?redirect=/login?mode=admin" style={{
              padding: '8px 18px', borderRadius: 8,
              background: '#F1F2F4', color: 'rgba(11,17,54,0.6)', textDecoration: 'none',
              fontSize: 12, fontWeight: 500,
            }}>
              Cambia account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const username = deriveUsername(profile);

  return (
    <AdminShellClient username={username} viewerProfileId={profile.id}>
      {children}
    </AdminShellClient>
  );
}
