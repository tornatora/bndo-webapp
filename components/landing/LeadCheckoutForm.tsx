'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

type FormState = {
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  challenge: string;
};

const initialState: FormState = {
  fullName: '',
  companyName: '',
  email: '',
  phone: '',
  challenge: ''
};

export function LeadCheckoutForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = useMemo(
    () => !form.fullName || !form.companyName || !form.email || loading,
    [form.fullName, form.companyName, form.email, loading]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Impossibile avviare il checkout.');
      }

      window.location.href = payload.url;
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Errore imprevisto durante il checkout.'
      );
      setLoading(false);
    }
  }

  return (
    <form className="panel p-6 sm:p-8" onSubmit={onSubmit}>
      <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-brand.steel">
        <Sparkles className="h-4 w-4 text-brand.mint" />
        Attiva il servizio in meno di 3 minuti
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fullName">
            Nome referente
          </label>
          <input
            id="fullName"
            className="input"
            value={form.fullName}
            onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))}
            placeholder="Mario Rossi"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="companyName">
            Azienda
          </label>
          <input
            id="companyName"
            className="input"
            value={form.companyName}
            onChange={(event) => setForm((previous) => ({ ...previous, companyName: event.target.value }))}
            placeholder="Rossi Impianti S.r.l."
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={form.email}
            onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
            placeholder="gare@azienda.it"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="phone">
            Telefono
          </label>
          <input
            id="phone"
            className="input"
            value={form.phone}
            onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
            placeholder="+39 333 1234567"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="challenge">
          Breve contesto (facoltativo)
        </label>
        <textarea
          id="challenge"
          className="input min-h-24"
          value={form.challenge}
          onChange={(event) => setForm((previous) => ({ ...previous, challenge: event.target.value }))}
          placeholder="Tipologie gare, territorio, volume annuo..."
        />
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}

      <button className="btn btn-primary mt-6 w-full" type="submit" disabled={disabled}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Reindirizzamento a Stripe...
          </>
        ) : (
          'Acquista servizio e attiva account'
        )}
      </button>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Dopo il pagamento ricevi credenziali immediate via email (username + password) e accesso alla dashboard gare personalizzata.
      </p>
    </form>
  );
}
