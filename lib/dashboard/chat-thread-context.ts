import { hasOpsAccess } from '@/lib/roles';

export type ChatViewerProfile = {
  id: string;
  company_id: string | null;
  role: 'client_admin' | 'consultant' | 'ops_admin';
};

export type ConsultantMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

export type ChatThreadContextPayload = {
  threadId: string | null;
  lastReadAt: string | null;
  messages: ConsultantMessage[];
  error?: string;
};

export type ChatThreadContextResult = {
  status: number;
  payload: ChatThreadContextPayload;
};

type BuildChatThreadContextArgs = {
  supabase: any;
  profile: ChatViewerProfile;
  includeMessages?: boolean;
  messagesLimit?: number;
};

export async function buildChatThreadContext({
  supabase,
  profile,
  includeMessages = true,
  messagesLimit = 80,
}: BuildChatThreadContextArgs): Promise<ChatThreadContextResult> {
  if (hasOpsAccess(profile.role)) {
    return {
      status: 200,
      payload: {
        threadId: null,
        lastReadAt: null,
        messages: [],
      },
    };
  }

  if (!profile.company_id) {
    return {
      status: 422,
      payload: {
        threadId: null,
        lastReadAt: null,
        messages: [],
        error: 'Profilo non associato ad alcuna azienda.',
      },
    };
  }

  const { data: existingThread, error: threadLookupError } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', profile.company_id)
    .maybeSingle();

  if (threadLookupError) {
    return {
      status: 500,
      payload: {
        threadId: null,
        lastReadAt: null,
        messages: [],
        error: 'Impossibile inizializzare la chat.',
      },
    };
  }

  let threadId = existingThread?.id ?? null;
  if (!threadId) {
    const { data: createdThread, error: threadCreateError } = await supabase
      .from('consultant_threads')
      .insert({ company_id: profile.company_id })
      .select('id')
      .single();

    if (threadCreateError) {
      return {
        status: 500,
        payload: {
          threadId: null,
          lastReadAt: null,
          messages: [],
          error: 'Impossibile inizializzare la chat.',
        },
      };
    }

    threadId = createdThread?.id ?? null;
  }

  if (!threadId) {
    return {
      status: 500,
      payload: {
        threadId: null,
        lastReadAt: null,
        messages: [],
        error: 'Impossibile inizializzare la chat.',
      },
    };
  }

  // Best-effort: the UI should still work even if this upsert fails transiently.
  await supabase.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: profile.id,
      participant_role: profile.role,
    },
    { onConflict: 'thread_id,profile_id', ignoreDuplicates: true },
  );

  const participantPromise = supabase
    .from('consultant_thread_participants')
    .select('last_read_at')
    .eq('thread_id', threadId)
    .eq('profile_id', profile.id)
    .maybeSingle();

  const messagesPromise = includeMessages
    ? supabase
        .from('consultant_messages')
        .select('id, thread_id, sender_profile_id, body, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(messagesLimit)
    : Promise.resolve({ data: [] as ConsultantMessage[] });

  const [{ data: participant }, { data: messages }] = await Promise.all([participantPromise, messagesPromise]);

  return {
    status: 200,
    payload: {
      threadId,
      lastReadAt: participant?.last_read_at ?? null,
      messages: (messages ?? []) as ConsultantMessage[],
    },
  };
}
