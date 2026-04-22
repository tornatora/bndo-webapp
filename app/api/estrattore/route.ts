import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const saveSchema = z.object({
  user_id: z.string().uuid(),
  extracted_data: z.record(z.any()),
  custom_fields: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});

export async function POST(req: Request) {
  try {
    const rate = checkRateLimit(req, { keyPrefix: 'estrattore_save', windowMs: 60_000, max: 20 });
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra qualche secondo.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
      );
    }

    const user = await requireUser();
    const body = await req.json();
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 400 });
    }

    // Ensure user can only save for themselves
    if (parsed.data.user_id !== user.id) {
      return NextResponse.json({ error: 'Non autorizzato.' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('estrattore_extractions')
      .insert({
        user_id: parsed.data.user_id,
        original_filename: parsed.data.extracted_data?.original_filename ?? null,
        extracted_data: parsed.data.extracted_data ?? {},
        custom_fields: parsed.data.custom_fields ?? [],
        status: 'completed',
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore durante il salvataggio.' },
      { status: 500 }
    );
  }
}
