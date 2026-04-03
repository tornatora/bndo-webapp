'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('bndo-cookie-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem('bndo-cookie-consent', 'accepted');
    setIsVisible(false);
  };

  const reject = () => {
    localStorage.setItem('bndo-cookie-consent', 'rejected');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-5 z-[9999] px-4">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-[#d7e2f2] bg-white shadow-[0_12px_36px_rgba(11,17,54,0.12)]">
        <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 md:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5f7388]">Cookie e Privacy</p>
            <p className="mt-1 text-sm leading-relaxed text-[#0f1f52]">
              Utilizziamo cookie tecnici per il funzionamento del sito. Con il tuo consenso attiviamo cookie non essenziali.
              Leggi{' '}
              <Link href="/privacy" className="font-semibold text-[#0f1f52] underline underline-offset-4">
                Privacy Policy
              </Link>{' '}
              e{' '}
              <Link href="/cookie-policy" className="font-semibold text-[#0f1f52] underline underline-offset-4">
                Cookie Policy
              </Link>
              .
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={reject}
              className="min-h-10 rounded-xl border border-[#d7e2f2] bg-white px-5 text-sm font-semibold text-[#24395a] transition hover:border-[#b6c7df]"
            >
              Rifiuta
            </button>
            <button
              onClick={accept}
              className="min-h-10 rounded-xl bg-[#0f1f52] px-5 text-sm font-semibold text-white transition hover:bg-[#122963]"
            >
              Accetta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
