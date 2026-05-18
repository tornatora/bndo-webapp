import { getOptionalUserProfile, createServerSupabaseClient } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import { ChatThreadList } from './ChatThreadList';

export const dynamic = 'force-dynamic';

export type ThreadEntry = {
  id: string;
  companyName: string;
  companyId: string | null;
  threadType: 'chat' | 'practice';
  practiceType: string | null;
  applicationId: string | null;
  messageCount: number;
  lastActivity: string;
  lastMessage: string | null;
};

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderName: string;
  senderRole: string | null;
};

export default async function AdminChatLogPage() {
  try {
    if (process.env.MOCK_BACKEND !== 'true') {
      const bundle = await getOptionalUserProfile();
      if (!bundle || !hasAdminAccess(bundle.profile.role)) {
        return <ChatLogFallback />;
      }
    }
  } catch (err) {
    console.error('[admin/chat-log] Auth error:', err);
    return <ChatLogFallback />;
  }

  let threads: ThreadEntry[] = [];
  let messagesByThread: Record<string, ThreadMessage[]> = {};

  try {
    const supabase = createServerSupabaseClient();

    // Fetch general threads with company info
    const { data: generalThreads } = await supabase
      .from('consultant_threads')
      .select(`id, company_id, created_at, companies!inner(name)`)
      .order('created_at', { ascending: false })
      .limit(15);

    // Fetch practice threads with application/company info
    const { data: practiceThreads } = await (supabase as any)
      .from('consultant_practice_threads')
      .select(`id, application_id, company_id, created_at,
        application:tender_applications!inner(company_id, bando_type, companies!inner(name))`)
      .order('created_at', { ascending: false })
      .limit(15);

    const generalThreadIds = (generalThreads ?? []).map((t: any) => t.id);
    const practiceThreadIds = (practiceThreads ?? []).map((t: any) => t.id);

    // Fetch messages for all threads
    const [gMsgs, pMsgs] = await Promise.all([
      generalThreadIds.length > 0
        ? supabase
            .from('consultant_messages')
            .select(`id, body, created_at, thread_id, sender_profile_id,
              sender:profiles!sender_profile_id(full_name, email, role)`)
            .in('thread_id', generalThreadIds)
            .order('created_at', { ascending: true })
            .limit(500)
        : { data: [] },
      practiceThreadIds.length > 0
        ? (supabase as any)
            .from('consultant_practice_messages')
            .select(`id, body, created_at, thread_id, sender_profile_id,
              sender:profiles!sender_profile_id(full_name, email, role)`)
            .in('thread_id', practiceThreadIds)
            .order('created_at', { ascending: true })
            .limit(500)
        : { data: [] },
    ]);

    // Build threads from general
    for (const t of generalThreads ?? []) {
      const msgs = ((gMsgs?.data ?? []) as any[]).filter((m: any) => m.thread_id === t.id);
      const lastMsg = msgs[msgs.length - 1];
      threads.push({
        id: t.id,
        companyName: (t as any).companies?.name || '—',
        companyId: (t as any).company_id || null,
        threadType: 'chat',
        practiceType: null,
        applicationId: null,
        messageCount: msgs.length,
        lastActivity: lastMsg?.created_at || (t as any).created_at,
        lastMessage: lastMsg?.body?.slice(0, 160) || null,
      });
      messagesByThread[t.id] = msgs.map((m: any) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        senderName: m.sender?.full_name || m.sender?.email || 'Sconosciuto',
        senderRole: m.sender?.role || null,
      }));
    }

    // Build threads from practice
    for (const t of practiceThreads ?? []) {
      const msgs = ((pMsgs?.data ?? []) as any[]).filter((m: any) => m.thread_id === t.id);
      const lastMsg = msgs[msgs.length - 1];
      threads.push({
        id: t.id,
        companyName: (t as any).application?.companies?.name || '—',
        companyId: (t as any).company_id || null,
        threadType: 'practice',
        practiceType: (t as any).application?.bando_type || null,
        applicationId: (t as any).application_id || null,
        messageCount: msgs.length,
        lastActivity: lastMsg?.created_at || (t as any).created_at,
        lastMessage: lastMsg?.body?.slice(0, 160) || null,
      });
      messagesByThread[t.id] = msgs.map((m: any) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        senderName: m.sender?.full_name || m.sender?.email || 'Sconosciuto',
        senderRole: m.sender?.role || null,
      }));
    }

    // Sort by last activity
    threads.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  } catch (err) {
    console.error('[admin/chat-log] Query error:', err);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
          Chat Log
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: 0 }}>
          {threads.length} conversazioni trovate. Clicca per leggere.
        </p>
      </div>

      {threads.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(11,17,54,0.4)', fontSize: 13 }}>
          Nessuna conversazione presente.
        </div>
      ) : (
        <ChatThreadList threads={threads} messagesByThread={messagesByThread} />
      )}
    </div>
  );
}

function ChatLogFallback() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0B1136', margin: '0 0 4px' }}>Chat Log</h1>
      <p style={{ fontSize: 13, color: 'rgba(11,17,54,0.5)' }}>Accesso non disponibile. Ricarica o riaccedi.</p>
    </div>
  );
}
