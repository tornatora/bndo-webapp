import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

const QuerySchema = z.object({
  actionType: z.string().trim().max(120).optional(),
  companyId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export async function GET(request: Request) {
  await requireOpsProfile();
  const parsed = QuerySchema.safeParse({
    actionType: new URL(request.url).searchParams.get('actionType') || undefined,
    companyId: new URL(request.url).searchParams.get('companyId') || undefined,
    applicationId: new URL(request.url).searchParams.get('applicationId') || undefined,
    limit: new URL(request.url).searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const admin = getSupabaseAdmin() as any;
  let query = admin
    .from('admin_audit_logs')
    .select('id, action_type, actor_profile_id, actor_role, target_type, target_id, company_id, application_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit ?? 250);

  if (parsed.data.actionType) query = query.eq('action_type', parsed.data.actionType);
  if (parsed.data.companyId) query = query.eq('company_id', parsed.data.companyId);
  if (parsed.data.applicationId) query = query.eq('application_id', parsed.data.applicationId);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error, 'admin_audit_logs')) {
      return NextResponse.json({
        rows: [],
        notice: 'Registro audit non ancora attivo su questo ambiente.',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [], notice: null });
}
