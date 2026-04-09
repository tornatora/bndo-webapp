'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toSimpleUiError } from '@/components/admin/uiError';

type FinanceOverview = {
  windowDays: number;
  notice?: string | null;
  totals: {
    paidCents: number;
    pendingCents: number;
    refundedCents: number;
    failedCents: number;
    todayCents: number;
    weekCents: number;
    monthCents: number;
  };
  statusBuckets: {
    pending: number;
    paid: number;
    failed: number;
    canceled: number;
    refunded: number;
  };
  commissions: {
    grossPostedCents: number;
    consultantMaturedCents: number;
    platformMaturedCents: number;
    consultantApprovedCents: number;
    consultantPaidCents: number;
  };
};

type LedgerRow = {
  id: string;
  company_id: string | null;
  application_id: string | null;
  consultant_profile_id: string | null;
  entry_type: 'client_payment' | 'refund' | 'consultant_payout' | 'platform_fee' | 'manual_adjustment';
  direction: 'in' | 'out';
  amount_cents: number;
  currency: string;
  status: string;
  source: string;
  reference: string | null;
  occurred_at: string;
  created_at: string;
};

type PayoutRow = {
  id: string;
  consultant_profile_id: string;
  period_start: string;
  period_end: string;
  gross_amount_cents: number;
  consultant_share_cents: number;
  platform_share_cents: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  approved_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
};

type ConsultantRow = {
  id: string;
  fullName: string;
  email: string;
};

type ConsultantBillingProfileRow = {
  consultantId: string;
  fullName: string;
  email: string;
  billingProfile: {
    payoutMethod: 'bank_transfer' | 'paypal' | 'other';
    accountHolder: string;
    iban: string | null;
    paypalEmail: string | null;
  } | null;
  updatedAt: string | null;
};

type RowsResponse<T> = {
  rows: T[];
  notice?: string | null;
  error?: string;
};

type AssignmentsApiResponse = {
  consultants: ConsultantRow[];
  notice?: string | null;
  error?: string;
};

function formatMoneyCents(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format((Number(cents || 0) || 0) / 100);
}

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

function isoDate(daysDelta: number) {
  const value = new Date();
  value.setDate(value.getDate() + daysDelta);
  return value.toISOString().slice(0, 10);
}

export function AdminFinanceControl() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [consultantBillingProfiles, setConsultantBillingProfiles] = useState<ConsultantBillingProfileRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const [creatingPayout, setCreatingPayout] = useState(false);
  const [updatingPayoutId, setUpdatingPayoutId] = useState<string | null>(null);
  const [newPayout, setNewPayout] = useState({
    consultantProfileId: '',
    periodStart: isoDate(-30),
    periodEnd: isoDate(0),
    note: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, ledgerRes, payoutsRes, consultantsRes, billingProfilesRes] = await Promise.all([
        fetch('/api/admin/finance/overview?days=30', { cache: 'no-store' }),
        fetch('/api/admin/finance/ledger?limit=250', { cache: 'no-store' }),
        fetch('/api/admin/finance/payouts', { cache: 'no-store' }),
        fetch('/api/admin/assignments', { cache: 'no-store' }),
        fetch('/api/admin/consultant-billing-profiles', { cache: 'no-store' }),
      ]);

      const [overviewJsonRaw, ledgerJsonRaw, payoutsJsonRaw, consultantsJsonRaw, billingProfilesJsonRaw] = await Promise.all([
        overviewRes.json(),
        ledgerRes.json(),
        payoutsRes.json(),
        consultantsRes.json(),
        billingProfilesRes.json(),
      ]);

      const overviewJson = overviewJsonRaw as FinanceOverview & { error?: string };
      const ledgerJson = ledgerJsonRaw as RowsResponse<LedgerRow>;
      const payoutsJson = payoutsJsonRaw as RowsResponse<PayoutRow>;
      const consultantsJson = consultantsJsonRaw as AssignmentsApiResponse;
      const billingProfilesJson = billingProfilesJsonRaw as {
        rows?: ConsultantBillingProfileRow[];
        error?: string;
      };

      if (!overviewRes.ok) throw new Error(overviewJson.error ?? 'Errore overview finanza.');
      if (!ledgerRes.ok) throw new Error(ledgerJson.error ?? 'Errore ledger finanza.');
      if (!payoutsRes.ok) throw new Error(payoutsJson.error ?? 'Errore payout finanza.');
      if (!consultantsRes.ok) throw new Error(consultantsJson.error ?? 'Errore caricamento consulenti.');
      if (!billingProfilesRes.ok) throw new Error(billingProfilesJson.error ?? 'Errore profili pagamento consulenti.');

      setOverview(overviewJson as FinanceOverview);
      setLedger((ledgerJson.rows ?? []) as LedgerRow[]);
      setPayouts((payoutsJson.rows ?? []) as PayoutRow[]);
      setConsultants((consultantsJson.consultants ?? []) as ConsultantRow[]);
      setConsultantBillingProfiles((billingProfilesJson.rows ?? []) as ConsultantBillingProfileRow[]);
      const notices = [overviewJson.notice, ledgerJson.notice, payoutsJson.notice, consultantsJson.notice]
        .filter((item): item is string => Boolean(item && item.trim()));
      setNotice(notices.length ? notices.join(' ') : null);

      setNewPayout((previous) => ({
        ...previous,
        consultantProfileId: previous.consultantProfileId || consultantsJson.consultants?.[0]?.id || '',
      }));
    } catch (cause) {
      setError(toSimpleUiError(cause instanceof Error ? cause.message : 'Errore caricamento finanza.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pendingPayouts = useMemo(() => payouts.filter((row) => row.status === 'pending'), [payouts]);
  const billingByConsultant = useMemo(() => {
    const map = new Map<string, ConsultantBillingProfileRow>();
    for (const row of consultantBillingProfiles) {
      map.set(row.consultantId, row);
    }
    return map;
  }, [consultantBillingProfiles]);

  async function createPayout() {
    if (!newPayout.consultantProfileId || !newPayout.periodStart || !newPayout.periodEnd) {
      setError('Compila consulente e periodo per creare il payout.');
      return;
    }
    setCreatingPayout(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/finance/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultantProfileId: newPayout.consultantProfileId,
          periodStart: newPayout.periodStart,
          periodEnd: newPayout.periodEnd,
          note: newPayout.note.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Impossibile creare payout.');
      await loadData();
    } catch (cause) {
      setError(toSimpleUiError(cause instanceof Error ? cause.message : 'Impossibile creare payout.'));
    } finally {
      setCreatingPayout(false);
    }
  }

  async function updatePayoutStatus(payoutId: string, status: 'approved' | 'paid' | 'rejected') {
    setUpdatingPayoutId(payoutId);
    setError(null);
    try {
      const response = await fetch('/api/admin/finance/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutId, status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Impossibile aggiornare payout.');
      await loadData();
    } catch (cause) {
      setError(toSimpleUiError(cause instanceof Error ? cause.message : 'Impossibile aggiornare payout.'));
    } finally {
      setUpdatingPayoutId(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="section-card">
        <div className="section-title">
          <span>💶</span>
          <span>Soldi della piattaforma</span>
        </div>
        <div className="admin-item-sub" style={{ marginTop: 4 }}>
          Qui vedi in modo chiaro incassi, pagamenti, rimborsi e compensi consulenti.
        </div>

        <div style={{ marginTop: 12, marginBottom: 4 }}>
          <button type="button" className="btn-action secondary" onClick={() => void loadData()}>
            Aggiorna dati
          </button>
        </div>

        {loading ? <div className="admin-item-sub">Caricamento finanza…</div> : null}
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

        {overview ? (
          <div className="admin-practice-crm-top" style={{ marginTop: 14 }}>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Incassato oggi</div>
              <div className="admin-kpi-value">{formatMoneyCents(overview.totals.todayCents)}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Incassato 7 giorni</div>
              <div className="admin-kpi-value">{formatMoneyCents(overview.totals.weekCents)}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Incassato 30 giorni</div>
              <div className="admin-kpi-value">{formatMoneyCents(overview.totals.monthCents)}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Pagamenti paid</div>
              <div className="admin-kpi-value">{overview.statusBuckets.paid}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Pagamenti pending</div>
              <div className="admin-kpi-value is-warn">{overview.statusBuckets.pending}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Consulente maturato</div>
              <div className="admin-kpi-value">{formatMoneyCents(overview.commissions.consultantMaturedCents)}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Piattaforma maturato</div>
              <div className="admin-kpi-value">{formatMoneyCents(overview.commissions.platformMaturedCents)}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Consulente già pagato</div>
              <div className="admin-kpi-value">{formatMoneyCents(overview.commissions.consultantPaidCents)}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>🏦</span>
          <span>Queue Payout Consulenti</span>
        </div>
        <div className="admin-item-sub" style={{ marginTop: 4 }}>
          Da qui admin gestisce il trasferimento quota consulente: crea payout, approva e marca pagato.
        </div>

        <div className="admin-billing-head" style={{ marginTop: 12 }}>
          <div className="modal-field" style={{ marginBottom: 0 }}>
            <label className="modal-label">Consulente</label>
            <select
              className="modal-select"
              value={newPayout.consultantProfileId}
              onChange={(event) => setNewPayout((previous) => ({ ...previous, consultantProfileId: event.target.value }))}
            >
              <option value="">Seleziona consulente</option>
              {consultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                  {consultant.fullName} · {consultant.email}
                </option>
              ))}
            </select>
            {newPayout.consultantProfileId && billingByConsultant.get(newPayout.consultantProfileId)?.billingProfile ? (
              <div className="admin-item-sub" style={{ marginTop: 8 }}>
                Metodo pagamento: {billingByConsultant.get(newPayout.consultantProfileId)?.billingProfile?.payoutMethod === 'bank_transfer'
                  ? 'Bonifico'
                  : billingByConsultant.get(newPayout.consultantProfileId)?.billingProfile?.payoutMethod === 'paypal'
                    ? 'PayPal'
                    : 'Altro'}
              </div>
            ) : (
              <div className="admin-item-sub" style={{ marginTop: 8, color: '#92400E' }}>
                Nessuna preferenza pagamento inserita dal consulente.
              </div>
            )}
          </div>

          <div className="modal-field" style={{ marginBottom: 0 }}>
            <label className="modal-label">Periodo</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                className="modal-input"
                type="date"
                value={newPayout.periodStart}
                onChange={(event) => setNewPayout((previous) => ({ ...previous, periodStart: event.target.value }))}
              />
              <input
                className="modal-input"
                type="date"
                value={newPayout.periodEnd}
                onChange={(event) => setNewPayout((previous) => ({ ...previous, periodEnd: event.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="modal-field" style={{ marginBottom: 0 }}>
          <label className="modal-label">Nota (opzionale)</label>
          <input
            className="modal-input"
            value={newPayout.note}
            onChange={(event) => setNewPayout((previous) => ({ ...previous, note: event.target.value }))}
            placeholder="Esempio: saldo primo trimestre"
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn-action" disabled={creatingPayout} onClick={() => void createPayout()}>
            {creatingPayout ? 'Creazione...' : 'Crea payout'}
          </button>
        </div>

        <div className="admin-item-sub" style={{ marginTop: 12 }}>
          Payout in attesa: {pendingPayouts.length}
        </div>

        <div className="admin-table" style={{ marginTop: 12 }}>
          {payouts.map((row) => {
            const consultant = consultants.find((entry) => entry.id === row.consultant_profile_id) ?? null;
            const consultantBilling = billingByConsultant.get(row.consultant_profile_id)?.billingProfile ?? null;
            const isUpdating = updatingPayoutId === row.id;
            return (
              <div key={row.id} className="admin-table-row">
                <div className="admin-table-main">
                  <div className="admin-table-name">
                    {consultant?.fullName ?? row.consultant_profile_id.slice(0, 8)} · {row.period_start} → {row.period_end}
                  </div>
                  <div className="admin-table-meta">
                    Lordo: {formatMoneyCents(row.gross_amount_cents)} · Quota consulente: {formatMoneyCents(row.consultant_share_cents)} · Stato: {row.status}
                  </div>
                  <div className="admin-table-meta">
                    Creato: {formatDateTime(row.created_at)} · Approvato: {formatDateTime(row.approved_at)} · Pagato: {formatDateTime(row.paid_at)}
                  </div>
                  {consultantBilling ? (
                    <div className="admin-table-meta">
                      Pagamento consulente: {consultantBilling.payoutMethod === 'bank_transfer' ? 'Bonifico' : consultantBilling.payoutMethod === 'paypal' ? 'PayPal' : 'Altro'}
                      {consultantBilling.iban ? ` · IBAN ${consultantBilling.iban}` : ''}
                      {consultantBilling.paypalEmail ? ` · ${consultantBilling.paypalEmail}` : ''}
                    </div>
                  ) : (
                    <div className="admin-table-meta" style={{ color: '#92400E' }}>
                      Il consulente non ha ancora compilato fatturazione e pagamenti.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {row.status === 'pending' ? (
                    <button type="button" className="btn-action secondary small" disabled={isUpdating} onClick={() => void updatePayoutStatus(row.id, 'approved')}>
                      Approva
                    </button>
                  ) : null}
                  {(row.status === 'approved' || row.status === 'pending') ? (
                    <button type="button" className="btn-action secondary small" disabled={isUpdating} onClick={() => void updatePayoutStatus(row.id, 'paid')}>
                      Segna pagato
                    </button>
                  ) : null}
                  {row.status !== 'rejected' && row.status !== 'paid' ? (
                    <button type="button" className="btn-action secondary small" disabled={isUpdating} onClick={() => void updatePayoutStatus(row.id, 'rejected')}>
                      Rifiuta
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {payouts.length === 0 ? <div className="admin-item-sub">Nessun payout presente.</div> : null}
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>📒</span>
          <span>Ledger Pagamenti</span>
        </div>

        <div className="admin-table" style={{ marginTop: 12 }}>
          {ledger.map((row) => (
            <div key={row.id} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">
                  {row.entry_type} · {row.direction === 'in' ? 'Entrata' : 'Uscita'} · {formatMoneyCents(row.amount_cents, String(row.currency || 'eur').toUpperCase())}
                </div>
                <div className="admin-table-meta">
                  Stato: {row.status} · Fonte: {row.source} · Riferimento: {row.reference ?? 'N/D'}
                </div>
                <div className="admin-table-meta">
                  Company: {shortId(row.company_id)} · Pratica: {shortId(row.application_id)} · Consulente: {shortId(row.consultant_profile_id)}
                </div>
                <div className="admin-table-meta">Data: {formatDateTime(row.occurred_at)}</div>
              </div>
            </div>
          ))}
          {ledger.length === 0 ? <div className="admin-item-sub">Nessuna voce ledger disponibile.</div> : null}
        </div>
      </section>
    </div>
  );
}
