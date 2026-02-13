import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const QuerySchema = z.object({
  companyId: z.string().uuid()
});

const BillingSchema = z.object({
  payments: z.record(z.object({ total: z.number(), paid: z.number() })),
  invoices: z.array(
    z.object({
      id: z.string(),
      applicationId: z.string().uuid().nullable(),
      fileName: z.string(),
      createdAt: z.string(),
      url: z.string().nullable()
    })
  )
});

const BodySchema = z.object({
  companyId: z.string().uuid(),
  billing: BillingSchema
});

function extractBilling(adminFields: Record<string, unknown>) {
  const b = adminFields?.billing;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const parsed = BillingSchema.safeParse(b);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request) {
  await requireOpsProfile();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ companyId: url.searchParams.get('companyId') });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('company_crm')
    .select('admin_fields')
    .eq('company_id', parsed.data.companyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const adminFields = (data?.admin_fields ?? {}) as Record<string, unknown>;
  const billing = extractBilling(adminFields);
  return NextResponse.json({ data: billing ?? null });
}

export async function POST(request: Request) {
  await requireOpsProfile();

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('company_crm')
    .select('admin_fields')
    .eq('company_id', body.data.companyId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const current = ((existing?.admin_fields ?? {}) as Record<string, unknown>) ?? {};
  const merged = { ...current, billing: body.data.billing };

  const { error } = await supabaseAdmin.from('company_crm').upsert(
    {
      company_id: body.data.companyId,
      admin_fields: merged,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'company_id' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

