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

  // Fast path: fetch recent messages across all threads (RLS allows ops users),
  // then filter by per-thread last_read_at. This avoids N queries (one per thread),
  // which can be slow/unreliable on serverless.
  const { data: recentMessages, error: msgErr } = await supabase
    .from('consultant_messages')
    .select('id, thread_id, sender_profile_id, body, created_at')
    .order('created_at', { ascending: false })
    .limit(400);

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  const messages = (recentMessages ?? []) as unknown as MessageRow[];
  const threadIds = [...new Set(messages.map((m) => m.thread_id))];

  const [{ data: participants, error: participantError }, { data: threads, error: threadsError }] = await Promise.all([
    threadIds.length
      ? supabase
          .from('consultant_thread_participants')
          .select('thread_id, last_read_at')
          .eq('profile_id', user.id)
          .in('thread_id', threadIds)
      : Promise.resolve({ data: [] as ParticipantRow[], error: null }),
    threadIds.length
      ? supabase.from('consultant_threads').select('id, company_id, companies(name)').in('id', threadIds)
      : Promise.resolve({ data: [] as ThreadRow[], error: null })
  ]);

  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 });
  if (threadsError) return NextResponse.json({ error: threadsError.message }, { status: 500 });

  const lastReadByThread = new Map<string, string>();
  for (const p of (participants ?? []) as unknown as ParticipantRow[]) lastReadByThread.set(p.thread_id, p.last_read_at);

  const threadById = new Map<string, ThreadRow>();
  for (const t of (threads ?? []) as unknown as ThreadRow[]) threadById.set(t.id, t);

  const items: Array<{ id: string; threadId: string; companyId: string; title: string; body: string; createdAt: string }> = [];
  const seenThread = new Set<string>();

  for (const m of messages) {
    if (seenThread.has(m.thread_id)) continue;
    if (m.sender_profile_id === user.id) continue;
    if (isAutoReplyMessage(m.body)) continue;

    const lastReadAt = lastReadByThread.get(m.thread_id) ?? new Date(0).toISOString();
    if (new Date(m.created_at).getTime() <= new Date(lastReadAt).getTime()) continue;

    const thread = threadById.get(m.thread_id);
    if (!thread) continue;

    items.push({
      id: m.id,
      threadId: m.thread_id,
      companyId: thread.company_id,
      title: `${companyNameFromThread(thread)} ti ha inviato un messaggio`,
      body: m.body,
      createdAt: m.created_at
    });
    seenThread.add(m.thread_id);
    if (items.length >= limit) break;
  }

  return NextResponse.json({ ok: true, count: items.length, items }, { status: 200 });
}
