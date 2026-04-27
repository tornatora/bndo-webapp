import { NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmFinalSubmit } from '@/lib/copilot/service';

export const runtime = 'nodejs';

const BodySchema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await confirmFinalSubmit(body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Conferma finale fallita.' },
      { status: 500 }
    );
  }
}
