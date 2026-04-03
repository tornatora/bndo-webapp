import { notFound } from 'next/navigation';
import { practiceTypeFromGrantSlug } from '@/lib/bandi';
import { PracticePaymentSuccessClient } from '@/components/landing/PracticePaymentSuccessClient';

export const dynamic = 'force-dynamic';

export default function PracticePaymentSuccessPage({
  params,
  searchParams,
}: {
  params: { grantSlug: string };
  searchParams: { session_id?: string; quiz?: string };
}) {
  const practiceType = practiceTypeFromGrantSlug(params.grantSlug);
  if (!practiceType) notFound();

  const sessionId = searchParams.session_id?.trim() ?? '';
  if (!sessionId) {
    return (
      <main className="bndo-payment-page">
        <section className="bndo-payment-shell">
          <article className="bndo-payment-left">
            <div className="bndo-payment-error">Sessione Stripe non trovata. Riprova dal link di pagamento.</div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <PracticePaymentSuccessClient
      sessionId={sessionId}
      grantSlug={params.grantSlug}
      quizSubmissionId={searchParams.quiz?.trim() || undefined}
    />
  );
}
