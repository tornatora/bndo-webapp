import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { AdminAuditTrailClient } from '@/components/admin/AdminAuditTrailClient';

export default async function AdminAuditPage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <UnauthorizedFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/audit] Auth error:', err);
    return <UnauthorizedFallback />;
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
          Audit
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: 0 }}>
          Registro delle attività sensibili e modifiche sulla piattaforma.
        </p>
      </div>
      <AdminAuditTrailClient />
    </div>
  );
}

function UnauthorizedFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Audit</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}
