import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { enforceRateLimit, getClientIp, publicError, rejectCrossSiteMutation } from '@/lib/security/http';

export const runtime = 'nodejs';

const checkoutSchema = z.object({
  fullName: z.string().min(2),
  companyName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  challenge: z.string().optional().nullable()
});

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'checkout-create',
      key: getClientIp(request),
      limit: 20,
      windowMs: 10 * 60_000
    });
    if (rateLimit) return rateLimit;

    const supabaseAdmin = getSupabaseAdmin();
    const stripe = getStripeClient();

    if (!process.env.STRIPE_PRICE_ID) {
      return NextResponse.json(
        { error: 'Variabile STRIPE_PRICE_ID mancante in ambiente.' },
        { status: 500 }
      );
    }

    const json = await request.json();
    const payload = checkoutSchema.parse(json);

    await supabaseAdmin.from('leads').insert({
      full_name: payload.fullName,
      email: payload.email,
      company_name: payload.companyName,
      phone: payload.phone || null,
      challenge: payload.challenge || null
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: payload.email,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}?checkout=cancelled`,
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      metadata: {
        companyName: payload.companyName,
        contactName: payload.fullName,
        phone: payload.phone || '',
        challenge: payload.challenge || ''
      }
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati modulo non validi.' }, { status: 422 });
    }

    return NextResponse.json(
      {
        error: publicError(error, 'Impossibile creare la sessione checkout.')
      },
      { status: 500 }
    );
  }
}
