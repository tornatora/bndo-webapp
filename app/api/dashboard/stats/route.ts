import { NextResponse } from 'next/server';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('id, company_id, role').eq('id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });
  if (hasOpsAccess(profile.role)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  if (!profile.company_id) return NextResponse.json({ error: 'Profilo non associato ad alcuna azienda.' }, { status: 422 });

  const { count: docsCount, error: docsErr } = await supabase
    .from('application_documents')
    .select('id', { count: 'exact', head: true })
    .eq('uploaded_by', profile.id);

  if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });

  const { data: thread } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', profile.company_id)
    .maybeSingle();

  if (!thread?.id) {
    return NextResponse.json({ ok: true, docsCount: docsCount ?? 0, unreadCount: 0 }, { status: 200 });
  }

  const { data: participant } = await supabase
    .from('consultant_thread_participants')
    .select('last_read_at')
    .eq('thread_id', thread.id)
    .eq('profile_id', profile.id)
    .maybeSingle();

  const lastReadAt = participant?.last_read_at ?? new Date(0).toISOString();

  const { count: unreadCount, error: unreadErr } = await supabase
    .from('consultant_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', thread.id)
    .gt('created_at', lastReadAt)
    .neq('sender_profile_id', profile.id);

  if (unreadErr) return NextResponse.json({ error: unreadErr.message }, { status: 500 });

  return NextResponse.json(
    {
      ok: true,
      docsCount: docsCount ?? 0,
      unreadCount: unreadCount ?? 0
    },
    { status: 200 }
  );
}

