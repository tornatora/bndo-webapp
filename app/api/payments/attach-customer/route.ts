import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripeClient } from '@/lib/stripe';
import {
  enforceRateLimit,
  getClientIp,
  publicError,
  rejectCrossSiteMutation,
  safeSessionId,
} from '@/lib/security/http';
import { upsertPracticePaymentFromIntent } from '@/lib/services/practicePayments';

export const runtime = 'nodejs';

const BodySchema = z.object({
  paymentIntentId: z.string().trim().min(8),
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const rateLimit = enforceRateLimit({
      namespace: 'payments-attach-customer',
      key: getClientIp(request),
      limit: 50,
      windowMs: 10 * 60_000,
    });
    if (rateLimit) return rateLimit;

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati cliente non validi.' }, { status: 422 });
    }

    const safeIntentId = safeSessionId(parsed.data.paymentIntentId);
    if (!safeIntentId || !safeIntentId.startsWith('pi_')) {
      return NextResponse.json({ error: 'paymentIntentId non valido.' }, { status: 422 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const fullName = `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`.trim();
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.update(safeIntentId, {
      receipt_email: email,
      metadata: {
        customer_email: email,
        customer_name: fullName,
      },
    });

    try {
      await upsertPracticePaymentFromIntent({
        intent,
        forceStatus: intent.status === 'succeeded' ? 'paid' : 'pending',
      });
    } catch {
      // Webhook/session-status will reconcile if sync fails here.
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: publicError(error, 'Impossibile salvare i dati cliente per il pagamento.') },
      { status: 500 },
    );
  }
}

