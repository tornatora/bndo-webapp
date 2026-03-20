import { OnboardingWelcomeClient } from '@/components/landing/OnboardingWelcomeClient';
import { practiceTypeFromGrantSlug, type PracticeType } from '@/lib/bandi';

export const dynamic = 'force-dynamic';

function parsePracticeType(value: string | undefined): PracticeType | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return undefined;
  const bySlug = practiceTypeFromGrantSlug(v);
  if (bySlug) return bySlug;
  if (v === 'resto_sud_2_0') return 'resto_sud_2_0';
  if (v === 'autoimpiego_centro_nord') return 'autoimpiego_centro_nord';
  return undefined;
}

export default function OnboardingPage({
  searchParams
}: {
  searchParams: {
    session_id?: string;
    bando?: string;
    practice?: string;
    pratica?: string;
    quiz?: string;
    preview_step?: string;
    skip_payment?: string;
  };
}) {
  const sessionId = searchParams.session_id;
  const practiceType = parsePracticeType(searchParams.bando ?? searchParams.practice ?? searchParams.pratica);
  const quizSubmissionId = searchParams.quiz?.trim() || undefined;
  const parsedPreviewStep = Number(searchParams.preview_step);
  const previewStep = Number.isInteger(parsedPreviewStep) && parsedPreviewStep >= 1 && parsedPreviewStep <= 7
    ? (parsedPreviewStep as 1 | 2 | 3 | 4 | 5 | 6 | 7)
    : undefined;
  const skipPayment = searchParams.skip_payment === '1';

  return (
    <OnboardingWelcomeClient
      sessionId={sessionId}
      practiceType={practiceType}
      quizSubmissionId={quizSubmissionId}
      previewStep={previewStep}
      skipPayment={skipPayment}
    />
  );
}
