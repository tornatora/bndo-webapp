import { OnboardingWelcomeClient } from '@/components/landing/OnboardingWelcomeClient';
import { practiceTypeFromGrantSlug, type PracticeType } from '@/lib/bandi';

export const dynamic = 'force-dynamic';
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type OnboardingMode = 'legacy' | 'dashboard_client';

function parsePracticeType(value: string | undefined): PracticeType | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return undefined;
  const bySlug = practiceTypeFromGrantSlug(v);
  if (bySlug) return bySlug;
  if (v === 'resto_sud_2_0') return 'resto_sud_2_0';
  if (v === 'autoimpiego_centro_nord') return 'autoimpiego_centro_nord';
  return undefined;
}

function parseUuid(value: string | undefined): string | undefined {
  const v = (value ?? '').trim();
  if (!v) return undefined;
  return UUID_LIKE.test(v) ? v : undefined;
}

function parseOnboardingMode(value: string | undefined): OnboardingMode | undefined {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'dashboard_client') return 'dashboard_client';
  if (v === 'legacy') return 'legacy';
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
    applicationId?: string;
    grantId?: string;
    grantSlug?: string;
    source?: string;
    preview_step?: string;
    resume_step?: string;
    skip_payment?: string;
    onboarding_mode?: string;
  };
}) {
  const sessionId = searchParams.session_id;
  const practiceType = parsePracticeType(searchParams.bando ?? searchParams.practice ?? searchParams.pratica);
  const quizSubmissionId = parseUuid(searchParams.quiz);
  const applicationId = searchParams.applicationId?.trim() || undefined;
  const parsedPreviewStep = Number(searchParams.preview_step);
  const previewStep = Number.isInteger(parsedPreviewStep) && parsedPreviewStep >= 1 && parsedPreviewStep <= 7
    ? (parsedPreviewStep as 1 | 2 | 3 | 4 | 5 | 6 | 7)
    : undefined;
  const parsedResumeStep = Number(searchParams.resume_step);
  const resumeStep = Number.isInteger(parsedResumeStep) && parsedResumeStep >= 1 && parsedResumeStep <= 7
    ? (parsedResumeStep as 1 | 2 | 3 | 4 | 5 | 6 | 7)
    : undefined;
  const grantId = searchParams.grantId?.trim() || undefined;
  const grantSlug = searchParams.grantSlug?.trim() || undefined;
  const source =
    searchParams.source === 'scanner' ||
    searchParams.source === 'chat' ||
    searchParams.source === 'direct' ||
    searchParams.source === 'admin'
      ? searchParams.source
      : undefined;
  const skipPayment = searchParams.skip_payment === '1';
  const explicitMode = parseOnboardingMode(searchParams.onboarding_mode);
  const inferDashboardMode = !sessionId && Boolean(applicationId);
  const onboardingMode: OnboardingMode =
    explicitMode ??
    (inferDashboardMode ? 'dashboard_client' : 'legacy');

  return (
    <OnboardingWelcomeClient
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
