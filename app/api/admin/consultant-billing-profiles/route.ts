import { NextResponse } from 'next/server';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type BillingProfile = {
  payoutMethod: 'bank_transfer' | 'paypal' | 'other';
  accountHolder: string;
  iban: string | null;
  taxCode: string | null;
  vatNumber: string | null;
  paypalEmail: string | null;
  billingAddress: string | null;
  notes: string | null;
};

function readBillingProfile(metadata: unknown): BillingProfile | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).billingProfile;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const payoutMethod = String((raw as Record<string, unknown>).payoutMethod ?? '');
  const accountHolder = String((raw as Record<string, unknown>).accountHolder ?? '').trim();
  if (!['bank_transfer', 'paypal', 'other'].includes(payoutMethod) || !accountHolder) return null;
  return {
    payoutMethod: payoutMethod as BillingProfile['payoutMethod'],
    accountHolder,
    iban: typeof (raw as Record<string, unknown>).iban === 'string' ? ((raw as Record<string, unknown>).iban as string) : null,
    taxCode:
      typeof (raw as Record<string, unknown>).taxCode === 'string'
        ? ((raw as Record<string, unknown>).taxCode as string)
        : null,
    vatNumber:
      typeof (raw as Record<string, unknown>).vatNumber === 'string'
        ? ((raw as Record<string, unknown>).vatNumber as string)
        : null,
    paypalEmail:
      typeof (raw as Record<string, unknown>).paypalEmail === 'string'
        ? ((raw as Record<string, unknown>).paypalEmail as string)
        : null,
    billingAddress:
      typeof (raw as Record<string, unknown>).billingAddress === 'string'
        ? ((raw as Record<string, unknown>).billingAddress as string)
        : null,
    notes: typeof (raw as Record<string, unknown>).notes === 'string' ? ((raw as Record<string, unknown>).notes as string) : null
  };
}

export async function GET() {
  await requireOpsProfile();
  const admin = getSupabaseAdmin() as any;

  const [{ data: consultants, error: consultantsError }, { data: events, error: eventsError }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'consultant')
      .order('full_name', { ascending: true }),
    admin
      .from('platform_events')
      .select('id, actor_profile_id, metadata, created_at')
      .eq('event_type', 'consultant_billing_profile_updated')
      .order('created_at', { ascending: false })
      .limit(1500)
  ]);

  if (consultantsError) return NextResponse.json({ error: consultantsError.message }, { status: 500 });
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const latestProfileByConsultant = new Map<string, { profile: BillingProfile; updatedAt: string }>();
  for (const event of events ?? []) {
    const consultantId = String((event as any).actor_profile_id ?? '');
    if (!consultantId || latestProfileByConsultant.has(consultantId)) continue;
    const billing = readBillingProfile((event as any).metadata);
    if (!billing) continue;
    latestProfileByConsultant.set(consultantId, {
      profile: billing,
      updatedAt: String((event as any).created_at ?? '')
    });
  }

  const rows = (consultants ?? []).map((consultant: any) => {
    const latest = latestProfileByConsultant.get(String(consultant.id));
    return {
      consultantId: String(consultant.id),
      fullName: String(consultant.full_name ?? 'Consulente'),
      email: String(consultant.email ?? ''),
      billingProfile: latest?.profile ?? null,
      updatedAt: latest?.updatedAt ?? null
    };
  });

  return NextResponse.json({ ok: true, rows });
}
