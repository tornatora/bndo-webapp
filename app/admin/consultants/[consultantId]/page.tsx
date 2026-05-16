import { getOptionalUserProfile, createServerSupabaseClient } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import Link from 'next/link';

type Params = Promise<{ consultantId: string }>;

export default async function ConsultantDetailPage({ params }: { params: Params }) {
  const { consultantId } = await params;

  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <ConsultantDetailFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/consultant-detail] Auth error:', err);
    return <ConsultantDetailFallback />;
  }

  let supabase: any = null;
  let consultant: any = null;
  try {
    supabase = createServerSupabaseClient();
    const sba = supabase as any;

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, username, role, created_at')
      .eq('id', consultantId)
      .single();
    consultant = data;
  } catch (err) {
    console.error('[admin/consultant-detail] Query error:', err);
  }

  if (!consultant) {
    return (
      <div style={{ padding: 32 }}>
        <Link href="/admin/consultants" style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
          ← Torna alla lista
        </Link>
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(11,17,54,0.4)', fontSize: 13 }}>Consulente non trovato.</div>
      </div>
    );
  }

  // Assigned practices
  let assignments: any[] = [];
  let practiceMessages = 0;
  let generalMessages = 0;
  let activeThreads = 0;
  let payouts: any[] = [];

  if (supabase && consultant) {
    try {
      const sba = supabase as any;
      const results = await Promise.allSettled([
        sba.from('consultant_practice_assignments')
          .select('application_id, tender_applications!inner(id, company_id, status, bando_type, created_at, companies!inner(name))')
          .eq('consultant_id', consultantId),
        sba.from('consultant_practice_messages').select('*', { count: 'exact', head: true }).eq('sender_id', consultantId),
        supabase.from('consultant_messages').select('*', { count: 'exact', head: true }).eq('sender_id', consultantId),
        sba.from('consultant_practice_thread_participants').select('*', { count: 'exact', head: true }).eq('profile_id', consultantId),
        sba.from('consultant_payouts').select('amount, status').eq('consultant_id', consultantId),
      ]);

      if (results[0].status === 'fulfilled') assignments = results[0].value.data ?? [];
      if (results[1].status === 'fulfilled') practiceMessages = results[1].value.count ?? 0;
      if (results[2].status === 'fulfilled') generalMessages = results[2].value.count ?? 0;
      if (results[3].status === 'fulfilled') activeThreads = results[3].value.count ?? 0;
      if (results[4].status === 'fulfilled') payouts = results[4].value.data ?? [];
    } catch (err) {
      console.error('[admin/consultant-detail] Queries error:', err);
    }
  }

  const totalPayoutCents = payouts.reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
  const pendingPayouts = (payouts ?? []).filter((p: any) => p.status === 'pending').reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      {/* Back link */}
      <Link href="/admin/consultants" style={{ fontSize: 12, color: 'rgba(11,17,54,0.45)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
        <span style={{ fontSize: 14 }}>←</span> Torna alla lista consulenti
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <span style={{
          width: 52, height: 52, borderRadius: 14,
          background: consultant.role === 'ops_admin' ? '#0acf83' : '#0B1136',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          {(consultant.full_name || consultant.email || '?').charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: 0 }}>
            {consultant.full_name || '—'}
          </h1>
          <div style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', marginTop: 2 }}>
            {consultant.email} {consultant.role === 'ops_admin' ? '· Admin' : '· Consulente'}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        <KpiCard label="Pratiche assegnate" value={String(assignments?.length ?? 0)} />
        <KpiCard label="Thread attivi" value={String(activeThreads ?? 0)} />
        <KpiCard label="Messaggi inviati" value={String((practiceMessages ?? 0) + (generalMessages ?? 0))} />
        <KpiCard label="Payout totale" value={formatCents(totalPayoutCents)} />
        <KpiCard label="Payout in sospeso" value={formatCents(pendingPayouts)} warn />
      </div>

      {/* Assigned practices table */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 10px' }}>
          Pratiche assegnate
        </h2>
        {(assignments ?? []).length === 0 ? (
          <div style={{ padding: 20, background: '#FAFBFC', borderRadius: 12, fontSize: 12, color: 'rgba(11,17,54,0.4)', textAlign: 'center' }}>
            Nessuna pratica assegnata.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(assignments ?? []).slice(0, 20).map((a: any) => {
              const app = a.tender_applications;
              return (
                <Link
                  key={a.application_id}
                  href={`/admin/clients/${app.company_id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    background: '#FAFBFC', textDecoration: 'none', color: '#0B1136',
                    fontSize: 12, transition: 'all .15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F2F4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFBFC'; }}
                >
                  <span style={{ flex: 1, fontWeight: 500 }}>{app.companies?.name || '—'}</span>
                  <span style={{ color: 'rgba(11,17,54,0.4)' }}>
                    {app.bando_type === 'resto-al-sud-2-0' ? 'Resto al Sud 2.0' : app.bando_type === 'autoimpiego-centro-nord' ? 'Autoimpiego CN' : app.bando_type || '—'}
                    {' · '}{(app.created_at || '').split('T')[0]}
                  </span>
                  <StatusBadge status={app.status} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: warn ? '#FEF3C7' : '#fff',
      border: '0.5px solid rgba(11,17,54,0.06)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(11,17,54,0.4)', marginBottom: 4, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: warn ? '#D97706' : '#0B1136', letterSpacing: '-0.03em' }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: '#F1F2F4',
    in_progress: '#DBEAFE',
    submitted: '#DCFCE7',
    completed: '#0acf83',
    rejected: '#FEE2E2',
  };
  const textColors: Record<string, string> = {
    draft: 'rgba(11,17,54,0.4)',
    in_progress: '#2563EB',
    submitted: '#16A34A',
    completed: '#fff',
    rejected: '#DC2626',
  };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      background: colors[status] || '#F1F2F4',
      color: textColors[status] || 'rgba(11,17,54,0.4)',
      letterSpacing: '-0.01em',
      whiteSpace: 'nowrap',
    }}>
      {status === 'draft' ? 'Bozza' : status === 'in_progress' ? 'In corso' : status === 'submitted' ? 'Inviata' : status === 'completed' ? 'Completata' : status === 'rejected' ? 'Respinta' : status}
    </span>
  );
}

function ConsultantDetailFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Dettaglio Consulente</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}
