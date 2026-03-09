import { NextResponse } from 'next/server';
import { z } from 'zod';
import { provisionAccountFromCheckout } from '@/lib/services/provisioning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  email: z.string().email(),
  companyName: z.string().min(2),
  contactName: z.string().min(2),
  checkoutSessionId: z.string().min(8).optional()
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production.' }, { status: 404 });
  }

  const expectedSecret = process.env.DEV_PROVISION_SECRET;
  const providedSecret = request.headers.get('x-dev-provision-secret');

  if (!expectedSecret || !providedSecret || expectedSecret !== providedSecret) {
    return NextResponse.json({ error: 'Unauthorized dev provision request.' }, { status: 401 });
  }

  try {
    const payload = requestSchema.parse(await request.json());
    const checkoutSessionId = payload.checkoutSessionId ?? `manual_${Date.now()}`;

    const result = await provisionAccountFromCheckout({
      checkoutSessionId,
      customerEmail: payload.email,
      companyName: payload.companyName,
      contactName: payload.contactName
    });

    return NextResponse.json(
      {
        success: true,
        checkoutSessionId,
        ...result
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 422 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Provisioning failed.'
      },
      { status: 500 }
    );
  }
}
