'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type ConsentValue = 'accepted' | 'rejected';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  const isMarketingHost = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.host.toLowerCase();
    // Local: bndo.lvh.me. Prod: bndo.it. Netlify: *.netlify.app
    return host === 'bndo.it' || host.startsWith('bndo.') || host.endsWith('.netlify.app');
  }, []);

  useEffect(() => {
    if (!isMarketingHost) return;
    const value = readCookie('bndo_cookie_consent') as ConsentValue | null;
    if (value === 'accepted' || value === 'rejected') return;
    setVisible(true);
  }, [isMarketingHost]);

  if (!isMarketingHost || !visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Preferenze cookie">
      <div className="cookie-banner-inner">
        <div className="cookie-banner-copy">
          <div className="cookie-banner-title">Cookie</div>
          <p className="cookie-banner-text">
            Usiamo cookie tecnici necessari al funzionamento del sito. Con il tuo consenso possiamo usare cookie non essenziali
            per migliorare l&apos;esperienza. Leggi la nostra <Link href="/cookie-policy">Cookie Policy</Link>.
          </p>
        </div>
        <div className="cookie-banner-actions">
          <button
            type="button"
            className="cookie-btn cookie-btn-muted"
            onClick={() => {
              writeCookie('bndo_cookie_consent', 'rejected', 60 * 60 * 24 * 365);
              setVisible(false);
            }}
          >
            Rifiuta
          </button>
          <button
            type="button"
            className="cookie-btn cookie-btn-primary"
            onClick={() => {
              writeCookie('bndo_cookie_consent', 'accepted', 60 * 60 * 24 * 365);
              setVisible(false);
            }}
          >
            Accetta
          </button>
        </div>
      </div>
    </div>
  );
}

