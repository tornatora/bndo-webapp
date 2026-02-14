'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { AfterPaymentOnboardingForm } from '@/components/landing/AfterPaymentOnboardingForm';
import type { PracticeType } from '@/lib/bandi';

export function OnboardingWelcomeClient({ sessionId, practiceType }: { sessionId?: string; practiceType?: PracticeType }) {
  const [view, setView] = useState<'welcome' | 'form'>('welcome');

  const buttonLabel = useMemo(
    () =>
      view === 'welcome'
        ? 'Carica i documenti richiesti e attiva la dashboard'
        : 'Invia documenti e attiva dashboard',
    [view]
  );

  return (
    <main className={`onboarding2030 ${view === 'form' ? 'is-form' : ''}`}>
      <div className="onboarding2030-bg" aria-hidden="true" />

      <div className="onboarding2030-inner">
        {view === 'welcome' ? (
          <section className="onboarding2030-stage">
            <div className="onboarding2030-tag">Attivazione pratica</div>

            <h1 className="onboarding2030-welcomeTitle">BENVENUT* IN</h1>

            <div className="onboarding2030-logoWrap" aria-label="BNDO">
              <Image
                src="/Logo-BNDO-header.png"
                alt="BNDO"
                width={520}
                height={224}
                priority
                quality={100}
                sizes="(max-width: 520px) 90vw, 520px"
                className="onboarding2030-logo"
              />
              <div className="onboarding2030-logoShine" aria-hidden="true" />
            </div>

            <p className="onboarding2030-subtitle">
              Caricando questi documenti avrai accesso alla tua dashboard cliente. Da lì potrai seguire lo stato della
              pratica, ricevere richieste documenti e comunicare con il tuo consulente.
            </p>

            <div className="onboarding2030-ctaRow">
              <button type="button" className="onboarding2030-cta" onClick={() => setView('form')}>
                <span>{buttonLabel}</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="onboarding2030-formOnly">
            <div className="onboarding2030-formTop">
              <button type="button" className="onboarding2030-formBack" onClick={() => setView('welcome')}>
                ← Indietro
              </button>
            </div>
            <div className="onboarding2030-formCard">
              <AfterPaymentOnboardingForm sessionId={sessionId} practiceType={practiceType} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
