import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { AdminFinanceControl } from '@/components/admin/AdminFinanceControl';

export default async function AdminFinancePage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <UnauthorizedFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/finance] Auth error:', err);
    return <UnauthorizedFallback />;
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
          Finanza
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: 0 }}>
          Pagamenti, payout e transazioni della piattaforma.
        </p>
      </div>
      <AdminFinanceControl />
    </div>
  );
}

function UnauthorizedFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Finanza</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}
