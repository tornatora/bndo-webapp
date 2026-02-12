import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const PersonalSchema = z.object({
  section: z.literal('personal'),
  fullName: z.string().trim().min(2).max(120),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username non valido. Usa solo lettere, numeri, punto, trattino o underscore.')
});

const BillingSchema = z.object({
  section: z.literal('billing'),
  billingType: z.enum(['company', 'individual']).default('company'),
  companyName: z.string().trim().min(2).max(160),
  vatNumber: z.string().trim().max(40).optional(),
  taxCode: z.string().trim().max(40).optional(),
  industry: z.string().trim().max(120).optional(),
  annualSpendTarget: z.number().min(0).max(1_000_000_000).nullable().optional()
});

const PayloadSchema = z.union([PersonalSchema, BillingSchema]);

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return error('Sessione non valida.', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = PayloadSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? 'Dati non validi.');
  }

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, company_id, username')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return error('Profilo non trovato.', 404);
  }

  if (parsed.data.section === 'personal') {
    const username = parsed.data.username.toLowerCase();

    if (username !== profile.username) {
      const { data: duplicateUser } = await admin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', user.id)
        .maybeSingle();

      if (duplicateUser) {
        return error('Username gia in uso da un altro account.', 409);
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: parsed.data.fullName,
        username
      })
      .eq('id', user.id);

    if (updateError) {
      return error('Impossibile aggiornare i dati account.', 500);
    }

    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: parsed.data.fullName,
        username
      }
    });

    return NextResponse.json({ success: true });
  }

  if (!profile.company_id) {
    return error('Profilo non associato ad alcuna azienda.', 400);
  }

  const { error: companyError } = await admin
    .from('companies')
    .update({
      name: parsed.data.companyName,
      vat_number:
        parsed.data.billingType === 'company'
          ? parsed.data.vatNumber?.trim() || null
          : parsed.data.taxCode?.trim() || null,
      industry: parsed.data.industry?.trim() || null,
      annual_spend_target: parsed.data.annualSpendTarget ?? null
    })
    .eq('id', profile.company_id);

  if (companyError) {
    return error('Impossibile aggiornare i dati fatturazione.', 500);
  }

  return NextResponse.json({ success: true });
}
