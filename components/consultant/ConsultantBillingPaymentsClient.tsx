'use client';

import { useEffect, useMemo, useState } from 'react';

type BillingProfile = {
  payoutMethod: 'bank_transfer' | 'paypal' | 'other';
  accountHolder: string;
  iban: string | null;
  taxCode: string | null;
  vatNumber: string | null;
  paypalEmail: string | null;
  billingAddress: string | null;
  notes: string | null;
};

type PayoutRow = {
  id: string;
  period_start: string;
  period_end: string;
  consultant_share_cents: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  paid_at: string | null;
  payment_reference: string | null;
  created_at: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/D';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/D';
  return date.toLocaleString('it-IT');
}

export function ConsultantBillingPaymentsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [billingProfile, setBillingProfile] = useState<BillingProfile>({
    payoutMethod: 'bank_transfer',
    accountHolder: '',
    iban: null,
    taxCode: null,
    vatNumber: null,
    paypalEmail: null,
    billingAddress: null,
    notes: null
  });
  const [totals, setTotals] = useState<{ maturedCents: number; paidCents: number; pendingCents: number }>({
    maturedCents: 0,
    paidCents: 0,
    pendingCents: 0
  });
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const [profileRes, payoutsRes] = await Promise.all([
          fetch('/api/consultant/billing-profile', { cache: 'no-store' }),
          fetch('/api/consultant/finance/payouts', { cache: 'no-store' })
        ]);
        const profilePayload = (await profileRes.json()) as {
          error?: string;
          data?: BillingProfile | null;
          notice?: string | null;
        };
        const payoutsPayload = (await payoutsRes.json()) as {
          error?: string;
          totals?: { maturedCents: number; paidCents: number; pendingCents: number };
          payouts?: PayoutRow[];
          notice?: string | null;
        };

        if (!profileRes.ok) throw new Error(profilePayload.error ?? 'Impossibile caricare profilo pagamento.');
        if (!payoutsRes.ok) throw new Error(payoutsPayload.error ?? 'Impossibile caricare stato pagamenti.');

        if (!cancelled) {
          if (profilePayload.data) setBillingProfile(profilePayload.data);
          setTotals(payoutsPayload.totals ?? { maturedCents: 0, paidCents: 0, pendingCents: 0 });
          setPayouts(payoutsPayload.payouts ?? []);
          const notices = [profilePayload.notice, payoutsPayload.notice].filter((item): item is string => Boolean(item));
          setNotice(notices.length ? notices.join(' ') : null);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Errore caricamento fatturazione.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const methodLabel = useMemo(() => {
    if (billingProfile.payoutMethod === 'bank_transfer') return 'Bonifico';
    if (billingProfile.payoutMethod === 'paypal') return 'PayPal';
    return 'Altro';
  }, [billingProfile.payoutMethod]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (!billingProfile.accountHolder.trim()) {
        throw new Error('Inserisci l’intestatario pagamento.');
      }
      if (billingProfile.payoutMethod === 'bank_transfer' && !(billingProfile.iban ?? '').trim()) {
        throw new Error('Per bonifico devi inserire IBAN.');
      }
      if (billingProfile.payoutMethod === 'paypal' && !(billingProfile.paypalEmail ?? '').trim()) {
        throw new Error('Per PayPal devi inserire l’email PayPal.');
      }

      const response = await fetch('/api/consultant/billing-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billingProfile)
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Salvataggio dati pagamento non riuscito.');
      setNotice('Preferenze pagamento salvate.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Salvataggio dati pagamento non riuscito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="section-card">
        <div className="section-title">
          <span>💳</span>
          <span>Fatturazione e pagamenti</span>
        </div>
        <div className="admin-item-sub" style={{ marginTop: 4 }}>
          Configura qui come vuoi ricevere i pagamenti.
        </div>
        <div className="admin-item-sub" style={{ marginTop: 4 }}>
          Nota trasparente: il box KPI mostra il maturato, il pagamento reale viene disposto da admin nel flusso payout.
        </div>

        {loading ? <div className="admin-item-sub" style={{ marginTop: 10 }}>Caricamento…</div> : null}
        {error ? (
          <div className="admin-item-sub" style={{ marginTop: 10, color: '#B91C1C', fontWeight: 700 }}>
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="admin-item-sub" style={{ marginTop: 10, color: '#065F46', fontWeight: 700 }}>
            {notice}
          </div>
        ) : null}

        <div className="admin-practice-crm-top" style={{ marginTop: 12 }}>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Maturato</div>
            <div className="admin-kpi-value">{formatCurrency(totals.maturedCents)}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Pagato</div>
            <div className="admin-kpi-value">{formatCurrency(totals.paidCents)}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">In attesa</div>
            <div className="admin-kpi-value is-warn">{formatCurrency(totals.pendingCents)}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Metodo attivo</div>
            <div className="admin-kpi-value">{methodLabel}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <select
            className="modal-select"
            value={billingProfile.payoutMethod}
            onChange={(event) =>
              setBillingProfile((previous) => ({
                ...previous,
                payoutMethod: event.target.value as BillingProfile['payoutMethod']
              }))
            }
          >
            <option value="bank_transfer">Bonifico</option>
            <option value="paypal">PayPal</option>
            <option value="other">Altro</option>
          </select>

          <input
            className="modal-input"
            value={billingProfile.accountHolder}
            onChange={(event) => setBillingProfile((previous) => ({ ...previous, accountHolder: event.target.value }))}
            placeholder="Intestatario pagamento"
          />

          <input
            className="modal-input"
            value={billingProfile.iban ?? ''}
            onChange={(event) => setBillingProfile((previous) => ({ ...previous, iban: event.target.value || null }))}
            placeholder="IBAN"
          />

          <input
            className="modal-input"
            value={billingProfile.paypalEmail ?? ''}
            onChange={(event) =>
              setBillingProfile((previous) => ({ ...previous, paypalEmail: event.target.value || null }))
            }
            placeholder="Email PayPal"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              className="modal-input"
              value={billingProfile.taxCode ?? ''}
              onChange={(event) => setBillingProfile((previous) => ({ ...previous, taxCode: event.target.value || null }))}
              placeholder="Codice fiscale"
            />
            <input
              className="modal-input"
              value={billingProfile.vatNumber ?? ''}
              onChange={(event) =>
                setBillingProfile((previous) => ({ ...previous, vatNumber: event.target.value || null }))
              }
              placeholder="Partita IVA"
            />
          </div>

          <textarea
            className="modal-textarea"
            value={billingProfile.billingAddress ?? ''}
            onChange={(event) =>
              setBillingProfile((previous) => ({ ...previous, billingAddress: event.target.value || null }))
            }
            placeholder="Indirizzo fiscale"
          />

          <textarea
            className="modal-textarea"
            value={billingProfile.notes ?? ''}
            onChange={(event) => setBillingProfile((previous) => ({ ...previous, notes: event.target.value || null }))}
            placeholder="Note aggiuntive (facoltative)"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-action" disabled={saving} onClick={() => void saveProfile()}>
              {saving ? 'Salvataggio…' : 'Salva preferenze pagamento'}
            </button>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-title">
          <span>🧾</span>
          <span>Storico payout</span>
        </div>
        <div className="admin-table" style={{ marginTop: 12 }}>
          {payouts.map((row) => (
            <div key={row.id} className="admin-table-row">
              <div className="admin-table-main">
                <div className="admin-table-name">
                  Periodo {row.period_start} → {row.period_end}
                </div>
                <div className="admin-table-meta">
                  Importo: {formatCurrency(row.consultant_share_cents)} · Stato: {row.status}
                </div>
                <div className="admin-table-meta">
                  Creato: {formatDateTime(row.created_at)} · Pagato: {formatDateTime(row.paid_at)}
                </div>
                <div className="admin-table-meta">Riferimento: {row.payment_reference ?? 'N/D'}</div>
              </div>
            </div>
          ))}
          {!loading && payouts.length === 0 ? <div className="admin-item-sub">Nessun payout disponibile.</div> : null}
        </div>
      </section>
    </div>
  );
}
