import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { AdminAnalyticsControl } from '@/components/admin/AdminAnalyticsControl';

export default async function AdminAnalyticsPage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <UnauthorizedFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/analytics] Auth error:', err);
    return <UnauthorizedFallback />;
  }
  return <AdminAnalyticsControl />;
}

function UnauthorizedFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Analytics</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}
