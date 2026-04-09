import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserProfile } from '@/lib/auth';
import { hasAdminAccess } from '@/lib/roles';
import { isAutoReplyMessage } from '@/lib/chat/constants';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  group: z.string().optional()
});

type InboxItem = {
  id: string;
  eventType: string;
  eventGroup: 'lead_quiz' | 'pratiche' | 'documenti' | 'pagamenti' | 'chat' | 'consulenti' | 'sistema';
  priority: 'high' | 'medium';
  title: string;
  body: string;
  actionPath: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

const GROUP_LABELS: Record<InboxItem['eventGroup'], string> = {
  lead_quiz: 'Lead e Quiz',
  pratiche: 'Pratiche',
  documenti: 'Documenti',
  pagamenti: 'Pagamenti',
  chat: 'Chat',
  consulenti: 'Consulenti',
  sistema: 'Sistema'
};

function buildGrouped(items: InboxItem[]) {
  const grouped = new Map<InboxItem['eventGroup'], InboxItem[]>();
  for (const item of items) {
    const list = grouped.get(item.eventGroup) ?? [];
    list.push(item);
    grouped.set(item.eventGroup, list);
  }

  return Object.entries(GROUP_LABELS).map(([group, label]) => ({
    group,
    label,
    items: (grouped.get(group as InboxItem['eventGroup']) ?? []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }));
}

async function fallbackFromLegacy(role: string, profileId: string, companyId: string | null, limit: number) {
  const supabase = createClient() as any;

  if (hasAdminAccess(role)) {
    const { data: adminRows, error } = await supabase
      .from('admin_notifications')
      .select('id, type, title, body, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      return { items: [] as InboxItem[], notice: 'Notifiche in attivazione.' };
    }

    const items: InboxItem[] = (adminRows ?? []).map((row: any) => ({
      id: String(row.id),
      eventType: String(row.type ?? 'system'),
      eventGroup: row.type === 'message' ? 'chat' : row.type === 'quiz_submission' ? 'lead_quiz' : 'sistema',
      priority: 'high',
      title: String(row.title ?? 'Aggiornamento'),
      body: String(row.body ?? ''),
      actionPath: '/admin',
      payload: {},
      createdAt: String(row.created_at),
      readAt: row.read_at ? String(row.read_at) : null
    }));

    return {
      items,
      notice: 'Stai visualizzando il feed legacy notifiche admin.'
    };
  }

  if (!companyId && role !== 'consultant') {
    return {
      items: [],
      notice: 'Nessuna notifica disponibile per il profilo corrente.'
    };
  }

  if (role === 'consultant') {
    const { data: participantRows } = await supabase
      .from('consultant_thread_participants')
      .select('thread_id, last_read_at')
      .eq('profile_id', profileId)
      .eq('participant_role', 'consultant')
      .limit(300);

    const threadIds = Array.from(
      new Set((participantRows ?? []).map((row: any) => String(row.thread_id ?? '')).filter(Boolean))
    );

    if (threadIds.length === 0) {
      return {
        items: [],
        notice: 'Nessuna notifica disponibile.'
      };
    }

    const { data: messages } = await supabase
      .from('consultant_messages')
      .select('id, thread_id, body, created_at, sender_profile_id')
      .in('thread_id', threadIds)
      .neq('sender_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit);

    const readByThread = new Map<string, string>();
    for (const row of participantRows ?? []) {
      readByThread.set(String((row as any).thread_id), String((row as any).last_read_at ?? new Date(0).toISOString()));
    }

    const items: InboxItem[] = (messages ?? [])
      .filter((m: any) => !isAutoReplyMessage(String(m.body ?? '')))
      .map((m: any) => {
        const lastReadAt = readByThread.get(String(m.thread_id)) ?? new Date(0).toISOString();
        return {
          id: String(m.id),
          eventType: 'chat_message_new',
          eventGroup: 'chat',
          priority: 'high',
          title: 'Nuovo messaggio cliente',
          body: String(m.body ?? ''),
          actionPath: '/consultant',
          payload: { threadId: String(m.thread_id) },
          createdAt: String(m.created_at),
          readAt: new Date(String(m.created_at)).getTime() > new Date(lastReadAt).getTime() ? null : lastReadAt
        } as InboxItem;
      });

    return {
      items,
      notice: 'Stai visualizzando il feed legacy chat consulente.'
    };
  }

  const { data: thread } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();

  if (!thread?.id) {
    return {
      items: [],
      notice: 'Nessuna notifica disponibile.'
    };
  }

  const [{ data: messages }, { data: participant }] = await Promise.all([
    supabase
      .from('consultant_messages')
      .select('id, body, created_at, sender_profile_id')
      .eq('thread_id', thread.id)
      .neq('sender_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('consultant_thread_participants')
      .select('last_read_at')
      .eq('thread_id', thread.id)
      .eq('profile_id', profileId)
      .maybeSingle()
  ]);

  const lastRead = new Date(participant?.last_read_at ?? new Date(0).toISOString()).getTime();

  const items: InboxItem[] = (messages ?? [])
    .filter((m: any) => !isAutoReplyMessage(String(m.body ?? '')))
    .map((m: any) => ({
      id: String(m.id),
      eventType: 'chat_message_new',
      eventGroup: 'chat',
      priority: 'high',
      title: 'Nuovo messaggio',
      body: String(m.body ?? ''),
      actionPath: role === 'consultant' ? '/consultant' : '/dashboard/messages',
      payload: {},
      createdAt: String(m.created_at),
      readAt: new Date(String(m.created_at)).getTime() > lastRead ? null : String(participant?.last_read_at ?? null)
    }));

  return {
    items,
    notice: 'Stai visualizzando il feed legacy chat.'
  };
}

export async function GET(request: Request) {
  const { profile } = await requireUserProfile();
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  const limit = parsed.success ? parsed.data.limit ?? 80 : 80;
  const unreadOnly = parsed.success ? parsed.data.unreadOnly : false;
  const groupFilter = parsed.success ? parsed.data.group : undefined;

  const supabase = createClient() as any;
  let query = supabase
    .from('notification_inbox')
    .select('id, event_type, event_group, priority, title, body, action_path, payload, created_at, read_at')
    .eq('recipient_profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }
  if (groupFilter) {
    query = query.eq('event_group', groupFilter);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error, 'notification_inbox')) {
      const fallback = await fallbackFromLegacy(profile.role, profile.id, profile.company_id, limit);
      const unreadCount = fallback.items.filter((item) => !item.readAt).length;
      return NextResponse.json(
        {
          ok: true,
          source: 'legacy',
          unreadCount,
          items: fallback.items,
          groups: buildGrouped(fallback.items),
          notice: fallback.notice
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items: InboxItem[] = (data ?? []).map((row: any) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    eventGroup: row.event_group,
    priority: row.priority,
    title: String(row.title ?? 'Aggiornamento'),
    body: String(row.body ?? ''),
    actionPath: row.action_path ? String(row.action_path) : null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: String(row.created_at),
    readAt: row.read_at ? String(row.read_at) : null
  }));

  const unreadCount = items.filter((item) => !item.readAt).length;
  const groups = buildGrouped(items);

  return NextResponse.json(
    {
      ok: true,
      source: 'inbox',
      unreadCount,
      items,
      groups
    },
    { status: 200 }
  );
}
