import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

const payloadSchema = z.object({
  threadId: z.string().uuid()
});

type ViewerProfile = {
  id: string;
  company_id: string | null;
  role: 'client_admin' | 'consultant' | 'ops_admin';
};

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const supabase = createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });
    }

    const typedProfile = profile as ViewerProfile;

    let threadQuery = supabase.from('consultant_threads').select('id, company_id').eq('id', payload.threadId);

    if (!hasOpsAccess(typedProfile.role)) {
      if (!typedProfile.company_id) {
        return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });
      }
      threadQuery = threadQuery.eq('company_id', typedProfile.company_id);
    }

    const { data: thread } = await threadQuery.maybeSingle();

    if (!thread) {
      return NextResponse.json({ error: 'Thread non disponibile.' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    const { error } = await supabase.from('consultant_thread_participants').upsert(
      {
        thread_id: payload.threadId,
        profile_id: typedProfile.id,
        participant_role: typedProfile.role,
        last_read_at: nowIso
      },
      { onConflict: 'thread_id,profile_id' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, lastReadAt: nowIso });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore aggiornamento stato lettura.' },
      { status: 500 }
    );
  }
}
