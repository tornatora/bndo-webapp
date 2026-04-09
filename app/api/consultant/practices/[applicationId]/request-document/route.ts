import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { resolveConsultantPracticeContext } from '@/lib/consultant/practiceAccess';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const ParamsSchema = z.object({
  applicationId: z.string().uuid()
});

const BodySchema = z.object({
  label: z.string().trim().min(3).max(160),
  description: z.string().trim().max(600).optional(),
  isRequired: z.boolean().optional()
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export async function POST(request: Request, context: { params: { applicationId: string } }) {
  const parsedParams = ParamsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'ApplicationId non valido.' }, { status: 422 });
  }

  const parsedBody = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Dati non validi per richiesta documento.' }, { status: 422 });
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

  const admin = getSupabaseAdmin() as any;
  const label = parsedBody.data.label.trim();
  const description = parsedBody.data.description?.trim() || null;
  const requirementKey = `extra_doc_${slugify(label)}_${Date.now().toString(36).slice(-6)}`;

  const insertResult = await admin.from('practice_document_requirements').insert({
    application_id: resolved.applicationId,
    tender_id: resolved.tenderId ?? resolved.applicationId,
    requirement_key: requirementKey,
    label,
    description,
    is_required: parsedBody.data.isRequired ?? true,
    status: 'missing',
    source_channel: 'admin',
    metadata: {
      requestedByProfileId: profile.id,
      requestedAt: new Date().toISOString(),
      requestedVia: 'consultant_dashboard'
    }
  });

  const tableMissing = Boolean(insertResult.error && isMissingTable(insertResult.error, 'practice_document_requirements'));
  if (insertResult.error && !tableMissing) {
    return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
  }

  await admin.from('consultant_messages').insert({
    thread_id: resolved.threadId,
    sender_profile_id: profile.id,
    body: [
      '📄 Richiesta documentazione aggiuntiva',
      `Documento richiesto: ${label}`,
      description ? `Dettaglio: ${description}` : null,
      '',
      'Puoi caricare il file dalla dashboard pratica.'
    ]
      .filter(Boolean)
      .join('\n')
  });

  void emitNotificationEvent({
    eventType: 'document_requested',
    actorProfileId: profile.id,
    actorRole: profile.role as 'consultant' | 'ops_admin',
    companyId: resolved.companyId,
    applicationId: resolved.applicationId,
    threadId: resolved.threadId,
    documentLabel: label,
    metadata: {
      description,
      requirementKey,
      source: 'consultant_request_document'
    }
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    requirement: tableMissing
      ? null
      : {
          requirementKey,
          label,
          description
        },
    compatibilityMode: resolved.compatibilityMode || tableMissing,
    notice: tableMissing
      ? 'Checklist dinamica non disponibile su questo ambiente: richiesta inviata via chat pratica.'
      : null
  });
}
