import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const FormDataSchema = z.object({
  applicationId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = FormDataSchema.parse(body);
    const formData = body.formData;
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Devi essere autenticato.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    // Verify the application belongs to this user's company
    const { data: application } = await admin
      .from('tender_applications')
      .select('id, status')
      .eq('id', payload.applicationId)
      .eq('company_id', profile.company_id)
      .maybeSingle();

    if (!application) {
      return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
    }

    if (!formData || typeof formData !== 'object') {
      return NextResponse.json({ error: 'Dati form non validi.' }, { status: 422 });
    }

    // Save all form data as JSONB snapshot
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('pia_submissions')
      .update({
        status: 'submitted',
        form_data: formData,
        completed_at: now,
      })
      .eq('application_id', payload.applicationId);

    if (updateError) {
      return NextResponse.json(
        { error: `Errore salvataggio form: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Update tender_application status
    await admin
      .from('tender_applications')
      .update({
        status: 'submitted',
        notes: `Pratica PIA completata il ${new Date().toLocaleString('it-IT')}. In attesa di revisione admin.`,
      })
      .eq('id', payload.applicationId);

    // Send notification to admin
    try {
      const { data: adminProfiles } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'ops_admin');

      if (adminProfiles) {
        for (const adminProfile of adminProfiles) {
          await admin.from('notification_inbox').insert({
            recipient_profile_id: adminProfile.id,
            recipient_role: 'ops_admin',
            event_type: 'pia_submission',
            event_group: 'pratiche',
            priority: 'high',
            title: 'Nuova pratica PIA completata',
            body: `Un utente ha completato il questionario PIA. Vedi i dettagli.`,
            entity_type: 'tender_application',
            entity_id: payload.applicationId,
            company_id: profile.company_id,
            application_id: payload.applicationId,
            action_path: `/admin/practices/${payload.applicationId}`,
          });
        }
      }
    } catch {
      // Non-blocking notification
    }

    return NextResponse.json({ ok: true, applicationId: payload.applicationId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore durante il salvataggio.' },
      { status: 500 }
    );
  }
}
