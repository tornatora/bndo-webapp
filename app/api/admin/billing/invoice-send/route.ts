import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendDocumentReminderEmail } from '@/lib/services/email';

const BodySchema = z.object({
  companyId: z.string().uuid(),
  invoiceId: z.string().min(1),
  threadId: z.string().uuid(),
  toEmail: z.string().email(),
  companyName: z.string().min(1).max(160)
});

export async function POST(request: Request) {
  const { profile } = await requireOpsProfile();

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Dati non validi.' }, { status: 422 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('company_crm')
    .select('admin_fields')
    .eq('company_id', body.data.companyId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error, 'company_crm')) {
      return NextResponse.json(
        {
          error:
            'CRM avanzato non ancora attivo su questo ambiente: invio fattura da pannello billing temporaneamente non disponibile.'
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const adminFields = ((data?.admin_fields ?? {}) as Record<string, unknown>) ?? {};
  const billing = adminFields.billing && typeof adminFields.billing === 'object' && !Array.isArray(adminFields.billing) ? (adminFields.billing as Record<string, unknown>) : null;
  const invoicesRaw = billing && Array.isArray(billing.invoices) ? (billing.invoices as unknown[]) : [];
  const inv = invoicesRaw.find((i) => i && typeof i === 'object' && (i as Record<string, unknown>).id === body.data.invoiceId) as
    | Record<string, unknown>
    | undefined;
  const url = (inv?.url as string | undefined) ?? null;
  const fileName = (inv?.fileName as string | undefined) ?? 'Fattura';

  // Send in chat.
  await supabaseAdmin.from('consultant_messages').insert({
    thread_id: body.data.threadId,
    sender_profile_id: profile.id,
    body: url
      ? `📎 Fattura disponibile: ${fileName}\n${url}`
      : `📎 Fattura disponibile: ${fileName}`
  });

  // Reuse existing email sender with a generic "document reminder" template for now.
  // (We'll add a dedicated invoice email template later.)
  await sendDocumentReminderEmail({
    toEmail: body.data.toEmail,
    companyName: body.data.companyName,
    practiceTitle: 'Fatturazione',
    documentLabel: `Fattura: ${fileName}`
  });

  return NextResponse.json({ success: true });
}
