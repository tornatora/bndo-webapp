'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { OnboardingCredentialsCard } from '@/components/landing/OnboardingCredentialsCard';

type StripeSessionPayload = {
  ok?: boolean;
  error?: string;
  session?: {
    id: string;
    payment_status: string | null;
    customer_email: string | null;
    customer_name: string | null;
    amount_total: number | null;
    currency: string | null;
    created_at: string | null;
  };
};

type CompletePayload = {
  ok?: boolean;
  error?: string;
  sessionId?: string;
  practiceType?: string;
  applicationId?: string;
  alreadyProvisioned?: boolean;
};

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || !currency) return null;
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

function moneyFromStripe(amountTotal: number | null | undefined, currency: string | null | undefined) {
  if (!amountTotal || !currency) return null;
  const isZeroDecimal = new Set(['jpy', 'krw', 'vnd']).has(currency.toLowerCase());
  return isZeroDecimal ? amountTotal : amountTotal / 100;
}

export function AfterPaymentOnboardingForm({ sessionId }: { sessionId: string }) {
  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<StripeSessionPayload['session'] | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [pec, setPec] = useState('');
  const [digitalSignature, setDigitalSignature] = useState<'yes' | 'no'>('no');
  const [projectSummary, setProjectSummary] = useState('');

  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [taxCodeDocument, setTaxCodeDocument] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingSession(true);
      setSessionError(null);
      try {
        const res = await fetch(`/api/stripe/checkout-session?session_id=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store'
        });
        const json = (await res.json()) as StripeSessionPayload;
        if (!res.ok) throw new Error(json?.error ?? 'Impossibile verificare il pagamento.');
        if (!cancelled) setSession(json.session ?? null);
      } catch (e) {
        if (!cancelled) setSessionError(e instanceof Error ? e.message : 'Errore verifica pagamento.');
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const paidAmount = useMemo(
    () => moneyFromStripe(session?.amount_total ?? null, session?.currency ?? null),
    [session?.amount_total, session?.currency]
  );

  const paidLabel = useMemo(
    () => (paidAmount !== null ? formatMoney(paidAmount, session?.currency ?? null) : null),
    [paidAmount, session?.currency]
  );

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!session || session.payment_status !== 'paid') return false;
    if (!idDocument || !taxCodeDocument) return false;
    return true;
  }, [idDocument, session, submitting, taxCodeDocument]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      if (!idDocument || !taxCodeDocument) throw new Error('Carica documento identita e codice fiscale.');

      const fd = new FormData();
      fd.set('sessionId', sessionId);
      fd.set('pec', pec.trim());
      fd.set('digitalSignature', digitalSignature);
      fd.set('projectSummary', projectSummary.trim());
      fd.set('idDocument', idDocument);
      fd.set('taxCodeDocument', taxCodeDocument);

      const res = await fetch('/api/onboarding/after-payment/complete', {
        method: 'POST',
        body: fd
      });

      const json = (await res.json()) as CompletePayload;
      if (!res.ok) throw new Error(json?.error ?? 'Onboarding non riuscito.');

      setCompleted(json);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Errore onboarding.');
    } finally {
      setSubmitting(false);
    }
  }

  if (completed?.ok) {
    return (
      <div className="space-y-4">
        <div className="panel p-6 sm:p-8">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand.steel">
            <ShieldCheck className="h-4 w-4 text-brand.mint" />
            Documenti ricevuti
          </div>
          <p className="text-sm text-slate-700">
            Perfetto: abbiamo ricevuto i documenti base. Ora stiamo attivando la tua dashboard e ti invieremo le
            credenziali via email.
          </p>
        </div>

        <OnboardingCredentialsCard sessionId={sessionId} />
      </div>
    );
  }

  return (
    <form className="panel p-6 sm:p-8" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand.steel">
        <ShieldCheck className="h-4 w-4 text-brand.mint" />
        Carica documenti base
      </div>

      {loadingSession ? (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifica pagamento in corso...
        </div>
      ) : sessionError ? (
        <div className="text-sm font-semibold text-red-700">{sessionError}</div>
      ) : session?.payment_status !== 'paid' ? (
        <div className="text-sm font-semibold text-red-700">
          Pagamento non risultante completato. Se hai appena pagato, attendi qualche secondo e ricarica la pagina.
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Pagamento confermato{paidLabel ? `: ${paidLabel}` : ''}. Email: <strong>{session.customer_email ?? 'N/D'}</strong>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pec">
            PEC (se ce l&apos;hai)
          </label>
          <input
            id="pec"
            className="input"
            value={pec}
            onChange={(e) => setPec(e.target.value)}
            placeholder="nome@pec.it"
            inputMode="email"
          />
        </div>

        <div>
          <label className="label" htmlFor="digitalSignature">
            Firma digitale
          </label>
          <select
            id="digitalSignature"
            className="input"
            value={digitalSignature}
            onChange={(e) => setDigitalSignature(e.target.value as 'yes' | 'no')}
          >
            <option value="no">Non in possesso</option>
            <option value="yes">In possesso</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="projectSummary">
          Sintesi del progetto (facoltativa)
        </label>
        <textarea
          id="projectSummary"
          className="input min-h-28"
          value={projectSummary}
          onChange={(e) => setProjectSummary(e.target.value)}
          placeholder="Descrivi in poche righe cosa vuoi realizzare con il bando..."
          maxLength={2000}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="idDocument">
            Documento di identita (PDF/JPG/PNG)
          </label>
          <input
            id="idDocument"
            className="input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
            onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)}
            required
          />
          {idDocument ? <div className="mt-2 text-xs text-slate-500">{idDocument.name}</div> : null}
        </div>

        <div>
          <label className="label" htmlFor="taxCodeDocument">
            Codice fiscale (PDF/JPG/PNG)
          </label>
          <input
            id="taxCodeDocument"
            className="input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
            onChange={(e) => setTaxCodeDocument(e.target.files?.[0] ?? null)}
            required
          />
          {taxCodeDocument ? <div className="mt-2 text-xs text-slate-500">{taxCodeDocument.name}</div> : null}
        </div>
      </div>

      {submitError ? <p className="mt-4 text-sm font-semibold text-red-700">{submitError}</p> : null}

      <button className="btn btn-primary mt-6 w-full" type="submit" disabled={!canSubmit}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Invio documenti...
          </>
        ) : (
          'Invia documenti e attiva dashboard'
        )}
      </button>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        I documenti caricati saranno visibili al nostro team e verranno associati automaticamente alla tua pratica.
      </p>
    </form>
  );
}

