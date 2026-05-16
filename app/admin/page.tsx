import { redirect } from 'next/navigation';
import { getOptionalUserProfile } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/** Create a supabase client wrapped in try-catch */
async function createClient() {
  try {
    const { createServerSupabaseClient } = await import('@/shared/api');
    return createServerSupabaseClient();
  } catch {
    return null;
  }
}

/** Safe count query */
async function cnt(supabase: any, table: string, filter?: (q: any) => any): Promise<number> {
  if (!supabase) return 0;
  try {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Safe revenue query */
async function rev(supabase: any, table: string, filter?: (q: any) => any): Promise<number> {
  if (!supabase) return 0;
  try {
    let q = supabase.from(table).select('amount');
    if (filter) q = filter(q);
    const { data } = await q;
    return ((data ?? []) as any[]).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  } catch {
    return 0;
  }
}

export default async function ControlTowerPage() {
  try {
    // 1. Auth check
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle) {
        redirect('/login?mode=admin&error=Utente%20non%20autenticato');
        return <></>;
      }
      if (!hasAdminAccess(bundle.profile.role)) {
        redirect('/dashboard/pratiche');
        return <></>;
      }
    }

    // 2. KPI data
    const supabase = await createClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [
      openPractices, totalPractices,
      totalPayments, monthPayments, revenueThisMonth,
      totalCompanies, newCompanies,
      totalQuiz, monthQuiz,
      chatsToday, practiceChatsToday,
    ] = await Promise.all([
      cnt(supabase, 'tender_applications', (q: any) => q.in('status', ['draft', 'in_progress'])),
      cnt(supabase, 'tender_applications'),
      cnt(supabase, 'practice_payments', (q: any) => q.eq('status', 'completed')),
      cnt(supabase, 'practice_payments', (q: any) => q.eq('status', 'completed').gte('created_at', monthStart)),
      rev(supabase, 'practice_payments', (q: any) => q.eq('status', 'completed').gte('created_at', monthStart)),
      cnt(supabase, 'companies'),
      cnt(supabase, 'companies', (q: any) => q.gte('created_at', monthStart)),
      cnt(supabase, 'quiz_submissions'),
      cnt(supabase, 'quiz_submissions', (q: any) => q.gte('created_at', monthStart)),
      cnt(supabase, 'consultant_messages', (q: any) => q.gte('created_at', dayStart)),
      cnt(supabase, 'consultant_practice_messages', (q: any) => q.gte('created_at', dayStart)),
    ]);

    return (
      <Dashboard
        openPractices={openPractices}
        totalPractices={totalPractices}
        totalPayments={totalPayments}
        monthPayments={monthPayments}
        revenueThisMonth={revenueThisMonth}
        totalCompanies={totalCompanies}
        newCompanies={newCompanies}
        totalQuiz={totalQuiz}
        monthQuiz={monthQuiz}
        totalChatsToday={chatsToday + practiceChatsToday}
      />
    );
  } catch (err) {
    // Last-resort fallback — never 500
    console.error('[admin] Fatal error rendering ControlTower:', err);
    return <Dashboard openPractices={0} totalPractices={0} totalPayments={0} monthPayments={0} revenueThisMonth={0} totalCompanies={0} newCompanies={0} totalQuiz={0} monthQuiz={0} totalChatsToday={0} />;
  }
}

// ---- Presentational ----

function formatEuro(cents: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

function Dashboard({
  openPractices, totalPractices, totalPayments, monthPayments, revenueThisMonth,
  totalCompanies, newCompanies, totalQuiz, monthQuiz, totalChatsToday,
}: {
  openPractices: number; totalPractices: number; totalPayments: number; monthPayments: number;
  revenueThisMonth: number; totalCompanies: number; newCompanies: number;
  totalQuiz: number; monthQuiz: number; totalChatsToday: number;
}) {
  const kpis = [
    { label: 'Pratiche aperte', value: String(openPractices), sub: `${totalPractices} totali` },
    { label: 'Chat oggi', value: String(totalChatsToday), sub: 'messaggi AI + consulenti' },
    { label: 'Pagamenti mese', value: String(monthPayments), sub: `${totalPayments} totali` },
    { label: 'Fatturato mese', value: formatEuro(revenueThisMonth), sub: 'pratiche completate' },
    { label: 'Aziende registrate', value: String(totalCompanies), sub: `${newCompanies} questo mese` },
    { label: 'Quiz compilati', value: String(totalQuiz), sub: `${monthQuiz} questo mese` },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: '#0B1136', margin: 0 }}>Torre di Controllo</h1>
        <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)', margin: '4px 0 0' }}>Panoramica in tempo reale della piattaforma.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} style={{ padding: '22px 24px', borderRadius: 14, background: '#fff', border: '0.5px solid rgba(11,17,54,0.06)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(11,17,54,0.4)', marginBottom: 6, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#0B1136', letterSpacing: '-0.03em', marginBottom: 4 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.4)' }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <QLink href="/admin/clients" icon="👥" label="Vedi tutti i clienti" />
        <QLink href="/admin/finance" icon="💰" label="Vedi pagamenti e finanza" />
        <QLink href="/admin/quiz-responses" icon="🧩" label="Risposte quiz" />
        <QLink href="/admin/chat-log" icon="💬" label="Chat log" />
      </div>
    </div>
  );
}

function QLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 12, background: '#fff', border: '0.5px solid rgba(11,17,54,0.06)', textDecoration: 'none', color: '#0B1136', fontSize: 12.5, fontWeight: 600 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </a>
  );
}
