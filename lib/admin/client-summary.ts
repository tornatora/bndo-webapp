import type { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { listApplicationDocumentsCompat } from '@/lib/db/applicationDocumentsCompat';

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export type ClientSummary = {
  company: {
    id: string;
    name: string;
    vat_number: string | null;
    industry: string | null;
    annual_spend_target: number | null;
    created_at: string;
  } | null;
  clientProfile: {
    id: string;
    email: string;
    full_name: string;
    username: string;
    role: string;
    created_at: string;
  } | null;
  applications: Array<{
    id: string;
    tender_id: string;
    tender_title: string | null;
    status: string;
    supplier_registry_status: string;
    notes: string | null;
    updated_at: string;
  }>;
  documents: Array<{
    id: string;
    application_id: string;
    file_name: string;
    requirement_key: string | null;
    storage_path: string;
    file_size: number;
    mime_type: string;
    created_at: string;
    downloadUrl: string | null;
  }>;
  practiceRequirements: Array<{
    application_id: string;
    requirement_key: string;
    label: string;
    description: string | null;
    is_required: boolean;
    status: 'missing' | 'uploaded' | 'waived';
  }>;
  /** Testo dei preventivi inseriti durante l'onboarding (da company_crm.admin_fields.preventivi_testo) */
  preventivi_testo: string | null;
};

type DocumentRow = {
  id: string;
  application_id: string;
  file_name: string;
  requirement_key: string | null;
  storage_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
};

export async function getClientSummary(supabase: SupabaseServerClient, companyId: string): Promise<ClientSummary> {
  const [{ data: company }, { data: clientProfile }] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, vat_number, industry, annual_spend_target, created_at')
      .eq('id', companyId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, email, full_name, username, role, created_at')
      .eq('company_id', companyId)
      .eq('role', 'client_admin')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  ]);

  const { data: applications } = await supabase
    .from('tender_applications')
    .select('id, tender_id, status, supplier_registry_status, notes, updated_at, tender:tenders(title)')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(120);

  const applicationsWithTitle =
    (applications ?? []).map((row) => ({
      id: row.id as string,
      tender_id: row.tender_id as string,
      tender_title: (row as unknown as { tender?: { title?: string | null } }).tender?.title ?? null,
      status: row.status as string,
      supplier_registry_status: row.supplier_registry_status as string,
      notes: (row as unknown as { notes?: string | null }).notes ?? null,
      updated_at: row.updated_at as string
    })) ?? [];

  const applicationIds = applicationsWithTitle.map((item) => item.id);

  const docsResult = applicationIds.length
    ? await listApplicationDocumentsCompat({
        client: supabase as unknown as Parameters<typeof listApplicationDocumentsCompat>[0]['client'],
        applicationIds,
        limit: 120,
        ascending: false,
        includeExtendedColumns: true
      })
    : { rows: [] as DocumentRow[], error: null };
  if (docsResult.error) {
    throw new Error(docsResult.error.message ?? 'Errore caricamento documenti cliente.');
  }

  const { data: practiceRequirements } = applicationIds.length
    ? await supabase
        .from('practice_document_requirements')
        .select('application_id, requirement_key, label, description, is_required, status')
        .in('application_id', applicationIds)
    : {
        data: [] as Array<{
          application_id: string;
          requirement_key: string;
          label: string;
          description: string | null;
          is_required: boolean;
          status: 'missing' | 'uploaded' | 'waived';
        }>
      };

  // Fetch preventivi_testo from company_crm
  let preventivi_testo: string | null = null;
  try {
    const { data: crmRow } = await supabase
      .from('company_crm')
      .select('admin_fields')
      .eq('company_id', companyId)
      .maybeSingle();
    const fields = (crmRow?.admin_fields ?? {}) as Record<string, unknown>;
    preventivi_testo = typeof fields.preventivi_testo === 'string' && fields.preventivi_testo.trim()
      ? fields.preventivi_testo.trim()
      : null;
  } catch {
    // Non blocchiamo il caricamento se CRM non è disponibile
  }

  const docsWithLinksRaw = await Promise.all(
    (docsResult.rows ?? []).map(async (doc) => {
      if (!doc.id || !doc.storage_path || !doc.created_at || typeof doc.file_size !== 'number' || !doc.mime_type) {
        return null;
      }
      const signed = await supabase.storage.from('application-documents').createSignedUrl(doc.storage_path, 3600);
      return {
        id: doc.id,
        application_id: doc.application_id,
        file_name: doc.file_name,
        requirement_key: doc.requirement_key,
        storage_path: doc.storage_path,
        file_size: doc.file_size,
        mime_type: doc.mime_type,
        created_at: doc.created_at,
        downloadUrl: signed.error ? null : signed.data.signedUrl
      };
    })
  );
  const docsWithLinks = docsWithLinksRaw.filter(
    (doc): doc is Exclude<(typeof docsWithLinksRaw)[number], null> => doc !== null
  );

  return {
    company,
    clientProfile,
    applications: applicationsWithTitle,
    documents: docsWithLinks,
    practiceRequirements: practiceRequirements ?? [],
    preventivi_testo
  };
}
