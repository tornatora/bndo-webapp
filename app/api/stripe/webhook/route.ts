import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';
import { provisionAccountFromCheckout } from '@/lib/services/provisioning';

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
