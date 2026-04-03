import { notFound } from 'next/navigation';
import { getPracticeConfig, practiceTypeFromGrantSlug } from '@/lib/bandi';
import { PracticePaymentClient } from '@/components/landing/PracticePaymentClient';

export const dynamic = 'force-dynamic';

export default function PracticePaymentPage({
  params,
  searchParams,
}: {
  params: { grantSlug: string };
  searchParams: { quiz?: string; cancelled?: string };
}) {
  const practiceType = practiceTypeFromGrantSlug(params.grantSlug);
  if (!practiceType) notFound();

  const config = getPracticeConfig(practiceType);
  const quizSubmissionId = searchParams.quiz?.trim() || undefined;

  return (
    <PracticePaymentClient
      grantSlug={config.slug}
      grantTitle={config.title}
      quizSubmissionId={quizSubmissionId}
      cancelled={searchParams.cancelled === '1'}
    />
  );
}
