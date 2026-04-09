'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ClientPracticeRow = {
  applicationId: string;
  companyId: string;
  companyName: string;
  practiceTitle: string;
  status: string;
  supplierRegistryStatus: string;
  updatedAt: string;
  docsUploadedCount: number;
  docsMissingCount: number;
};

type ClientPracticesPayload = {
  kpis: {
    total: number;
    draft: number;
    reviewed: number;
    submitted: number;
    docsMissing: number;
  };
  items: ClientPracticeRow[];
  notice?: string | null;
  error?: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT');
}

export function ConsultantClientPracticesPanel({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ClientPracticesPayload | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/consultant/practices?companyId=${encodeURIComponent(companyId)}`, {
        cache: 'no-store'
      });
      const json = (await response.json()) as ClientPracticesPayload;
      if (!response.ok) {
        throw new Error(json.error ?? 'Errore caricamento pratiche cliente.');
      }
      setPayload(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Errore caricamento pratiche cliente.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return payload?.items ?? [];
    return (payload?.items ?? []).filter((item) => {
      return item.practiceTitle.toLowerCase().includes(query) || item.status.toLowerCase().includes(query);
    });
  }, [payload?.items, search]);

  const companyName = payload?.items?.[0]?.companyName ?? 'Cliente';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="section-card">
        <div className="section-title">
          <span>👤</span>
          <span>{companyName}</span>
        </div>
        <div className="admin-item-sub" style={{ marginTop: 4 }}>
          Vista completa delle pratiche del cliente assegnate al consulente.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          <input
            className="modal-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca pratica per titolo o stato…"
          />
          <button type="button" className="btn-action secondary" onClick={() => void loadData()}>
            Aggiorna
          </button>
        </div>
        {payload?.notice ? (
          <div className="admin-item-sub" style={{ marginTop: 10, color: '#92400E', fontWeight: 700 }}>
            {payload.notice}
          </div>
        ) : null}
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>📌</span>
          <span>Pratiche cliente</span>
        </div>
        <div className="admin-practice-crm-top" style={{ marginTop: 12 }}>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Totali</div>
            <div className="admin-kpi-value">{payload?.kpis.total ?? 0}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">In bozza</div>
            <div className="admin-kpi-value">{payload?.kpis.draft ?? 0}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">In revisione</div>
            <div className="admin-kpi-value">{payload?.kpis.reviewed ?? 0}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Inviate</div>
            <div className="admin-kpi-value">{payload?.kpis.submitted ?? 0}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Documenti mancanti</div>
            <div className="admin-kpi-value is-warn">{payload?.kpis.docsMissing ?? 0}</div>
          </div>
        </div>

        {loading ? <div className="admin-item-sub" style={{ marginTop: 12 }}>Caricamento pratiche…</div> : null}
        {error ? (
          <div className="admin-item-sub" style={{ marginTop: 12, color: '#B91C1C', fontWeight: 700 }}>
            {error}
          </div>
        ) : null}

        <div className="admin-table" style={{ marginTop: 12 }}>
          {filtered.map((item) => (
            <div key={item.applicationId} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">{item.practiceTitle}</div>
                <div className="admin-table-meta">
                  Stato: {item.status} · Fornitore: {item.supplierRegistryStatus}
                </div>
                <div className="admin-table-meta">
                  Caricati: {item.docsUploadedCount} · Mancanti: {item.docsMissingCount}
                </div>
                <div className="admin-table-meta">Aggiornata: {formatDateTime(item.updatedAt)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Link href={`/consultant/practices/${item.applicationId}`} className="btn-action secondary">
                  Apri pratica
                </Link>
              </div>
            </div>
          ))}

          {!loading && filtered.length === 0 ? (
            <div className="admin-item-sub">Nessuna pratica trovata per questo cliente.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
