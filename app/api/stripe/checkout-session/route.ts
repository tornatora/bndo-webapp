import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  session_id: z.string().trim().min(8)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({ session_id: url.searchParams.get('session_id') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'session_id non valido.' }, { status: 422 });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(parsed.data.session_id);

    const email = session.customer_details?.email ?? session.customer_email ?? null;
    const name = session.customer_details?.name ?? null;
    const createdAt = session.created ? new Date(session.created * 1000).toISOString() : null;

    return NextResponse.json(
      {
        ok: true,
        session: {
          id: session.id,
          status: session.status ?? null,
          payment_status: session.payment_status ?? null,
          customer_email: email,
          customer_name: name,
          amount_total: session.amount_total ?? null,
          currency: session.currency ?? null,
          created_at: createdAt
        }
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore recupero sessione Stripe.' },
      { status: 500 }
    );
  }
}

