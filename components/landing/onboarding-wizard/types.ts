'use client';

export type OnboardingWizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type OnboardingMode = 'legacy' | 'dashboard_client';

export type StepStatus = 'completed' | 'active' | 'upcoming';

export type OnboardingWizardStepConfig = {
  id: OnboardingWizardStep;
  title: string;
  description: string;
};

export type OnboardingDocumentRequirement = {
  requirementKey: string;
  label: string;
  description: string | null;
  isRequired: boolean;
  status: 'missing' | 'uploaded' | 'waived';
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
  applicationId: string | null;
  documentRequirements: OnboardingDocumentRequirement[];
  amountCents: number;
  currency: string;
  paymentCtaLabel: string;
  customerEmail?: string | null;
  didRequired?: boolean;
  nextUrl?: string | null;
};
