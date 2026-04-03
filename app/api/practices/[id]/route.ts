import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasOpsAccess } from '@/lib/roles';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { computeDocumentChecklistFromRequirements } from '@/lib/admin/document-requirements';
import {
  computeDerivedProgressKey,
  computeProgressBar,
  extractProgressFromNotes,
  progressBadge
} from '@/lib/admin/practice-progress';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.company_id) {
    return NextResponse.json({ error: 'Profilo non valido o non autorizzato.' }, { status: 403 });
  }

  if (hasOpsAccess(profile.role)) {
    return NextResponse.json({ error: 'Accesso non consentito.' }, { status: 403 });
  }

  const { data: application } = await supabase
    .from('tender_applications')
    .select('id, tender_id, status, notes, updated_at')
    .eq('id', params.id)
    .eq('company_id', profile.company_id)
    .maybeSingle();

  if (!application) {
    return NextResponse.json({ error: 'Pratica non trovata.' }, { status: 404 });
  }

  const { data: tender } = await supabase
    .from('tenders')
    .select('title, authority_name')
    .eq('id', application.tender_id)
    .maybeSingle();

  const { data: docsRaw } = await supabase
    .from('application_documents')
    .select('id, file_name, requirement_key, created_at, storage_path')
    .eq('application_id', application.id)
    .order('created_at', { ascending: false });
  let docs = docsRaw ?? [];
  if (hasRealServiceRoleKey()) {
    try {
      const admin = getSupabaseAdmin();
      const { data: adminDocs } = await admin
        .from('application_documents')
        .select('id, file_name, requirement_key, created_at, storage_path')
        .eq('application_id', application.id)
        .order('created_at', { ascending: false });
      if ((adminDocs ?? []).length >= docs.length) {
        docs = adminDocs ?? [];
      }
    } catch {
      // Keep user-scoped docs if admin fallback fails.
    }
  }

  const { data: dynamicRequirements } = await supabase
    .from('practice_document_requirements')
    .select('application_id, requirement_key, label, description, is_required')
    .eq('application_id', application.id);

  const checklist =
    (dynamicRequirements ?? []).length > 0
      ? computeDocumentChecklistFromRequirements(
          application.id,
          dynamicRequirements!.map(r => ({ ...r, application_id: r.application_id })),
          docs.map(d => ({ application_id: application.id, file_name: d.file_name, requirement_key: d.requirement_key }))
      )
      : [];

  const missingCount = checklist.filter(c => !c.uploaded).length;
  const step =
    extractProgressFromNotes(application.notes ?? null) ??
    computeDerivedProgressKey(application.status, missingCount);
  const bar = computeProgressBar(step);
  const badge = progressBadge(step);

  return NextResponse.json({
    ok: true,
    application: {
      id: application.id,
      title: tender?.title || 'Pratica',
      authority: tender?.authority_name,
      status: application.status,
      updatedAt: application.updated_at,
      progressPct: bar.pct,
      statusLabel: badge.label,
      statusClassName: badge.className,
      checklist,
      docs: docs.map(d => ({
        id: d.id,
        fileName: d.file_name,
        createdAt: d.created_at,
        requirementKey: d.requirement_key
      }))
    }
  });
}
