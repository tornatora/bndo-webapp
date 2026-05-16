import { getOptionalUserProfile, createServerSupabaseClient } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';

export default async function AdminVisitsTrafficPage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <VisitsFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/visits-traffic] Auth error:', err);
    return <VisitsFallback />;
  }

  let supabase: any = null;
  try {
    supabase = createServerSupabaseClient() as any;
  } catch (err) {
    console.error('[admin/visits-traffic] Client error:', err);
  }

  let totalViews = 0;
  let uniqueSessions = 0;
  let allUniqueSessions = 0;
  let totalEvents = 0;
  const dailyTrend: Array<[string, number]> = [];
  const topPages: Array<[string, number]> = [];
  const channelStats: Array<[string, number]> = [];

  if (supabase) {
    try {
      const queries = await Promise.allSettled([
        supabase.from('platform_events').select('*', { count: 'exact', head: true }).eq('event_type', 'page_view'),
        supabase.from('platform_events').select('session_id').eq('event_type', 'page_view').not('session_id', 'is', null),
        supabase.from('platform_events').select('page_path').eq('event_type', 'page_view').not('page_path', 'is', null).limit(500),
        supabase.from('platform_events').select('created_at').eq('event_type', 'page_view').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).limit(2000),
        supabase.from('platform_events').select('channel').eq('event_type', 'page_view').not('channel', 'is', null).limit(500),
        supabase.from('platform_events').select('session_id').not('session_id', 'is', null).limit(2000),
        supabase.from('platform_events').select('*', { count: 'exact', head: true }),
      ]);

      // Total page views
      if (queries[0].status === 'fulfilled' && queries[0].value.count) totalViews = queries[0].value.count;

      // Unique sessions (page views)
      if (queries[1].status === 'fulfilled') {
        const sessions = queries[1].value.data ?? [];
        uniqueSessions = new Set(sessions.map((s: any) => s.session_id)).size;
      }

      // Top pages
      if (queries[2].status === 'fulfilled') {
        const rawPages = queries[2].value.data ?? [];
        const pageCounts = new Map<string, number>();
        for (const r of rawPages) {
          const path = (r as any).page_path || '/';
          pageCounts.set(path, (pageCounts.get(path) ?? 0) + 1);
        }
        topPages.push(...[...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));
      }

      // Daily trend
      if (queries[3].status === 'fulfilled') {
        const dailyData = queries[3].value.data ?? [];
        const dailyCounts = new Map<string, number>();
        for (const r of dailyData) {
          const day = (r as any).created_at?.split('T')[0] || '—';
          dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
        }
        dailyTrend.push(...[...dailyCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
      }

      // Channel stats
      if (queries[4].status === 'fulfilled') {
        const channelData = queries[4].value.data ?? [];
        const channelCounts = new Map<string, number>();
        for (const r of channelData) {
          const ch = (r as any).channel || 'unknown';
          channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
        }
        channelStats.push(...[...channelCounts.entries()].sort((a, b) => b[1] - a[1]));
      }

      // All sessions
      if (queries[5].status === 'fulfilled') {
        const allSessions = queries[5].value.data ?? [];
        allUniqueSessions = new Set(allSessions.map((s: any) => s.session_id)).size;
      }

      // Total events
      if (queries[6].status === 'fulfilled' && queries[6].value.count) totalEvents = queries[6].value.count;
    } catch (err) {
      console.error('[admin/visits-traffic] Query error:', err);
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
          Visite & Traffico
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: 0 }}>
          Statistiche di navigazione e utilizzo della piattaforma.
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 28 }}>
        <KpiCard label="Pagine viste" value={String(totalViews ?? 0)} />
        <KpiCard label="Sessioni uniche" value={String(uniqueSessions)} />
        <KpiCard label="Utenti attivi" value={String(allUniqueSessions)} sub="sessioni totali" />
        <KpiCard label="Eventi totali" value={String(totalEvents ?? 0)} sub="tutti gli eventi" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Daily trend */}
        <div style={{
          padding: 20, borderRadius: 14, background: '#fff',
          border: '0.5px solid rgba(11,17,54,0.06)',
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 12px' }}>
            Trend giornaliero (7 giorni)
          </h2>
          {dailyTrend.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.4)', textAlign: 'center', padding: 20 }}>
              Nessun dato disponibile.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dailyTrend.map(([day, count]) => (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: 'rgba(11,17,54,0.45)', width: 60, flexShrink: 0 }}>
                    {day?.split('-').slice(1).join('/')}
                  </span>
                  <div style={{
                    flex: 1, height: 20, borderRadius: 4,
                    background: '#F1F2F4', position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', top: 0, left: 0, height: '100%',
                      width: `${Math.max(5, (count / Math.max(...dailyTrend.map(([, c]) => c))) * 100)}%`,
                      background: '#0B1136', borderRadius: 4, opacity: 0.8,
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#0B1136', width: 40, textAlign: 'right' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top pages */}
        <div style={{
          padding: 20, borderRadius: 14, background: '#fff',
          border: '0.5px solid rgba(11,17,54,0.06)',
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 12px' }}>
            Pagine più visitate
          </h2>
          {topPages.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.4)', textAlign: 'center', padding: 20 }}>
              Nessun dato disponibile.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {topPages.map(([path, count]) => (
                <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 500, color: 'rgba(11,17,54,0.65)',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {path}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#0B1136', flexShrink: 0 }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Channel breakdown */}
      {channelStats.length > 0 && (
        <div style={{
          padding: 20, borderRadius: 14, background: '#fff',
          border: '0.5px solid rgba(11,17,54,0.06)', marginTop: 20,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 12px' }}>
            Canali di accesso
          </h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {channelStats.map(([ch, count]) => (
              <div key={ch} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1136', letterSpacing: '-0.03em' }}>
                  {count}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(11,17,54,0.45)', marginTop: 2 }}>
                  {ch || 'Sconosciuto'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VisitsFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Visite & Traffico</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 12, background: '#fff',
      border: '0.5px solid rgba(11,17,54,0.06)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(11,17,54,0.4)', marginBottom: 4, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#0B1136', letterSpacing: '-0.03em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'rgba(11,17,54,0.35)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
