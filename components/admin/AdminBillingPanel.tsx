'use client';

import { useEffect, useMemo, useState } from 'react';

type PracticeRef = { id: string; tender_id: string; tender_title: string | null };

type BillingState = {
  payments: Record<string, { total: number; paid: number }>;
  invoices: Array<{
    id: string;
    applicationId: string | null;
    fileName: string;
    createdAt: string;
    url: string | null;
  }>;
};

function practiceLabel(practice: PracticeRef | null) {
  if (practice?.tender_title) return practice.tender_title;
  const tenderId = practice?.tender_id ?? '';
  const key = tenderId.toLowerCase();
  if (key === 'resto_sud_2_0' || key === 'resto al sud 2.0') return 'Resto al Sud 2.0';
  if (key === 'autoimpiego_centro_nord' || key === 'autoimpiego centro nord') return 'Autoimpiego Centro-Nord';
  return tenderId || 'N/D';
}

function defaultBilling(practices: PracticeRef[]): BillingState {
  const payments: BillingState['payments'] = {};
  for (const p of practices) {
    payments[p.id] = { total: 500, paid: 0 };
  }
  // Demo: first practice has paid 100.
  if (practices[0]) payments[practices[0].id] = { total: 500, paid: 100 };
  return { payments, invoices: [] };
}

function pct(paid: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
}

export function AdminBillingPanel({
  isMock,
  companyId,
  threadId,
  toEmail,
  companyName,
  practices
}: {
  isMock: boolean;
  companyId: string;
  threadId: string | null;
  toEmail: string | null;
  companyName: string;
  practices: PracticeRef[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<BillingState>(() => defaultBilling(practices));
  const [selectedAppId, setSelectedAppId] = useState<string>('all');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const selectedPractice = useMemo(
    () => (selectedAppId === 'all' ? null : practices.find((p) => p.id === selectedAppId) ?? null),
    [practices, selectedAppId]
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        if (isMock) {
          const raw = localStorage.getItem(`bndo:billing:${companyId}`);
          if (raw) {
            const parsed = JSON.parse(raw) as BillingState;
            if (!cancelled) setState(parsed);
          } else {
            const init = defaultBilling(practices);
            localStorage.setItem(`bndo:billing:${companyId}`, JSON.stringify(init));
            if (!cancelled) setState(init);
          }
          return;
        }

        const res = await fetch(`/api/admin/billing?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
        const json = (await res.json()) as { error?: string; data?: BillingState };
        if (!res.ok) throw new Error(json?.error ?? 'Errore caricamento fatturazione.');
        if (!cancelled) setState(json.data ?? defaultBilling(practices));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Errore caricamento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [companyId, isMock, practices]);

  async function persist(next: BillingState) {
    setState(next);
    if (isMock) {
      localStorage.setItem(`bndo:billing:${companyId}`, JSON.stringify(next));
      return;
    }
    await fetch('/api/admin/billing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId, billing: next })
    });
  }

  async function applyPayment() {
    if (selectedAppId === 'all') {
      setError('Seleziona una pratica per aggiornare i pagamenti.');
      return;
    }
    const amount = Number(amountPaid.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Inserisci un importo valido.');
      return;
    }
    setError(null);
    const current = state.payments[selectedAppId] ?? { total: 500, paid: 0 };
    const nextPaid = Math.max(0, Math.min(current.total, current.paid + amount));
    const next: BillingState = {
      ...state,
      payments: { ...state.payments, [selectedAppId]: { ...current, paid: nextPaid } }
    };
    await persist(next);
    setAmountPaid('');
  }

  async function uploadInvoice() {
    if (!invoiceFile) {
      setError('Seleziona un file fattura.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      if (isMock) {
        const url = URL.createObjectURL(invoiceFile);
        const inv = {
          id: `inv-${Date.now()}`,
          applicationId: selectedAppId === 'all' ? null : selectedAppId,
          fileName: invoiceFile.name,
          createdAt: new Date().toISOString(),
          url
        };
        const next: BillingState = { ...state, invoices: [inv, ...state.invoices] };
        await persist(next);
        setInvoiceFile(null);
        return;
      }

      const fd = new FormData();
      fd.set('companyId', companyId);
      fd.set('applicationId', selectedAppId === 'all' ? '' : selectedAppId);
      fd.set('file', invoiceFile);

      const res = await fetch('/api/admin/billing/invoice-upload', { method: 'POST', body: fd });
      const json = (await res.json()) as { error?: string; data?: BillingState };
      if (!res.ok) throw new Error(json?.error ?? 'Upload fattura non riuscito.');
      if (json.data) setState(json.data);
      setInvoiceFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore upload fattura.');
    } finally {
      setSending(false);
    }
  }

  async function sendInvoice(invId: string) {
    setSending(true);
    setError(null);
    try {
      if (!threadId) throw new Error('Thread chat non disponibile.');
      if (!toEmail) throw new Error('Email cliente non disponibile.');
      if (isMock) return;

      const res = await fetch('/api/admin/billing/invoice-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, invoiceId: invId, threadId, toEmail, companyName })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json?.error ?? 'Invio fattura non riuscito.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore invio fattura.');
    } finally {
      setSending(false);
    }
  }

  const practicesRows = practices.map((p) => {
    const pay = state.payments[p.id] ?? { total: 500, paid: 0 };
    const percent = pct(pay.paid, pay.total);
    return { practice: p, pay, percent };
  });

  const filteredInvoices = state.invoices.filter((i) => (selectedAppId === 'all' ? true : i.applicationId === selectedAppId));

  return (
    <section className="section-card">
      <div className="section-title">Fatturazione e pagamenti</div>

      {loading ? <div className="admin-item-sub">Caricamento…</div> : null}
      {error ? (
        <div className="admin-item-sub" style={{ color: '#B91C1C', fontWeight: 500 }}>
          {error}
        </div>
      ) : null}

      <div className="admin-billing-panel">
        <div className="admin-billing-head">
          <div className="modal-field" style={{ marginBottom: 0 }}>
            <label className="modal-label">Filtro pratica</label>
            <select className="modal-select" value={selectedAppId} onChange={(e) => setSelectedAppId(e.target.value)}>
              <option value="all">Tutte</option>
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {practiceLabel(p)}
                </option>
              ))}
            </select>
            <div className="admin-item-sub" style={{ marginTop: 8 }}>
              Il filtro si applica alla lista fatture.
            </div>
          </div>

          <div className="modal-field" style={{ marginBottom: 0 }}>
            <label className="modal-label">Registra pagamento</label>
            <div className="admin-billing-payrow">
              <input
                className="modal-input"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="Es: 100"
                inputMode="decimal"
              />
              <button type="button" className="btn-action primary" onClick={applyPayment}>
                Applica
              </button>
            </div>
            <div className="admin-item-sub" style={{ marginTop: 8 }}>
              Seleziona prima una pratica (non “Tutte”).
            </div>
          </div>
        </div>

        <div className="admin-billing-grid">
          <div className="admin-billing-col">
            <div className="admin-docs-col-title">Pagamenti per pratica</div>
            <div className="admin-table admin-table-spaced">
              {practicesRows.map((row) => (
                <div key={row.practice.id} className="admin-table-row">
                  <div className="admin-table-main">
                    <div className="admin-table-name">{practiceLabel(row.practice)}</div>
                    <div className="admin-table-meta">
                      Pagato: {row.pay.paid} / {row.pay.total} EUR
                    </div>
                    <div className="admin-billing-bar" aria-label="Avanzamento pagamento">
                      <div className="admin-billing-bar-fill" style={{ width: `${row.percent}%` }} />
                    </div>
                  </div>
                  <span className="meta-tag">{row.percent}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-billing-col">
            <div className="admin-docs-col-title">Fatture</div>

            <div className="admin-billing-upload">
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn-action primary" disabled={sending} onClick={uploadInvoice}>
                {sending ? 'Caricamento…' : 'Carica fattura'}
              </button>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="admin-panel-empty">Nessuna fattura caricata{selectedPractice ? ' per questa pratica.' : '.'}</div>
            ) : (
              <div className="admin-table admin-table-spaced">
                {filteredInvoices.map((inv) => (
                <div key={inv.id} className="admin-table-row">
                  <div className="admin-table-main">
                    <div className="admin-table-name">{inv.fileName}</div>
                    <div className="admin-table-meta">
                      {inv.applicationId
                        ? `Pratica: ${practiceLabel(practices.find((p) => p.id === inv.applicationId) ?? null)}`
                        : 'Generale'}
                      {' · '}
                      {new Date(inv.createdAt).toLocaleString('it-IT')}
                    </div>
                  </div>

                    <div className="admin-billing-actions">
                      {inv.url ? (
                        <a className="btn-doc" href={inv.url} target="_blank" rel="noreferrer">
                          <span>Apri</span>
                        </a>
                      ) : (
                        <span className="btn-doc" style={{ opacity: 0.6 }}>
                          <span>Non disponibile</span>
                        </span>
                      )}

                      <button type="button" className="btn-doc" disabled={sending || isMock} onClick={() => sendInvoice(inv.id)}>
                        Invia
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isMock ? <div className="admin-item-sub">In mock mode “Invia” e’ disabilitato.</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
