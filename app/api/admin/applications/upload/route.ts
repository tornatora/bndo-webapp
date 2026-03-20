import { NextResponse } from 'next/server';
import { requireOpsProfile } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { profile } = await requireOpsProfile();
    const supabaseAdmin = getSupabaseAdmin();

    const formData = await request.formData();
    const applicationId = String(formData.get('applicationId') ?? '');
    const companyId = String(formData.get('companyId') ?? '');
    const documentLabel = String(formData.get('documentLabel') ?? '');
    const requirementKeyRaw = formData.get('requirementKey');
    const requirementKey =
      typeof requirementKeyRaw === 'string' && requirementKeyRaw.trim()
        ? requirementKeyRaw.trim().slice(0, 120)
        : null;
    const file = formData.get('file');

    if (!applicationId || !companyId || !file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Dati upload incompleti.' }, { status: 422 });
    }

    const allowedExtensions = ['pdf', 'doc', 'docx', 'zip', 'png', 'jpg', 'jpeg'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: 'Formato file non consentito. Ammessi PDF, DOC, DOCX, ZIP, PNG, JPG.' },
        { status: 422 }
      );
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande. Max 25MB.' }, { status: 422 });
    }

    // Admin upload: store a normalized file name so our keyword matching works reliably.
    const timestamp = Date.now();
    const safeOriginal = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeLabel = documentLabel ? documentLabel.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) : 'Documento';
    const fileName = `${safeLabel}__${safeOriginal}`;
    const storagePath = `${companyId}/${applicationId}/${timestamp}_${fileName}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await supabaseAdmin.storage.from('application-documents').upload(storagePath, fileBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });

    if (storageError) {
      return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
    }

    const { error: docError } = await supabaseAdmin.from('application_documents').insert({
      application_id: applicationId,
      uploaded_by: profile.id,
      file_name: fileName,
      requirement_key: requirementKey,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream'
    });

    if (docError) {
      return NextResponse.json({ error: `Inserimento record fallito: ${docError.message}` }, { status: 500 });
    }

    if (requirementKey) {
      await supabaseAdmin
        .from('practice_document_requirements')
        .update({ status: 'uploaded' })
        .eq('application_id', applicationId)
        .eq('requirement_key', requirementKey);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore upload documento.' },
      { status: 500 }
    );
  }
}
