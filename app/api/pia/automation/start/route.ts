import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createJob } from '@/lib/pia/jobStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  applicationId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const payload = PayloadSchema.parse(await request.json());
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

    // Solo ops_admin o consultant possono avviare automazioni
    const role = String((profile as any).role || '').toLowerCase();
    if (role !== 'ops_admin' && role !== 'consultant') {
      return NextResponse.json({ error: 'Solo operatori possono avviare automazioni.' }, { status: 403 });
    }

    // Verifica che la pratica esista e sia in uno stato avviabile
    const { data: app } = await supabase
      .from('tender_applications')
      .select('id, company_id, status')
      .eq('id', payload.applicationId)
      .maybeSingle();

    if (!app) {
      return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
    }

    const appStatus = String((app as any).status ?? '');
    if (appStatus !== 'active' && appStatus !== 'in_progress' && appStatus !== 'draft') {
      return NextResponse.json({ error: `Pratica in stato ${appStatus}: non puoi avviare automazione.` }, { status: 400 });
    }

    // Controlla se esiste già un job attivo per questa pratica
    const admin = getSupabaseAdmin() as any;
    const { data: existingJobs } = await admin
      .from('pia_automation_jobs')
      .select('id, status')
      .eq('application_id', payload.applicationId)
      .in('status', ['queued', 'running', 'waiting_user']);

    if (existingJobs && (existingJobs as Array<any>).length > 0) {
      const arr = existingJobs as Array<any>;
      return NextResponse.json({
        error: 'Esiste già un automazione attiva per questa pratica.',
        existingJobId: arr[0].id,
      }, { status: 409 });
    }

    // Crea job via Storage-based store
    const jobRow = await createJob(admin, {
      applicationId: payload.applicationId,
      createdBy: user.id,
      browserbaseSessionId: '',
      status: 'queued',
      phase: 'bootstrap',
      progress: { percent: 0, lastMessage: 'Job creato. In attesa del worker…' },
    });

    return NextResponse.json({
      jobId: jobRow.id,
      status: jobRow.status,
      phase: jobRow.phase,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    console.error('[PIA_AUTOMATION_START]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
