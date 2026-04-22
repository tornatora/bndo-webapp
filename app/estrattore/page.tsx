import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUserProfile } from '@/lib/auth';
import { EstrattoreClient } from './components/EstrattoreClient';

export const metadata = {
  title: 'Estrattore Visure | BNDO',
  description: 'Estrai automaticamente i dati dalle visure camerali italiane.',
};

export default async function EstrattorePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/estrattore');
  }

  const { profile } = await requireUserProfile();

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0b1136] md:text-3xl">Estrattore Visure</h1>
        <p className="mt-2 text-sm text-[#64748b]">
          Carica una visura camerale in PDF e estrai automaticamente i dati aziendali. Puoi modificare i campi estratti e aggiungere informazioni personalizzate prima di salvare.
        </p>
      </div>
      <EstrattoreClient userId={user.id} />
    </section>
  );
}
