'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileText,
  KeyRound,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';
import { LEGACY_ONBOARDING_STEPS } from '@/components/landing/onboarding-wizard/config';
import type {
  OnboardingMode,
  OnboardingWizardStep,
  OnboardingWizardStepConfig,
  StepStatus
} from '@/components/landing/onboarding-wizard/types';

type BandoOnboardingShellProps = {
  children: ReactNode;
  sidebar: ReactNode;
  currentStep?: OnboardingWizardStep;
  stepMode?: 'default' | 'payment';
};

type BandoOnboardingSidebarProps = {
  currentStep: OnboardingWizardStep;
  completedSteps: OnboardingWizardStep[];
  maxReachableStep: OnboardingWizardStep;
  steps?: OnboardingWizardStepConfig[];
  mode?: OnboardingMode;
  onSelectStep?: (step: OnboardingWizardStep) => void;
};

type BandoOnboardingStepHeaderProps = {
  title: string;
  subtitle: string;
  onBack?: () => void;
};

type BandoOnboardingStepTransitionProps = {
  step: OnboardingWizardStep;
  direction: 'next' | 'back';
  children: ReactNode;
};

type BandoOnboardingFooterActionsProps = {
  backDisabled?: boolean;
  nextDisabled?: boolean;
  backLabel?: string;
  nextLabel: ReactNode;
  onBack?: () => void;
  onNext: () => void;
};

function iconForStep(step: OnboardingWizardStep, mode: OnboardingMode) {
  if (mode === 'dashboard_client') {
    switch (step) {
      case 1:
        return UserCircle2;
      case 2:
        return FileCheck2;
      case 3:
        return FileText;
      case 4:
        return ShieldCheck;
      default:
        return UserCircle2;
    }
  }

  switch (step) {
    case 1:
      return CreditCard;
    case 2:
      return UserCircle2;
    case 3:
      return KeyRound;
    case 4:
      return BadgeCheck;
    case 5:
      return FileCheck2;
    case 6:
      return FileText;
    case 7:
      return ShieldCheck;
    default:
      return UserCircle2;
  }
}

export function resolveStepStatus(args: {
  step: OnboardingWizardStep;
  currentStep: OnboardingWizardStep;
  completedSteps: OnboardingWizardStep[];
}): StepStatus {
  if (args.completedSteps.includes(args.step)) return 'completed';
  if (args.step === args.currentStep) return 'active';
  return 'upcoming';
}

export function BandoOnboardingShell({
  children,
  sidebar,
  currentStep,
  stepMode = 'default',
}: BandoOnboardingShellProps) {
  return (
    <main className="wizard7-page">
      <section className="wizard7-card" data-current-step={currentStep} data-step-mode={stepMode}>
        {sidebar}
        <article className="wizard7-content">{children}</article>
      </section>
    </main>
  );
}

export function BandoOnboardingSidebar({
  currentStep,
  completedSteps,
  maxReachableStep,
  steps = LEGACY_ONBOARDING_STEPS,
  mode = 'legacy',
  onSelectStep,
}: BandoOnboardingSidebarProps) {
  return (
    <aside className="wizard7-sidebar">
      <div className="wizard7-sidebarHead">
        <Image src="/Logo-BNDO-header.png" alt="BNDO" width={126} height={34} className="wizard7-logo" priority />
      </div>

      <ol className="wizard7-stepper" aria-label="Progressione onboarding BNDO">
        {steps.map((entry) => {
          const status = resolveStepStatus({ step: entry.id, currentStep, completedSteps });
          const Icon = iconForStep(entry.id, mode);
          const reachable = entry.id <= maxReachableStep;
          return (
            <li
              key={entry.id}
              className={`wizard7-step is-${status}`}
              data-status={status}
              data-reachable={reachable ? 'yes' : 'no'}
            >
              <button
                type="button"
                className="wizard7-stepButton"
                onClick={() => onSelectStep?.(entry.id)}
                disabled={!reachable}
              >
                <span className="wizard7-stepRail" aria-hidden="true" />
                <span className="wizard7-stepIcon" aria-hidden="true">
                  {status === 'completed' ? <CheckCircle2 size={15} /> : <Icon size={14} />}
                </span>
                <span className="wizard7-stepBody">
                  <span className="wizard7-stepTitle">{entry.title}</span>
                  <span className="wizard7-stepDescription">{entry.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export function BandoOnboardingStepHeader({ title, subtitle, onBack }: BandoOnboardingStepHeaderProps) {
  return (
    <header className="wizard7-header">
      <div className="wizard7-topRow">
        <button type="button" className="wizard7-backBtn" onClick={onBack} disabled={!onBack}>
          ← Back
        </button>
      </div>
      <h1 className="wizard7-title">{title}</h1>
      {subtitle.trim().length ? <p className="wizard7-subtitle">{subtitle}</p> : null}
    </header>
  );
}

export function BandoOnboardingStepTransition({
  step,
  direction,
  children,
}: BandoOnboardingStepTransitionProps) {
  return (
    <div key={`${step}-${direction}`} className={`wizard7-stepTransition is-${direction}`}>
      {children}
    </div>
  );
}

export function BandoOnboardingFooterActions({
  backDisabled = false,
  nextDisabled = false,
  backLabel = 'Indietro',
  nextLabel,
  onBack,
  onNext,
}: BandoOnboardingFooterActionsProps) {
  return (
    <footer className="wizard7-footer">
      <button
        type="button"
        className="wizard7-btn wizard7-btn-muted"
        onClick={onBack}
        disabled={backDisabled || !onBack}
      >
        {backLabel}
      </button>
      <button
        type="button"
        className="wizard7-btn wizard7-btn-primary"
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel}
      </button>
    </footer>
  );
}
