import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';
import { enforceRateLimit, getClientIp, publicError, safeSessionId } from '@/lib/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  session_id: z.string().trim().min(8)
});

export async function GET(request: Request) {
  try {
    const limit = enforceRateLimit({
      namespace: 'stripe-checkout-session',
      key: getClientIp(request),
      limit: 60,
      windowMs: 60_000
    });
    if (limit) return limit;

    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({ session_id: url.searchParams.get('session_id') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'session_id non valido.' }, { status: 422 });
    }

    const safeId = safeSessionId(parsed.data.session_id);
    if (!safeId) {
      return NextResponse.json({ error: 'session_id non valido.' }, { status: 422 });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(safeId);

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
      { error: publicError(error, 'Impossibile verificare la sessione Stripe in questo momento.') },
      { status: 503 }
    );
  }
}
