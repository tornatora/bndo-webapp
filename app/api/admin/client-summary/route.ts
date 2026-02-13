import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsProfile } from '@/lib/auth';
import { getClientSummary } from '@/lib/admin/client-summary';
import { createClient } from '@/lib/supabase/server';

const QuerySchema = z.object({
  companyId: z.string().uuid()
});

export async function GET(request: Request) {
  await requireOpsProfile();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    companyId: url.searchParams.get('companyId')
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
  }

  const companyId = parsed.data.companyId;
  const supabase = createClient();
  const summary = await getClientSummary(supabase, companyId);
  return NextResponse.json(summary);
}
