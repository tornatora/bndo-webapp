import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUserProfile } from '@/lib/auth';
import { hasAdminAccess, hasConsultantAccess, hasOpsAccess } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import {
  computeDocumentChecklist,
  computeDocumentChecklistFromRequirements
} from '@/lib/admin/document-requirements';
import {
  PROGRESS_STEPS,
  computeDerivedProgressKey,
  computeProgressBar,
  extractProgressFromNotes,
  progressBadge
} from '@/lib/admin/practice-progress';
import { ClientUploadDocButton } from '@/components/dashboard/ClientUploadDocButton';
import { PreventiviSection } from '@/components/dashboard/PreventiviSection';

const ParamsSchema = z.object({
  applicationId: z.string().uuid()
});

const SearchSchema = z.object({
  docs: z.enum(['all', 'missing', 'uploaded']).optional(),
  q: z.string().optional()
});

type DocRow = {
  id: string;
  file_name: string;
  requirement_key: string | null;
  created_at: string;
  storage_path: string;
};

export default async function ClientPracticePage({
  params,
  searchParams
}: {
  params: { applicationId: string };
  searchParams: { docs?: string; q?: string };
}) {
  const parsedParams = ParamsSchema.safeParse(params);
  if (!parsedParams.success) notFound();

  const parsedSearch = SearchSchema.safeParse(searchParams);
  const docsView = parsedSearch.success ? parsedSearch.data.docs ?? 'all' : 'all';
  const q = parsedSearch.success ? parsedSearch.data.q ?? '' : '';
  const qNorm = q.trim().toLowerCase();

  const { profile } = await requireUserProfile();
  if (hasAdminAccess(profile.role)) redirect('/admin');
  if (hasConsultantAccess(profile.role)) redirect('/consultant');
  if (!profile.company_id) notFound();

  const supabase = createClient();

  const { data: application } = await supabase
    .from('tender_applications')
    .select('id, company_id, tender_id, status, supplier_registry_status, notes, updated_at')
    .eq('id', parsedParams.data.applicationId)
    .eq('company_id', profile.company_id)
    .maybeSingle();

  if (!application) notFound();

  const { data: tender } = await supabase
    .from('tenders')
    .select('title, authority_name')
    .eq('id', application.tender_id)
    .maybeSingle();

  const practiceTitle = tender?.title ?? 'Pratica';

  const { data: docsRaw } = await supabase
    .from('application_documents')
    .select('id, file_name, created_at, storage_path')
    .eq('application_id', application.id)
    .order('created_at', { ascending: false })
    .limit(120);
  const dedupeDocs = <T extends { file_name?: string | null }>(rows: T[]) => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = String(row.file_name ?? '').toLowerCase();
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  let typedDocs = dedupeDocs((docsRaw ?? []) as DocRow[]);
  if (hasRealServiceRoleKey()) {
    try {
      const admin = getSupabaseAdmin();
      const { data: adminDocs } = await admin
        .from('application_documents')
        .select('id, file_name, created_at, storage_path')
        .eq('application_id', application.id)
        .order('created_at', { ascending: false })
        .limit(120);
      const adminDeduped = dedupeDocs((adminDocs ?? []) as DocRow[]);
      if (adminDeduped.length >= typedDocs.length) {
        typedDocs = adminDeduped;
      }
    } catch {
      // Keep user-scoped docs if admin fallback fails.
    }
  }
  // Separate preventivi docs from regular docs
  const preventiviDocs = typedDocs.filter((d) => d.file_name.startsWith('Preventivo_spesa__'));
  const regularDocs = typedDocs.filter((d) => !d.file_name.startsWith('Preventivo_spesa__'));

  // Fetch preventivi_testo from company_crm
  let preventivi_testo: string | null = null;
  try {
    if (hasRealServiceRoleKey()) {
      const admin = getSupabaseAdmin();
      const { data: crmRow } = await admin
        .from('company_crm')
        .select('admin_fields')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      const fields = (crmRow?.admin_fields ?? {}) as Record<string, unknown>;
      preventivi_testo =
        typeof fields.preventivi_testo === 'string' && fields.preventivi_testo.trim()
          ? fields.preventivi_testo.trim()
          : null;
    }
  } catch {
    // Non blocchiamo la pagina se CRM non è disponibile
  }

  const { data: dynamicRequirements } = await supabase
    .from('practice_document_requirements')
    .select('application_id, requirement_key, label, description, is_required')
    .eq('application_id', application.id)
    .order('created_at', { ascending: true });

  // FALLBACK: If dynamic table is missing or empty, use static checklist engine
  let checklist = [];
  if ((dynamicRequirements ?? []).length > 0) {
    checklist = computeDocumentChecklistFromRequirements(
      application.id,
      (dynamicRequirements ?? []).map((requirement) => ({
        application_id: requirement.application_id,
        requirement_key: requirement.requirement_key,
        label: requirement.label,
        description: requirement.description,
        is_required: requirement.is_required
      })),
      typedDocs.map((doc) => ({
        application_id: application.id,
        file_name: doc.file_name,
        requirement_key: null
      }))
    );
  } else {
    // Determine practice key from tender
    const { data: tender } = await supabase
      .from('tenders')
      .select('id, grant_slug, external_grant_id')
      .eq('id', application.tender_id)
      .maybeSingle();
    const practiceKey = tender?.grant_slug ?? tender?.external_grant_id ?? 'base';
    checklist = computeDocumentChecklist(
      application.id,
      practiceKey,
      typedDocs.map((doc) => ({
        application_id: application.id,
        file_name: doc.file_name,
        requirement_key: null
      }))
    );
  }

  const missing = checklist.filter((c) => !c.uploaded);
  const missingCount = missing.length;
  // Exclude preventivi docs from the uploaded count shown in the KPIs
  const uploadedCount = regularDocs.length;

  const step =
    extractProgressFromNotes(application.notes ?? null) ??
    computeDerivedProgressKey(application.status, missingCount);
  const bar = computeProgressBar(step);
  const stepLabel = PROGRESS_STEPS.find((s) => s.key === step)?.label ?? step;
  const badge = progressBadge(step);

  // Prepare signed URLs only when needed (regular docs only).
  const docsWithUrls =
    docsView === 'uploaded'
      ? await Promise.all(
          (qNorm ? regularDocs.filter((d) => d.file_name.toLowerCase().includes(qNorm)) : regularDocs).map(async (doc) => {
            const signed = await supabase.storage.from('application-documents').createSignedUrl(doc.storage_path, 3600);
            return {
              ...doc,
              downloadUrl: signed.error ? null : signed.data.signedUrl
            };
          })
        )
      : [];

  const missingFiltered =
    docsView === 'missing'
      ? qNorm
        ? missing.filter((r) => r.label.toLowerCase().includes(qNorm))
        : missing
      : [];

  return (
    <div className="space-y-4">
      <Link href="/dashboard/pratiche" className="inline-flex items-center gap-2 text-sm font-semibold text-brand.steel">
        ← Torna alle pratiche
      </Link>

      <article className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="pratica-type">Pratica</p>
            <h1 className="pratica-title" style={{ marginTop: 6 }}>
              {practiceTitle}
            </h1>
            <p className="pratica-type" style={{ marginTop: 8 }}>
              Aggiornata: {new Date(application.updated_at).toLocaleString('it-IT')}
              {application.notes ? ` · ${application.notes.replace(/\[\[PROGRESS:[^\]]+\]\]/g, '').trim()}` : ''}
            </p>
          </div>

          <span className={badge.className}>{badge.label}</span>
        </div>

        <div className="progress-section" style={{ marginTop: 18 }}>
          <div className="progress-header">
            <span className="progress-label">Avanzamento pratica</span>
            <span className="progress-value">{bar.pct}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${bar.pct}%` }} />
          </div>
          <div className="document-date" style={{ marginTop: 10, marginBottom: 0 }}>
            {stepLabel}
          </div>
        </div>

        <div className="client-practice-kpis" style={{ marginTop: 18 }}>
          <Link className="admin-kpi admin-kpi-link" href={`/dashboard/practices/${application.id}?docs=missing`}>
            <div className="admin-kpi-label">Documenti mancanti</div>
            <div className={`admin-kpi-value ${missingCount > 0 ? 'is-warn' : 'is-ok'}`}>{missingCount}</div>
          </Link>
          <Link className="admin-kpi admin-kpi-link" href={`/dashboard/practices/${application.id}?docs=uploaded`}>
            <div className="admin-kpi-label">Documenti caricati</div>
            <div className="admin-kpi-value">{uploadedCount}</div>
          </Link>
        </div>

        {docsView !== 'all' ? (
          <section className="admin-docs-panel client-docs-panel">
            <div className="admin-docs-panel-head">
              <div className="admin-docs-title">
                {docsView === 'missing' ? 'Documenti mancanti' : 'Documenti caricati'}
              </div>
              <Link className="admin-docs-back" href={`/dashboard/practices/${application.id}`}>
                Chiudi
              </Link>
            </div>

            <div className="admin-docs-search">
              <span className="admin-docs-search-icon">⌕</span>
              <form>
                <input className="admin-docs-search-input" name="q" placeholder="Cerca documento…" defaultValue={q} />
                <input type="hidden" name="docs" value={docsView} />
              </form>
            </div>

            {docsView === 'missing' ? (
              <div className="admin-docs-col">
                <div className="admin-docs-col-title">Mancanti ({missingFiltered.length})</div>
                {missingFiltered.length === 0 ? (
                  <div className="admin-panel-empty">Nessun documento mancante{qNorm ? ' per la ricerca.' : '.'}</div>
                ) : (
                  <ul className="admin-checklist">
                    {missingFiltered.map((req) => (
                      <li key={req.key} className="admin-checklist-item is-missing">
                        <span className="admin-check is-missing" aria-hidden="true" />
                        <span style={{ flex: 1 }}>{req.label}</span>
                        <ClientUploadDocButton
                          applicationId={application.id}
                          requirementKey={req.key}
                          documentLabel={req.label}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="admin-docs-col">
                <div className="admin-docs-col-title">Caricati ({docsWithUrls.length})</div>
                {docsWithUrls.length === 0 ? (
                  <div className="admin-panel-empty">Nessun documento caricato{qNorm ? ' per la ricerca.' : '.'}</div>
                ) : (
                  <div className="admin-table">
                    {docsWithUrls.map((doc) => (
                      <div key={doc.id} className="admin-table-row">
                        <div className="admin-table-main">
                          <div className="admin-table-name">{doc.file_name}</div>
                          <div className="admin-table-meta">{new Date(doc.created_at).toLocaleString('it-IT')}</div>
                        </div>

                        {doc.downloadUrl ? (
                          <a className="btn-doc" href={doc.downloadUrl} target="_blank" rel="noreferrer">
                            <span>👁</span>
                            <span>Apri</span>
                          </a>
                        ) : (
                          <span className="btn-doc" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                            <span>⚠</span>
                            <span>Non disponibile</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        ) : null}

        {/* Sezione Preventivi */}
        <PreventiviSection
          preventivi_testo={preventivi_testo}
          files={preventiviDocs.map((doc) => ({
            id: doc.id,
            fileName: doc.file_name,
            createdAt: doc.created_at,
            fileSize: 0,
            downloadUrl: null
          }))}
        />
      </article>
    </div>
  );
}
