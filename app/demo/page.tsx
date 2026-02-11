import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, FileUp, MessageCircle, SearchCheck, ShieldCheck } from 'lucide-react';

const demoTenders = [
  {
    authority: 'Comune di Milano',
    title: 'Manutenzione impianti elettrici edifici comunali',
    relevance: '92%',
    deadline: '27/02/2026',
    value: 'EUR 1.250.000',
    status: 'new'
  },
  {
    authority: 'ASL Roma 1',
    title: 'Fornitura dispositivi medicali monouso',
    relevance: '88%',
    deadline: '19/02/2026',
    value: 'EUR 830.000',
    status: 'participating'
  },
  {
    authority: 'Regione Emilia-Romagna',
    title: 'Servizi digitali SUAP + integrazione SPID/CIE',
    relevance: '84%',
    deadline: '06/03/2026',
    value: 'EUR 2.450.000',
    status: 'in_review'
  }
];

function statusBadge(status: string) {
  if (status === 'participating') return 'badge badge-progress';
  if (status === 'submitted') return 'badge badge-done';
  return 'badge badge-new';
}

export default function DemoPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <section className="panel mb-5 p-5 sm:p-6">
        <p className="badge badge-progress mb-3">Demo visiva senza configurazione</p>
        <h1 className="text-2xl font-extrabold text-brand.navy sm:text-3xl">
          Questa e una preview completa di come vedranno la piattaforma i tuoi clienti.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Non richiede chiavi Supabase/Stripe. Quando vuoi il flusso reale (acquisto, email credenziali, login vero),
          basta inserire le chiavi in <code>.env.local</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="btn btn-muted">
            Vai alla landing reale
          </Link>
          <Link href="/login" className="btn btn-primary">
            Schermata login
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="desktop-grid grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="panel h-fit p-4 sm:p-5">
          <div className="rounded-xl bg-brand.navy p-3 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-200">Cliente demo</p>
            <p className="mt-1 text-base font-bold">Mario Rossi</p>
            <p className="text-sm text-slate-200">@azienda-demo-123456</p>
          </div>

          <nav className="mt-5 space-y-2">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <SearchCheck className="h-4 w-4 text-brand.steel" />
              Gare consigliate
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-500">
              <MessageCircle className="h-4 w-4 text-brand.steel" />
              Chat consulente
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-500">
              <FileUp className="h-4 w-4 text-brand.steel" />
              Upload documenti
            </div>
          </nav>
        </aside>

        <section className="space-y-4">
          <article className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand.steel">Dashboard gare</p>
                <h2 className="text-2xl font-extrabold text-brand.navy">3 opportunita rilevanti in watchlist</h2>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold">Matching automatico aggiornato quotidianamente</p>
                <p>Consulente dedicato sempre disponibile</p>
              </div>
            </div>
          </article>

          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3">
              {demoTenders.map((tender) => (
                <article key={tender.title} className="panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-brand.steel">{tender.authority}</p>
                      <h3 className="mt-0.5 text-lg font-bold text-brand.navy">{tender.title}</h3>
                    </div>
                    <span className={statusBadge(tender.status)}>{tender.status.replace('_', ' ')}</span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase">Relevance</p>
                      <p className="font-semibold">{tender.relevance}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase">Scadenza</p>
                      <p className="font-semibold">{tender.deadline}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs uppercase">Valore</p>
                      <p className="font-semibold">{tender.value}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn btn-primary text-sm" type="button">
                      Apri sintesi
                    </button>
                    <button className="btn btn-muted text-sm" type="button">
                      Partecipa
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="space-y-4">
              <section className="panel p-4">
                <h3 className="text-lg font-bold text-brand.navy">Consulente dedicato</h3>
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                  <div className="max-w-[90%] rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                    Buongiorno, abbiamo gia preparato la checklist documentale per la gara ASL.
                  </div>
                  <div className="ml-auto max-w-[90%] rounded-2xl bg-brand.navy px-3 py-2 text-sm text-white">
                    Perfetto, carico oggi certificazioni e referenze.
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                  <span className="text-sm text-slate-500">Messaggio demo...</span>
                </div>
              </section>

              <section className="panel p-4">
                <h3 className="text-lg font-bold text-brand.navy">Partecipazione guidata</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand.mint" />
                    Upload documenti societari e tecnici
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-brand.mint" />
                    Supporto iscrizione albo fornitori ente
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock3 className="mt-0.5 h-4 w-4 text-brand.mint" />
                    Presa in carico consulente entro 2 ore lavorative
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
