import Link from 'next/link';
import { OnboardingWelcomeClient } from '@/components/landing/OnboardingWelcomeClient';
import { MARKETING_URL } from '@/lib/site-urls';
import type { PracticeType } from '@/lib/bandi';

export const dynamic = 'force-dynamic';

function parsePracticeType(value: string | undefined): PracticeType | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'resto_sud_2_0') return 'resto_sud_2_0';
  if (v === 'autoimpiego_centro_nord') return 'autoimpiego_centro_nord';
  return undefined;
}

export default function OnboardingPage({
  searchParams
}: {
  searchParams: { session_id?: string; bando?: string; practice?: string; pratica?: string };
}) {
  const sessionId = searchParams.session_id;
  const practiceType = parsePracticeType(searchParams.bando ?? searchParams.practice ?? searchParams.pratica);

  return (
    <>
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 50 }}>
        <Link href={MARKETING_URL} className="onboarding2030-back">
          Torna al sito
        </Link>
      </div>
      <OnboardingWelcomeClient sessionId={sessionId} practiceType={practiceType} />
    </>
  );
}

