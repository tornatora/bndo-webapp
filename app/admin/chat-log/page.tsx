import { getOptionalUserProfile, createServerSupabaseClient } from '@/shared/api';
import { hasAdminAccess } from '@/lib/roles';
import Link from 'next/link';

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

  let generalMessages: any[] = [];
  let practiceMessages: any[] = [];
  try {
    const supabase = createServerSupabaseClient();

    const [gRes, pRes] = await Promise.all([
      supabase
        .from('consultant_messages')
        .select(`
          id, body, created_at, sender_profile_id,
          sender:profiles!sender_profile_id(full_name, email, role),
          thread:consultant_threads!thread_id(company_id, companies(name))
        `)
        .order('created_at', { ascending: false })
        .limit(50),
      (supabase as any)
        .from('consultant_practice_messages')
        .select(`
          id, body, created_at, sender_profile_id,
          sender:profiles!sender_profile_id(full_name, email, role),
          thread:consultant_practice_threads!thread_id(
            application_id,
            application:tender_applications!application_id(
              company_id, bando_type,
              company:companies(name)
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    generalMessages = gRes.data ?? [];
    practiceMessages = pRes.data ?? [];
  } catch (err) {
    console.error('[admin/chat-log] Query error:', err);
  }

  // Combine and sort
  const combined = [
    ...generalMessages.map((m: any) => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      sender: m.sender,
      companyName: m.thread?.companies?.name || '—',
      type: 'chat_ai' as const,
      href: m.thread?.company_id ? `/admin/clients/${m.thread.company_id}` : null,
    })),
    ...practiceMessages.map((m: any) => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      sender: m.sender,
      companyName: m.thread?.application?.company?.name || '—',
      type: 'practice' as const,
      href: m.thread?.application?.company_id ? `/admin/clients/${m.thread.application.company_id}` : null,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalMessages = combined.length;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', color: '#0B1136', margin: '0 0 4px' }}>
          Chat Log
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(11,17,54,0.5)', margin: 0 }}>
          {totalMessages} messaggi recenti (AI + pratiche).
        </p>
      </div>

      {totalMessages === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(11,17,54,0.4)', fontSize: 13 }}>
          Nessun messaggio presente.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {combined.map((msg) => (
            <ChatMessageRow key={msg.id + msg.type} message={msg} />
          ))}
        </div>
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

type ChatEntry = {
  id: string;
  body: string;
  created_at: string;
  sender: { full_name: string | null; email: string | null; role: string | null } | null;
  companyName: string;
  type: 'chat_ai' | 'practice';
  href: string | null;
};

function ChatMessageRow({ message }: { message: ChatEntry }) {
  const senderName = message.sender?.full_name || message.sender?.email || 'Sconosciuto';
  const roleLabel = message.sender?.role === 'client_admin' ? 'Cliente'
    : message.sender?.role === 'consultant' ? 'Consulente'
    : message.sender?.role === 'ops_admin' ? 'Admin'
    : message.sender?.role || '—';
  const date = new Date(message.created_at);
  const dateStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const bodyPreview = message.body.length > 120 ? message.body.slice(0, 120) + '...' : message.body;

  const inner = (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 16px', borderRadius: 10,
      background: '#fff', border: '0.5px solid rgba(11,17,54,0.06)',
      transition: 'all .15s',
    }}>
      {/* Avatar */}
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: message.type === 'practice' ? '#DBEAFE' : '#F1F2F4',
        color: message.type === 'practice' ? '#2563EB' : 'rgba(11,17,54,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, flexShrink: 0,
      }}>
        {senderName.charAt(0).toUpperCase()}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#0B1136' }}>{senderName}</span>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#F1F2F4', color: 'rgba(11,17,54,0.45)' }}>
            {roleLabel}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(11,17,54,0.35)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {dateStr}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(11,17,54,0.65)', lineHeight: 1.55, marginBottom: 4 }}>
          {bodyPreview}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {message.type === 'practice' ? (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#DBEAFE', color: '#2563EB', fontWeight: 500 }}>
              Pratica
            </span>
          ) : (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#F1F2F4', color: 'rgba(11,17,54,0.45)', fontWeight: 500 }}>
              Chat AI
            </span>
          )}
          <span style={{ fontSize: 10, color: 'rgba(11,17,54,0.35)' }}>
            {message.companyName}
          </span>
        </div>
      </div>
    </div>
  );

  if (message.href) {
    return (
      <Link href={message.href} style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
