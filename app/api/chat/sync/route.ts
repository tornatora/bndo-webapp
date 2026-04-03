import { NextResponse } from 'next/server';
import { buildChatThreadContext, type ChatViewerProfile } from '@/lib/dashboard/chat-thread-context';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const typedProfile = profile as ChatViewerProfile;
  const context = await buildChatThreadContext({
    supabase,
    profile: typedProfile,
    includeMessages: true,
    messagesLimit: 80,
  });
  return NextResponse.json(context.payload, { status: context.status });
}
