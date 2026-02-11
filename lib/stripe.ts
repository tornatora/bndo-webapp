import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY env variable.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: '2025-02-24.acacia'
    });
  }

  return stripeClient;
}
