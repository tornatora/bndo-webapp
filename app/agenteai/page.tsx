import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowRight, Bot, Sparkles, Globe, FileCheck, Shield, CheckCircle } from 'lucide-react';
import { CompilaBandoPage } from '@/features/compila-bando';

export const metadata = {
  title: 'Agente AI | BNDO',
  description:
    'Compila automaticamente la domanda per i bandi di finanziamento con l\'Agente AI di BNDO. Browserbase automation + DeepSeek + OpenAI.',
};

// Sezione hero / landing per utenti non loggati
function AgenteAILanding() {
  const STEPS = [
    { icon: Globe, title: 'Scegli il bando', desc: 'Seleziona tra Resto al Sud 2.0, Autoimpiego Centro Nord o altri bandi disponibili.' },
    { icon: FileCheck, title: 'Carica i documenti', desc: 'Invia la visura camerale e i documenti richiesti. L\'Agente AI li analizza in tempo reale.' },
    { icon: Bot, title: 'Compilazione automatica', desc: 'L\'Agente AI naviga il portale Invitalia e compila la domanda per te, campo per campo.' },
    { icon: Shield, title: 'Conferma e invia', desc: 'Verifica il risultato e conferma l\'invio. Nessun errore di compilazione, nessuna omissione.' },
  ];

  const FEATURES = [
    'Compilazione automatica su Invitalia e altri portali PA',
    'Browser automation con Browserbase per interazione reale coi siti',
    'Riconoscimento automatico dei campi del modulo',
    'Estrazione dati da visure camerali e documenti PDF',
    'AI Rescue Layer con DeepSeek + OpenAI per casi complessi',
    'Supporto 24/7 via chat AI dedicata',
  ];

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0b1136] to-[#16206a] px-4 py-20 text-white md:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm">
            <Sparkles size={16} />
            <span>Automazione AI per bandi di finanziamento</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
            Il tuo Agente AI
            <br />
            <span className="bg-gradient-to-r from-[#22c55f] to-[#4ade80] bg-clip-text text-transparent">
              compila la domanda per te
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70 md:text-xl">
            L&apos;Agente AI di BNDO naviga autonomamente il portale Invitalia, compila i campi del modulo
            e presenta la domanda. Nessun copia-incolla, nessun errore.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link
              href="/login?next=/agenteai"
              className="inline-flex items-center gap-2 rounded-xl bg-[#22c55f] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#16a34a] hover:shadow-lg hover:shadow-green-500/25"
            >
              Accedi e prova l&apos;Agente AI
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/register?next=/agenteai"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 transition-all hover:border-white/40 hover:text-white"
            >
              Registrati gratis
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-[#22c55f]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-[#4ade80]/10 blur-3xl" />
      </section>

      {/* Steps */}
      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-[#0b1136]">Come funziona</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[#64748b]">
            Quattro passi per ottenere la domanda compilata automaticamente.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#22c55f]/10 text-[#22c55f]">
                    <Icon size={26} />
                  </div>
                  <div className="mb-1 text-sm font-bold text-[#22c55f]">Passo {i + 1}</div>
                  <h3 className="mb-2 font-semibold text-[#0b1136]">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-[#64748b]">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-[#f8fafc] px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold text-[#0b1136]">Cosa fa l&apos;Agente AI</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[#64748b]">
            Tecnologia che funziona davvero, non un chatbot qualsiasi.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {FEATURES.map((feat) => (
              <div key={feat} className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4">
                <CheckCircle size={20} className="mt-0.5 shrink-0 text-[#22c55f]" />
                <span className="text-sm text-[#475569]">{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-[#0b1136]">Pronto a compilare la tua domanda?</h2>
          <p className="mt-3 text-[#64748b]">
            Lascia che l&apos;Agente AI faccia il lavoro pesante. Tu concentrati sul tuo progetto.
          </p>
          <Link
            href="/login?next=/agenteai"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#22c55f] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#16a34a] hover:shadow-lg hover:shadow-green-500/25"
          >
            <Bot size={18} />
            Accedi e inizia
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}

// Pagina ibrida: loggato → flusso agente, ospite → landing
export default async function AgenteAIPage() {
  // Bypass auth in development
  if (process.env.NODE_ENV === 'development') {
    return <CompilaBandoPage />;
  }

  // Preview Netlify bypass auth
  const host = headers().get('host')?.toLowerCase() || '';
  if (host.endsWith('.netlify.app')) {
    return <CompilaBandoPage />;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AgenteAILanding />;
  }

  // Loggato → flusso agente diretto
  return <CompilaBandoPage />;
}
