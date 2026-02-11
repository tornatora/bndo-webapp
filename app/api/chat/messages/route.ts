import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

const payloadSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(1200)
});

const querySchema = z.object({
  threadId: z.string().uuid()
});

type ViewerProfile = {
  id: string;
  company_id: string | null;
  role: 'client_admin' | 'consultant' | 'ops_admin';
};

async function getViewerProfile() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) as NextResponse };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return { supabase, error: NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 }) as NextResponse };
  }

  return { supabase, profile: profile as ViewerProfile };
}

async function getAuthorizedThread(
  supabase: ReturnType<typeof createClient>,
  profile: ViewerProfile,
  threadId: string
) {
  let threadQuery = supabase.from('consultant_threads').select('id, company_id').eq('id', threadId);

  if (!hasOpsAccess(profile.role)) {
    if (!profile.company_id) return null;
    threadQuery = threadQuery.eq('company_id', profile.company_id);
  }

  const { data: thread } = await threadQuery.maybeSingle();
  return thread;
}

async function ensureParticipant(
  supabase: ReturnType<typeof createClient>,
  profile: ViewerProfile,
  threadId: string,
  lastReadAt = new Date().toISOString()
) {
  await supabase.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: profile.id,
      participant_role: profile.role,
      last_read_at: lastReadAt
    },
    { onConflict: 'thread_id,profile_id' }
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      threadId: url.searchParams.get('threadId')
    });

    const viewer = await getViewerProfile();
    if ('error' in viewer) return viewer.error;

    const { supabase, profile } = viewer;

    const thread = await getAuthorizedThread(supabase, profile, parsed.threadId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread non disponibile.' }, { status: 404 });
    }

    const { data: messages, error } = await supabase
      .from('consultant_messages')
      .select('id, thread_id, sender_profile_id, body, created_at')
      .eq('thread_id', parsed.threadId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: participant } = await supabase
      .from('consultant_thread_participants')
      .select('last_read_at')
      .eq('thread_id', parsed.threadId)
      .eq('profile_id', profile.id)
      .maybeSingle();

    const lastReadAt = participant?.last_read_at ?? new Date(0).toISOString();

    const { count } = await supabase
      .from('consultant_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', parsed.threadId)
      .gt('created_at', lastReadAt)
      .neq('sender_profile_id', profile.id);

    return NextResponse.json({
      messages: messages ?? [],
      unreadCount: count ?? 0,
      lastReadAt
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parametri chat non validi.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore caricamento chat.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const viewer = await getViewerProfile();
    if ('error' in viewer) return viewer.error;

    const { supabase, profile } = viewer;

    const thread = await getAuthorizedThread(supabase, profile, payload.threadId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread non disponibile.' }, { status: 404 });
    }

    await ensureParticipant(supabase, profile, payload.threadId);

    const { data: message, error } = await supabase
      .from('consultant_messages')
      .insert({
        thread_id: payload.threadId,
        sender_profile_id: profile.id,
        body: payload.body.trim()
      })
      .select('id, thread_id, sender_profile_id, body, created_at')
      .single();

    if (error || !message) {
      return NextResponse.json({ error: error?.message ?? 'Messaggio non inviato.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload chat non valido.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore invio messaggio.' },
      { status: 500 }
    );
  }
}
