import { redirect } from 'next/navigation';
import { requireUserProfile } from '@/lib/auth';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { ChatPanel } from '@/components/dashboard/ChatPanel';

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
  const { data: existingThread } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', profile.company_id)
    .maybeSingle();

  let threadId = existingThread?.id ?? null;

  if (!threadId) {
    const { data: createdThread } = await supabase
      .from('consultant_threads')
      .insert({ company_id: profile.company_id })
      .select('id')
      .single();

    threadId = createdThread?.id ?? null;
  }

  if (!threadId) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <p className="empty-text">Impossibile inizializzare la chat consulente.</p>
      </div>
    );
  }

  await supabase.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: profile.id,
      participant_role: profile.role
    },
    { onConflict: 'thread_id,profile_id', ignoreDuplicates: true }
  );

  const [{ data: messages }, { data: participant }] = await Promise.all([
    supabase
      .from('consultant_messages')
      .select('id, thread_id, sender_profile_id, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(120),
    supabase
      .from('consultant_thread_participants')
      .select('last_read_at')
      .eq('thread_id', threadId)
      .eq('profile_id', profile.id)
      .maybeSingle()
  ]);

  return (
    <>
      <section className="welcome-section">
        <h1 className="welcome-title">Messaggi</h1>
        <p className="welcome-subtitle">Chat diretta con il consulente. Risposta automatica immediata attiva.</p>
      </section>

      <ChatPanel
        threadId={threadId}
        viewerProfileId={profile.id}
        initialMessages={messages ?? []}
        initialLastReadAt={participant?.last_read_at ?? null}
      />
    </>
  );
}
