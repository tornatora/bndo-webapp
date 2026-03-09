import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';

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
  const { data: doc, error: docErr } = await supabase
    .from('application_documents')
    .select('id, storage_path, application_id')
    .eq('id', parsed.data.documentId)
    .maybeSingle();

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });
  if (!doc?.storage_path) return NextResponse.json({ error: 'Documento non trovato.' }, { status: 404 });

  if (!hasOpsAccess(profile.role)) {
    // Defensive check: ensure the application belongs to the viewer company.
    const { data: app } = await supabase
      .from('tender_applications')
      .select('company_id')
      .eq('id', doc.application_id)
      .maybeSingle();
    if (!profile.company_id || !app?.company_id || profile.company_id !== app.company_id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  }

  // Use service role to sign URLs for maximum reliability (storage policies won't block),
  // but only after RLS has proven the caller can see the document row.
  const signer = hasRealServiceRoleKey() ? getSupabaseAdmin() : supabase;
  const signed = await signer.storage.from('application-documents').createSignedUrl(doc.storage_path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message ?? 'Impossibile generare URL.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.data.signedUrl }, { status: 200 });
}
