import { NextResponse } from 'next/server';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();

    const formData = await request.formData();
    const applicationId = String(formData.get('applicationId') ?? '');
    const requirementKeyRaw = String(formData.get('requirementKey') ?? '').trim();
    const requirementKey = requirementKeyRaw ? requirementKeyRaw : null;
    const documentLabel = String(formData.get('documentLabel') ?? '');
    const file = formData.get('file');

    if (!applicationId || !file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Dati upload incompleti.' }, { status: 422 });
    }

    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      return NextResponse.json({ error: 'Formato file non consentito. Ammessi PDF, PNG, JPG.' }, { status: 422 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande. Max 25MB.' }, { status: 422 });
    }

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
      .select('id, company_id')
      .eq('id', applicationId)
      .eq('company_id', profile.company_id)
      .maybeSingle();

    if (!application) {
      return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
    }

    const timestamp = Date.now();
    const safeOriginal = safeFileName(file.name);
    const safeLabel = documentLabel ? safeFileName(documentLabel).slice(0, 80) : 'Documento';
    const fileName = `${safeLabel}__${safeOriginal}`;
    const storagePath = `${profile.company_id}/${applicationId}/${timestamp}_${fileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await supabase.storage
      .from('application-documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (storageError) {
      return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
    }

    const { error: docError } = await supabase.from('application_documents').insert({
      application_id: applicationId,
      uploaded_by: profile.id,
      file_name: fileName,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream'
      // requirement_key is intentionally omitted as the column is missing in DB
    });

    if (docError) {
      return NextResponse.json({ error: `Inserimento documento fallito: ${docError.message}` }, { status: 500 });
    }

    if (requirementKey) {
      await supabase
        .from('practice_document_requirements')
        .update({ status: 'uploaded' })
        .eq('application_id', applicationId)
        .eq('requirement_key', requirementKey);
    }

    // Notify consultant thread (non-blocking).
    try {
      const { data: ensuredThread } = await supabase
        .from('consultant_threads')
        .upsert({ company_id: profile.company_id }, { onConflict: 'company_id' })
        .select('id')
        .single();

      const threadId = ensuredThread?.id ?? null;
      if (threadId) {
        await supabase.from('consultant_thread_participants').upsert(
          {
            thread_id: threadId,
            profile_id: profile.id,
            participant_role: 'client_admin',
            last_read_at: new Date().toISOString()
          },
          { onConflict: 'thread_id,profile_id' }
        );

        await supabase.from('consultant_messages').insert({
          thread_id: threadId,
          sender_profile_id: profile.id,
          body: `Ho caricato il documento ${fileName}${requirementKey ? ` (requisito: ${requirementKey})` : ''} per la mia pratica.`
        });

        void emitNotificationEvent({
          eventType: 'document_uploaded_by_client',
          actorProfileId: profile.id,
          actorRole: 'client_admin',
          companyId: profile.company_id,
          applicationId,
          threadId,
          documentLabel: documentLabel || fileName,
          metadata: {
            requirementKey,
            fileName
          }
        }).catch(() => undefined);
      }
    } catch {
      // Non bloccare upload in caso di errore notifica chat.
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore upload documento.' },
      { status: 500 }
    );
  }
}
