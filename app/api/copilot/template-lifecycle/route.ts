import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateTemplateLifecycle } from '@/lib/copilot/service';

export const runtime = 'nodejs';

const BodySchema = z.object({
  templateId: z.string().uuid(),
  action: z.enum(['activate', 'deactivate', 'duplicate', 'soft_delete', 'restore']),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await updateTemplateLifecycle(body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Operazione template non riuscita.' },
      { status: 500 },
    );
  }
}
