import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PROGRESS_STEPS,
  progressToApplicationStatus,
  upsertProgressIntoNotes,
  type ProgressStepKey
} from '@/lib/admin/practice-progress';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { resolveConsultantPracticeContext } from '@/lib/consultant/practiceAccess';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { sendPracticeProgressEmail } from '@/lib/services/email';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const ParamsSchema = z.object({
  applicationId: z.string().uuid()
});

const BodySchema = z.object({
  stepKey: z.string().min(1).max(40)
});

export async function POST(request: Request, context: { params: { applicationId: string } }) {
  const parsedParams = ParamsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'ApplicationId non valido.' }, { status: 422 });
  }

  const parsedBody = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Step non valido.' }, { status: 422 });
  }

  const step = PROGRESS_STEPS.find((item) => item.key === parsedBody.data.stepKey) ?? null;
  if (!step) {
    return NextResponse.json({ error: 'Step non valido.' }, { status: 422 });
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
  const { data: application, error: applicationError } = await admin
    .from('tender_applications')
    .select('id, notes, tender:tenders(title), company:companies(name)')
    .eq('id', parsedParams.data.applicationId)
    .maybeSingle();
  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 500 });
  }
  if (!application) {
    return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
  }

  const nextNotes = upsertProgressIntoNotes(application.notes ?? null, step.key as ProgressStepKey);
  const nextStatus = progressToApplicationStatus(step.key as ProgressStepKey);

  const { error: updateError } = await admin
    .from('tender_applications')
    .update({ notes: nextNotes, status: nextStatus })
    .eq('id', parsedParams.data.applicationId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const practiceTitle = application.tender?.title ?? `Pratica ${parsedParams.data.applicationId.slice(0, 8)}`;
  const companyName = application.company?.name ?? 'Cliente';
  const chatBody = [
    '[AGGIORNAMENTO PRATICA]',
    `Pratica: ${practiceTitle}`,
    `Stato avanzamento: ${step.label}`,
    '',
    'Ti aggiorniamo non appena ci saranno ulteriori novità.'
  ].join('\n');

  await admin.from('consultant_messages').insert({
    thread_id: resolved.threadId,
    sender_profile_id: profile.id,
    body: chatBody
  });

  let emailStatus: 'sent' | 'skipped' | 'failed' = 'skipped';
  if (resolved.clientProfileId) {
    const { data: clientProfile, error: clientProfileError } = await admin
      .from('profiles')
      .select('email')
      .eq('id', resolved.clientProfileId)
      .maybeSingle();
    if (clientProfileError) {
      emailStatus = 'failed';
    } else if (clientProfile?.email) {
      const emailResult = await sendPracticeProgressEmail({
        toEmail: clientProfile.email,
        companyName,
        practiceTitle,
        stepLabel: step.label
      });
      emailStatus = emailResult.sent ? 'sent' : 'failed';
    }
  }

  void emitNotificationEvent({
    eventType: 'practice_progress_updated',
    actorProfileId: profile.id,
    actorRole: profile.role as 'consultant' | 'ops_admin',
    companyId: resolved.companyId,
    applicationId: parsedParams.data.applicationId,
    threadId: resolved.threadId,
    progressLabel: step.label,
    metadata: {
      stepKey: step.key,
      status: nextStatus
    }
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    step: step.key,
    status: nextStatus,
    emailStatus
  });
}
