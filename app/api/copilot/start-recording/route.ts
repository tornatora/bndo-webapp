import { NextResponse } from 'next/server';
import { z } from 'zod';
import { startRecordingSession } from '@/lib/copilot/service';

export const runtime = 'nodejs';

const BodySchema = z.object({
  clientId: z.string().uuid(),
  applicationId: z.string().uuid(),
  bandoKey: z.string().min(1).max(200),
  proceduraKey: z.string().min(1).max(200),
  nameHint: z.string().max(150).optional(),
  demoMode: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await startRecordingSession(body);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Avvio registrazione fallito.' },
      { status: 500 }
    );
  }
}
