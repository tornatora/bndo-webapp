'use client';

import { useEffect, useMemo, useState } from 'react';

type DataRow = {
  id: string;
  status: string;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  currentMessage: string | null;
  currentStep: string | null;
  errorMessage: string | null;
  demoMode: boolean;
  bandoKey: string;
  proceduraKey: string;
  client: {
    id: string;
    fullName: string;
    email: string;
  };
  template: {
    id: string | null;
    name: string;
    version: number;
    status: string;
  } | null;
};

type DataResponse = {
  ok: boolean;
  metrics: {
    completed: number;
    waitingHuman: number;
    failed: number;
    avgDurationSeconds: number;
  };
  rows: DataRow[];
  health: {
    db: 'ok' | 'missing_config';
    browserbase: 'ok' | 'missing_config';
    extension: 'ok' | 'missing_config';
    worker: 'ok' | 'missing_config';
  };
  allowedDomains: Array<{
    id: string;
    domain: string;
    active: boolean;
    createdAt: string;
  }>;
  error?: string;
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('it-IT');
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  if (minutes === 0) return `${remain}s`;
  return `${minutes}m ${remain}s`;
}

function statusColor(status: string) {
  if (status === 'completed') return '#16a34a';
  if (status === 'failed') return '#dc2626';
  if (status === 'waiting_human') return '#d97706';
  if (status === 'running') return '#2563eb';
  return '#475569';
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string; ok?: boolean };
  if (!response.ok || json.ok === false) {
    throw new Error(json.error ?? 'Operazione non riuscita.');
  }
  return json;
}

export function BndoCopilotDataPageClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [metrics, setMetrics] = useState<DataResponse['metrics']>({
    completed: 0,
    waitingHuman: 0,
    failed: 0,
    avgDurationSeconds: 0,
  });
  const [health, setHealth] = useState<DataResponse['health']>({
    db: 'missing_config',
    browserbase: 'missing_config',
    extension: 'missing_config',
    worker: 'missing_config',
  });
  const [allowedDomains, setAllowedDomains] = useState<DataResponse['allowedDomains']>([]);

  const [filters, setFilters] = useState({
    client: '',
    bando: '',
    procedura: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const [newDomain, setNewDomain] = useState('');

  const clientOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const row of rows) {
      if (!set.has(row.client.id)) set.set(row.client.id, row.client.fullName);
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.client) params.set('clientId', filters.client);
      if (filters.bando) params.set('bando', filters.bando);
      if (filters.procedura) params.set('procedura', filters.procedura);
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      const data = await fetchJson<DataResponse>(`/api/copilot/admin-data?${params.toString()}`);
      setRows(data.rows ?? []);
      setMetrics(data.metrics);
      setHealth(data.health);
      setAllowedDomains(data.allowedDomains ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore caricamento pagina dati Co-pilot.');
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => {
      void load();
    }, 15000);
    return () => window.clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addDomain() {
    if (!newDomain.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/admin-data', {
        method: 'POST',
        body: JSON.stringify({ action: 'addDomain', domain: newDomain }),
      });
      setNewDomain('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore salvataggio dominio.');
      setBusy(false);
    }
  }

  async function toggleDomain(id: string, active: boolean) {
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/admin-data', {
        method: 'POST',
        body: JSON.stringify({ action: 'toggleDomain', id, active }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore aggiornamento dominio.');
      setBusy(false);
    }
  }

  async function removeDomain(id: string) {
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/copilot/admin-data', {
        method: 'POST',
        body: JSON.stringify({ action: 'removeDomain', id }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore rimozione dominio.');
      setBusy(false);
    }
  }

  return (
    <section className="panel p-5 sm:p-6" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="welcome-title" style={{ margin: 0 }}>BNDO CO-PILOT DATI</h1>
          <p className="welcome-subtitle" style={{ margin: '6px 0 0 0' }}>Controllo operativo sessioni, KPI e stato sistema.</p>
        </div>
        <button className="btn-action secondary" disabled={busy} onClick={() => void load()}>
          {busy ? 'Aggiornamento...' : 'Aggiorna'}
        </button>
      </header>

      {error ? (
        <div style={{ border: '1px solid #fecaca', borderRadius: 10, background: '#fef2f2', color: '#7f1d1d', padding: 10, fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div className="admin-practice-crm-top" style={{ marginTop: 4 }}>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Completate</div>
          <div className="admin-kpi-value">{metrics.completed}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Waiting_human</div>
          <div className="admin-kpi-value is-warn">{metrics.waitingHuman}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Failed</div>
          <div className="admin-kpi-value" style={{ color: '#b91c1c' }}>{metrics.failed}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Tempo medio</div>
          <div className="admin-kpi-value">{formatDuration(metrics.avgDurationSeconds)}</div>
        </div>
      </div>

      <section className="section-card" style={{ padding: 14 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>
          <span>🧪</span>
          <span>Stato sistema</span>
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
          {[
            { label: 'Database', value: health.db },
            { label: 'Browserbase', value: health.browserbase },
            { label: 'Extension', value: health.extension },
            { label: 'Worker', value: health.worker },
          ].map((item) => (
            <div key={item.label} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>{item.label}</span>
              <strong style={{ color: item.value === 'ok' ? '#15803d' : '#b45309', fontSize: 13 }}>
                {item.value === 'ok' ? 'OK' : 'Configurazione mancante'}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card" style={{ padding: 14 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>
          <span>🌐</span>
          <span>Whitelist domini</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            value={newDomain}
            onChange={(event) => setNewDomain(event.target.value)}
            placeholder="es. invitalia.it"
            style={{ minWidth: 220, flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }}
          />
          <button className="btn-action" onClick={() => void addDomain()} disabled={busy || !newDomain.trim()}>
            Aggiungi dominio
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {allowedDomains.length === 0 ? (
            <div className="admin-item-sub">Nessun dominio configurato.</div>
          ) : (
            allowedDomains.map((domain) => (
              <div key={domain.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{domain.domain}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Creato: {formatDate(domain.createdAt)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-action secondary" onClick={() => void toggleDomain(domain.id, !domain.active)} disabled={busy}>
                    {domain.active ? 'Disattiva' : 'Attiva'}
                  </button>
                  <button className="btn-action secondary" onClick={() => void removeDomain(domain.id)} disabled={busy}>
                    Elimina
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
        <div className="section-title" style={{ marginBottom: 2 }}>
          <span>🧭</span>
          <span>Filtri sessioni</span>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Cliente</span>
            <select value={filters.client} onChange={(event) => setFilters((prev) => ({ ...prev, client: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}>
              <option value="">Tutti</option>
              {clientOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Bando</span>
            <input value={filters.bando} onChange={(event) => setFilters((prev) => ({ ...prev, bando: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }} />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Procedura</span>
            <input value={filters.procedura} onChange={(event) => setFilters((prev) => ({ ...prev, procedura: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }} />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Stato</span>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }}>
              <option value="">Tutti</option>
              <option value="starting">Avvio</option>
              <option value="running">In corso</option>
              <option value="waiting_human">In attesa</option>
              <option value="paused">In pausa</option>
              <option value="completed">Completata</option>
              <option value="failed">Errore</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Data da</span>
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }} />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Data a</span>
            <input type="date" value={filters.dateTo} onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8 }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-action secondary" onClick={() => setFilters({ client: '', bando: '', procedura: '', status: '', dateFrom: '', dateTo: '' })} disabled={busy}>
            Reset filtri
          </button>
          <button className="btn-action" onClick={() => void load()} disabled={busy}>
            Applica filtri
          </button>
        </div>
      </section>

      <section className="section-card" style={{ padding: 14 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>
          <span>📋</span>
          <span>Sessioni cloud</span>
        </div>

        {loading ? (
          <div className="admin-item-sub">Caricamento sessioni...</div>
        ) : rows.length === 0 ? (
          <div className="admin-item-sub">Nessuna sessione trovata con i filtri correnti.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
              <thead>
                <tr>
                  {['Cliente', 'Bando', 'Procedura', 'Stato', 'Progress', 'Template', 'Creata', 'Messaggio'].map((head) => (
                    <th key={head} style={{ textAlign: 'left', fontSize: 12, color: '#64748b', padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{row.client.fullName}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{row.client.email || '-'}</div>
                    </td>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>{row.bandoKey || '-'}</td>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>{row.proceduraKey || '-'}</td>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(row.status), textTransform: 'uppercase' }}>{row.status}</span>
                    </td>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>{Math.max(0, Math.min(100, Number(row.progress ?? 0)))}%</td>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                      {row.template ? `${row.template.name} v${row.template.version}` : '-'}
                    </td>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>{formatDate(row.createdAt)}</td>
                    <td style={{ padding: '9px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>{row.currentMessage || row.errorMessage || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
