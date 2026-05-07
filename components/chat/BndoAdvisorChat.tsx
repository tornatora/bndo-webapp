'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useCallback, useMemo, useState } from 'react';
import { ChatKit, useChatKit } from '@openai/chatkit-react';

type BndoContext = 'unknown' | 'rsud' | 'acn';

type BndoAdvisorChatProps = {
  sourcePage: string;
  bandoContext?: BndoContext;
  className?: string;
  title?: string;
  subtitle?: string;
};

type SessionPayload = {
  client_secret?: string;
  error?: string;
};

function isChatEnabled() {
  const value = (process.env.NEXT_PUBLIC_ENABLE_BNDO_CHAT ?? '').trim().toLowerCase();
  if (!value) return false;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function bandoQueryParam(value: BndoContext) {
  return value;
}

function BndoAdvisorChatEnabled({
  sourcePage,
  bandoContext = 'unknown',
  className,
  title = 'BNDO Advisor',
  subtitle = 'Consulenza guidata su Resto al Sud 2.0 e Autoimpiego Centro-Nord.'
}: BndoAdvisorChatProps) {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(true);

  const getClientSecret = useCallback(
    async (currentClientSecret: string | null) => {
      setLoadingSecret(true);
      setRuntimeError(null);

      const res = await fetch('/api/chatkit/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_page: sourcePage,
          bando_context: bandoContext,
          current_client_secret: currentClientSecret ?? undefined
        })
      });

      const payload = (await res.json().catch(() => ({}))) as SessionPayload;
      if (!res.ok || !payload.client_secret) {
        const message = payload.error?.trim() || 'Sessione chat non disponibile al momento.';
        setRuntimeError(message);
        setLoadingSecret(false);
        throw new Error(message);
      }

      setLoadingSecret(false);
      return payload.client_secret;
    },
    [bandoContext, sourcePage]
  );

  const { control } = useChatKit({
    api: { getClientSecret },
    theme: 'light',
    frameTitle: 'BNDO Advisor Chat'
  });

  const verifyHref = useMemo(
    () => `/quiz/autoimpiego?source=chat&bando=${encodeURIComponent(bandoQueryParam(bandoContext))}`,
    [bandoContext]
  );

  return (
    <section className={className}>
      <Script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js" strategy="afterInteractive" />
      <div className="panel p-5 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-brand.navy">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </div>
          <Link href={verifyHref} className="btn btn-primary whitespace-nowrap">
            Fai la verifica requisiti
          </Link>
        </div>

        {runtimeError ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{runtimeError}</div>
        ) : null}

        {loadingSecret ? (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Avvio chat in corso...
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ChatKit control={control} className="h-[620px] w-full" />
        </div>
      </div>
    </section>
  );
}

export function BndoAdvisorChat(props: BndoAdvisorChatProps) {
  if (!isChatEnabled()) return null;
  return <BndoAdvisorChatEnabled {...props} />;
}
