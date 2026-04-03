'use client';

import { OnboardingWizardClient } from '@/components/landing/OnboardingWizardClient';
import type { PracticeType } from '@/lib/bandi';
import type { OnboardingMode, OnboardingWizardStep } from '@/components/landing/onboarding-wizard/types';

export function OnboardingWelcomeClient({
  sessionId,
  practiceType,
  quizSubmissionId,
  applicationId,
  grantId,
  grantSlug,
  source,
  previewStep,
  resumeStep,
  skipPayment,
  onboardingMode,
}: {
  sessionId?: string;
  practiceType?: PracticeType;
  quizSubmissionId?: string;
  applicationId?: string;
  grantId?: string;
  grantSlug?: string;
  source?: 'scanner' | 'chat' | 'direct' | 'admin';
  previewStep?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  resumeStep?: OnboardingWizardStep;
  skipPayment?: boolean;
  onboardingMode?: OnboardingMode;
}) {
  return (
    <OnboardingWizardClient
      sessionId={sessionId}
      practiceType={practiceType}
      quizSubmissionId={quizSubmissionId}
      applicationId={applicationId}
      grantId={grantId}
      grantSlug={grantSlug}
      source={source}
      previewStep={previewStep}
      resumeStep={resumeStep}
      skipPayment={skipPayment}
      onboardingMode={onboardingMode}
    />
  );
}
