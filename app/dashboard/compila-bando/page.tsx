import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { CompilaBandoPage } from '@/features/compila-bando';

export const metadata = {
  title: 'Compila Bando | BNDO',
  description: 'Compila automaticamente la tua domanda per i bandi con l\'Agente AI di BNDO.',
};

export default async function CompilaBandoRoute() {
  // Bypass auth in development for local testing
  if (process.env.NODE_ENV === 'development') {
    return <CompilaBandoPage />;
  }

  const host = headers().get('host')?.toLowerCase() || '';
  if (host.endsWith('.netlify.app')) {
    return <CompilaBandoPage />;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/compila-bando');
  }

  return <CompilaBandoPage />;
}
