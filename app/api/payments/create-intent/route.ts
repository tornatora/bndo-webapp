import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';
import {
  getPracticeConfig,
  practiceTypeFromGrantSlug,
  type PracticeType,
} from '@/lib/bandi';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getLatestPaidPaymentByQuiz,
  resolveNextUrlFromPayment,
  upsertPracticePaymentFromIntent,
} from '@/lib/services/practicePayments';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation,
} from '@/lib/security/http';

export const runtime = 'nodejs';

const ApplicationIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const BodySchema = z.object({
  grantSlug: z.string().trim().min(2),
  quizSubmissionId: z.string().uuid().optional(),
  practiceType: z.enum(['resto_sud_2_0', 'autoimpiego_centro_nord', 'generic']).optional(),
  applicationId: ApplicationIdSchema.optional(),
});

type QuizLookup = {
  id: string;
  email: string;
  bando_type: string | null;
};

async function getQuizIfAny(quizSubmissionId?: string): Promise<QuizLookup | null> {
  if (!quizSubmissionId) return null;
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from('quiz_submissions')
    .select('id, email, bando_type')
    .eq('id', quizSubmissionId)
    .maybeSingle();
  return (data as QuizLookup | null) ?? null;
}

async function getAlreadyPaidByQuiz(args: { quizSubmissionId?: string; practiceType: PracticeType }) {
  if (!args.quizSubmissionId) return null;
  const paid = await getLatestPaidPaymentByQuiz({
    quizSubmissionId: args.quizSubmissionId,
    practiceType: args.practiceType,
  });
  if (!paid) return null;
  return {
    ok: true,
    alreadyPaid: true,
    status: paid.onboarding_status === 'completed' ? 'onboarding_completed' : 'paid',
    nextUrl: resolveNextUrlFromPayment(paid),
    sessionId: paid.stripe_checkout_session_id,
    paymentIntentId: paid.stripe_payment_intent_id,
  };
}

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'payments-create-intent',
      key: getClientIp(request),
      limit: 24,
      windowMs: 10 * 60_000,
    });
    if (rateLimit) return rateLimit;

    const body = BodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Dati richiesta non validi.' }, { status: 422 });
    }

    const practiceType = body.data.practiceType ?? practiceTypeFromGrantSlug(body.data.grantSlug);
    if (!practiceType) {
      return NextResponse.json({ error: 'Bando non riconosciuto.' }, { status: 404 });
    }

    const quiz = await getQuizIfAny(body.data.quizSubmissionId);
    const practiceConfig = getPracticeConfig(practiceType);

    const alreadyPaid = await getAlreadyPaidByQuiz({
      quizSubmissionId: quiz?.id ?? body.data.quizSubmissionId,
      practiceType,
    });
    if (alreadyPaid) return NextResponse.json(alreadyPaid);

    const stripe = getStripeClient();
    const metadata: Record<string, string> = {
      flow: 'practice_start',
      payment_mode: 'payment_element',
      practice_type: practiceType,
      grant_slug: practiceConfig.slug,
      grant_title: practiceConfig.title,
      amount_cents: String(practiceConfig.startFeeCents),
      currency: practiceConfig.currency,
      priority_queue: 'true',
    };
    if (quiz?.id) metadata.quiz_submission_id = quiz.id;
    if (quiz?.email) metadata.customer_email = quiz.email.toLowerCase();
    if (body.data.applicationId) metadata.application_id = body.data.applicationId;

    let intent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: practiceConfig.startFeeCents,
        currency: practiceConfig.currency,
        payment_method_types: ['card', 'paypal'],
        description: `${practiceConfig.title} · Avvio pratica BNDO`,
        metadata,
        receipt_email: quiz?.email ?? undefined,
      });
    } catch (paymentMethodError) {
      const message = paymentMethodError instanceof Error ? paymentMethodError.message.toLowerCase() : '';
      const canFallbackToCardOnly =
        message.includes('payment_method_types') ||
        message.includes('paypal') ||
        message.includes('not available');
      if (!canFallbackToCardOnly) throw paymentMethodError;

      intent = await stripe.paymentIntents.create({
        amount: practiceConfig.startFeeCents,
        currency: practiceConfig.currency,
        payment_method_types: ['card'],
        description: `${practiceConfig.title} · Avvio pratica BNDO`,
        metadata,
        receipt_email: quiz?.email ?? undefined,
      });
    }

    try {
      await upsertPracticePaymentFromIntent({
        intent,
        fallbackPracticeType: practiceType,
        fallbackQuizSubmissionId: quiz?.id ?? body.data.quizSubmissionId ?? null,
        fallbackApplicationId: body.data.applicationId ?? null,
        forceStatus: 'pending',
      });
    } catch (syncError) {
      console.error('[payments/create-intent] unable to persist pending intent', {
        intentId: intent.id,
        practiceType,
        reason: syncError instanceof Error ? syncError.message : 'unknown_error',
      });
    }

    if (!intent.client_secret) {
      return NextResponse.json(
        { error: 'Pagamento non disponibile: impossibile inizializzare Stripe Payment Element.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
      paymentMode: 'payment_element',
      status: intent.status,
      sessionId: intent.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
    });
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('missing stripe_secret_key')) {
        return NextResponse.json(
          { error: 'Pagamento non disponibile: manca STRIPE_SECRET_KEY in questo ambiente Netlify.' },
          { status: 503 },
        );
      }
      if (message.includes('stripe_secret_key non valida')) {
        return NextResponse.json(
          { error: 'Pagamento non disponibile: STRIPE_SECRET_KEY configurata ma non valida.' },
          { status: 503 },
        );
      }
    }
    return NextResponse.json(
      { error: publicError(error, 'Impossibile inizializzare il pagamento in questo momento.') },
      { status: 500 },
    );
  }
}
