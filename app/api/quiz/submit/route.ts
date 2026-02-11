import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const payloadSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(40),
  region: z.string().trim().max(120).nullable().optional(),
  bandoType: z.string().trim().max(60).nullable().optional(),
  eligibility: z.enum(['eligible', 'not_eligible']),
  answers: z.record(z.string()).default({})
});

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const supabaseAdmin = getSupabaseAdmin();

    const fullName = `${payload.firstName} ${payload.lastName}`.trim();
    const region = payload.region ?? null;
    const bandoType = payload.bandoType ?? null;

    const leadChallenge = `Quiz requisiti: ${payload.eligibility === 'eligible' ? 'idoneo' : 'non idoneo'}${
      region ? ` | Regione: ${region}` : ''
    }${bandoType ? ` | Bando: ${bandoType}` : ''}`;

    const [{ data: quizSubmission, error: quizError }, { error: leadError }] = await Promise.all([
      supabaseAdmin
        .from('quiz_submissions')
        .insert({
          full_name: fullName,
          email: payload.email.toLowerCase(),
          phone: payload.phone,
          region,
          bando_type: bandoType,
          eligibility: payload.eligibility,
          answers: payload.answers
        })
        .select('id')
        .single(),
      supabaseAdmin.from('leads').insert({
        full_name: fullName,
        email: payload.email.toLowerCase(),
        company_name: `Lead Quiz ${region ?? 'N/D'}`,
        phone: payload.phone,
        challenge: leadChallenge
      })
    ]);

    if (quizError || !quizSubmission) {
      return NextResponse.json({ error: quizError?.message ?? 'Salvataggio quiz non riuscito.' }, { status: 500 });
    }

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, submissionId: quizSubmission.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati quiz non validi.' }, { status: 422 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore salvataggio quiz.' },
      { status: 500 }
    );
  }
}
