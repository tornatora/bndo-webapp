import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  eventType: z.string().trim().max(80).optional(),
  channel: z.string().trim().max(40).optional(),
  actorRole: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export async function GET(request: Request) {
  await requireOpsProfile();
  const parsed = QuerySchema.safeParse({
    eventType: new URL(request.url).searchParams.get('eventType') || undefined,
    channel: new URL(request.url).searchParams.get('channel') || undefined,
    actorRole: new URL(request.url).searchParams.get('actorRole') || undefined,
    limit: new URL(request.url).searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;
  let query = admin
    .from('platform_events')
    .select('id, event_type, actor_profile_id, actor_role, company_id, application_id, session_id, page_path, channel, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit ?? 250);

  if (parsed.data.eventType) query = query.eq('event_type', parsed.data.eventType);
  if (parsed.data.channel) query = query.eq('channel', parsed.data.channel);
  if (parsed.data.actorRole) query = query.eq('actor_role', parsed.data.actorRole);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error, 'platform_events')) {
      return NextResponse.json({
        rows: [],
        notice: 'Eventi analytics non ancora attivi su questo ambiente.',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [], notice: null });
}
