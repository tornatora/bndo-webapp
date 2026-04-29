import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function detectAcceptedFormat(fileName: string): 'pdf' | 'p7m' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.p7m')) return 'p7m';
  return null;
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const formData = await request.formData();
    const applicationId = String(formData.get('applicationId') ?? '').trim();
    const requirementKey = String(formData.get('requirementKey') ?? '').trim();
    const file = formData.get('file');

    if (!applicationId || !requirementKey || !file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'applicationId, requirementKey e file sono obbligatori.' }, { status: 422 });
    }

    const acceptedFormat = detectAcceptedFormat(file.name);
    if (!acceptedFormat) {
      return NextResponse.json({ ok: false, error: 'Formato non supportato. Usa PDF o P7M.' }, { status: 422 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'File troppo grande. Max 25MB.' }, { status: 422 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, company_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.company_id) {
      return NextResponse.json({ ok: false, error: 'Profilo non associato a un\'azienda.' }, { status: 403 });
    }

    const { data: app } = await supabase
      .from('tender_applications')
      .select('id')
      .eq('id', applicationId)
      .eq('company_id', profile.company_id)
      .maybeSingle();
    if (!app) return NextResponse.json({ ok: false, error: 'Pratica non trovata.' }, { status: 404 });

    const safeName = sanitizeFileName(file.name);
    const storagePath = `${profile.company_id}/${applicationId}/${Date.now()}_Signed__${safeName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || (acceptedFormat === 'p7m' ? 'application/pkcs7-signature' : 'application/pdf');

    const { error: storageError } = await supabase.storage
      .from('application-documents')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });
    if (storageError) {
      return NextResponse.json({ ok: false, error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('application_documents')
      .insert({
        application_id: applicationId,
        uploaded_by: profile.id,
        file_name: safeName,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: mimeType,
        requirement_key: requirementKey,
      })
      .select('id')
      .single();
    if (insertError) {
      return NextResponse.json({ ok: false, error: `Salvataggio DB fallito: ${insertError.message}` }, { status: 500 });
    }

    await supabase
      .from('practice_document_requirements')
      .update({ status: 'uploaded' })
      .eq('application_id', applicationId)
      .eq('requirement_key', requirementKey);

    return NextResponse.json(
      {
        ok: true,
        storedDocumentId: inserted.id,
        acceptedFormat,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore upload-signed.' },
      { status: 500 }
    );
  }
}
