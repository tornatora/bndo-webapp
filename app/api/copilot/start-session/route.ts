import { NextResponse } from 'next/server';
import { z } from 'zod';
import { startCopilotSession } from '@/lib/copilot/service';

export const runtime = 'nodejs';

const BodySchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  bandoKey: z.string().min(1).max(200),
  proceduraKey: z.string().min(1).max(200).optional().nullable(),
  demoMode: z.boolean().default(false),
  runMode: z.enum(['real_or_demo_fallback', 'demo_only']).optional(),
  credentials: z
    .object({
      email: z.string().email().optional(),
      password: z.string().min(1).max(300).optional(),
    })
    .optional(),
});

function safeCopilotError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/column .* does not exist|relation .* does not exist|syntax error/i.test(message)) {
    return 'Servizio Co-pilot in aggiornamento. Riprova tra pochi minuti.';
  }
  return message || fallback;
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await startCopilotSession(body);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    console.error('[copilot/start-session] error', error);
    return NextResponse.json(
      { ok: false, error: safeCopilotError(error, 'Avvio sessione fallito.') },
      { status: 500 }
    );
  }
}
