import { OnboardingCredentialsCard } from '@/components/landing/OnboardingCredentialsCard';

export default function CheckoutSuccessPage({
  searchParams
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <section className="mb-6">
        <h1 className="text-3xl font-extrabold text-brand.navy">Pagamento completato</h1>
        <p className="mt-2 text-slate-600">
          Stiamo configurando il tuo account. Appena pronto ti invieremo le credenziali via email.
        </p>
      </section>

      {sessionId ? (
        <OnboardingCredentialsCard sessionId={sessionId} />
      ) : (
        <div className="panel p-6 text-sm text-red-700">Sessione checkout mancante. Contatta il supporto.</div>
      )}
    </main>
  );
}
