import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logAdminAudit } from '@/lib/ops/audit';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  consultantId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const CreateSchema = z.object({
  companyId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  consultantId: z.string().uuid().optional(),
  entryType: z.enum(['client_payment', 'refund', 'consultant_payout', 'platform_fee', 'manual_adjustment']),
  direction: z.enum(['in', 'out']),
  amountCents: z.number().int().min(0),
  currency: z.string().trim().min(3).max(8).optional(),
  reference: z.string().trim().max(180).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(request: Request) {
  await requireOpsProfile();
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    companyId: url.searchParams.get('companyId') || undefined,
    consultantId: url.searchParams.get('consultantId') || undefined,
    applicationId: url.searchParams.get('applicationId') || undefined,
    limit: url.searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;
  let query = admin
    .from('practice_payment_ledger')
    .select('id, practice_payment_id, company_id, application_id, consultant_profile_id, entry_type, direction, amount_cents, currency, status, source, reference, occurred_at, metadata, created_at')
    .order('occurred_at', { ascending: false })
    .limit(parsed.data.limit ?? 300);

  if (parsed.data.companyId) query = query.eq('company_id', parsed.data.companyId);
  if (parsed.data.consultantId) query = query.eq('consultant_profile_id', parsed.data.consultantId);
  if (parsed.data.applicationId) query = query.eq('application_id', parsed.data.applicationId);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error, 'practice_payment_ledger')) {
      return NextResponse.json({
        rows: [],
        notice: 'Registro movimenti avanzato non ancora attivo su questo ambiente.',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], notice: null });
}

export async function POST(request: Request) {
  const { profile } = await requireOpsProfile();
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;
  const payload = parsed.data;
  const { data, error } = await admin
    .from('practice_payment_ledger')
    .insert({
      company_id: payload.companyId ?? null,
      application_id: payload.applicationId ?? null,
      consultant_profile_id: payload.consultantId ?? null,
      entry_type: payload.entryType,
      direction: payload.direction,
      amount_cents: payload.amountCents,
      currency: (payload.currency ?? 'eur').toLowerCase(),
      status: 'posted',
      source: 'admin',
      reference: payload.reference ?? null,
      metadata: payload.notes ? { notes: payload.notes } : {},
      created_by_profile_id: profile.id,
      occurred_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingTable(error, 'practice_payment_ledger')) {
      return NextResponse.json(
        { error: 'Registro movimenti non ancora attivo. Completa la migrazione database e riprova.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAudit({
    actionType: 'ledger.manual_entry.create',
    actorProfileId: profile.id,
    actorRole: profile.role,
    targetType: 'practice_payment_ledger',
    targetId: data.id,
    companyId: payload.companyId ?? null,
    applicationId: payload.applicationId ?? null,
    details: {
      entryType: payload.entryType,
      direction: payload.direction,
      amountCents: payload.amountCents,
      consultantId: payload.consultantId ?? null,
    },
  });

  return NextResponse.json({ ok: true, row: data });
}
