'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ConsultantPractice = {
  applicationId: string;
  companyId: string;
  companyName: string;
  practiceTitle: string;
  status: string;
  supplierRegistryStatus: string;
  notes: string | null;
  updatedAt: string;
  docsUploadedCount: number;
  docsMissingCount: number;
  assignedAt: string | null;
  assignmentNote: string | null;
};

type ConsultantPracticePayload = {
  kpis: {
    total: number;
    draft: number;
    reviewed: number;
    submitted: number;
    docsMissing: number;
  };
  items: ConsultantPractice[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT');
}

export function ConsultantPracticesClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [docsMissingOnly, setDocsMissingOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'updated_desc' | 'docs_missing_desc'>('updated_desc');
  const [payload, setPayload] = useState<ConsultantPracticePayload | null>(null);

  const loadData = useCallback(async (statusFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter.trim();
      const response = await fetch(`/api/consultant/practices${query ? `?status=${encodeURIComponent(query)}` : ''}`, {
        cache: 'no-store',
      });
      const json = (await response.json()) as ConsultantPracticePayload & { error?: string };
      if (!response.ok) throw new Error(json.error ?? 'Errore caricamento pratiche consulente.');
      setPayload(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore caricamento pratiche consulente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(status);
  }, [status, loadData]);

  const filteredItems = useMemo(() => {
    const items = payload?.items ?? [];
    const query = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (docsMissingOnly && Number(item.docsMissingCount ?? 0) <= 0) return false;
      if (!query) return true;
      return (
        item.companyName.toLowerCase().includes(query) ||
        item.practiceTitle.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query)
      );
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === 'docs_missing_desc') return Number(b.docsMissingCount ?? 0) - Number(a.docsMissingCount ?? 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [docsMissingOnly, payload?.items, search, sortBy]);

  const clients = useMemo(() => {
    const map = new Map<
      string,
      { companyId: string; companyName: string; practices: number; docsMissing: number; latestUpdate: string | null }
    >();
    for (const row of payload?.items ?? []) {
      const existing = map.get(row.companyId) ?? {
        companyId: row.companyId,
        companyName: row.companyName,
        practices: 0,
        docsMissing: 0,
        latestUpdate: null,
      };
      existing.practices += 1;
      existing.docsMissing += Number(row.docsMissingCount ?? 0);
      if (!existing.latestUpdate || new Date(row.updatedAt).getTime() > new Date(existing.latestUpdate).getTime()) {
        existing.latestUpdate = row.updatedAt;
      }
      map.set(row.companyId, existing);
    }
    return [...map.values()].sort((a, b) => new Date(b.latestUpdate ?? 0).getTime() - new Date(a.latestUpdate ?? 0).getTime());
  }, [payload?.items]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="section-card">
        <div className="section-title">
          <span>🗂️</span>
          <span>Le mie pratiche assegnate</span>
        </div>
        <div className="admin-item-sub" style={{ marginTop: 4 }}>
          Vista operativa consulente: priorità, documenti mancanti e pratiche da gestire.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, marginTop: 14 }}>
          <input
            className="modal-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca cliente o pratica..."
          />

          <select className="modal-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tutti gli stati</option>
            <option value="draft">Draft</option>
            <option value="reviewed">Reviewed</option>
            <option value="submitted">Submitted</option>
          </select>

          <select
            className="modal-select"
            value={docsMissingOnly ? 'missing' : 'all'}
            onChange={(event) => setDocsMissingOnly(event.target.value === 'missing')}
          >
            <option value="all">Tutte le checklist</option>
            <option value="missing">Solo documenti mancanti</option>
          </select>

          <select className="modal-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'updated_desc' | 'docs_missing_desc')}>
            <option value="updated_desc">Priorità: aggiornate di recente</option>
            <option value="docs_missing_desc">Priorità: più mancanti</option>
          </select>

          <button type="button" className="btn-action secondary" onClick={() => void loadData(status)}>
            Aggiorna
          </button>
        </div>

        {loading ? <div className="admin-item-sub" style={{ marginTop: 12 }}>Caricamento pratiche…</div> : null}
        {error ? (
          <div className="admin-item-sub" style={{ marginTop: 12, color: '#B91C1C', fontWeight: 700 }}>
            {error}
          </div>
        ) : null}

        {payload ? (
          <div className="admin-practice-crm-top" style={{ marginTop: 14 }}>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Pratiche attive</div>
              <div className="admin-kpi-value">{payload.kpis.total}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Da contattare (draft)</div>
              <div className="admin-kpi-value">{payload.kpis.draft}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">In revisione</div>
              <div className="admin-kpi-value">{payload.kpis.reviewed}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Inviate</div>
              <div className="admin-kpi-value">{payload.kpis.submitted}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Documenti mancanti</div>
              <div className="admin-kpi-value is-warn">{payload.kpis.docsMissing}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>👥</span>
          <span>I miei clienti</span>
        </div>
        <div className="admin-table" style={{ marginTop: 12 }}>
          {clients.map((client) => (
            <div key={client.companyId} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">{client.companyName}</div>
                <div className="admin-table-meta">
                  Pratiche assegnate: {client.practices} · Documenti mancanti: {client.docsMissing}
                </div>
                <div className="admin-table-meta">Ultimo aggiornamento: {formatDateTime(client.latestUpdate)}</div>
              </div>
            </div>
          ))}
          {!loading && clients.length === 0 ? <div className="admin-item-sub">Nessun cliente assegnato.</div> : null}
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>📌</span>
          <span>Pratiche assegnate</span>
        </div>

        <div className="admin-table" style={{ marginTop: 12 }}>
          {filteredItems.map((item) => (
            <div key={item.applicationId} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">{item.practiceTitle}</div>
                <div className="admin-table-meta">
                  Cliente: {item.companyName} · Stato pratica: {item.status} · Fornitore: {item.supplierRegistryStatus}
                </div>
                <div className="admin-table-meta">
                  Caricati: {item.docsUploadedCount} · Mancanti: {item.docsMissingCount} · Assegnata: {formatDateTime(item.assignedAt)}
                </div>
                <div className="admin-table-meta">Aggiornata: {formatDateTime(item.updatedAt)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Link className="btn-action secondary" href={`/consultant/practices/${item.applicationId}`}>
                  Apri pratica
                </Link>
              </div>
            </div>
          ))}

          {!loading && filteredItems.length === 0 ? (
            <div className="admin-item-sub">Nessuna pratica assegnata trovata.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
