import { NextResponse } from 'next/server';
import { z } from 'zod';
import { retrySessionWithAiFallback } from '@/lib/copilot/service';

export const runtime = 'nodejs';

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  stepKey: z.string().trim().max(200).optional(),
  instruction: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await retrySessionWithAiFallback(body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Retry AI non riuscito.' },
      { status: 500 },
    );
  }
}
