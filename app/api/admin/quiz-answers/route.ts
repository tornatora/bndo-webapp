import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const QuerySchema = z.object({
  email: z.string().trim().email().max(160),
  bando: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord'])
});

function toQuizBandoType(bando: 'resto_sud_2_0' | 'autoimpiego_centro_nord') {
  return bando === 'resto_sud_2_0' ? 'sud' : 'centro_nord';
}

export async function GET(request: Request) {
  await requireOpsProfile();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    email: url.searchParams.get('email'),
    bando: url.searchParams.get('bando')
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const email = parsed.data.email.toLowerCase();
  const bandoType = toQuizBandoType(parsed.data.bando);

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('quiz_submissions')
    .select('created_at, eligibility, bando_type, answers, region, phone, full_name')
    .eq('email', email)
    .eq('bando_type', bandoType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? null });
}

