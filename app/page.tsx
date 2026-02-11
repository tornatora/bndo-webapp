'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const menuLinks = [
  { href: '#bandi', label: 'Bandi' },
  { href: '#servizi', label: 'Servizi' },
  { href: '#processo', label: 'Processo' }
];

const steps = [
  {
    title: 'Verifica requisiti',
    description: 'Compili il quiz e ricevi una risposta immediata su idoneita e bando consigliato.'
  },
  {
    title: 'Raccolta documenti',
    description: 'Un consulente ti guida nel caricamento e nella verifica di tutta la documentazione.'
  },
  {
    title: 'Invio pratica',
    description: 'Gestiamo invio e monitoraggio della domanda con aggiornamenti real-time in dashboard.'
  },
  {
    title: 'Assistenza post invio',
    description: 'Supporto su richieste integrative e gestione step successivi fino all esito.'
  }
];

export default function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  return (
    <main className="min-h-screen bg-[#f4f8fc]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-8">
          <a href="#" className="text-lg font-extrabold text-brand.navy">
            BNDO
          </a>

          <nav className="hidden items-center gap-6 lg:flex">
            {menuLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-semibold text-slate-600 hover:text-brand.navy">
                {link.label}
              </a>
            ))}
            <Link href="/login" className="btn btn-muted !py-2 text-sm">
              Area clienti
            </Link>
            <Link href="/quiz" className="btn btn-primary !py-2 text-sm">
              Verifica requisiti
            </Link>
          </nav>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand.navy lg:hidden"
            onClick={() => setIsMenuOpen((previous) => !previous)}
            aria-label="Apri menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setIsMenuOpen(false)}>
          <div
            className="absolute right-0 top-16 h-[calc(100vh-4rem)] w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <nav className="space-y-3">
              {menuLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-brand.navy"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <Link href="/quiz" className="btn btn-primary mt-3 w-full" onClick={() => setIsMenuOpen(false)}>
                Verifica requisiti
              </Link>
              <Link href="/login" className="btn btn-muted w-full" onClick={() => setIsMenuOpen(false)}>
                Area clienti
              </Link>
            </nav>
          </div>
        </div>
      ) : null}

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-24 sm:px-8">
        <article className="panel relative overflow-hidden p-6 sm:p-10">
          <div className="pointer-events-none absolute -left-16 top-0 h-52 w-52 rounded-full bg-brand.mint/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 bottom-0 h-48 w-48 rounded-full bg-brand.steel/20 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="badge badge-new">Piattaforma con consulenti reali</p>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight text-brand.navy sm:text-5xl">
                Verifica i requisiti in 2 minuti e avvia la pratica senza errori.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
                Un unico flusso: quiz, raccolta documenti, chat con consulente, notifiche sincronizzate e monitoraggio
                pratica da app.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/quiz" className="btn btn-primary">
                  Verifica requisiti gratis
                </Link>
                <Link href="/login" className="btn btn-muted">
                  Accedi a app.bndo.it
                </Link>
              </div>
            </div>

            <div className="panel h-fit border-brand.steel/20 bg-white/95 p-5">
              <h2 className="text-xl font-extrabold text-brand.navy">Costi trasparenti</h2>
              <div className="mt-4 rounded-2xl bg-brand.navy p-4 text-white">
                <p className="text-sm text-slate-200">Presentazione domanda</p>
                <p className="text-3xl font-extrabold">EUR 500</p>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p className="rounded-xl bg-slate-50 p-3">Success fee solo in caso di esito positivo.</p>
                <p className="rounded-xl bg-slate-50 p-3">Dashboard operativa con supporto consulente dedicato.</p>
                <p className="rounded-xl bg-slate-50 p-3">Tempo medio di prima risposta: entro 2 ore lavorative.</p>
              </div>
            </div>
          </div>
        </article>

        <section id="bandi" className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="panel p-5">
            <p className="text-sm font-semibold text-brand.steel">Resto al Sud 2.0</p>
            <h3 className="mt-1 text-xl font-extrabold text-brand.navy">Contributi fino a EUR 200.000</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Eta 18-34 anni e stato occupazionale compatibile.</li>
              <li>Regioni: Abruzzo, Basilicata, Calabria, Campania, Molise, Puglia, Sardegna, Sicilia.</li>
              <li>Voucher e contributi a fondo perduto su spese ammissibili.</li>
            </ul>
            <Link href="/quiz" className="btn btn-primary mt-4">
              Verifica requisiti
            </Link>
          </article>

          <article className="panel p-5">
            <p className="text-sm font-semibold text-brand.steel">Autoimpiego Centro-Nord</p>
            <h3 className="mt-1 text-xl font-extrabold text-brand.navy">Agevolazioni fino a EUR 200.000</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Copertura fino al 65% secondo fasce investimento.</li>
              <li>Requisiti e limiti verificati automaticamente nel quiz.</li>
              <li>Gestione documenti e pratica in area riservata con assistenza.</li>
            </ul>
            <Link href="/quiz" className="btn btn-primary mt-4">
              Verifica requisiti
            </Link>
          </article>
        </section>

        <section id="servizi" className="panel mt-8 p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-brand.navy">Servizio completo, gestibile senza codice</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Quiz guidato e acquisizione lead automatica</p>
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Area cliente con upload documenti e chat realtime</p>
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Pannello admin con notifiche sincronizzate</p>
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Architettura scalabile su Supabase + Next.js</p>
          </div>
        </section>

        <section id="processo" className="panel mt-8 p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-brand.navy">Come funziona</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {steps.map((step, index) => (
              <article key={step.title} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold tracking-wide text-brand.steel">STEP {String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-1 font-bold text-brand.navy">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel mt-8 flex flex-wrap items-center justify-between gap-3 bg-brand.navy p-6 text-white sm:p-8">
          <div>
            <h2 className="text-2xl font-extrabold">Inizia dalla verifica requisiti</h2>
            <p className="mt-1 text-sm text-slate-200">Collega bndo.it, app.bndo.it e admin.bndo.it in un solo sistema.</p>
          </div>
          <Link href="/quiz" className="btn bg-white font-bold text-brand.navy">
            Vai al quiz
          </Link>
        </section>

        <footer className="py-8 text-center text-sm text-slate-500">(c) 2026 BNDO</footer>
      </section>
    </main>
  );
}
