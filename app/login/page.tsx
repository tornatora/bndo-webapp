import Link from 'next/link';
import { loginAction } from './actions';

export default function LoginPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <section className="panel w-full p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-brand.navy">Accedi alla dashboard gare</h1>
        <p className="mt-2 text-sm text-slate-600">
          Inserisci username o email e password ricevuti dopo l&apos;acquisto del servizio.
        </p>

        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="identifier">
              Username o email
            </label>
            <input id="identifier" name="identifier" className="input" required />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input id="password" name="password" type="password" className="input" required />
          </div>

          {searchParams.error ? <p className="text-sm font-semibold text-red-700">{searchParams.error}</p> : null}

          <button className="btn btn-primary w-full" type="submit">
            Entra
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          Non hai ancora un account? <Link href="/" className="font-semibold text-brand.steel">Attiva il servizio</Link>
        </p>
      </section>
    </main>
  );
}
