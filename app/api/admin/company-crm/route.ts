import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const QuerySchema = z.object({
  companyId: z.string().uuid()
});

const BodySchema = z.object({
  companyId: z.string().uuid(),
  priority: z.enum(['bassa', 'media', 'alta']).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(30).optional(),
  admin_notes: z.string().max(5000).optional(),
  admin_fields: z.record(z.string().max(200)).optional(),
  next_action_at: z.string().trim().max(10).nullable().optional() // YYYY-MM-DD
});

function toTimestamptzDateOnly(value: string | null | undefined) {
  if (!value) return null;
  // Store as date-only in UTC to keep it stable across time zones.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T00:00:00.000Z`;
}

export async function GET(request: Request) {
  await requireOpsProfile();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ companyId: url.searchParams.get('companyId') });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('company_crm')
    .select('priority, tags, admin_notes, admin_fields, next_action_at')
    .eq('company_id', parsed.data.companyId)
    .maybeSingle();

  if (error) {
    // Friendly message when table isn't deployed yet.
    if ((error as { code?: string })?.code === '42P01') {
      return NextResponse.json(
        { error: "Tabella CRM mancante su Supabase. Applica l'update schema (company_crm) e riprova." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextAction = data?.next_action_at ? new Date(data.next_action_at).toISOString().slice(0, 10) : null;
  return NextResponse.json({
    data: data
      ? {
          priority: data.priority ?? null,
          tags: data.tags ?? [],
          admin_notes: data.admin_notes ?? '',
          admin_fields: (data.admin_fields ?? {}) as Record<string, string>,
          next_action_at: nextAction
        }
      : null
  });
}

export async function POST(request: Request) {
  await requireOpsProfile();

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });

  const supabaseAdmin = getSupabaseAdmin();
  // Merge admin_fields to avoid overwriting keys that were not provided.
  const { data: existing } = await supabaseAdmin
    .from('company_crm')
    .select('admin_fields')
    .eq('company_id', body.data.companyId)
    .maybeSingle();

  const mergedAdminFields = {
    ...((existing?.admin_fields ?? {}) as Record<string, string>),
    ...(body.data.admin_fields ?? {})
  };

  const row = {
    company_id: body.data.companyId,
    priority: body.data.priority ?? null,
    tags: body.data.tags ?? [],
    admin_notes: body.data.admin_notes ?? '',
    admin_fields: mergedAdminFields,
    next_action_at: toTimestamptzDateOnly(body.data.next_action_at ?? null),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseAdmin.from('company_crm').upsert(row, { onConflict: 'company_id' });
  if (error) {
    if ((error as { code?: string })?.code === '42P01') {
      return NextResponse.json(
        { error: "Tabella CRM mancante su Supabase. Applica l'update schema (company_crm) e riprova." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
