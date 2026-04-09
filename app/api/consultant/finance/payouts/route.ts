import { NextResponse } from 'next/server';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

export const runtime = 'nodejs';

export async function GET() {
  const { profile } = await requireOpsOrConsultantProfile();
  const admin = getSupabaseAdmin() as any;

  const consultantId = profile.id;

  const [payoutsRes, ledgerRes] = await Promise.all([
    admin
      .from('consultant_payouts')
      .select(
        'id, consultant_profile_id, period_start, period_end, gross_amount_cents, consultant_share_cents, platform_share_cents, status, approved_at, paid_at, payment_reference, notes, created_at'
      )
      .eq('consultant_profile_id', consultantId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('practice_payment_ledger')
      .select('id, entry_type, amount_cents, status, occurred_at')
      .eq('consultant_profile_id', consultantId)
      .eq('entry_type', 'client_payment')
      .order('occurred_at', { ascending: false })
      .limit(300)
  ]);

  if (payoutsRes.error && !isMissingTable(payoutsRes.error, 'consultant_payouts')) {
    return NextResponse.json({ error: payoutsRes.error.message }, { status: 500 });
  }
  if (ledgerRes.error && !isMissingTable(ledgerRes.error, 'practice_payment_ledger')) {
    return NextResponse.json({ error: ledgerRes.error.message }, { status: 500 });
  }

  const payouts = payoutsRes.error ? [] : payoutsRes.data ?? [];
  const ledger = ledgerRes.error ? [] : ledgerRes.data ?? [];
  const maturedCents = ledger
    .filter((row: any) => row.status === 'posted')
    .reduce((sum: number, row: any) => sum + Math.round(Number(row.amount_cents ?? 0) * 0.65), 0);
  const paidCents = payouts
    .filter((row: any) => row.status === 'paid')
    .reduce((sum: number, row: any) => sum + Number(row.consultant_share_cents ?? 0), 0);
  const pendingCents = Math.max(0, maturedCents - paidCents);

  const notices: string[] = [];
  if (payoutsRes.error) {
    notices.push('Storico payout non disponibile su questo ambiente.');
  }
  if (ledgerRes.error) {
    notices.push('Calcolo maturato in modalità base su questo ambiente.');
  }

  return NextResponse.json({
    ok: true,
    totals: {
      maturedCents,
      paidCents,
      pendingCents
    },
    payouts,
    notice: notices.length > 0 ? notices.join(' ') : null
  });
}
