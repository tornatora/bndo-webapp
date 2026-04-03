'use client';

import { useCallback, useEffect, useState } from 'react';
import { toSimpleUiError } from '@/components/admin/uiError';

type AuditRow = {
  id: string;
  action_type: string;
  actor_profile_id: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  company_id: string | null;
  application_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type AuditRowsResponse = {
  rows: AuditRow[];
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

export function AdminAuditTrailClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actionType, setActionType] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async (actionFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = actionFilter.trim();
      const response = await fetch(
        `/api/admin/audit?limit=300${query ? `&actionType=${encodeURIComponent(query)}` : ''}`,
        { cache: 'no-store' }
      );
      const payload = (await response.json()) as AuditRowsResponse;
      if (!response.ok) throw new Error(payload.error ?? 'Errore caricamento audit log.');
      setRows(payload.rows ?? []);
      setNotice(payload.notice ?? null);
    } catch (cause) {
      setError(toSimpleUiError(cause instanceof Error ? cause.message : 'Errore caricamento audit log.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(actionType);
  }, [actionType, loadData]);

  return (
    <section className="section-card">
      <div className="section-title">
        <span>🔐</span>
        <span>Registro attività sensibili</span>
      </div>
      <div className="admin-item-sub" style={{ marginTop: 4 }}>
        Cronologia completa delle azioni importanti (assegnazioni, pagamenti, stati pratiche).
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <input
          className="modal-input"
          value={actionType}
          onChange={(event) => setActionType(event.target.value)}
          placeholder="Filtra per action type (es. assignment.upsert)"
        />
        <button type="button" className="btn-action secondary" onClick={() => void loadData(actionType)}>
          Aggiorna
        </button>
      </div>

      {loading ? <div className="admin-item-sub" style={{ marginTop: 12 }}>Caricamento audit…</div> : null}
      {error ? (
        <div className="admin-item-sub" style={{ marginTop: 12, color: '#B91C1C', fontWeight: 700 }}>
          {error}
        </div>
      ) : null}
      {!error && notice ? (
        <div className="admin-item-sub" style={{ marginTop: 12, color: '#0F766E', fontWeight: 700 }}>
          {notice}
        </div>
      ) : null}

      <div className="admin-table" style={{ marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.id} className="admin-table-row">
            <div className="admin-table-main">
              <div className="admin-table-name">{row.action_type}</div>
              <div className="admin-table-meta">
                Ruolo: {row.actor_role ?? 'N/D'} · Operatore: {shortId(row.actor_profile_id)}
              </div>
              <div className="admin-table-meta">
                Target: {row.target_type ?? 'N/D'} · ID target: {shortId(row.target_id)}
              </div>
              <div className="admin-table-meta">
                Company: {shortId(row.company_id)} · Pratica: {shortId(row.application_id)}
              </div>
              <div className="admin-table-meta">{formatDateTime(row.created_at)}</div>
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 ? <div className="admin-item-sub">Nessuna voce audit trovata.</div> : null}
      </div>
    </section>
  );
}
