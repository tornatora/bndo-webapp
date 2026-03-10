import { NextResponse } from 'next/server';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/admin/quiz-submissions
 * Returns all quiz submissions, optionally filtered by bando_type.
 * Admin only.
 */
export async function GET(request: Request) {
  await requireOpsProfile();

  const url = new URL(request.url);
  const bandoType = url.searchParams.get('bando_type') || null; // 'sud' | 'centro_nord' | null
  const search = url.searchParams.get('search')?.trim().toLowerCase() || null;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from('quiz_submissions')
    .select('id, created_at, eligibility, bando_type, answers, region, phone, full_name, email')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (bandoType) {
    query = query.eq('bando_type', bandoType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let results = data ?? [];

  // Client-side search filter (name, email, phone)
  if (search) {
    results = results.filter((r) => {
      const name = (r.full_name || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const phone = (r.phone || '').toLowerCase();
      return name.includes(search) || email.includes(search) || phone.includes(search);
    });
  }

  // Split into eligible and not eligible
  const eligible = results.filter((r) => r.eligibility === 'eligible');
  const notEligible = results.filter((r) => r.eligibility !== 'eligible');

  return NextResponse.json({
    eligible,
    notEligible,
    total: results.length,
    totalEligible: eligible.length,
    totalNotEligible: notEligible.length,
  });
}
