'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type ResumeMapPayload = {
  targetUrl?: string;
  savedAt?: string;
};

function isSafeSameOriginUrl(value: string, origin: string) {
  try {
    const parsed = new URL(value);
    return parsed.origin === origin;
  } catch {
    return false;
  }
}

export function ResumeLinkRedirectClient() {
  const router = useRouter();
  const params = useParams<{ grantSlug: string; resumeCode: string }>();
  const grantSlug = params?.grantSlug ?? 'pratica';
  const resumeCode = params?.resumeCode ?? '';
  const [error, setError] = useState<string | null>(null);

  const fallbackUrl = useMemo(() => {
    const qp = new URLSearchParams();
    qp.set('grantSlug', grantSlug);
    qp.set('onboarding_mode', 'dashboard_client');
    qp.set('skip_payment', '1');
    return `/onboarding?${qp.toString()}`;
  }, [grantSlug]);

  useEffect(() => {
    if (!resumeCode) {
      router.replace(fallbackUrl);
      return;
    }

    try {
      const storageKey = `bndo:onboarding:resume-map:${resumeCode}`;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        router.replace(fallbackUrl);
        return;
      }

      const parsed = JSON.parse(raw) as ResumeMapPayload;
      const targetUrl = String(parsed?.targetUrl ?? '').trim();
      if (!targetUrl) {
        router.replace(fallbackUrl);
        return;
      }

      if (!isSafeSameOriginUrl(targetUrl, window.location.origin)) {
        router.replace(fallbackUrl);
        return;
      }

      window.location.replace(targetUrl);
    } catch {
      setError('Link non disponibile su questo dispositivo. Reindirizzamento in corso...');
      router.replace(fallbackUrl);
    }
  }, [fallbackUrl, resumeCode, router]);

  return (
    <main className="wizard7-page">
      <section className="wizard7-successCard">
        <p className="wizard7-payLaterNotice">
          {error ?? 'Ti sto riportando al punto esatto dell’onboarding...'}
        </p>
      </section>
    </main>
  );
}

