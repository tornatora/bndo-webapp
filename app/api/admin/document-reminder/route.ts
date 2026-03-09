import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { sendDocumentReminderEmail } from '@/lib/services/email';

const PayloadSchema = z.object({
  threadId: z.string().uuid(),
  toEmail: z.string().email(),
  companyName: z.string().min(1).max(200),
  practiceTitle: z.string().min(1).max(200),
  documentLabel: z.string().min(1).max(200)
});

export async function POST(request: Request) {
  try {
    const { profile } = await requireOpsProfile();
    const payload = PayloadSchema.parse(await request.json().catch(() => ({})));

    const supabase = createClient();

    const body = [
      '[PROMEMORIA DOCUMENTO]',
      `Pratica: ${payload.practiceTitle}`,
      `Documento richiesto: ${payload.documentLabel}`,
      '',
      'Puoi caricare il documento dalla tua dashboard. Se hai dubbi, rispondi a questo messaggio.'
    ].join('\n');

    const { error: insertError } = await supabase.from('consultant_messages').insert({
      thread_id: payload.threadId,
      sender_profile_id: profile.id,
      body
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const emailResult = await sendDocumentReminderEmail({
      toEmail: payload.toEmail,
      companyName: payload.companyName,
      practiceTitle: payload.practiceTitle,
      documentLabel: payload.documentLabel
    });

    return NextResponse.json({
      ok: true,
      email: emailResult
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore invio promemoria.' },
      { status: 500 }
    );
  }
}

