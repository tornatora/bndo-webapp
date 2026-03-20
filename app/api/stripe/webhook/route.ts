import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';
import { provisionAccountFromCheckout } from '@/lib/services/provisioning';
import {
  upsertPracticePaymentFromIntent,
  upsertPracticePaymentFromSession,
} from '@/lib/services/practicePayments';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const signature = request.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook signature missing.' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Webhook signature verification failed.'
      },
      { status: 400 }
    );
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const flow = String(session.metadata?.flow ?? '').trim().toLowerCase();

      await upsertPracticePaymentFromSession({
        session,
        fallbackQuizSubmissionId: session.metadata?.quiz_submission_id ?? null,
        forceStatus: 'paid',
      });

      if (flow === 'practice_start') {
        return NextResponse.json({ received: true, handled: 'practice_start' });
      }

      const email = session.customer_details?.email ?? session.customer_email;
      const companyName = session.metadata?.companyName;
      const contactName = session.metadata?.contactName;

      if (!email || !companyName || !contactName) {
        return NextResponse.json({ received: true, skipped: true, reason: 'Missing metadata/email.' });
      }

      await provisionAccountFromCheckout({
        checkoutSessionId: session.id,
        customerEmail: email,
        companyName,
        contactName,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null
      });
    }

    if (event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      await upsertPracticePaymentFromSession({
        session,
        fallbackQuizSubmissionId: session.metadata?.quiz_submission_id ?? null,
        forceStatus: 'paid',
      });
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await upsertPracticePaymentFromSession({
        session,
        fallbackQuizSubmissionId: session.metadata?.quiz_submission_id ?? null,
        forceStatus: 'failed',
      });
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      await upsertPracticePaymentFromSession({
        session,
        fallbackQuizSubmissionId: session.metadata?.quiz_submission_id ?? null,
        forceStatus: 'canceled',
      });
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await upsertPracticePaymentFromIntent({
        intent,
        fallbackQuizSubmissionId: intent.metadata?.quiz_submission_id ?? null,
        forceStatus: 'paid',
      });
    }

    if (event.type === 'payment_intent.processing') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await upsertPracticePaymentFromIntent({
        intent,
        fallbackQuizSubmissionId: intent.metadata?.quiz_submission_id ?? null,
        forceStatus: 'pending',
      });
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await upsertPracticePaymentFromIntent({
        intent,
        fallbackQuizSubmissionId: intent.metadata?.quiz_submission_id ?? null,
        forceStatus: 'failed',
      });
    }

    if (event.type === 'payment_intent.canceled') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await upsertPracticePaymentFromIntent({
        intent,
        fallbackQuizSubmissionId: intent.metadata?.quiz_submission_id ?? null,
        forceStatus: 'canceled',
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Provisioning failed.'
      },
      { status: 500 }
    );
  }
}
