'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

type CredentialsPayload = {
  ready: boolean;
  companyName?: string;
  username?: string;
  tempPassword?: string | null;
  loginUrl?: string;
  emailSent?: boolean;
  showCredentials?: boolean;
  message?: string;
  error?: string;
  detail?: string;
};

function readApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const normalize = (value: string) => {
    const text = value.trim();
    const lowered = text.toLowerCase();
    if (!text || lowered === 'bad request' || lowered === 'invalid request') return '';
    if (lowered.includes('invalid api key')) return 'Configurazione pagamento non valida. Contatta supporto BNDO.';
    return text;
  };

  if (typeof record.error === 'string') {
    const normalized = normalize(record.error);
    if (normalized) return normalized;
  }
  if (typeof record.message === 'string') {
    const normalized = normalize(record.message);
    if (normalized) return normalized;
  }
  if (typeof record.detail === 'string') {
    const normalized = normalize(record.detail);
    if (normalized) return normalized;
  }
  return fallback;
}

export function OnboardingCredentialsCard({ sessionId }: { sessionId: string }) {
  const [payload, setPayload] = useState<CredentialsPayload>({ ready: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchCredentials = async () => {
      try {
        const response = await fetch(`/api/onboarding-credentials?session_id=${sessionId}`);
        const data = (await response.json()) as CredentialsPayload;

        if (!response.ok) {
          throw new Error(readApiError(data, 'Errore durante il recupero credenziali.'));
        }

        setPayload(data);
        setLoading(false);

        if (!data.ready) {
          timer = setTimeout(fetchCredentials, 4000);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Errore inatteso.');
        setLoading(false);
      }
    };

    fetchCredentials();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  const statusLabel = useMemo(() => {
    if (error) return 'Errore provisioning';
    if (loading) return 'Provisioning account in corso';
    if (!payload.ready) return 'Stiamo creando la tua dashboard';
    return 'Account attivo';
  }, [error, loading, payload.ready]);

  return (
    <div className="panel mx-auto max-w-2xl p-6 sm:p-8">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand.steel">
        <ShieldCheck className="h-4 w-4 text-brand.mint" />
        {statusLabel}
      </div>

      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}

      {loading || !payload.ready ? (
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Attendi qualche secondo: stiamo generando username e password.
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Azienda attivata: <strong>{payload.companyName}</strong>
          </p>
          <p className="rounded-xl bg-slate-50 p-3 text-slate-600">
            {payload.message ??
              'Ti abbiamo inviato le informazioni di accesso. Se non trovi la mail, controlla la cartella spam.'}
          </p>
          <p>
            Username: <strong>{payload.username}</strong>
          </p>
          {payload.showCredentials ? (
            <p>
              Password temporanea: <strong>{payload.tempPassword}</strong>
            </p>
          ) : null}
          {payload.showCredentials ? (
            <p className="rounded-xl bg-slate-50 p-3 text-slate-600">
              Usa queste credenziali per entrare in dashboard. Ti consigliamo di cambiare password al primo accesso.
            </p>
          ) : (
            <p className="rounded-xl bg-slate-50 p-3 text-slate-600">
              Le credenziali complete sono state inviate via email. Ti consigliamo di cambiare password al primo
              accesso.
            </p>
          )}
          <a href={payload.loginUrl ?? '/login'} className="btn btn-primary mt-2">
            Vai al login
          </a>
        </div>
      )}
    </div>
  );
}
