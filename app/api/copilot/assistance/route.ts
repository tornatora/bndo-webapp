import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listAssistanceMessages, pushAssistanceMessage } from '@/lib/copilot/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  sessionId: z.string().uuid(),
});

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  body: z.string().trim().min(1).max(1200),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = QuerySchema.parse({
      sessionId: url.searchParams.get('sessionId') ?? '',
    });

    const data = await listAssistanceMessages(query);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore lettura chat assistenza.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await pushAssistanceMessage(body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore invio messaggio assistenza.' },
      { status: 500 },
    );
  }
}
