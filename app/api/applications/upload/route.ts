import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const formData = await request.formData();
    const applicationId = String(formData.get('applicationId') ?? '');
    const tenderId = String(formData.get('tenderId') ?? '');
    const notes = String(formData.get('notes') ?? '');
    const file = formData.get('file');

    if (!applicationId || !tenderId || !file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Dati candidatura incompleti.' }, { status: 422 });
    }

    const allowedExtensions = ['pdf', 'doc', 'docx', 'zip'];
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!extension || !allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: 'Formato file non consentito. Ammessi PDF, DOC, DOCX, ZIP.' },
        { status: 422 }
      );
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande. Max 25MB.' }, { status: 422 });
    }

    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Profilo non associato a un\'azienda.' }, { status: 403 });
    }

    const { data: application } = await supabase
      .from('tender_applications')
      .select('id, company_id, tender_id')
      .eq('id', applicationId)
      .eq('company_id', profile.company_id)
      .eq('tender_id', tenderId)
      .maybeSingle();

    if (!application) {
      return NextResponse.json({ error: 'Candidatura non trovata.' }, { status: 404 });
    }

    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${profile.company_id}/${applicationId}/${timestamp}_${safeFileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await supabaseAdmin.storage
      .from('application-documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (storageError) {
      return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
    }

    const { error: docError } = await supabaseAdmin.from('application_documents').insert({
      application_id: application.id,
      uploaded_by: profile.id,
      file_name: safeFileName,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream'
    });

    if (docError) {
      return NextResponse.json(
        {
          error: `Documento salvato ma record DB fallito: ${docError.message}`
        },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from('tender_applications')
      .update({
        status: 'submitted',
        supplier_registry_status: 'in_progress',
        notes
      })
      .eq('id', application.id);

    await supabaseAdmin
      .from('tender_matches')
      .update({
        status: 'participating'
      })
      .eq('company_id', profile.company_id)
      .eq('tender_id', tenderId);

    // Avvisa inbox consulente con un messaggio automatico sul thread aziendale.
    try {
      const { data: ensuredThread } = await supabaseAdmin
        .from('consultant_threads')
        .upsert({ company_id: profile.company_id }, { onConflict: 'company_id' })
        .select('id')
        .single();

      const threadId = ensuredThread?.id;

      if (threadId) {
        await supabaseAdmin.from('consultant_thread_participants').upsert(
          {
            thread_id: threadId,
            profile_id: profile.id,
            participant_role: 'client_admin',
            last_read_at: new Date().toISOString()
          },
          { onConflict: 'thread_id,profile_id' }
        );

        await supabaseAdmin.from('consultant_messages').insert({
          thread_id: threadId,
          sender_profile_id: profile.id,
          body: `Ho caricato il documento ${safeFileName} per la pratica ${tenderId}.`
        });
      }
    } catch {
      // Non bloccare upload documento in caso di errore notifica chat.
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Documento caricato. Candidatura aggiornata e presa in carico dal consulente.'
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Errore upload candidatura.'
      },
      { status: 500 }
    );
  }
}
