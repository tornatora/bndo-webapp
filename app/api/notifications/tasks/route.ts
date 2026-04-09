import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserProfile } from '@/lib/auth';
import { hasAdminAccess, hasConsultantAccess } from '@/lib/roles';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  notificationId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(1000).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  assignedToProfileId: z.string().uuid().optional().nullable()
});

const QuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export async function GET(request: Request) {
  const { profile } = await requireUserProfile();
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  const limit = parsed.success ? parsed.data.limit ?? 60 : 60;

  const supabase = createClient() as any;
  let query = supabase
    .from('notification_tasks')
    .select('id, notification_id, created_by_profile_id, assigned_to_profile_id, status, title, description, due_at, metadata, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (parsed.success && parsed.data.status) {
    query = query.eq('status', parsed.data.status);
  }

  if (!hasAdminAccess(profile.role)) {
    query = query.or(`assigned_to_profile_id.eq.${profile.id},created_by_profile_id.eq.${profile.id}`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error, 'notification_tasks')) {
      return NextResponse.json({ rows: [], compatibilityMode: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const { profile } = await requireUserProfile();
  if (!hasAdminAccess(profile.role) && !hasConsultantAccess(profile.role)) {
    return NextResponse.json({ error: 'Ruolo non autorizzato.' }, { status: 403 });
  }

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
  }

  const assignedToProfileId =
    hasAdminAccess(profile.role) && parsed.data.assignedToProfileId
      ? parsed.data.assignedToProfileId
      : profile.id;

  const supabase = createClient() as any;

  const { data, error } = await supabase
    .from('notification_tasks')
    .insert({
      notification_id: parsed.data.notificationId ?? null,
      created_by_profile_id: profile.id,
      assigned_to_profile_id: assignedToProfileId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      due_at: parsed.data.dueAt ?? null,
      metadata: {
        source: 'notification_timeline'
      }
    })
    .select('id, notification_id, created_by_profile_id, assigned_to_profile_id, status, title, description, due_at, metadata, created_at, updated_at')
    .single();

  if (error) {
    if (isMissingTable(error, 'notification_tasks')) {
      return NextResponse.json(
        { ok: false, compatibilityMode: true, error: 'Task notifiche non ancora attivi su questo ambiente.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
