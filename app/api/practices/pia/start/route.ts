import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const PayloadSchema = z.object({
  bandoType: z.enum(['resto-al-sud-2-0', 'autoimpiego-centro-nord']),
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
      .select('id, company_id, username, full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profilo non trovato.' }, { status: 404 });
    }

    if (!profile.company_id) {
      return NextResponse.json({ error: 'Nessuna azienda associata al profilo.' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    // Create a NEW tender for each practice (so multiple practices per bando are allowed)
    const bandoSlug = payload.bandoType === 'resto-al-sud-2-0' ? 'resto-al-sud-2-0' : 'autoimpiego-centro-nord';
    const uniqueSuffix = Date.now().toString(36);
    const bandoExternalId = `${payload.bandoType === 'resto-al-sud-2-0' ? 'resto-al-sud-2-0-pia' : 'autoimpiego-centro-nord-pia'}-${uniqueSuffix}`;
    const bandoTitle = payload.bandoType === 'resto-al-sud-2-0' ? 'Resto al Sud 2.0' : 'Autoimpiego Centro Nord';

    const { data: newTender, error: tenderError } = await admin
      .from('tenders')
      .insert({
        title: bandoTitle,
        authority_name: 'Invitalia',
        deadline_at: '2026-12-31T23:59:59.000Z',
        summary: `Pratica assistita BNDO per ${bandoTitle}`,
        external_grant_id: bandoExternalId,
        grant_slug: bandoSlug,
        metadata: { pia: true, bandoType: payload.bandoType },
      })
      .select('id')
      .single();

    if (tenderError || !newTender) {
      return NextResponse.json(
        { error: `Impossibile creare il bando: ${tenderError?.message ?? 'errore sconosciuto'}` },
        { status: 500 }
      );
    }
    const tender = newTender;

    // Ensure tender match exists
    await admin
      .from('tender_matches')
      .upsert(
        { company_id: profile.company_id, tender_id: tender.id, relevance_score: 1, status: 'participating' },
        { onConflict: 'company_id,tender_id' }
      );

    // Always create a new application — users can have multiple practices
    let applicationId: string;
    {
      const { data: newApp, error: appError } = await admin
        .from('tender_applications')
        .insert({
          company_id: profile.company_id,
          tender_id: tender.id,
          status: 'draft',
          supplier_registry_status: 'pending',
          notes: `Pratica PIA avviata per ${bandoTitle}`,
          bando_type: payload.bandoType,
        })
        .select('id')
        .single() as unknown as { data: { id: string } | null; error: any };

      if (appError || !newApp) {
        return NextResponse.json(
          { error: `Impossibile creare la pratica: ${appError?.message ?? 'errore sconosciuto'}` },
          { status: 500 }
        );
      }
      applicationId = newApp.id;
    }

    // Set up document requirements for the 4 PIA documents
    const piaDocs = [
      { key: 'documento_identita', label: 'Documento Identità', required: true },
      { key: 'visura_camerale', label: 'Visura Camerale / P.IVA', required: true },
      { key: 'did', label: 'DID - Dichiarazione Disponibilità', required: true },
      { key: 'curriculum_vitae', label: 'Curriculum Vitae', required: false },
    ];

    await admin.from('practice_document_requirements').upsert(
      piaDocs.map((doc) => ({
        application_id: applicationId,
        tender_id: tender.id,
        requirement_key: doc.key,
        label: doc.label,
        description: null,
        is_required: doc.required,
        status: 'missing' as const,
        source_channel: 'direct' as const,
        metadata: { category: 'pia_document' },
      })),
      { onConflict: 'application_id,requirement_key' }
    );

    // Create or reuse existing pia_submission
    let { data: submission } = await admin
      .from('pia_submissions')
      .select('id')
      .eq('application_id', applicationId)
      .in('status', ['draft', 'in_progress'])
      .maybeSingle() as unknown as { data: { id: string } | null };

    if (!submission) {
      const { data: newSub, error: subError } = await admin
        .from('pia_submissions')
        .insert({
          application_id: applicationId,
          user_id: profile.id,
          bando_type: payload.bandoType,
          status: 'in_progress',
        })
        .select('id')
        .single() as unknown as { data: { id: string } | null; error: any };

      if (subError || !newSub) {
        return NextResponse.json(
          { error: `Impossibile creare la sottomissione: ${subError?.message ?? 'errore sconosciuto'}` },
          { status: 500 }
        );
      }
      submission = newSub;
    }

    return NextResponse.json({
      ok: true,
      applicationId,
      submissionId: submission.id,
      bandoType: payload.bandoType,
      bandoTitle,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore durante l\'avvio della pratica.' },
      { status: 500 }
    );
  }
}
