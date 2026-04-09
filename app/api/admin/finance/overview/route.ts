import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { splitCommission, syncLedgerFromPracticePayments } from '@/lib/ops/finance';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(request: Request) {
  await requireOpsProfile();

  const parsed = QuerySchema.safeParse({
    days: new URL(request.url).searchParams.get('days') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const days = parsed.data.days ?? 30;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromIso = fromDate.toISOString();

  try {
    let ledgerAvailable = true;
    try {
      await syncLedgerFromPracticePayments();
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      if (
        isMissingTable(message, 'practice_payment_ledger') ||
        isMissingTable(message, 'practice_payments') ||
        isMissingTable(message, 'consultant_practice_assignments')
      ) {
        ledgerAvailable = false;
      } else {
        throw error;
      }
    }

    const admin = getSupabaseAdmin() as any;
    const [paymentsRes, ledgerRes, payoutsRes] = await Promise.all([
      admin
        .from('practice_payments')
        .select('id, company_id, application_id, grant_title, amount_cents, currency, status, paid_at, created_at')
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      admin
        .from('practice_payment_ledger')
        .select('id, company_id, application_id, consultant_profile_id, entry_type, direction, amount_cents, status, occurred_at')
        .gte('occurred_at', fromIso)
        .order('occurred_at', { ascending: false })
        .limit(2000),
      admin
        .from('consultant_payouts')
        .select('id, consultant_profile_id, status, consultant_share_cents, paid_at, created_at')
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    const paymentsMissing = Boolean(paymentsRes.error && isMissingTable(paymentsRes.error, 'practice_payments'));
    if (paymentsRes.error && !paymentsMissing) throw new Error(paymentsRes.error.message);
    if (ledgerRes.error && !isMissingTable(ledgerRes.error, 'practice_payment_ledger')) {
      throw new Error(ledgerRes.error.message);
    }
    if (payoutsRes.error && !isMissingTable(payoutsRes.error, 'consultant_payouts')) {
      throw new Error(payoutsRes.error.message);
    }

    const payments = paymentsMissing ? [] : paymentsRes.data ?? [];
    const ledger = ledgerRes.error ? [] : ledgerRes.data ?? [];
    const payouts = payoutsRes.error ? [] : payoutsRes.data ?? [];

    const totals = {
      paidCents: 0,
      pendingCents: 0,
      refundedCents: 0,
      failedCents: 0,
      todayCents: 0,
      weekCents: 0,
      monthCents: 0,
    };

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    for (const row of payments) {
      const cents = Number(row.amount_cents ?? 0);
      const status = String(row.status ?? '');
      if (status === 'paid') totals.paidCents += cents;
      if (status === 'pending') totals.pendingCents += cents;
      if (status === 'refunded') totals.refundedCents += cents;
      if (status === 'failed' || status === 'canceled') totals.failedCents += cents;

      const basisTs = new Date(row.paid_at ?? row.created_at ?? Date.now()).getTime();
      if (status === 'paid' && basisTs >= oneDayAgo) totals.todayCents += cents;
      if (status === 'paid' && basisTs >= oneWeekAgo) totals.weekCents += cents;
      if (status === 'paid' && basisTs >= oneMonthAgo) totals.monthCents += cents;
    }

    let grossPostedCents = 0;
    let consultantMaturedCents = 0;
    let platformMaturedCents = 0;
    for (const row of ledger) {
      if (row.status !== 'posted') continue;
      if (row.entry_type !== 'client_payment') continue;
      const cents = Number(row.amount_cents ?? 0);
      grossPostedCents += cents;
      const split = splitCommission(cents);
      consultantMaturedCents += split.consultantShareCents;
      platformMaturedCents += split.platformShareCents;
    }

    let consultantApprovedCents = 0;
    let consultantPaidCents = 0;
    for (const payout of payouts) {
      const cents = Number(payout.consultant_share_cents ?? 0);
      if (payout.status === 'approved') consultantApprovedCents += cents;
      if (payout.status === 'paid') consultantPaidCents += cents;
    }

    const statusBuckets = {
      pending: payments.filter((p: any) => p.status === 'pending').length,
      paid: payments.filter((p: any) => p.status === 'paid').length,
      failed: payments.filter((p: any) => p.status === 'failed').length,
      canceled: payments.filter((p: any) => p.status === 'canceled').length,
      refunded: payments.filter((p: any) => p.status === 'refunded').length,
    };

    return NextResponse.json({
      ok: true,
      windowDays: days,
      notice:
        !ledgerAvailable || Boolean(ledgerRes.error) || Boolean(payoutsRes.error) || paymentsMissing
          ? 'Controllo finanza attivo in modalità base: alcune tabelle finance non sono ancora allineate su questo ambiente.'
          : null,
      totals,
      statusBuckets,
      commissions: {
        grossPostedCents,
        consultantMaturedCents,
        platformMaturedCents,
        consultantApprovedCents,
        consultantPaidCents,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Errore overview finanza.' }, { status: 500 });
  }
}
