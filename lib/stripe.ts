import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY env variable.');
  }

  const trimmed = key.trim();
  // Common misconfig: leaving placeholders like "sk_test_..." in env files.
  if (trimmed.includes('...') || trimmed === 'sk_test_' || trimmed === 'sk_live_') {
    throw new Error(
      'STRIPE_SECRET_KEY non valida (sembra un placeholder). Incolla la chiave completa sk_test_... o sk_live_...'
    );
  }
  if (!trimmed.startsWith('sk_test_') && !trimmed.startsWith('sk_live_')) {
    throw new Error(
      'STRIPE_SECRET_KEY non valida: deve iniziare con sk_test_ (test) oppure sk_live_ (live).'
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(trimmed, {
      apiVersion: '2025-02-24.acacia'
    });
  }

  return stripeClient;
}
