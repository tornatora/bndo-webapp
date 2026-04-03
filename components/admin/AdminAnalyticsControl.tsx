'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toSimpleUiError } from '@/components/admin/uiError';

type AnalyticsOverview = {
  windowDays: number;
  notice?: string | null;
  totals: {
    events: number;
    sessions: number;
    actors: number;
  };
  funnel: {
    scannerStarted: number;
    scannerCompleted: number;
    quizStarted: number;
    quizCompleted: number;
    onboardingStarted: number;
    onboardingCompleted: number;
    practiceCreated: number;
    practiceActivated: number;
  };
  topPages: Array<{ path: string; count: number }>;
  eventTypeBreakdown: Array<{ eventType: string; count: number }>;
  channelBreakdown: Array<{ channel: string; count: number }>;
  deviceBreakdown: Array<{ device: string; sessions: number }>;
  geoBreakdown: Array<{ countryCode: string; sessions: number }>;
  eventsTimeline: Array<{ day: string; count: number }>;
};

type EventRow = {
  id: string;
  event_type: string;
  actor_profile_id: string | null;
  actor_role: string | null;
  company_id: string | null;
  application_id: string | null;
  session_id: string | null;
  page_path: string | null;
  channel: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type EventRowsResponse = {
  rows: EventRow[];
  notice?: string | null;
  error?: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT');
}

function shortId(value: string | null | undefined) {
  if (!value) return 'N/D';
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

export function AdminAnalyticsControl() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async (windowDays: number, selectedEventType: string) => {
    setLoading(true);
    setError(null);
    try {
      const queryEventType = selectedEventType.trim();
      const [overviewRes, eventsRes] = await Promise.all([
        fetch(`/api/admin/analytics/overview?days=${windowDays}`, { cache: 'no-store' }),
        fetch(
          `/api/admin/analytics/events?limit=300${
            queryEventType ? `&eventType=${encodeURIComponent(queryEventType)}` : ''
          }`,
          { cache: 'no-store' }
        ),
      ]);
      const [overviewJsonRaw, eventsJsonRaw] = await Promise.all([overviewRes.json(), eventsRes.json()]);
      const overviewJson = overviewJsonRaw as AnalyticsOverview & { error?: string };
      const eventsJson = eventsJsonRaw as EventRowsResponse;

      if (!overviewRes.ok) throw new Error(overviewJson.error ?? 'Errore overview analytics.');
      if (!eventsRes.ok) throw new Error(eventsJson.error ?? 'Errore eventi analytics.');

      setOverview(overviewJson as AnalyticsOverview);
      setEvents((eventsJson.rows ?? []) as EventRow[]);
      const notices = [overviewJson.notice, eventsJson.notice].filter((item): item is string => Boolean(item && item.trim()));
      setNotice(notices.length ? notices.join(' ') : null);
    } catch (cause) {
      setError(toSimpleUiError(cause instanceof Error ? cause.message : 'Errore caricamento analytics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(days, eventTypeFilter);
  }, [days, eventTypeFilter, loadData]);

  const funnelRows = useMemo(() => {
    if (!overview) return [];
    return [
      ['Scanner avviati', overview.funnel.scannerStarted],
      ['Scanner completati', overview.funnel.scannerCompleted],
      ['Quiz avviati', overview.funnel.quizStarted],
      ['Quiz completati', overview.funnel.quizCompleted],
      ['Onboarding avviati', overview.funnel.onboardingStarted],
      ['Onboarding completati', overview.funnel.onboardingCompleted],
      ['Pratiche create', overview.funnel.practiceCreated],
      ['Pratiche attivate', overview.funnel.practiceActivated],
    ] as const;
  }, [overview]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="section-card">
        <div className="section-title">
          <span>📊</span>
          <span>Monitoraggio piattaforma</span>
        </div>
        <div className="admin-item-sub" style={{ marginTop: 4 }}>
          Vedi subito visitatori, azioni principali, conversioni e attività operative.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <select className="modal-select" value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>
            <option value="7">Ultimi 7 giorni</option>
            <option value="30">Ultimi 30 giorni</option>
            <option value="90">Ultimi 90 giorni</option>
            <option value="180">Ultimi 180 giorni</option>
          </select>

          <input
            className="modal-input"
            value={eventTypeFilter}
            onChange={(event) => setEventTypeFilter(event.target.value)}
            placeholder="Filtra per tipo evento (opzionale)"
          />

          <button type="button" className="btn-action secondary" onClick={() => void loadData(days, eventTypeFilter)}>
            Aggiorna
          </button>
        </div>

        {loading ? <div className="admin-item-sub" style={{ marginTop: 12 }}>Caricamento analytics…</div> : null}
        {error ? (
          <div className="admin-item-sub" style={{ marginTop: 12, color: '#B91C1C', fontWeight: 700 }}>{error}</div>
        ) : null}
        {!error && notice ? (
          <div className="admin-item-sub" style={{ marginTop: 12, color: '#0F766E', fontWeight: 700 }}>
            {notice}
          </div>
        ) : null}

        {overview ? (
          <div className="admin-practice-crm-top" style={{ marginTop: 14 }}>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Eventi</div>
              <div className="admin-kpi-value">{overview.totals.events}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Sessioni</div>
              <div className="admin-kpi-value">{overview.totals.sessions}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Utenti unici attivi</div>
              <div className="admin-kpi-value">{overview.totals.actors}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>🪜</span>
          <span>Funnel operativo</span>
        </div>

        <div className="admin-table" style={{ marginTop: 12 }}>
          {funnelRows.map(([label, count]) => (
            <div key={label} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">{label}</div>
              </div>
              <div className="meta-tag">{count}</div>
            </div>
          ))}
          {funnelRows.length === 0 ? <div className="admin-item-sub">Nessun dato funnel disponibile.</div> : null}
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>📄</span>
          <span>Top pagine</span>
        </div>

        <div className="admin-table" style={{ marginTop: 12 }}>
          {(overview?.topPages ?? []).map((row) => (
            <div key={row.path} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">{row.path}</div>
              </div>
              <div className="meta-tag">{row.count}</div>
            </div>
          ))}
          {(overview?.topPages?.length ?? 0) === 0 ? <div className="admin-item-sub">Nessuna pagina tracciata.</div> : null}
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>🧭</span>
          <span>Breakdown canale/dispositivo/geo</span>
        </div>

        <div className="admin-billing-grid" style={{ marginTop: 12 }}>
          <div className="admin-billing-card">
            <div className="admin-billing-label">Canale</div>
            {(overview?.channelBreakdown ?? []).map((row) => (
              <div key={row.channel} className="admin-billing-line">
                <span>{row.channel}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
            {(overview?.channelBreakdown?.length ?? 0) === 0 ? <div className="admin-item-sub">N/D</div> : null}
          </div>

          <div className="admin-billing-card">
            <div className="admin-billing-label">Dispositivo (sessioni)</div>
            {(overview?.deviceBreakdown ?? []).map((row) => (
              <div key={row.device} className="admin-billing-line">
                <span>{row.device}</span>
                <strong>{row.sessions}</strong>
              </div>
            ))}
            {(overview?.deviceBreakdown?.length ?? 0) === 0 ? <div className="admin-item-sub">N/D</div> : null}
          </div>

          <div className="admin-billing-card">
            <div className="admin-billing-label">Geo (sessioni)</div>
            {(overview?.geoBreakdown ?? []).map((row) => (
              <div key={row.countryCode} className="admin-billing-line">
                <span>{row.countryCode}</span>
                <strong>{row.sessions}</strong>
              </div>
            ))}
            {(overview?.geoBreakdown?.length ?? 0) === 0 ? <div className="admin-item-sub">N/D</div> : null}
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>🧾</span>
          <span>Eventi recenti</span>
        </div>

        <div className="admin-table" style={{ marginTop: 12 }}>
          {events.map((row) => (
            <div key={row.id} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">{row.event_type}</div>
                <div className="admin-table-meta">
                  Ruolo: {row.actor_role ?? 'anon'} · Canale: {row.channel ?? 'N/D'} · Sessione: {row.session_id ?? 'N/D'}
                </div>
                <div className="admin-table-meta">
                  Pagina: {row.page_path ?? 'N/D'} · Company: {shortId(row.company_id)} · Pratica: {shortId(row.application_id)}
                </div>
                <div className="admin-table-meta">{formatDateTime(row.created_at)}</div>
              </div>
            </div>
          ))}
          {events.length === 0 ? <div className="admin-item-sub">Nessun evento trovato.</div> : null}
        </div>
      </section>
    </div>
  );
}
