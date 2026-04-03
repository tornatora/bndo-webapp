import { NextResponse } from 'next/server';
import { z } from 'zod';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe';
import {
  getPracticeConfig,
  practiceTypeFromGrantSlug,
  practiceTypeFromQuizBandoType,
} from '@/lib/bandi';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  buildOnboardingUrl,
  getLatestPaidPaymentByQuiz,
  resolveNextUrlFromPayment,
  upsertPracticePaymentFromSession,
} from '@/lib/services/practicePayments';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation,
} from '@/lib/security/http';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  grantSlug: z.string().trim().min(2),
  quizSubmissionId: z.string().uuid().optional(),
});

const BodySchema = QuerySchema.extend({
  checkoutMode: z.enum(['embedded', 'redirect']).optional(),
});

type QuizLookup = {
  id: string;
  email: string;
  full_name: string;
  eligibility: 'eligible' | 'not_eligible';
  bando_type: string | null;
};

const SupportedCheckoutMethods = ['card', 'paypal', 'link'] as const;

function parseCheckoutPaymentMethodTypes(): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] | null {
  const raw = process.env.STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES?.trim();
  if (!raw) return null;
  const allowed = new Set<string>(SupportedCheckoutMethods);
  const parsed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Stripe.Checkout.SessionCreateParams.PaymentMethodType => allowed.has(value));
  return parsed.length ? parsed : null;
}

function resolvePublicBaseUrl(request: Request) {
  const requestUrl = new URL(request.url);
  const requestHost = requestUrl.hostname.toLowerCase();
  const requestOrigin = requestUrl.origin;
  const configuredMarketing = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  if (!configuredMarketing) return requestOrigin;

  let configuredHost = '';
  try {
    configuredHost = new URL(configuredMarketing).hostname.toLowerCase();
  } catch {
    return requestOrigin;
  }

  const isLocalOrPreview =
    requestHost === 'localhost' || requestHost === '127.0.0.1' || requestHost.endsWith('.netlify.app');
  if (isLocalOrPreview || requestHost !== configuredHost) return requestOrigin;
  return configuredMarketing;
}

async function resolveQuizAndPractice(args: { grantSlug: string; quizSubmissionId?: string }) {
  const practiceType = practiceTypeFromGrantSlug(args.grantSlug);
  if (!practiceType) {
    return { error: 'Bando non riconosciuto.', status: 404 as const };
  }

  if (!args.quizSubmissionId) {
    return { practiceType, quiz: null } as const;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: quiz, error } = await supabaseAdmin
    .from('quiz_submissions')
    .select('id, email, full_name, eligibility, bando_type')
    .eq('id', args.quizSubmissionId)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 500 as const };
  }
  if (!quiz) return { practiceType, quiz: null } as const;

  const typedQuiz = quiz as QuizLookup;
  const quizPracticeType = practiceTypeFromQuizBandoType(typedQuiz.bando_type);
  if (quizPracticeType && quizPracticeType !== practiceType) {
    return { practiceType, quiz: null } as const;
  }

  return { practiceType, quiz: typedQuiz } as const;
}

async function getAlreadyPaidResponse(args: { quizSubmissionId?: string; grantSlug: string }) {
  if (!args.quizSubmissionId) return null;
  const practiceType = practiceTypeFromGrantSlug(args.grantSlug);
  if (!practiceType) return null;
  const paid = await getLatestPaidPaymentByQuiz({
    quizSubmissionId: args.quizSubmissionId,
    practiceType,
  });
  if (!paid) return null;
  return {
    ok: true,
    alreadyPaid: true,
    status: paid.onboarding_status === 'completed' ? 'onboarding_completed' : 'paid',
    nextUrl: resolveNextUrlFromPayment(paid),
    sessionId: paid.stripe_checkout_session_id,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      grantSlug: url.searchParams.get('grantSlug'),
      quizSubmissionId: url.searchParams.get('quizSubmissionId') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
    }

    const validation = await resolveQuizAndPractice(parsed.data);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const alreadyPaid = await getAlreadyPaidResponse(parsed.data);
    if (alreadyPaid) return NextResponse.json(alreadyPaid);

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
      status: 'unpaid',
      nextUrl: buildOnboardingUrl({
        practiceType: validation.practiceType,
        sessionId: '',
        quizSubmissionId: parsed.data.quizSubmissionId ?? null,
      }).replace('session_id=&', ''),
    });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, 'Errore verifica pagamento pratica.') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'payments-start-practice',
      key: getClientIp(request),
      limit: 20,
      windowMs: 10 * 60_000,
    });
    if (rateLimit) return rateLimit;

    const body = BodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Dati richiesta non validi.' }, { status: 422 });
    }

    const validation = await resolveQuizAndPractice(body.data);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const alreadyPaid = await getAlreadyPaidResponse(body.data);
    if (alreadyPaid) return NextResponse.json(alreadyPaid);

    const practiceConfig = getPracticeConfig(validation.practiceType);
    const stripe = getStripeClient();
    const marketingBase = resolvePublicBaseUrl(request);
    const checkoutMode = body.data.checkoutMode ?? 'redirect';
    const quizQuery = validation.quiz?.id ? `&quiz=${validation.quiz.id}` : '';
    const successUrl = `${marketingBase}/payment/${practiceConfig.slug}/success?session_id={CHECKOUT_SESSION_ID}${quizQuery}`;
    const cancelUrl = `${marketingBase}/payment/${practiceConfig.slug}?cancelled=1${quizQuery}`;
    const embeddedReturnUrl = `${marketingBase}/onboarding?bando=${validation.practiceType}${quizQuery}&session_id={CHECKOUT_SESSION_ID}`;

    const metadata: Record<string, string> = {
      flow: 'practice_start',
      practice_type: validation.practiceType,
      grant_slug: practiceConfig.slug,
      grant_title: practiceConfig.title,
      amount_cents: String(practiceConfig.startFeeCents),
      currency: practiceConfig.currency,
      priority_queue: 'true',
    };
    if (validation.quiz?.id) {
      metadata.quiz_submission_id = validation.quiz.id;
    }

    const preferredPaymentMethodTypes = parseCheckoutPaymentMethodTypes();
    const baseSessionPayload: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer_email: validation.quiz?.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: practiceConfig.currency,
            unit_amount: practiceConfig.startFeeCents,
            product_data: {
              name: `${practiceConfig.title} · Avvio pratica`,
              description: 'Pagamento una tantum per avviare la pratica e saltare la fila.',
            },
          },
          quantity: 1,
        },
      ],
      metadata,
    };

    const sessionPayload: Stripe.Checkout.SessionCreateParams =
      checkoutMode === 'embedded'
        ? {
            ...baseSessionPayload,
            ui_mode: 'embedded',
            return_url: embeddedReturnUrl,
            redirect_on_completion: 'if_required',
          }
        : {
            ...baseSessionPayload,
            success_url: successUrl,
            cancel_url: cancelUrl,
          };

    if (preferredPaymentMethodTypes?.length) {
      sessionPayload.payment_method_types = preferredPaymentMethodTypes;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionPayload);
    } catch (checkoutError) {
      const shouldRetryWithoutForcedMethods =
        !!preferredPaymentMethodTypes?.length &&
        checkoutError instanceof Error &&
        /payment_method_types/i.test(checkoutError.message);

      if (!shouldRetryWithoutForcedMethods) {
        throw checkoutError;
      }

      const fallbackPayload: Stripe.Checkout.SessionCreateParams = {
        ...sessionPayload,
      };
      delete fallbackPayload.payment_method_types;
      session = await stripe.checkout.sessions.create(fallbackPayload);
    }

    try {
      await upsertPracticePaymentFromSession({
        session,
        fallbackPracticeType: validation.practiceType,
        fallbackQuizSubmissionId: validation.quiz?.id ?? body.data.quizSubmissionId ?? null,
        forceStatus: 'pending',
      });
    } catch {
      // Non bloccare il checkout se la persistenza locale fallisce:
      // il webhook Stripe resta la source of truth e registrerà il pagamento.
    }

    if (checkoutMode === 'embedded') {
      if (!session.client_secret) {
        return NextResponse.json(
          { error: 'Checkout embedded non disponibile: Stripe non ha restituito il client secret.' },
          { status: 502 },
        );
      }

      return NextResponse.json({
        ok: true,
        alreadyPaid: false,
        checkoutMode: 'embedded',
        status: 'pending',
        sessionId: session.id,
        clientSecret: session.client_secret,
      });
    }

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
      checkoutMode: 'redirect',
      status: 'pending',
      url: session.url,
      sessionId: session.id,
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
      { error: publicError(error, 'Impossibile avviare il pagamento pratica in questo momento.') },
      { status: 500 },
    );
  }
}
