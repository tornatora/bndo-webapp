import Link from 'next/link';
import { AfterPaymentOnboardingForm } from '@/components/landing/AfterPaymentOnboardingForm';
import { MARKETING_URL } from '@/lib/site-urls';

export const dynamic = 'force-dynamic';

export default function AfterPaymentPage({
  searchParams
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
      <section className="mb-6">
        <div className="mb-3">
          <Link href={MARKETING_URL} className="text-sm font-semibold text-brand.steel">
            Torna al sito
          </Link>
        </div>
        <h1 className="text-3xl font-extrabold text-brand.navy">Completa la tua pratica</h1>
        <p className="mt-2 text-slate-600">
          Ultimo step: carica i documenti iniziali. Al termine ti inviamo le credenziali per entrare in dashboard e
          seguire lo status della pratica.
        </p>
      </section>

      {sessionId ? (
        <AfterPaymentOnboardingForm sessionId={sessionId} />
      ) : (
        <div className="panel p-6 text-sm text-red-700">
          Sessione checkout mancante. Torna al checkout Stripe oppure contatta il supporto.
        </div>
      )}
    </main>
  );
}
