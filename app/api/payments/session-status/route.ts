import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';
import { practiceTypeFromGrantSlug } from '@/lib/bandi';
import {
  getPracticePaymentBySession,
  resolveNextUrlFromPayment,
  upsertPracticePaymentFromIntent,
  upsertPracticePaymentFromSession,
} from '@/lib/services/practicePayments';
import { enforceRateLimit, getClientIp, publicError, safeSessionId } from '@/lib/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ApplicationIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const QuerySchema = z.object({
  session_id: z.string().trim().min(8),
  grantSlug: z.string().trim().min(2).optional(),
  quizSubmissionId: z.string().uuid().optional(),
  applicationId: ApplicationIdSchema.optional(),
});

function statusFromIntent(intentStatus: string): 'pending' | 'paid' | 'failed' | 'canceled' {
  if (intentStatus === 'succeeded') return 'paid';
  if (intentStatus === 'canceled') return 'canceled';
  return 'pending';
}

function statusFromCheckoutSession(args: {
  sessionStatus: string | null;
  paymentStatus: string | null;
}): 'pending' | 'paid' | 'failed' | 'canceled' {
  if (args.paymentStatus === 'paid') return 'paid';
  if (args.sessionStatus === 'expired') return 'canceled';
  return 'pending';
}

export async function GET(request: Request) {
  try {
    const rateLimit = enforceRateLimit({
      namespace: 'payments-session-status',
      key: getClientIp(request),
      limit: 60,
      windowMs: 60_000,
    });
    if (rateLimit) return rateLimit;

    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      session_id: url.searchParams.get('session_id'),
      grantSlug: url.searchParams.get('grantSlug') ?? undefined,
      quizSubmissionId: url.searchParams.get('quizSubmissionId') ?? undefined,
      applicationId: url.searchParams.get('applicationId') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
    }

    const safeId = safeSessionId(parsed.data.session_id);
    if (!safeId) {
      return NextResponse.json({ error: 'session_id non valido.' }, { status: 422 });
    }

    const fallbackPracticeType = practiceTypeFromGrantSlug(parsed.data.grantSlug ?? null);
    let payment = await getPracticePaymentBySession(safeId);
    let stripeFallbackStatus: 'pending' | 'paid' | 'failed' | 'canceled' | null = null;

    try {
      const stripe = getStripeClient();
      if (safeId.startsWith('pi_')) {
        const intent = await stripe.paymentIntents.retrieve(safeId);
        stripeFallbackStatus = statusFromIntent(intent.status);
        payment = await upsertPracticePaymentFromIntent({
          intent,
          fallbackPracticeType,
          fallbackQuizSubmissionId: parsed.data.quizSubmissionId ?? null,
          fallbackApplicationId: parsed.data.applicationId ?? null,
        });
      } else {
        const session = await stripe.checkout.sessions.retrieve(safeId);
        stripeFallbackStatus = statusFromCheckoutSession({
          sessionStatus: session.status,
          paymentStatus: session.payment_status,
        });
        payment = await upsertPracticePaymentFromSession({
          session,
          fallbackPracticeType,
          fallbackQuizSubmissionId: parsed.data.quizSubmissionId ?? null,
          fallbackApplicationId: parsed.data.applicationId ?? null,
        });
      }
    } catch {
      // If Stripe is unavailable, continue with DB snapshot.
    }

    if (!payment) {
      if (stripeFallbackStatus) {
        const onboardingParams = new URLSearchParams({ session_id: safeId });
        if (fallbackPracticeType) onboardingParams.set('bando', fallbackPracticeType);
        if (parsed.data.quizSubmissionId) onboardingParams.set('quiz', parsed.data.quizSubmissionId);
        if (parsed.data.applicationId) onboardingParams.set('applicationId', parsed.data.applicationId);
        return NextResponse.json({
          ok: true,
          status: stripeFallbackStatus,
          ready: stripeFallbackStatus === 'paid',
          nextUrl: stripeFallbackStatus === 'paid' ? `/onboarding?${onboardingParams.toString()}` : null,
        });
      }
      return NextResponse.json({ ok: true, status: 'pending', ready: false });
    }

    if (payment.status !== 'paid') {
      return NextResponse.json({
        ok: true,
        status: payment.status,
        ready: false,
      });
    }

    return NextResponse.json({
      ok: true,
      status: 'paid',
      ready: true,
      nextUrl: resolveNextUrlFromPayment(payment),
      onboardingStatus: payment.onboarding_status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicError(error, 'Impossibile verificare lo stato del pagamento in questo momento.') },
      { status: 500 },
    );
  }
}
