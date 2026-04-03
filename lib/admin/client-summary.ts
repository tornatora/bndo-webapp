import type { createClient as createSupabaseServerClient } from '@/lib/supabase/server';

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

  const { data: documents } = applicationIds.length
    ? await supabase
        .from('application_documents')
        .select('id, application_id, file_name, requirement_key, storage_path, file_size, mime_type, created_at')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })
        .limit(120)
    : { data: [] as DocumentRow[] };

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

  const docsWithLinks = await Promise.all(
    (documents ?? []).map(async (doc) => {
      const signed = await supabase.storage.from('application-documents').createSignedUrl(doc.storage_path, 3600);
      return {
        ...doc,
        downloadUrl: signed.error ? null : signed.data.signedUrl
      };
    })
  );

  return {
    company,
    clientProfile,
    applications: applicationsWithTitle,
    documents: docsWithLinks,
    practiceRequirements: practiceRequirements ?? []
  };
}
