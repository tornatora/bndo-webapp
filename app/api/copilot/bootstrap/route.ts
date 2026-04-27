import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  loadCopilotBootstrap,
  loadCopilotClientContext,
} from '@/lib/copilot/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

function safeCopilotError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/column .* does not exist|relation .* does not exist|syntax error/i.test(message)) {
    return 'Servizio Co-pilot in aggiornamento. Riprova tra pochi minuti.';
  }
  return message || fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = QuerySchema.parse({
      clientId: url.searchParams.get('clientId') ?? undefined,
      applicationId: url.searchParams.get('applicationId') ?? undefined,
    });

    const base = await loadCopilotBootstrap();

    if (!query.clientId && !query.applicationId) {
      return NextResponse.json({ ok: true, ...base });
    }

    const context = await loadCopilotClientContext({
      clientId: query.clientId ?? null,
      applicationId: query.applicationId ?? null,
    });

    return NextResponse.json({ ok: true, ...base, context });
  } catch (error) {
    console.error('[copilot/bootstrap] error', error);
    return NextResponse.json(
      { ok: false, error: safeCopilotError(error, 'Errore bootstrap copilot.') },
      { status: 500 }
    );
  }
}
