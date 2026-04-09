import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { resolveConsultantPracticeContext } from '@/lib/consultant/practiceAccess';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { isMissingDbObjectError, isMissingTable } from '@/lib/ops/dbErrorGuards';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const ParamsSchema = z.object({
  applicationId: z.string().uuid()
});

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isMissingRequirementKeyColumn(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '').toLowerCase();
  return isMissingDbObjectError(error as { message?: string }) && message.includes('requirement_key');
}

export async function POST(request: Request, context: { params: { applicationId: string } }) {
  const parsedParams = ParamsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'ApplicationId non valido.' }, { status: 422 });
  }

  const { profile } = await requireOpsOrConsultantProfile();

  const resolved = await resolveConsultantPracticeContext({
    applicationId: parsedParams.data.applicationId,
    profileId: profile.id,
    profileRole: profile.role
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const requirementKeyRaw = String(formData.get('requirementKey') ?? '').trim();
  const requirementKey = requirementKeyRaw ? requirementKeyRaw.slice(0, 120) : null;
  const documentLabelRaw = String(formData.get('documentLabel') ?? '').trim();

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'File mancante.' }, { status: 422 });
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

  const admin = getSupabaseAdmin() as any;
  const timestamp = Date.now();
  const safeOriginal = safeFileName(file.name);
  const safeLabel = documentLabelRaw ? safeFileName(documentLabelRaw).slice(0, 80) : 'DocumentoConsulente';
  const fileName = `${safeLabel}__${safeOriginal}`;
  const storagePath = `${resolved.companyId}/${resolved.applicationId}/${timestamp}_${fileName}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: storageError } = await admin.storage.from('application-documents').upload(storagePath, fileBuffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (storageError) {
    return NextResponse.json({ error: `Upload storage fallito: ${storageError.message}` }, { status: 500 });
  }

  const payloadWithRequirement = {
    application_id: resolved.applicationId,
    uploaded_by: profile.id,
    file_name: fileName,
    requirement_key: requirementKey,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type || 'application/octet-stream'
  };
  const payloadWithoutRequirement = {
    application_id: resolved.applicationId,
    uploaded_by: profile.id,
    file_name: fileName,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type || 'application/octet-stream'
  };

  let { error: insertError } = await admin.from('application_documents').insert(payloadWithRequirement);
  if (insertError && isMissingRequirementKeyColumn(insertError)) {
    const retry = await admin.from('application_documents').insert(payloadWithoutRequirement);
    insertError = retry.error;
  }
  if (insertError) {
    return NextResponse.json({ error: `Inserimento documento fallito: ${insertError.message}` }, { status: 500 });
  }

  if (requirementKey) {
    const requirementUpdate = await admin
      .from('practice_document_requirements')
      .update({ status: 'uploaded' })
      .eq('application_id', resolved.applicationId)
      .eq('requirement_key', requirementKey);
    if (requirementUpdate.error && !isMissingTable(requirementUpdate.error, 'practice_document_requirements')) {
      return NextResponse.json({ error: requirementUpdate.error.message }, { status: 500 });
    }
  }

  await admin.from('consultant_messages').insert({
    thread_id: resolved.threadId,
    sender_profile_id: profile.id,
    body: `📎 Ho caricato il documento "${fileName}"${requirementKey ? ` per il requisito ${requirementKey}.` : '.'}`
  });

  void emitNotificationEvent({
    eventType: 'document_uploaded_by_consultant',
    actorProfileId: profile.id,
    actorRole: profile.role as 'consultant' | 'ops_admin',
    companyId: resolved.companyId,
    applicationId: resolved.applicationId,
    threadId: resolved.threadId,
    documentLabel: documentLabelRaw || fileName,
    metadata: {
      requirementKey,
      fileName
    }
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    compatibilityMode: resolved.compatibilityMode,
    document: {
      fileName,
      requirementKey
    }
  });
}
