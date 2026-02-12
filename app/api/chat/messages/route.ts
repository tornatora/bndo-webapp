import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
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

type ChatMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

const AUTO_REPLY_BODY = 'Messaggio ricevuto: un consulente si connettera con te presto.';
const AUTO_REPLY_WINDOW_MINUTES = 15;

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

async function findOpsSenderProfile(threadId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: participantOps } = await supabaseAdmin
    .from('consultant_thread_participants')
    .select('profile_id, participant_role')
    .eq('thread_id', threadId)
    .in('participant_role', ['consultant', 'ops_admin'])
    .limit(1)
    .maybeSingle();

  if (participantOps?.profile_id) {
    return {
      id: participantOps.profile_id,
      role: participantOps.participant_role as ViewerProfile['role']
    };
  }

  const { data: fallbackOps } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .in('role', ['consultant', 'ops_admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fallbackOps?.id) {
    return null;
  }

  return {
    id: fallbackOps.id,
    role: fallbackOps.role as ViewerProfile['role']
  };
}

async function maybeCreateAutomaticReply(threadId: string, sender: ViewerProfile) {
  if (sender.role !== 'client_admin') {
    return { autoReplyNotice: null, autoReplyMessage: null };
  }

  const autoReplyNotice = 'Un consulente si connettera con te presto.';
  const opsSender = await findOpsSenderProfile(threadId);

  if (!opsSender) {
    return { autoReplyNotice, autoReplyMessage: null };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const thresholdIso = new Date(Date.now() - AUTO_REPLY_WINDOW_MINUTES * 60_000).toISOString();

  const { data: existingAck } = await supabaseAdmin
    .from('consultant_messages')
    .select('id')
    .eq('thread_id', threadId)
    .eq('sender_profile_id', opsSender.id)
    .eq('body', AUTO_REPLY_BODY)
    .gte('created_at', thresholdIso)
    .limit(1)
    .maybeSingle();

  if (existingAck?.id) {
    return { autoReplyNotice, autoReplyMessage: null };
  }

  await supabaseAdmin.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: opsSender.id,
      participant_role: opsSender.role,
      last_read_at: new Date().toISOString()
    },
    { onConflict: 'thread_id,profile_id' }
  );

  const { data: autoReplyMessage, error } = await supabaseAdmin
    .from('consultant_messages')
    .insert({
      thread_id: threadId,
      sender_profile_id: opsSender.id,
      body: AUTO_REPLY_BODY
    })
    .select('id, thread_id, sender_profile_id, body, created_at')
    .single();

  if (error || !autoReplyMessage) {
    return { autoReplyNotice, autoReplyMessage: null };
  }

  return {
    autoReplyNotice,
    autoReplyMessage: autoReplyMessage as ChatMessage
  };
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

    const autoReply = await maybeCreateAutomaticReply(payload.threadId, profile);

    return NextResponse.json(
      {
        success: true,
        message,
        autoReplyNotice: autoReply.autoReplyNotice,
        autoReplyMessage: autoReply.autoReplyMessage
      },
      { status: 201 }
    );
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
