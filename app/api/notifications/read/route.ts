import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserProfile } from '@/lib/auth';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const BodySchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
  read: z.boolean().default(true),
  markAll: z.boolean().optional().default(false)
});

export async function PATCH(request: Request) {
  const { profile } = await requireUserProfile();
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
  }

  const supabase = createClient() as any;
  const readAt = parsed.data.read ? new Date().toISOString() : null;

  let query = supabase
    .from('notification_inbox')
    .update({ read_at: readAt })
    .eq('recipient_profile_id', profile.id);

  if (!parsed.data.markAll) {
    const ids = parsed.data.ids ?? [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Seleziona almeno una notifica.' }, { status: 422 });
    }
    query = query.in('id', ids);
  }

  const { error } = await query;
  if (error) {
    if (isMissingTable(error, 'notification_inbox')) {
      return NextResponse.json(
        {
          ok: true,
          compatibilityMode: true,
          updated: 0
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
