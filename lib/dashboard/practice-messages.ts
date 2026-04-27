import { AUTO_REPLY_BODY } from '@/lib/chat/constants';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

export type ViewerRole = 'client_admin' | 'consultant' | 'ops_admin';

export type PracticeThreadMode = 'practice' | 'legacy';

export type PracticeMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

type CompatArgs = {
  supabase: any;
  mode: PracticeThreadMode;
};

function sortMessagesAscending(rows: PracticeMessage[]) {
  return [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function extractFirstName(fullName: string | null | undefined) {
  const normalized = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  const parts = normalized.split(' ');
  return parts[0] ?? null;
}

export function buildPreviewText(body: string | null | undefined, max = 88) {
  const normalized = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export async function ensurePracticeThreadCompat(args: {
  supabase: any;
  applicationId: string;
  companyId: string;
}): Promise<{ threadId: string; mode: PracticeThreadMode }> {
  const { supabase, applicationId, companyId } = args;

  const practiceLookup = await supabase
    .from('consultant_practice_threads')
    .select('id')
    .eq('application_id', applicationId)
    .maybeSingle();

  if (!practiceLookup.error && practiceLookup.data?.id) {
    return { threadId: String(practiceLookup.data.id), mode: 'practice' };
  }

  if (practiceLookup.error && !isMissingTable(practiceLookup.error, 'consultant_practice_threads')) {
    throw new Error(practiceLookup.error.message);
  }

  if (!practiceLookup.error) {
    const insertPractice = await supabase
      .from('consultant_practice_threads')
      .insert({
        application_id: applicationId,
        company_id: companyId,
      })
      .select('id')
      .single();

    if (!insertPractice.error && insertPractice.data?.id) {
      return { threadId: String(insertPractice.data.id), mode: 'practice' };
    }

    if (insertPractice.error && !isMissingTable(insertPractice.error, 'consultant_practice_threads')) {
      const raceLookup = await supabase
        .from('consultant_practice_threads')
        .select('id')
        .eq('application_id', applicationId)
        .maybeSingle();

      if (!raceLookup.error && raceLookup.data?.id) {
        return { threadId: String(raceLookup.data.id), mode: 'practice' };
      }

      throw new Error(insertPractice.error.message);
    }
  }

  const legacyLookup = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();

  if (legacyLookup.error) {
    throw new Error(legacyLookup.error.message);
  }

  if (legacyLookup.data?.id) {
    return { threadId: String(legacyLookup.data.id), mode: 'legacy' };
  }

  const legacyInsert = await supabase
    .from('consultant_threads')
    .insert({ company_id: companyId })
    .select('id')
    .single();

  if (legacyInsert.error || !legacyInsert.data?.id) {
    throw new Error(legacyInsert.error?.message ?? 'Impossibile creare il thread chat.');
  }

  return { threadId: String(legacyInsert.data.id), mode: 'legacy' };
}

export async function ensureParticipantCompat(args: {
  supabase: any;
  threadId: string;
  profileId: string;
  role: ViewerRole;
  mode: PracticeThreadMode;
}) {
  const { supabase, threadId, profileId, role, mode } = args;

  if (mode === 'practice') {
    const practiceUpsert = await supabase.from('consultant_practice_thread_participants').upsert(
      {
        thread_id: threadId,
        profile_id: profileId,
        participant_role: role,
        last_read_at: new Date(0).toISOString(),
      },
      {
        onConflict: 'thread_id,profile_id',
        ignoreDuplicates: true,
      }
    );

    if (!practiceUpsert.error) {
      return 'practice' as const;
    }

    if (!isMissingTable(practiceUpsert.error, 'consultant_practice_thread_participants')) {
      throw new Error(practiceUpsert.error.message);
    }
  }

  const legacyUpsert = await supabase.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: profileId,
      participant_role: role,
      last_read_at: new Date(0).toISOString(),
    },
    {
      onConflict: 'thread_id,profile_id',
      ignoreDuplicates: true,
    }
  );

  if (legacyUpsert.error) {
    throw new Error(legacyUpsert.error.message);
  }

  return 'legacy' as const;
}

export async function touchParticipantReadCompat(args: {
  supabase: any;
  threadId: string;
  profileId: string;
  role: ViewerRole;
  mode: PracticeThreadMode;
  atIso?: string;
}) {
  const { supabase, threadId, profileId, role, mode } = args;
  const atIso = args.atIso ?? new Date().toISOString();

  if (mode === 'practice') {
    const practiceUpsert = await supabase.from('consultant_practice_thread_participants').upsert(
      {
        thread_id: threadId,
        profile_id: profileId,
        participant_role: role,
        last_read_at: atIso,
      },
      { onConflict: 'thread_id,profile_id' }
    );

    if (!practiceUpsert.error) {
      return { mode: 'practice' as const, lastReadAt: atIso };
    }

    if (!isMissingTable(practiceUpsert.error, 'consultant_practice_thread_participants')) {
      throw new Error(practiceUpsert.error.message);
    }
  }

  const legacyUpsert = await supabase.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: profileId,
      participant_role: role,
      last_read_at: atIso,
    },
    { onConflict: 'thread_id,profile_id' }
  );

  if (legacyUpsert.error) {
    throw new Error(legacyUpsert.error.message);
  }

  return { mode: 'legacy' as const, lastReadAt: atIso };
}

export async function readLastReadAtCompat(args: {
  supabase: any;
  threadId: string;
  profileId: string;
  mode: PracticeThreadMode;
}) {
  const { supabase, threadId, profileId, mode } = args;

  if (mode === 'practice') {
    const practiceRead = await supabase
      .from('consultant_practice_thread_participants')
      .select('last_read_at')
      .eq('thread_id', threadId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (!practiceRead.error) {
      return {
        mode: 'practice' as const,
        lastReadAt: String(practiceRead.data?.last_read_at ?? new Date(0).toISOString()),
      };
    }

    if (!isMissingTable(practiceRead.error, 'consultant_practice_thread_participants')) {
      throw new Error(practiceRead.error.message);
    }
  }

  const legacyRead = await supabase
    .from('consultant_thread_participants')
    .select('last_read_at')
    .eq('thread_id', threadId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (legacyRead.error) {
    throw new Error(legacyRead.error.message);
  }

  return {
    mode: 'legacy' as const,
    lastReadAt: String(legacyRead.data?.last_read_at ?? new Date(0).toISOString()),
  };
}

export async function listMessagesCompat(args: CompatArgs & { threadId: string; limit?: number }) {
  const { supabase, mode, threadId } = args;
  const limit = args.limit ?? 180;

  if (mode === 'practice') {
    const practiceRows = await supabase
      .from('consultant_practice_messages')
      .select('id, thread_id, sender_profile_id, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (!practiceRows.error) {
      return {
        mode: 'practice' as const,
        messages: sortMessagesAscending((practiceRows.data ?? []) as PracticeMessage[]),
      };
    }

    if (!isMissingTable(practiceRows.error, 'consultant_practice_messages')) {
      throw new Error(practiceRows.error.message);
    }
  }

  const legacyRows = await supabase
    .from('consultant_messages')
    .select('id, thread_id, sender_profile_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (legacyRows.error) {
    throw new Error(legacyRows.error.message);
  }

  return {
    mode: 'legacy' as const,
    messages: sortMessagesAscending((legacyRows.data ?? []) as PracticeMessage[]),
  };
}

export async function fetchLatestMessageCompat(args: CompatArgs & { threadId: string }) {
  const { supabase, mode, threadId } = args;

  if (mode === 'practice') {
    const practiceRow = await supabase
      .from('consultant_practice_messages')
      .select('id, thread_id, sender_profile_id, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!practiceRow.error) {
      return {
        mode: 'practice' as const,
        message: (practiceRow.data as PracticeMessage | null) ?? null,
      };
    }

    if (!isMissingTable(practiceRow.error, 'consultant_practice_messages')) {
      throw new Error(practiceRow.error.message);
    }
  }

  const legacyRow = await supabase
    .from('consultant_messages')
    .select('id, thread_id, sender_profile_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyRow.error) {
    throw new Error(legacyRow.error.message);
  }

  return {
    mode: 'legacy' as const,
    message: (legacyRow.data as PracticeMessage | null) ?? null,
  };
}

export async function countUnreadCompat(
  args: CompatArgs & {
    threadId: string;
    viewerProfileId: string;
    lastReadAt: string;
  }
) {
  const { supabase, mode, threadId, viewerProfileId, lastReadAt } = args;

  if (mode === 'practice') {
    const practiceCount = await supabase
      .from('consultant_practice_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', threadId)
      .gt('created_at', lastReadAt)
      .neq('sender_profile_id', viewerProfileId);

    if (!practiceCount.error) {
      return {
        mode: 'practice' as const,
        unreadCount: practiceCount.count ?? 0,
      };
    }

    if (!isMissingTable(practiceCount.error, 'consultant_practice_messages')) {
      throw new Error(practiceCount.error.message);
    }
  }

  const legacyCount = await supabase
    .from('consultant_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .gt('created_at', lastReadAt)
    .neq('sender_profile_id', viewerProfileId);

  if (legacyCount.error) {
    throw new Error(legacyCount.error.message);
  }

  return {
    mode: 'legacy' as const,
    unreadCount: legacyCount.count ?? 0,
  };
}

export async function insertMessageCompat(
  args: CompatArgs & {
    threadId: string;
    senderProfileId: string;
    body: string;
  }
) {
  const { supabase, mode, threadId, senderProfileId, body } = args;

  if (mode === 'practice') {
    const practiceInsert = await supabase
      .from('consultant_practice_messages')
      .insert({
        thread_id: threadId,
        sender_profile_id: senderProfileId,
        body,
      })
      .select('id, thread_id, sender_profile_id, body, created_at')
      .single();

    if (!practiceInsert.error && practiceInsert.data) {
      return {
        mode: 'practice' as const,
        message: practiceInsert.data as PracticeMessage,
      };
    }

    if (practiceInsert.error && !isMissingTable(practiceInsert.error, 'consultant_practice_messages')) {
      throw new Error(practiceInsert.error.message);
    }
  }

  const legacyInsert = await supabase
    .from('consultant_messages')
    .insert({
      thread_id: threadId,
      sender_profile_id: senderProfileId,
      body,
    })
    .select('id, thread_id, sender_profile_id, body, created_at')
    .single();

  if (legacyInsert.error || !legacyInsert.data) {
    throw new Error(legacyInsert.error?.message ?? 'Messaggio non inviato.');
  }

  return {
    mode: 'legacy' as const,
    message: legacyInsert.data as PracticeMessage,
  };
}

export async function findLatestConsultantParticipantProfileIdCompat(
  args: CompatArgs & { threadId: string }
) {
  const { supabase, mode, threadId } = args;

  if (mode === 'practice') {
    const practiceParticipant = await supabase
      .from('consultant_practice_thread_participants')
      .select('profile_id, created_at')
      .eq('thread_id', threadId)
      .eq('participant_role', 'consultant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!practiceParticipant.error) {
      const profileId = practiceParticipant.data?.profile_id
        ? String(practiceParticipant.data.profile_id)
        : null;
      return {
        mode: 'practice' as const,
        profileId,
      };
    }

    if (!isMissingTable(practiceParticipant.error, 'consultant_practice_thread_participants')) {
      throw new Error(practiceParticipant.error.message);
    }
  }

  const legacyParticipant = await supabase
    .from('consultant_thread_participants')
    .select('profile_id, created_at')
    .eq('thread_id', threadId)
    .eq('participant_role', 'consultant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyParticipant.error) {
    throw new Error(legacyParticipant.error.message);
  }

  const profileId = legacyParticipant.data?.profile_id
    ? String(legacyParticipant.data.profile_id)
    : null;

  return {
    mode: 'legacy' as const,
    profileId,
  };
}

export async function findSupportSenderForAutoReply(
  args: CompatArgs & { threadId: string }
): Promise<{ profileId: string; role: ViewerRole } | null> {
  const { supabase, mode, threadId } = args;

  if (mode === 'practice') {
    const practiceParticipant = await supabase
      .from('consultant_practice_thread_participants')
      .select('profile_id, participant_role, created_at')
      .eq('thread_id', threadId)
      .in('participant_role', ['consultant', 'ops_admin'])
      .order('created_at', { ascending: true })
      .limit(5);

    if (!practiceParticipant.error) {
      const ranked = (practiceParticipant.data ?? []) as Array<{ profile_id?: string; participant_role?: string }>;
      const consultant = ranked.find((row) => row.participant_role === 'consultant' && row.profile_id);
      if (consultant?.profile_id) {
        return { profileId: consultant.profile_id, role: 'consultant' };
      }
      const ops = ranked.find((row) => row.participant_role === 'ops_admin' && row.profile_id);
      if (ops?.profile_id) {
        return { profileId: ops.profile_id, role: 'ops_admin' };
      }
    } else if (!isMissingTable(practiceParticipant.error, 'consultant_practice_thread_participants')) {
      throw new Error(practiceParticipant.error.message);
    }
  }

  const legacyParticipant = await supabase
    .from('consultant_thread_participants')
    .select('profile_id, participant_role, created_at')
    .eq('thread_id', threadId)
    .in('participant_role', ['consultant', 'ops_admin'])
    .order('created_at', { ascending: true })
    .limit(5);

  if (legacyParticipant.error) {
    throw new Error(legacyParticipant.error.message);
  }

  const rankedLegacy = (legacyParticipant.data ?? []) as Array<{ profile_id?: string; participant_role?: string }>;
  const consultantLegacy = rankedLegacy.find((row) => row.participant_role === 'consultant' && row.profile_id);
  if (consultantLegacy?.profile_id) {
    return { profileId: consultantLegacy.profile_id, role: 'consultant' };
  }
  const opsLegacy = rankedLegacy.find((row) => row.participant_role === 'ops_admin' && row.profile_id);
  if (opsLegacy?.profile_id) {
    return { profileId: opsLegacy.profile_id, role: 'ops_admin' };
  }

  const fallback = await supabase
    .from('profiles')
    .select('id, role')
    .in('role', ['consultant', 'ops_admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fallback.error && fallback.data?.id && (fallback.data.role === 'consultant' || fallback.data.role === 'ops_admin')) {
    return {
      profileId: String(fallback.data.id),
      role: fallback.data.role as ViewerRole,
    };
  }

  return null;
}

export async function maybeCreateAutomaticReply(args: {
  supabase: any;
  threadId: string;
  mode: PracticeThreadMode;
  senderRole: ViewerRole;
}) {
  const { supabase, threadId, mode, senderRole } = args;

  if (senderRole !== 'client_admin') {
    return {
      autoReplyNotice: null,
      autoReplyMessage: null as PracticeMessage | null,
    };
  }

  const supportSender = await findSupportSenderForAutoReply({
    supabase,
    mode,
    threadId,
  });

  if (!supportSender?.profileId) {
    return {
      autoReplyNotice: AUTO_REPLY_BODY,
      autoReplyMessage: null as PracticeMessage | null,
    };
  }

  await ensureParticipantCompat({
    supabase,
    threadId,
    profileId: supportSender.profileId,
    role: supportSender.role,
    mode,
  });

  const inserted = await insertMessageCompat({
    supabase,
    mode,
    threadId,
    senderProfileId: supportSender.profileId,
    body: AUTO_REPLY_BODY,
  });

  return {
    autoReplyNotice: AUTO_REPLY_BODY,
    autoReplyMessage: inserted.message,
  };
}
