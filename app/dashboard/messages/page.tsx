import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { buildChatThreadContext } from '@/lib/dashboard/chat-thread-context';
import { createClient } from '@/lib/supabase/server';
import { MessagesPageClient } from '@/components/dashboard/MessagesPageClient';

export default async function DashboardMessagesPage() {
  const { profile } = await requireUserProfile();

  if (hasOpsAccess(profile.role)) {
    redirect('/admin');
  }

  if (!profile.company_id) {
    return (
      <section className="welcome-section">
        <h1 className="welcome-title">Profilo non valido</h1>
        <p className="welcome-subtitle">Profilo non associato ad alcuna azienda. Contatta il supporto.</p>
      </section>
    );
  }

  const supabase = createClient();
  const context = await buildChatThreadContext({
    supabase,
    profile: {
      id: profile.id,
      company_id: profile.company_id,
      role: profile.role as 'client_admin' | 'consultant' | 'ops_admin',
    },
    includeMessages: true,
    messagesLimit: 80,
  });
  const contextError = context.status >= 400 ? context.payload.error ?? 'Impossibile inizializzare la chat.' : null;

  return (
    <>
      <section className="welcome-section chat-hero">
        <h1 className="welcome-title">Messaggi</h1>
        <p className="welcome-subtitle">Chat diretta con il consulente. Risposta automatica immediata attiva.</p>
      </section>

      <MessagesPageClient
        viewerProfileId={profile.id}
        initialThreadId={context.payload.threadId}
        initialLastReadAt={context.payload.lastReadAt}
        initialMessages={context.payload.messages}
        initialError={contextError}
      />
    </>
  );
}
