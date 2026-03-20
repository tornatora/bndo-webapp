'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ReactNode } from 'react';

type BandoOnboardingLayoutProps = {
  title: string;
  subtitle: string;
  rightPanelTitle: string;
  rightPanelDescription: string;
  rightPanelStepsTitle?: string;
  rightPanelSteps?: string[];
  dashboardPreview: ReactNode;
  hideLeftHeader?: boolean;
  children: ReactNode;
};

type BandoOnboardingShellProps = {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
};

type BandoOnboardingFormPanelProps = {
  title: string;
  subtitle: string;
  hideHeader?: boolean;
  children: ReactNode;
};

type BandoOnboardingPreviewPanelProps = {
  title: string;
  description: string;
  stepsTitle?: string;
  steps?: string[];
  dashboardPreview: ReactNode;
};

export function BandoOnboardingShell({ leftPanel, rightPanel }: BandoOnboardingShellProps) {
  return (
    <main className="bando-onboarding-page">
      <section className="bando-onboarding-shell">
        {leftPanel}
        {rightPanel}
      </section>
    </main>
  );
}

export function BandoOnboardingFormPanel({
  title,
  subtitle,
  hideHeader = false,
  children,
}: BandoOnboardingFormPanelProps) {
  return (
    <article className="bando-onboarding-left" id="onboarding-phase-1">
      <div className="bndo-split-head">
        <div className="bndo-split-brand" aria-label="BNDO">
          <Image src="/Logo-BNDO-header.png" alt="BNDO" width={118} height={32} priority />
        </div>
      </div>

      <div className={`bndo-split-leftBody ${hideHeader ? 'is-form-only' : ''}`}>
        {!hideHeader ? <h1 className="bando-onboarding-title">{title}</h1> : null}
        {!hideHeader && subtitle ? <p className="bando-onboarding-subtitle">{subtitle}</p> : null}
        <div className="bando-onboarding-formWrap">{children}</div>
      </div>
    </article>
  );
}

export function BandoOnboardingPreviewPanel({
  title,
  description,
  stepsTitle,
  steps,
  dashboardPreview,
}: BandoOnboardingPreviewPanelProps) {
  return (
    <aside className="bando-onboarding-right">
      <div className="bndo-auth-rightContent">
        <h2 className="bando-onboarding-rightTitle">{title}</h2>
        {description ? <p className="bando-onboarding-rightDescription">{description}</p> : null}
        <div className="bndo-auth-previewWrap">{dashboardPreview}</div>
        {steps?.length ? (
          <div className="bndo-rightSteps">
            {stepsTitle ? <p className="bndo-rightStepsTitle">{stepsTitle}</p> : null}
            <ol className="bndo-rightStepsList">
              {steps.map((step, index) => (
                <li key={step}>
                  <span className="bndo-rightStepIndex">{index + 1}</span>
                  <span className="bndo-rightStepText">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function BandoOnboardingLayout({
  title,
  subtitle,
  rightPanelTitle,
  rightPanelDescription,
  rightPanelStepsTitle,
  rightPanelSteps,
  dashboardPreview,
  hideLeftHeader = false,
  children,
}: BandoOnboardingLayoutProps) {
  return (
    <BandoOnboardingShell
      leftPanel={
        <BandoOnboardingFormPanel title={title} subtitle={subtitle} hideHeader={hideLeftHeader}>
          {children}
        </BandoOnboardingFormPanel>
      }
      rightPanel={
        <BandoOnboardingPreviewPanel
          title={rightPanelTitle}
          description={rightPanelDescription}
          stepsTitle={rightPanelStepsTitle}
          steps={rightPanelSteps}
          dashboardPreview={dashboardPreview}
        />
      }
    />
  );
}

export function BandoDashboardPreview() {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="bando-dashboard-imageFallback" role="img" aria-label="Anteprima dashboard BNDO non disponibile">
        Anteprima dashboard BNDO
      </div>
    );
  }

  return (
    <div className="bando-dashboard-imageWrap">
      <span className="bando-dashboard-usernameMask" aria-hidden="true" />
      <Image
        src="/dashboard-preview.png"
        alt="Anteprima dashboard BNDO"
        width={1600}
        height={980}
        className="bando-dashboard-image"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
