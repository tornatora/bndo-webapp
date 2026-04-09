import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const BillingProfileSchema = z.object({
  payoutMethod: z.enum(['bank_transfer', 'paypal', 'other']),
  accountHolder: z.string().trim().min(2).max(160),
  iban: z.string().trim().max(64).optional().nullable(),
  taxCode: z.string().trim().max(32).optional().nullable(),
  vatNumber: z.string().trim().max(32).optional().nullable(),
  paypalEmail: z.string().trim().email().max(200).optional().nullable(),
  billingAddress: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(600).optional().nullable()
});

function sanitizeProfile(input: z.infer<typeof BillingProfileSchema>) {
  return {
    payoutMethod: input.payoutMethod,
    accountHolder: input.accountHolder,
    iban: input.iban?.trim() || null,
    taxCode: input.taxCode?.trim() || null,
    vatNumber: input.vatNumber?.trim() || null,
    paypalEmail: input.paypalEmail?.trim() || null,
    billingAddress: input.billingAddress?.trim() || null,
    notes: input.notes?.trim() || null
  };
}

function readBillingProfileFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).billingProfile;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = BillingProfileSchema.safeParse(raw);
  if (!parsed.success) return null;
  return sanitizeProfile(parsed.data);
}

export async function GET() {
  const { profile } = await requireOpsOrConsultantProfile();
  const admin = getSupabaseAdmin() as any;

  const { data, error } = await admin
    .from('platform_events')
    .select('id, metadata, created_at')
    .eq('event_type', 'consultant_billing_profile_updated')
    .eq('actor_profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const billingProfile = data ? readBillingProfileFromMetadata(data.metadata) : null;

  return NextResponse.json({
    ok: true,
    data: billingProfile,
    updatedAt: data?.created_at ?? null
  });
}

export async function POST(request: Request) {
  const { profile } = await requireOpsOrConsultantProfile();
  const payload = BillingProfileSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: 'Dati fatturazione non validi.' }, { status: 422 });
  }

  const billingProfile = sanitizeProfile(payload.data);

  const admin = getSupabaseAdmin() as any;
  const { error } = await admin.from('platform_events').insert({
    event_type: 'consultant_billing_profile_updated',
    actor_profile_id: profile.id,
    actor_role: profile.role,
    channel: 'consultant',
    metadata: {
      billingProfile,
      updatedAt: new Date().toISOString()
    }
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: billingProfile });
}
