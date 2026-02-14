import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';

const payloadSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(40),
  region: z.string().trim().max(120).nullable().optional(),
  bandoType: z.string().trim().max(60).nullable().optional(),
  eligibility: z.enum(['eligible', 'not_eligible']),
  answers: z.record(z.string()).default({}),
  consentPrivacy: z.boolean(),
  consentTerms: z.boolean(),
  consentDataProcessing: z.boolean()
});

function getClientIp(request: Request) {
  const nf = request.headers.get('x-nf-client-connection-ip');
  if (nf && nf.trim()) return nf.trim();
  const xf = request.headers.get('x-forwarded-for');
  if (xf && xf.trim()) return xf.split(',')[0].trim();
  return null;
}

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    if (!payload.consentPrivacy || !payload.consentTerms || !payload.consentDataProcessing) {
      return NextResponse.json({ error: 'Consensi obbligatori mancanti.' }, { status: 422 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

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

    // Store legal consents evidence (best-effort fallback when table isn't deployed yet).
    const consents = {
      privacy_accepted: true,
      terms_accepted: true,
      data_processing_accepted: true,
      legal_version: LEGAL_LAST_UPDATED,
      captured_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent ?? null
    };

    const { error: legalErr } = await supabaseAdmin.from('legal_consents').upsert(
      {
        context: 'quiz',
        email: payload.email.toLowerCase(),
        company_id: null,
        user_id: null,
        application_id: null,
        checkout_session_id: null,
        quiz_submission_id: quizSubmission.id,
        consents,
        ip_address: ipAddress,
        user_agent: userAgent ?? null
      },
      { onConflict: 'context,quiz_submission_id' }
    );

    // Fallback: persist minimal evidence in the answers payload (hidden in admin).
    if (legalErr) {
      const fallbackAnswers = {
        ...payload.answers,
        _legal_privacy: 'yes',
        _legal_terms: 'yes',
        _legal_data_processing: 'yes',
        _legal_version: LEGAL_LAST_UPDATED,
        _legal_captured_at: new Date().toISOString()
      };
      await supabaseAdmin.from('quiz_submissions').update({ answers: fallbackAnswers }).eq('id', quizSubmission.id);
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
