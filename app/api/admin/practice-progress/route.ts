import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PROGRESS_STEPS, progressToApplicationStatus, upsertProgressIntoNotes } from '@/lib/admin/practice-progress';
import { sendPracticeProgressEmail } from '@/lib/services/email';

const PayloadSchema = z.object({
  applicationId: z.string().uuid(),
  threadId: z.string().uuid(),
  toEmail: z.string().email(),
  companyName: z.string().min(1).max(200),
  practiceTitle: z.string().min(1).max(200),
  stepKey: z.string().min(1).max(40)
});

export async function POST(request: Request) {
  try {
    const { profile } = await requireOpsProfile();
    const payload = PayloadSchema.parse(await request.json().catch(() => ({})));

    const step = PROGRESS_STEPS.find((s) => s.key === payload.stepKey);
    if (!step) return NextResponse.json({ error: 'Step non valido.' }, { status: 422 });

    const supabase = createClient();

    const { data: app } = await supabase
      .from('tender_applications')
      .select('id, notes')
      .eq('id', payload.applicationId)
      .maybeSingle();

    const nextNotes = upsertProgressIntoNotes(app?.notes ?? null, step.key);
    const nextStatus = progressToApplicationStatus(step.key);
    const { error: updateError } = await supabase
      .from('tender_applications')
      .update({ notes: nextNotes, status: nextStatus })
      .eq('id', payload.applicationId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const chatBody = [
      '[AGGIORNAMENTO PRATICA]',
      `Pratica: ${payload.practiceTitle}`,
      `Stato avanzamento: ${step.label}`,
      '',
      'Ti aggiorniamo non appena ci saranno ulteriori novita.'
    ].join('\n');

    const { error: msgError } = await supabase.from('consultant_messages').insert({
      thread_id: payload.threadId,
      sender_profile_id: profile.id,
      body: chatBody
    });

    if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

    const emailResult = await sendPracticeProgressEmail({
      toEmail: payload.toEmail,
      companyName: payload.companyName,
      practiceTitle: payload.practiceTitle,
      stepLabel: step.label
    });

    return NextResponse.json({ ok: true, email: emailResult }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore aggiornamento pratica.' },
      { status: 500 }
    );
  }
}
