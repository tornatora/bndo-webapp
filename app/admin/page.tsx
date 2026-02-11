import { AdminInbox } from '@/components/admin/AdminInbox';
import { requireOpsProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type ThreadSummary = {
  threadId: string;
  companyId: string;
  companyName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

export default async function AdminPage() {
  const { profile } = await requireOpsProfile();
  const supabase = createClient();

  const { data: threads } = await supabase
    .from('consultant_threads')
    .select('id, company_id, created_at')
    .order('created_at', { ascending: false })
    .limit(250);

  if (!threads || threads.length === 0) {
    return (
      <section className="panel p-6">
        <h1 className="text-2xl font-extrabold text-brand.navy">Pannello Admin</h1>
        <p className="mt-2 text-sm text-slate-600">
          Nessuna conversazione attiva. I thread appariranno qui appena i clienti iniziano a usare la dashboard.
        </p>
      </section>
    );
  }

  const companyIds = [...new Set(threads.map((thread) => thread.company_id))];

  const [{ data: companies }, { data: participants }] = await Promise.all([
    supabase.from('companies').select('id, name').in('id', companyIds),
    supabase
      .from('consultant_thread_participants')
      .select('thread_id, last_read_at')
      .eq('profile_id', profile.id)
  ]);

  const companyById = new Map((companies ?? []).map((company) => [company.id, company.name]));
  const lastReadByThread = new Map((participants ?? []).map((participant) => [participant.thread_id, participant.last_read_at]));

  const threadSummaries = await Promise.all(
    threads.map(async (thread): Promise<ThreadSummary> => {
      const lastReadAt = lastReadByThread.get(thread.id) ?? new Date(0).toISOString();

      const [{ data: lastMessageRow }, { count: unreadCount }] = await Promise.all([
        supabase
          .from('consultant_messages')
          .select('id, body, created_at')
          .eq('thread_id', thread.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('consultant_messages')
          .select('id', { head: true, count: 'exact' })
          .eq('thread_id', thread.id)
          .gt('created_at', lastReadAt)
          .neq('sender_profile_id', profile.id)
      ]);

      return {
        threadId: thread.id,
        companyId: thread.company_id,
        companyName: companyById.get(thread.company_id) ?? 'Azienda senza nome',
        lastMessage: lastMessageRow?.body ?? '',
        lastMessageAt: lastMessageRow?.created_at ?? thread.created_at,
        unreadCount: unreadCount ?? 0
      };
    })
  );

  threadSummaries.sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  const initialThreadId = threadSummaries[0]?.threadId ?? null;

  const { data: initialMessages } = initialThreadId
    ? await supabase
        .from('consultant_messages')
        .select('id, thread_id, sender_profile_id, body, created_at')
        .eq('thread_id', initialThreadId)
        .order('created_at', { ascending: true })
        .limit(200)
    : { data: [] };

  return (
    <AdminInbox
      viewerProfileId={profile.id}
      initialThreads={threadSummaries}
      initialThreadId={initialThreadId}
      initialMessages={initialMessages ?? []}
    />
  );
}
