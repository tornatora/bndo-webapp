import { getOptionalUserProfile, createServerSupabaseClient } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import Link from 'next/link';

export default async function AdminConsultantsPage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <ConsultantsFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/consultants] Auth error:', err);
    return <ConsultantsFallback />;
  }

  let consultants: any[] = [];
  try {
    const supabase = createServerSupabaseClient();
    const sba = supabase as any;

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, username, role, created_at')
      .in('role', ['consultant', 'ops_admin'])
      .order('created_at', { ascending: false });
    consultants = data ?? [];

    // Get assignment counts for each consultant
    const consultantIds = consultants.map((c) => c.id);
    if (consultantIds.length > 0) {
      const { data: assignments } = await sba
        .from('consultant_practice_assignments')
        .select('consultant_id')
        .in('consultant_id', consultantIds);

      const assignmentCountMap = new Map<string, number>();
      for (const a of assignments ?? []) {
        assignmentCountMap.set(a.consultant_id, (assignmentCountMap.get(a.consultant_id) ?? 0) + 1);
      }
      consultants = consultants.map((c) => ({
        ...c,
        practiceCount: assignmentCountMap.get(c.id) ?? 0,
      }));
    }
  } catch (err) {
    console.error('[admin/consultants] Query error:', err);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
        Consulenti
      </h1>
      <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: '0 0 24px' }}>
        {consultants.length} consulenti in piattaforma.
      </p>

      {consultants.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(11,17,54,0.4)', fontSize: 13 }}>
          Nessun consulente registrato.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {consultants.map((c) => (
            <Link
              key={c.id}
              href={`/admin/consultants/${c.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                borderRadius: 12,
                background: '#fff',
                border: '0.5px solid rgba(11,17,54,0.06)',
                textDecoration: 'none',
                color: '#0B1136',
                transition: 'all .15s',
              }}
            >
              <span style={{
                width: 38, height: 38, borderRadius: 10,
                background: c.role === 'ops_admin' ? '#0acf83' : '#0B1136',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}>
                {(c.full_name || c.email || '?').charAt(0).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  {c.full_name || '—'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.45)' }}>
                  {c.email} {c.role === 'ops_admin' ? '· Admin' : ''}
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 11, color: 'rgba(11,17,54,0.45)',
              }}>
                <span>{c.practiceCount} pratiche</span>
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: '#0acf83',
                }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsultantsFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Consulenti</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}
