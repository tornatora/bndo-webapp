import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { splitCommission } from '@/lib/ops/finance';
import { logAdminAudit } from '@/lib/ops/audit';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'paid', 'rejected']).optional(),
  consultantId: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  consultantProfileId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(1000).optional(),
});

const UpdateSchema = z.object({
  payoutId: z.string().uuid(),
  status: z.enum(['approved', 'paid', 'rejected']),
  paymentReference: z.string().trim().max(180).optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  await requireOpsProfile();
  const parsed = QuerySchema.safeParse({
    status: new URL(request.url).searchParams.get('status') || undefined,
    consultantId: new URL(request.url).searchParams.get('consultantId') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;
  let query = admin
    .from('consultant_payouts')
    .select('id, consultant_profile_id, period_start, period_end, gross_amount_cents, consultant_share_cents, platform_share_cents, status, approved_by_profile_id, approved_at, paid_at, payment_reference, notes, created_at');
  if (parsed.data.status) query = query.eq('status', parsed.data.status);
  if (parsed.data.consultantId) query = query.eq('consultant_profile_id', parsed.data.consultantId);
  query = query.order('created_at', { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error, 'consultant_payouts')) {
      return NextResponse.json({
        rows: [],
        notice: 'Payout consulenti non ancora attivi su questo ambiente.',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [], notice: null });
}

export async function POST(request: Request) {
  const { profile } = await requireOpsProfile();
  const payload = await request.json().catch(() => null);

  if (payload && typeof payload === 'object' && 'payoutId' in payload) {
    const parsedUpdate = UpdateSchema.safeParse(payload);
    if (!parsedUpdate.success) return NextResponse.json({ error: 'Payload update non valido.' }, { status: 422 });
    const admin = getSupabaseAdmin() as any;
    const updateData: Record<string, unknown> = {
      status: parsedUpdate.data.status,
      notes: parsedUpdate.data.note ?? null,
      payment_reference: parsedUpdate.data.paymentReference ?? null,
    };
    if (parsedUpdate.data.status === 'approved') {
      updateData.approved_by_profile_id = profile.id;
      updateData.approved_at = new Date().toISOString();
    }
    if (parsedUpdate.data.status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }
    const { data, error } = await admin
      .from('consultant_payouts')
      .update(updateData)
      .eq('id', parsedUpdate.data.payoutId)
      .select('*')
      .single();
    if (error) {
      if (isMissingTable(error, 'consultant_payouts')) {
        return NextResponse.json(
          { error: 'Payout consulenti non ancora attivi. Completa la migrazione database e riprova.' },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAudit({
      actionType: 'payout.status.update',
      actorProfileId: profile.id,
      actorRole: profile.role,
      targetType: 'consultant_payout',
      targetId: parsedUpdate.data.payoutId,
      details: {
        status: parsedUpdate.data.status,
      },
    });

    if (parsedUpdate.data.status === 'approved' || parsedUpdate.data.status === 'paid') {
      void emitNotificationEvent({
        eventType: parsedUpdate.data.status === 'approved' ? 'payout_approved' : 'payout_paid',
        actorProfileId: profile.id,
        actorRole: profile.role as 'ops_admin',
        consultantProfileId: data.consultant_profile_id ?? null,
        amountCents: Number(data.consultant_share_cents ?? 0),
        currency: 'EUR',
        practiceTitle: `Periodo ${String(data.period_start ?? '')} - ${String(data.period_end ?? '')}`,
        payoutId: data.id,
        metadata: {
          payoutId: data.id,
          status: parsedUpdate.data.status,
          paymentReference: parsedUpdate.data.paymentReference ?? null
        }
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, row: data });
  }

  const parsed = CreateSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Payload creazione non valido.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;
  const { data: entries, error: ledgerError } = await admin
    .from('practice_payment_ledger')
    .select('id, amount_cents, occurred_at')
    .eq('consultant_profile_id', parsed.data.consultantProfileId)
    .eq('entry_type', 'client_payment')
    .eq('status', 'posted')
    .gte('occurred_at', `${parsed.data.periodStart}T00:00:00.000Z`)
    .lte('occurred_at', `${parsed.data.periodEnd}T23:59:59.999Z`);

  if (ledgerError) {
    if (isMissingTable(ledgerError, 'practice_payment_ledger')) {
      return NextResponse.json(
        { error: 'Registro movimenti non ancora attivo. Completa la migrazione database e riprova.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }
  const grossAmountCents = (entries ?? []).reduce((acc: number, row: any) => acc + Number(row.amount_cents ?? 0), 0);
  const split = splitCommission(grossAmountCents);

  const { data, error } = await admin
    .from('consultant_payouts')
    .insert({
      consultant_profile_id: parsed.data.consultantProfileId,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      gross_amount_cents: grossAmountCents,
      consultant_share_cents: split.consultantShareCents,
      platform_share_cents: split.platformShareCents,
      notes: parsed.data.note ?? null,
      metadata: {
        sourceLedgerEntries: (entries ?? []).map((e: any) => e.id),
      },
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingTable(error, 'consultant_payouts')) {
      return NextResponse.json(
        { error: 'Payout consulenti non ancora attivi. Completa la migrazione database e riprova.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAudit({
    actionType: 'payout.created',
    actorProfileId: profile.id,
    actorRole: profile.role,
    targetType: 'consultant_payout',
    targetId: data.id,
    details: {
      consultantProfileId: parsed.data.consultantProfileId,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      grossAmountCents,
      consultantShareCents: split.consultantShareCents,
      platformShareCents: split.platformShareCents,
    },
  });

  void emitNotificationEvent({
    eventType: 'payout_created',
    actorProfileId: profile.id,
    actorRole: profile.role as 'ops_admin',
    consultantProfileId: parsed.data.consultantProfileId,
    amountCents: split.consultantShareCents,
    currency: 'EUR',
    practiceTitle: `Periodo ${parsed.data.periodStart} - ${parsed.data.periodEnd}`,
    payoutId: data.id,
    metadata: {
      payoutId: data.id,
      grossAmountCents,
      consultantShareCents: split.consultantShareCents,
      platformShareCents: split.platformShareCents
    }
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, row: data });
}
