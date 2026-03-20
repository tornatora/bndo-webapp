'use client';

export type OnboardingWizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type StepStatus = 'completed' | 'active' | 'upcoming';

export type OnboardingWizardStepConfig = {
  id: OnboardingWizardStep;
  title: string;
  description: string;
};

export type OnboardingWizardStatePayload = {
  ok: boolean;
  paymentStatus: 'unpaid' | 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
  onboardingStatus: 'not_started' | 'in_progress' | 'completed';
  currentStep: OnboardingWizardStep;
  completedSteps: OnboardingWizardStep[];
  sessionId: string | null;
  grantSlug: string;
  grantTitle: string;
  amountCents: number;
  currency: string;
  paymentCtaLabel: string;
  customerEmail?: string | null;
  didRequired?: boolean;
  nextUrl?: string | null;
};

