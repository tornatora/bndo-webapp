import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { hasOpsAccess } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  documentId: z.string().uuid()
});

export async function GET(request: Request) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('id, company_id, role').eq('id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Profilo non valido.' }, { status: 403 });

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ documentId: url.searchParams.get('documentId') ?? '' });
  if (!parsed.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  // RLS on application_documents already enforces access for company members / ops users.
  // We still do an explicit check for non-ops users: the document must belong to their company.
  const { data: doc, error: docErr } = await supabase
    .from('application_documents')
    .select('id, storage_path, application_id, tender_applications(company_id)')
    .eq('id', parsed.data.documentId)
    .maybeSingle();

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });
  if (!doc?.storage_path) return NextResponse.json({ error: 'Documento non trovato.' }, { status: 404 });

  const docCompanyId = (doc as unknown as { tender_applications?: { company_id: string } | null }).tender_applications?.company_id ?? null;
  if (!hasOpsAccess(profile.role)) {
    if (!profile.company_id || !docCompanyId || profile.company_id !== docCompanyId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  }

  const signed = await supabase.storage.from('application-documents').createSignedUrl(doc.storage_path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message ?? 'Impossibile generare URL.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.data.signedUrl }, { status: 200 });
}

