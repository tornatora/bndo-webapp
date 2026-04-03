import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const CONSULTANT_SHARE = 0.65;
export const PLATFORM_SHARE = 0.35;

export function splitCommission(amountCents: number) {
  const consultantShareCents = Math.round(amountCents * CONSULTANT_SHARE);
  const platformShareCents = Math.max(0, amountCents - consultantShareCents);
  return { consultantShareCents, platformShareCents };
}

export async function syncLedgerFromPracticePayments() {
  const admin = getSupabaseAdmin() as any;
  const { data: paidRows, error } = await admin
    .from('practice_payments')
    .select('id, company_id, application_id, amount_cents, currency, paid_at, status')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const paymentIds = (paidRows ?? []).map((row: any) => row.id as string);
  if (paymentIds.length === 0) return;

  const { data: existingRows } = await admin
    .from('practice_payment_ledger')
    .select('practice_payment_id')
    .in('practice_payment_id', paymentIds)
    .eq('entry_type', 'client_payment');
  const existingSet = new Set<string>((existingRows ?? []).map((row: any) => String(row.practice_payment_id)));

  const applicationIds = Array.from(
    new Set(
      (paidRows ?? [])
        .map((row: any) => row.application_id as string | null)
        .filter((id: string | null): id is string => Boolean(id)),
    ),
  );

  const assignmentByApplication = new Map<string, string>();
  if (applicationIds.length > 0) {
    const { data: assignments } = await admin
      .from('consultant_practice_assignments')
      .select('application_id, consultant_profile_id, status')
      .in('application_id', applicationIds)
      .eq('status', 'active');
    for (const row of assignments ?? []) {
      assignmentByApplication.set(String(row.application_id), String(row.consultant_profile_id));
    }
  }

  const toInsert = (paidRows ?? [])
    .filter((row: any) => !existingSet.has(String(row.id)))
    .map((row: any) => ({
      practice_payment_id: row.id,
      company_id: row.company_id ?? null,
      application_id: row.application_id ?? null,
      consultant_profile_id: row.application_id ? assignmentByApplication.get(String(row.application_id)) ?? null : null,
      entry_type: 'client_payment',
      direction: 'in',
      amount_cents: row.amount_cents,
      currency: row.currency ?? 'eur',
      status: 'posted',
      source: 'stripe',
      occurred_at: row.paid_at ?? new Date().toISOString(),
      metadata: {},
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await admin.from('practice_payment_ledger').insert(toInsert);
    if (insertError) throw new Error(insertError.message);
  }
}

