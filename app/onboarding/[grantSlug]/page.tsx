import { redirect } from 'next/navigation';
import { OnboardingWelcomeClient } from '@/components/landing/OnboardingWelcomeClient';
import { canonicalGrantSlugFromAny, normalizeGrantSlugToken, practiceTypeFromGrantSlug, type PracticeType } from '@/lib/bandi';

export const dynamic = 'force-dynamic';
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type OnboardingMode = 'legacy' | 'dashboard_client';

type SearchValue = string | string[] | undefined;
type SearchParams = Record<string, SearchValue>;

function readFirstString(value: SearchValue) {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  }
  return undefined;
}

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

function parseSource(
  value: string | undefined
): 'scanner' | 'chat' | 'direct' | 'admin' | undefined {
  if (
    value === 'scanner' ||
    value === 'chat' ||
    value === 'direct' ||
    value === 'admin'
  ) {
    return value;
  }
  return undefined;
}

function appendSearchParams(params: URLSearchParams, searchParams: SearchParams) {
  for (const [key, raw] of Object.entries(searchParams ?? {})) {
    if (typeof raw === 'string') {
      if (raw.trim()) params.append(key, raw);
      continue;
    }
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (typeof item === 'string' && item.trim()) params.append(key, item);
    }
  }
}

export default function OnboardingGrantSlugPage({
  params,
  searchParams
}: {
  params: { grantSlug: string };
  searchParams: SearchParams;
}) {
  const rawGrantSlug = decodeURIComponent(params.grantSlug ?? '').trim();
  const canonicalGrantSlug = canonicalGrantSlugFromAny(rawGrantSlug);
  const normalizedRawGrantSlug = normalizeGrantSlugToken(rawGrantSlug);

  if (
    canonicalGrantSlug &&
    normalizedRawGrantSlug &&
    normalizedRawGrantSlug !== canonicalGrantSlug
  ) {
    const nextSearch = new URLSearchParams();
    appendSearchParams(nextSearch, searchParams);
    const query = nextSearch.toString();
    redirect(query ? `/onboarding/${canonicalGrantSlug}?${query}` : `/onboarding/${canonicalGrantSlug}`);
  }

  const sessionId = readFirstString(searchParams.session_id);
  const practiceType =
    parsePracticeType(readFirstString(searchParams.practice)) ??
    parsePracticeType(readFirstString(searchParams.pratica)) ??
    parsePracticeType(canonicalGrantSlug ?? rawGrantSlug);
  const quizSubmissionId = parseUuid(readFirstString(searchParams.quiz));
  const applicationId = readFirstString(searchParams.applicationId);
  const grantId = readFirstString(searchParams.grantId);
  const source = parseSource(readFirstString(searchParams.source));
  const previewRaw = Number(readFirstString(searchParams.preview_step));
  const previewStep =
    Number.isInteger(previewRaw) && previewRaw >= 1 && previewRaw <= 7
      ? (previewRaw as 1 | 2 | 3 | 4 | 5 | 6 | 7)
      : undefined;
  const resumeRaw = Number(readFirstString(searchParams.resume_step));
  const resumeStep =
    Number.isInteger(resumeRaw) && resumeRaw >= 1 && resumeRaw <= 7
      ? (resumeRaw as 1 | 2 | 3 | 4 | 5 | 6 | 7)
      : undefined;

  const explicitMode = parseOnboardingMode(readFirstString(searchParams.onboarding_mode));
  const skipPaymentParam = readFirstString(searchParams.skip_payment) === '1';
  const skipPayment = sessionId ? skipPaymentParam : true;
  const inferDashboardMode =
    !sessionId && Boolean(applicationId || grantId || canonicalGrantSlug || rawGrantSlug || skipPayment);
  const onboardingMode: OnboardingMode =
    explicitMode ??
    (inferDashboardMode ? 'dashboard_client' : 'legacy');
  const effectiveGrantSlug = (canonicalGrantSlug ?? rawGrantSlug) || undefined;

  return (
    <OnboardingWelcomeClient
      sessionId={sessionId}
      practiceType={practiceType}
      quizSubmissionId={quizSubmissionId}
      applicationId={applicationId}
      grantId={grantId}
      grantSlug={effectiveGrantSlug}
      source={source}
      previewStep={previewStep}
      resumeStep={resumeStep}
      skipPayment={skipPayment}
      onboardingMode={onboardingMode}
    />
  );
}
