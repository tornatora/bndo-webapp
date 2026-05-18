import { getOptionalUserProfile, createServerSupabaseClient } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ period?: string }>;

export default async function AdminVisitsTrafficPage({ searchParams }: { searchParams: SearchParams }) {
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

  const { period: rawPeriod } = await searchParams;
  const period = ['30', '90', 'all'].includes(rawPeriod ?? '') ? rawPeriod! : '30';
  const days = period === 'all' ? 365 * 10 : Number(period);

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const periodLabel = period === 'all' ? 'Tutto' : `Ultimi ${days} giorni`;

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
  let todayViews = 0;
  const dailyTrend: Array<[string, number]> = [];
  const topPages: Array<[string, number]> = [];
  const channelStats: Array<[string, number]> = [];
  const eventTypeStats: Array<[string, number]> = [];
  const deviceStats: Array<[string, number, number]> = [];
  const roleStats: Array<[string, number]> = [];

  if (supabase) {
    try {
      const queries = await Promise.allSettled([
        // total page_views in period
        supabase.from('platform_events').select('*', { count: 'exact', head: true })
          .eq('event_type', 'page_view').gte('created_at', since),
        // unique page_view sessions
        supabase.from('platform_events').select('session_id')
          .eq('event_type', 'page_view').not('session_id', 'is', null).gte('created_at', since),
        // top pages
        supabase.from('platform_events').select('page_path')
          .eq('event_type', 'page_view').not('page_path', 'is', null).gte('created_at', since).limit(500),
        // daily trend
        supabase.from('platform_events').select('created_at')
          .eq('event_type', 'page_view').gte('created_at', since).limit(3000),
        // channel breakdown
        supabase.from('platform_events').select('channel')
          .eq('event_type', 'page_view').not('channel', 'is', null).gte('created_at', since).limit(500),
        // total all unique sessions
        supabase.from('platform_events').select('session_id').not('session_id', 'is', null)
          .gte('created_at', since).limit(5000),
        // total all events
        supabase.from('platform_events').select('*', { count: 'exact', head: true }).gte('created_at', since),
        // event type breakdown
        supabase.from('platform_events').select('event_type')
          .gte('created_at', since).limit(2000),
        // today's page views
        supabase.from('platform_events').select('*', { count: 'exact', head: true })
          .eq('event_type', 'page_view')
          .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
        // device breakdown (from metadata->>deviceClass)
        supabase.from('platform_events').select('metadata')
          .eq('event_type', 'page_view').gte('created_at', since).limit(2000),
        // role breakdown
        supabase.from('platform_events').select('actor_role')
          .eq('event_type', 'page_view').gte('created_at', since).limit(2000),
      ]);

      if (queries[0].status === 'fulfilled' && queries[0].value.count) totalViews = queries[0].value.count;

      if (queries[1].status === 'fulfilled') {
        const sessions = queries[1].value.data ?? [];
        uniqueSessions = new Set(sessions.map((s: any) => s.session_id)).size;
      }

      if (queries[2].status === 'fulfilled') {
        const rawPages = queries[2].value.data ?? [];
        const pageCounts = new Map<string, number>();
        for (const r of rawPages) {
          const path = (r as any).page_path || '/';
          pageCounts.set(path, (pageCounts.get(path) ?? 0) + 1);
        }
        topPages.push(...[...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));
      }

      if (queries[3].status === 'fulfilled') {
        const dailyData = queries[3].value.data ?? [];
        const dailyCounts = new Map<string, number>();
        for (const r of dailyData) {
          const day = (r as any).created_at?.split('T')[0] || '—';
          dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
        }
        dailyTrend.push(...[...dailyCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
      }

      if (queries[4].status === 'fulfilled') {
        const channelData = queries[4].value.data ?? [];
        const channelCounts = new Map<string, number>();
        for (const r of channelData) {
          const ch = (r as any).channel || 'unknown';
          channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
        }
        channelStats.push(...[...channelCounts.entries()].sort((a, b) => b[1] - a[1]));
      }

      if (queries[5].status === 'fulfilled') {
        const allSessions = queries[5].value.data ?? [];
        allUniqueSessions = new Set(allSessions.map((s: any) => s.session_id)).size;
      }

      if (queries[6].status === 'fulfilled' && queries[6].value.count) totalEvents = queries[6].value.count;

      if (queries[7].status === 'fulfilled') {
        const eventData = queries[7].value.data ?? [];
        const typeCounts = new Map<string, number>();
        for (const r of eventData) {
          const et = (r as any).event_type || 'unknown';
          typeCounts.set(et, (typeCounts.get(et) ?? 0) + 1);
        }
        eventTypeStats.push(...[...typeCounts.entries()].sort((a, b) => b[1] - a[1]));
      }

      if (queries[8].status === 'fulfilled' && queries[8].value.count) todayViews = queries[8].value.count;

      if (queries[9].status === 'fulfilled') {
        const metaRows = queries[9].value.data ?? [];
        const deviceCounts = new Map<string, number>();
        for (const r of metaRows) {
          const meta = (r as any).metadata || {};
          const dev = meta.deviceClass || 'unknown';
          deviceCounts.set(dev, (deviceCounts.get(dev) ?? 0) + 1);
        }
        const total = [...deviceCounts.values()].reduce((s, c) => s + c, 0) || 1;
        deviceStats.push(...[...deviceCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([dev, count]) => [dev, count, Math.round((count / total) * 100)] as [string, number, number])
        );
      }

      if (queries[10].status === 'fulfilled') {
        const roleRows = queries[10].value.data ?? [];
        const roleCounts = new Map<string, number>();
        for (const r of roleRows) {
          const role = (r as any).actor_role || 'anonimo';
          roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
        }
        roleStats.push(...[...roleCounts.entries()].sort((a, b) => b[1] - a[1]));
      }
    } catch (err) {
      console.error('[admin/visits-traffic] Query error:', err);
    }
  }

  const eventTypeLabels: Record<string, string> = {
    page_view: 'Pagine viste',
    quiz_completed: 'Quiz completati',
    practice_created: 'Pratiche create',
    assignment_updated: 'Assegnazioni',
    consultant_practice_message_sent: 'Messaggi inviati',
  };

  const deviceLabels: Record<string, string> = {
    desktop: 'Desktop',
    mobile: 'Mobile',
    tablet: 'Tablet',
    unknown: 'Sconosciuto',
  };

  const roleLabels: Record<string, string> = {
    client_admin: 'Clienti',
    consultant: 'Consulenti',
    ops_admin: 'Admin',
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      {/* Header + period selector */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
            Visite & Traffico
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: 0 }}>
            {periodLabel} · {totalViews.toLocaleString('it-IT')} pagine viste
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F1F2F4', borderRadius: 10, padding: 3 }}>
          {[
            { key: '30', label: '30 gg' },
            { key: '90', label: '90 gg' },
            { key: 'all', label: 'Tutto' },
          ].map(({ key, label }) => (
            <a
              key={key}
              href={`/admin/visits-traffic${key !== '30' ? `?period=${key}` : ''}`}
              style={{
                padding: '6px 14px', borderRadius: 8,
                fontSize: 11, fontWeight: 600,
                textDecoration: 'none',
                background: period === key ? '#0B1136' : 'transparent',
                color: period === key ? '#fff' : 'rgba(11,17,54,0.45)',
                transition: 'all .15s',
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        <KpiCard label="Pagine viste" value={totalViews.toLocaleString('it-IT')} sub={`${todayViews.toLocaleString('it-IT')} oggi`} />
        <KpiCard label="Sessioni uniche" value={uniqueSessions.toLocaleString('it-IT')} />
        <KpiCard label="Utenti attivi" value={allUniqueSessions.toLocaleString('it-IT')} sub="sessioni totali" />
        <KpiCard label="Eventi totali" value={totalEvents.toLocaleString('it-IT')} />
      </div>

      {/* Event type breakdown */}
      {eventTypeStats.length > 0 && (
        <div style={{
          padding: 20, borderRadius: 14, background: '#fff',
          border: '0.5px solid rgba(11,17,54,0.06)', marginBottom: 20,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 14px' }}>
            Tipi di eventi
          </h2>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {eventTypeStats.map(([et, count]) => (
              <div key={et} style={{ textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0B1136', letterSpacing: '-0.03em' }}>
                  {count.toLocaleString('it-IT')}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(11,17,54,0.45)', marginTop: 3, maxWidth: 100 }}>
                  {eventTypeLabels[et] || et}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Daily trend */}
        <div style={{
          padding: 20, borderRadius: 14, background: '#fff',
          border: '0.5px solid rgba(11,17,54,0.06)',
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 14px' }}>
            Trend giornaliero
          </h2>
          {dailyTrend.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.4)', textAlign: 'center', padding: 20 }}>
              Nessun dato disponibile.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {dailyTrend.slice(-30).map(([day, count]) => {
                const maxVal = Math.max(...dailyTrend.map(([, c]) => c), 1);
                const pct = Math.max(3, (count / maxVal) * 100);
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: 'rgba(11,17,54,0.4)', width: 40, flexShrink: 0, textAlign: 'right' }}>
                      {day?.split('-').slice(1).join('/')}
                    </span>
                    <div style={{
                      flex: 1, height: 18, borderRadius: 4,
                      background: '#F1F2F4', position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, height: '100%',
                        width: `${pct}%`,
                        background: pct > 80 ? '#0B1136' : pct > 40 ? 'rgba(11,17,54,0.7)' : 'rgba(11,17,54,0.4)',
                        borderRadius: 4, transition: 'width .3s',
                      }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#0B1136', width: 36, textAlign: 'right', flexShrink: 0 }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top pages */}
        <div style={{
          padding: 20, borderRadius: 14, background: '#fff',
          border: '0.5px solid rgba(11,17,54,0.06)',
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 14px' }}>
            Pagine più visitate
          </h2>
          {topPages.length === 0 ? (
            <div style={{ fontSize: 11, color: 'rgba(11,17,54,0.4)', textAlign: 'center', padding: 20 }}>
              Nessun dato disponibile.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {topPages.map(([path, count]) => (
                <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 500, color: 'rgba(11,17,54,0.6)',
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

      {/* Bottom row: devices + roles + channels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20 }}>
        {/* Device breakdown */}
        {deviceStats.length > 0 && (
          <div style={{
            padding: 20, borderRadius: 14, background: '#fff',
            border: '0.5px solid rgba(11,17,54,0.06)',
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 14px' }}>
              Dispositivi
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deviceStats.map(([dev, count, pct]) => (
                <div key={dev} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#0B1136', fontWeight: 500, width: 80, flexShrink: 0 }}>
                    {deviceLabels[dev] || dev}
                  </span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#F1F2F4', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: 3,
                      background: dev === 'desktop' ? '#0B1136' : dev === 'mobile' ? '#2563EB' : '#0acf83',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#0B1136', width: 36, textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Role breakdown */}
        {roleStats.length > 0 && (
          <div style={{
            padding: 20, borderRadius: 14, background: '#fff',
            border: '0.5px solid rgba(11,17,54,0.06)',
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 14px' }}>
              Visitatori per ruolo
            </h2>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {roleStats.map(([role, count]) => (
                <div key={role} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1136', letterSpacing: '-0.03em' }}>
                    {count.toLocaleString('it-IT')}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(11,17,54,0.45)', marginTop: 2 }}>
                    {roleLabels[role] || role}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channel breakdown */}
        {channelStats.length > 0 && (
          <div style={{
            padding: 20, borderRadius: 14, background: '#fff',
            border: '0.5px solid rgba(11,17,54,0.06)',
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B1136', margin: '0 0 14px' }}>
              Canali di accesso
            </h2>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {channelStats.map(([ch, count]) => (
                <div key={ch} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0B1136', letterSpacing: '-0.03em' }}>
                    {count.toLocaleString('it-IT')}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(11,17,54,0.45)', marginTop: 2 }}>
                    {ch === 'web' ? 'Web' : ch === 'admin' ? 'Admin' : ch === 'consultant' ? 'Consulente' : ch}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
