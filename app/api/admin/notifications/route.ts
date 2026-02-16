import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isAutoReplyMessage } from '@/lib/chat/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional()
});

type ThreadRow = {
  id: string;
  company_id: string;
  companies?: { name: string } | { name: string }[] | null;
};

type ParticipantRow = {
  thread_id: string;
  last_read_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

function companyNameFromThread(row: ThreadRow) {
  const c = row.companies;
  if (!c) return 'Cliente';
  if (Array.isArray(c)) return c[0]?.name ?? 'Cliente';
  return c.name ?? 'Cliente';
}

export async function GET(request: Request) {
  await requireOpsProfile();
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ limit: url.searchParams.get('limit') ?? undefined });
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;

  // 1) Get threads + company names (admin can see all via RLS is_ops_user()).
  const { data: threads, error: threadsError } = await supabase
    .from('consultant_threads')
    .select('id, company_id, companies(name)')
    .order('created_at', { ascending: false })
    .limit(250);

  if (threadsError) return NextResponse.json({ error: threadsError.message }, { status: 500 });

  const threadRows = (threads ?? []) as unknown as ThreadRow[];
  const threadIds = threadRows.map((t) => t.id);

  // 2) Read last_read_at for this admin profile per thread (missing row = never read).
  const { data: participants, error: participantError } = threadIds.length
    ? await supabase
        .from('consultant_thread_participants')
        .select('thread_id, last_read_at')
        .eq('profile_id', user.id)
        .in('thread_id', threadIds)
    : { data: [] as ParticipantRow[], error: null };

  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 });

  const lastReadByThread = new Map<string, string>();
  for (const p of (participants ?? []) as unknown as ParticipantRow[]) lastReadByThread.set(p.thread_id, p.last_read_at);

  // 3) For each thread, find the newest message after last_read_at NOT sent by this admin.
  // This is OK for <= 250 threads; keeps logic simple and correct with RLS.
  const checks = await Promise.all(
    threadRows.map(async (t) => {
      const lastReadAt = lastReadByThread.get(t.id) ?? new Date(0).toISOString();
      const { data: message } = await supabase
        .from('consultant_messages')
        .select('id, thread_id, sender_profile_id, body, created_at')
        .eq('thread_id', t.id)
        .gt('created_at', lastReadAt)
        .neq('sender_profile_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!message) return null;
      if (isAutoReplyMessage(message.body)) return null;

      return {
        threadId: t.id,
        companyId: t.company_id,
        companyName: companyNameFromThread(t),
        message: message as unknown as MessageRow
      };
    })
  );

  const items = checks
    .filter(Boolean)
    .map((it) => it as NonNullable<(typeof checks)[number]>)
    .sort((a, b) => new Date(b.message.created_at).getTime() - new Date(a.message.created_at).getTime())
    .slice(0, limit)
    .map((it) => ({
      id: it.message.id,
      threadId: it.threadId,
      companyId: it.companyId,
      title: `${it.companyName} ti ha inviato un messaggio`,
      body: it.message.body,
      createdAt: it.message.created_at
    }));

  return NextResponse.json({ ok: true, count: items.length, items }, { status: 200 });
}
