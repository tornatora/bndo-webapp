'use client';

import { OnboardingWizardClient } from '@/components/landing/OnboardingWizardClient';
import type { PracticeType } from '@/lib/bandi';

export function OnboardingWelcomeClient({
  sessionId,
  practiceType,
  quizSubmissionId,
  previewStep,
  skipPayment,
}: {
  sessionId?: string;
  practiceType?: PracticeType;
  quizSubmissionId?: string;
  previewStep?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  skipPayment?: boolean;
}) {
  return (
    <OnboardingWizardClient
      sessionId={sessionId}
      practiceType={practiceType}
      quizSubmissionId={quizSubmissionId}
      previewStep={previewStep}
      skipPayment={skipPayment}
    />
  );
}
