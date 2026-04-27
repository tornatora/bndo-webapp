import { NextResponse } from 'next/server';
import { z } from 'zod';
import { submitWaitingHumanInput } from '@/lib/copilot/service';

export const runtime = 'nodejs';

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  fields: z.record(z.string(), z.string()).optional(),
  otp: z.string().trim().min(3).max(32).optional(),
  message: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await submitWaitingHumanInput(body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore gestione waiting_human.' },
      { status: 500 },
    );
  }
}
