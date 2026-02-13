import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BodySchema = z.object({
  companyId: z.string().uuid(),
  company: z.object({
    name: z.string().trim().min(1).max(160),
    vat_number: z.string().trim().max(40).nullable(),
    industry: z.string().trim().max(120).nullable(),
    annual_spend_target: z.number().nullable()
  }),
  profile: z
    .object({
      id: z.string().uuid(),
      full_name: z.string().trim().min(1).max(120),
      username: z.string().trim().min(2).max(60)
    })
    .nullable()
});

export async function POST(request: Request) {
  await requireOpsProfile();

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });

  const supabaseAdmin = getSupabaseAdmin();

  const { error: companyErr } = await supabaseAdmin
    .from('companies')
    .update({
      name: body.data.company.name,
      vat_number: body.data.company.vat_number,
      industry: body.data.company.industry,
      annual_spend_target: body.data.company.annual_spend_target
    })
    .eq('id', body.data.companyId);

  if (companyErr) return NextResponse.json({ error: companyErr.message }, { status: 500 });

  if (body.data.profile) {
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: body.data.profile.full_name,
        username: body.data.profile.username
      })
      .eq('id', body.data.profile.id)
      .eq('company_id', body.data.companyId);

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

