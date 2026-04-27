import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listSessionEvents } from '@/lib/copilot/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  sessionId: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = QuerySchema.parse({
      sessionId: url.searchParams.get('sessionId') ?? '',
    });

    const data = await listSessionEvents(query.sessionId);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Lettura eventi fallita.' },
      { status: 500 }
    );
  }
}
