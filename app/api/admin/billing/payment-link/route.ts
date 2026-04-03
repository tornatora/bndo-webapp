import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';
import { requireOpsProfile } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await requireOpsProfile();
    const { companyId, applicationId, amount = 0 } = await request.json();

    if (!companyId || !applicationId) {
      return NextResponse.json({ error: 'Mancano i parametri obbligatori.' }, { status: 400 });
    }
    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json({ error: 'Importo non valido.' }, { status: 422 });
    }

    const stripe = getStripeClient();

    // Create a product for the balance
    const product = await stripe.products.create({
      name: `Saldo pratica - ${normalizedAmount}€`,
      description: `Rimanente per invio pratica ${applicationId.slice(0, 8)}`,
    });

    // Create a price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(normalizedAmount * 100), // in cents
      currency: 'eur',
    });

    // Create a payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: {
        companyId,
        applicationId,
        type: 'balance_payment',
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/practices/${applicationId}?payment=success`,
        },
      },
    });

    return NextResponse.json({ url: paymentLink.url });
  } catch (error) {
    console.error('[STRIKE_LINK_ERROR]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore generazione link Stripe.' },
      { status: 500 }
    );
  }
}
