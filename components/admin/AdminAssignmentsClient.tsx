'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toSimpleUiError } from '@/components/admin/uiError';

type ConsultantRow = {
  id: string;
  fullName: string;
  email: string;
};

type AssignmentRow = {
  applicationId: string;
  companyId: string;
  companyName: string;
  practiceTitle: string;
  status: string;
  updatedAt: string;
  assignment: {
    id: string;
    consultantProfileId: string;
    assignedAt: string;
    note: string | null;
  } | null;
};

type AssignmentsResponse = {
  consultants: ConsultantRow[];
  assignments: AssignmentRow[];
  notice?: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT');
}

export function AdminAssignmentsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectionByApplication, setSelectionByApplication] = useState<Record<string, string>>({});
  const [noteByApplication, setNoteByApplication] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/assignments', { cache: 'no-store' });
      const payload = (await response.json()) as AssignmentsResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Errore caricamento assegnazioni.');
      setConsultants(payload.consultants ?? []);
      setRows(payload.assignments ?? []);
      setNotice(payload.notice ?? null);
      setSelectionByApplication((previous) => {
        const next = { ...previous };
        for (const item of payload.assignments ?? []) {
          if (!next[item.applicationId]) {
            next[item.applicationId] = item.assignment?.consultantProfileId ?? '';
          }
        }
        return next;
      });
      setNoteByApplication((previous) => {
        const next = { ...previous };
        for (const item of payload.assignments ?? []) {
          if (typeof next[item.applicationId] === 'undefined') {
            next[item.applicationId] = item.assignment?.note ?? '';
          }
        }
        return next;
      });
    } catch (cause) {
      setError(toSimpleUiError(cause instanceof Error ? cause.message : 'Errore caricamento assegnazioni.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const assignedConsultant = consultants.find((item) => item.id === row.assignment?.consultantProfileId) ?? null;
      return (
        row.companyName.toLowerCase().includes(query) ||
        row.practiceTitle.toLowerCase().includes(query) ||
        String(row.status ?? '').toLowerCase().includes(query) ||
        assignedConsultant?.fullName.toLowerCase().includes(query)
      );
    });
  }, [consultants, rows, search]);

  async function assignConsultant(row: AssignmentRow) {
    const selectedConsultantProfileId = selectionByApplication[row.applicationId] ?? '';
    if (!selectedConsultantProfileId) {
      setError('Seleziona un consulente prima di salvare.');
      return;
    }

    setSavingId(row.applicationId);
    setError(null);

    try {
      const response = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: row.applicationId,
          companyId: row.companyId,
          consultantProfileId: selectedConsultantProfileId,
          note: (noteByApplication[row.applicationId] ?? '').trim() || null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Impossibile aggiornare l’assegnazione.');
      }
      await fetchData();
    } catch (cause) {
      setError(toSimpleUiError(cause instanceof Error ? cause.message : 'Impossibile aggiornare l’assegnazione.'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="section-card">
      <div className="section-title">
        <span>🧭</span>
        <span>Assegna pratiche ai consulenti</span>
      </div>

      <div className="admin-item-sub" style={{ marginTop: 4 }}>
        Scegli un consulente per ogni pratica: tutto resta tracciato in modo automatico.
      </div>

      <div className="admin-item-sub" style={{ marginTop: 8, lineHeight: 1.55 }}>
        Accesso consulenti: usano il login standard su <strong>/login</strong> con account ruolo <strong>consultant</strong>.
        Dopo l’accesso vengono portati automaticamente nella loro dashboard <strong>/consultant</strong>.
      </div>

      <div style={{ marginTop: 14, marginBottom: 14 }}>
        <input
          className="modal-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca azienda, pratica, stato o consulente..."
        />
      </div>

      {loading ? <div className="admin-item-sub">Caricamento assegnazioni…</div> : null}
      {error ? (
        <div className="admin-item-sub" style={{ color: '#B91C1C', fontWeight: 700 }}>
          {error}
        </div>
      ) : null}
      {!error && notice ? (
        <div className="admin-item-sub" style={{ color: '#0F766E', fontWeight: 700 }}>
          {notice}
        </div>
      ) : null}

      {!loading && filteredRows.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 8 }}>
          <div className="empty-icon">📭</div>
          <p className="empty-text">Nessuna pratica trovata.</p>
        </div>
      ) : null}

      {!loading && filteredRows.length > 0 ? (
        <div className="admin-table" style={{ marginTop: 12 }}>
          {filteredRows.map((row) => {
            const assignedConsultant = consultants.find((item) => item.id === row.assignment?.consultantProfileId) ?? null;
            const isSaving = savingId === row.applicationId;
            return (
              <div key={row.applicationId} className="admin-table-row" style={{ alignItems: 'stretch' }}>
                <div className="admin-table-main" style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <div className="admin-table-name">{row.practiceTitle}</div>
                    <div className="admin-table-meta">
                      {row.companyName} · Stato pratica: {row.status} · Aggiornata: {formatDateTime(row.updatedAt)}
                    </div>
                    <div className="admin-table-meta">
                      Assegnato ora: {assignedConsultant ? `${assignedConsultant.fullName} (${assignedConsultant.email})` : 'Non assegnato'}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px,1fr) minmax(180px,1fr) auto', gap: 10 }}>
                    <select
                      className="modal-select"
                      value={selectionByApplication[row.applicationId] ?? ''}
                      onChange={(event) =>
                        setSelectionByApplication((previous) => ({
                          ...previous,
                          [row.applicationId]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Seleziona consulente</option>
                      {consultants.map((consultant) => (
                        <option key={consultant.id} value={consultant.id}>
                          {consultant.fullName} · {consultant.email}
                        </option>
                      ))}
                    </select>

                    <input
                      className="modal-input"
                      value={noteByApplication[row.applicationId] ?? ''}
                      onChange={(event) =>
                        setNoteByApplication((previous) => ({
                          ...previous,
                          [row.applicationId]: event.target.value,
                        }))
                      }
                      placeholder="Nota interna (opzionale)"
                    />

                    <button
                      type="button"
                      className="btn-action"
                      disabled={isSaving}
                      onClick={() => {
                        void assignConsultant(row);
                      }}
                    >
                      {isSaving ? 'Salvataggio...' : 'Assegna'}
                    </button>
                  </div>

                  {row.assignment?.assignedAt ? (
                    <div className="admin-item-sub">Ultima assegnazione: {formatDateTime(row.assignment.assignedAt)}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
