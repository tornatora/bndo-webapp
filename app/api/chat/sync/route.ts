import { NextResponse } from 'next/server';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ViewerProfile = {
  id: string;
  company_id: string | null;
  role: 'client_admin' | 'consultant' | 'ops_admin';
};

type Message = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

export async function GET() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });
  const typedProfile = profile as ViewerProfile;

  // Ops users don't have a single "personal" thread context.
  if (hasOpsAccess(typedProfile.role)) {
    return NextResponse.json({ threadId: null, lastReadAt: null, messages: [] }, { status: 200 });
  }

  if (!typedProfile.company_id) return NextResponse.json({ error: 'Profilo non associato ad alcuna azienda.' }, { status: 422 });

  const { data: existingThread } = await supabase
    .from('consultant_threads')
    .select('id')
    .eq('company_id', typedProfile.company_id)
    .maybeSingle();

  let threadId = existingThread?.id ?? null;
  if (!threadId) {
    const { data: createdThread } = await supabase
      .from('consultant_threads')
      .insert({ company_id: typedProfile.company_id })
      .select('id')
      .single();
    threadId = createdThread?.id ?? null;
  }

  if (!threadId) return NextResponse.json({ error: 'Impossibile inizializzare la chat.' }, { status: 500 });

  // Ensure participant exists (don't force read state).
  await supabase.from('consultant_thread_participants').upsert(
    {
      thread_id: threadId,
      profile_id: typedProfile.id,
      participant_role: typedProfile.role
    },
    { onConflict: 'thread_id,profile_id', ignoreDuplicates: true }
  );

  const [{ data: participant }, { data: messages }] = await Promise.all([
    supabase
      .from('consultant_thread_participants')
      .select('last_read_at')
      .eq('thread_id', threadId)
      .eq('profile_id', typedProfile.id)
      .maybeSingle(),
    supabase
      .from('consultant_messages')
      .select('id, thread_id, sender_profile_id, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(80)
  ]);

  return NextResponse.json(
    {
      threadId,
      lastReadAt: participant?.last_read_at ?? null,
      messages: (messages ?? []) as Message[]
    },
    { status: 200 }
  );
}

