import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getJob } from '@/lib/pia/jobStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ jobId: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const { jobId } = await params;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Devi essere autenticato.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profilo non trovato.' }, { status: 404 });
    }

    const admin = getSupabaseAdmin() as any;
    const job = await getJob(admin, jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job non trovato.' }, { status: 404 });
    }

    // Verifica accesso: ops/consultant vedono tutto, utenti normali solo proprie pratiche
    const role = String((profile as any).role || '').toLowerCase();
    if (role !== 'ops_admin' && role !== 'consultant') {
      const companyId = (profile as any).company_id;
      const { data: app } = await supabase
        .from('tender_applications')
        .select('id')
        .eq('id', job.application_id)
        .eq('company_id', companyId)
        .maybeSingle();
      if (!app) {
        return NextResponse.json({ error: 'Accesso negato.' }, { status: 403 });
      }
    }

    return NextResponse.json({
      id: job.id,
      applicationId: job.application_id,
      status: job.status,
      phase: job.phase,
      cursor: job.cursor,
      progress: job.progress,
      error: job.error,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    console.error('[PIA_JOB_STATUS]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
