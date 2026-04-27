import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin, hasRealServiceRoleKey } from '@/lib/supabase/admin';
import { hasOpsAccess } from '@/lib/roles';
import type { CopilotClientPayload } from '@/lib/copilot/types';
import type { SupabaseClient } from '@supabase/supabase-js';

function pickFromAdminFields(adminFields: unknown, keys: string[]) {
  if (!adminFields || typeof adminFields !== 'object') return undefined;
  const map = adminFields as Record<string, unknown>;
  for (const key of keys) {
    const value = map[key];
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    return normalized;
  }
  return undefined;
}

async function fetchTendersByIds(supabase: SupabaseClient, tenderIds: string[]) {
  const normalizedIds = Array.from(new Set(tenderIds.map((id) => String(id).trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return new Map<string, any>();

  let queryResult = await (supabase as any)
    .from('tenders')
    .select('id, title, grant_slug, external_grant_id, metadata')
    .in('id', normalizedIds);

  if (queryResult.error && /column .* does not exist/i.test(String(queryResult.error.message))) {
    queryResult = await (supabase as any)
      .from('tenders')
      .select('id, title, external_grant_id, metadata')
      .in('id', normalizedIds);
  }

  if (queryResult.error) throw new Error(queryResult.error.message);

  return new Map((queryResult.data ?? []).map((row: any) => [String(row.id), row]));
}

export async function listCopilotClientsForViewer(viewer: {
  id: string;
  role: string;
  company_id: string | null;
}) {
  const supabase = hasRealServiceRoleKey() && hasOpsAccess(viewer.role) ? getSupabaseAdmin() : createClient();

  if (!hasOpsAccess(viewer.role)) {
    const { data: selfProfile, error: selfError } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_id, companies(name)')
      .eq('id', viewer.id)
      .maybeSingle();

    if (selfError) throw new Error(selfError.message);
    if (!selfProfile) return [];
    const self = selfProfile as any;

    return [
      {
        id: String(self.id),
        fullName: String(self.full_name ?? ''),
        email: String(self.email ?? ''),
        companyId: String(self.company_id ?? ''),
        companyName: String(self.companies?.name ?? 'Azienda'),
      },
    ];
  }

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, company_id, companies(name)')
    .eq('role', 'client_admin')
    .order('created_at', { ascending: false })
    .limit(200);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    fullName: String(row.full_name ?? ''),
    email: String(row.email ?? ''),
    companyId: String(row.company_id ?? ''),
    companyName: String(row.companies?.name ?? 'Azienda'),
  }));
}

export async function listCopilotTemplatesForViewer(viewer: {
  id: string;
  role: string;
}) {
  const useAdminForClient = !hasOpsAccess(viewer.role) && hasRealServiceRoleKey();
  const supabase = (useAdminForClient ? getSupabaseAdmin() : createClient()) as any;

  async function runQuery(selectClause: string) {
    let query = supabase
      .from('copilot_templates')
      .select(selectClause)
      .order('updated_at', { ascending: false })
      .limit(180);

    if (hasOpsAccess(viewer.role)) {
      // Ops/consultant can inspect full template set.
    } else if (useAdminForClient) {
      // Client should only see active templates when using service-role fallback.
      query = query.eq('status', 'active');
    } else {
      query = query.eq('created_by', viewer.id);
    }

    return query;
  }

  let result = await runQuery(
    'id, name, practice_key, bando_key, procedura_key, domain, status, version, updated_at, created_by'
  );

  if (result.error && /column .* does not exist/i.test(String(result.error.message))) {
    result = await runQuery('id, name, practice_key, domain, status, version, updated_at, created_by');
  }

  if (result.error) throw new Error(result.error.message);

  return (result.data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    bandoKey: String(row.bando_key ?? row.practice_key ?? 'generica'),
    proceduraKey: String(row.procedura_key ?? 'default'),
    practiceKey: String(row.practice_key ?? row.bando_key ?? 'generica'),
    domain: String(row.domain),
    status: String(row.status),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at ?? ''),
    createdBy: String(row.created_by ?? ''),
  }));
}

export async function listClientApplications(input: {
  viewerRole: string;
  viewerCompanyId: string | null;
  clientId: string;
}) {
  const supabase =
    (hasRealServiceRoleKey() && hasOpsAccess(input.viewerRole) ? getSupabaseAdmin() : createClient()) as SupabaseClient;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, company_id, full_name')
    .eq('id', input.clientId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.company_id) return [];

  if (!hasOpsAccess(input.viewerRole) && input.viewerCompanyId !== profile.company_id) {
    throw new Error('Accesso negato al cliente selezionato.');
  }

  const { data: apps, error } = await (supabase as any)
    .from('tender_applications')
    .select('id, tender_id, status, updated_at')
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  const tenderMap = await fetchTendersByIds(
    supabase,
    (apps ?? []).map((row: any) => String(row.tender_id ?? '')).filter(Boolean),
  );

  return (apps ?? []).map((row: any) => ({
    id: String(row.id),
    status: String(row.status ?? 'draft'),
    updatedAt: String(row.updated_at ?? ''),
    title: String(tenderMap.get(String(row.tender_id))?.title ?? 'Pratica'),
    practiceKey: String(
      tenderMap.get(String(row.tender_id))?.grant_slug ?? tenderMap.get(String(row.tender_id))?.external_grant_id ?? 'generica',
    ),
  }));
}

export async function buildCopilotClientPayload(input: {
  viewerRole: string;
  viewerCompanyId: string | null;
  clientId: string;
  applicationId: string;
}): Promise<CopilotClientPayload> {
  const supabase =
    (hasRealServiceRoleKey() && hasOpsAccess(input.viewerRole) ? getSupabaseAdmin() : createClient()) as SupabaseClient;

  const { data: clientProfile, error: clientProfileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, company_id')
    .eq('id', input.clientId)
    .maybeSingle();

  if (clientProfileError) throw new Error(clientProfileError.message);
  if (!clientProfile) throw new Error('Cliente non trovato.');
  if (!clientProfile.company_id) throw new Error('Cliente non associato a una azienda.');

  if (!hasOpsAccess(input.viewerRole) && input.viewerCompanyId !== clientProfile.company_id) {
    throw new Error('Accesso negato al cliente selezionato.');
  }

  const { data: application, error: appError } = await (supabase as any)
    .from('tender_applications')
    .select('id, company_id, tender_id, notes, updated_at')
    .eq('id', input.applicationId)
    .eq('company_id', clientProfile.company_id)
    .maybeSingle();

  if (appError) throw new Error(appError.message);
  if (!application) throw new Error('Pratica non trovata per il cliente selezionato.');

  const tenderMap = await fetchTendersByIds(supabase, [String(application.tender_id ?? '')]);
  const tender = tenderMap.get(String(application.tender_id ?? ''));

  const { data: crm } = await supabase
    .from('company_crm')
    .select('admin_fields')
    .eq('company_id', clientProfile.company_id)
    .maybeSingle();

  const adminFields = crm?.admin_fields ?? {};

  const { data: docs, error: docsError } = await supabase
    .from('application_documents')
    .select('id, file_name, storage_path, requirement_key')
    .eq('application_id', application.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (docsError) throw new Error(docsError.message);

  const signer = hasRealServiceRoleKey() ? getSupabaseAdmin() : supabase;
  const documents = await Promise.all(
    (docs ?? []).map(async (doc: any) => {
      const signed = await signer.storage
        .from('application-documents')
        .createSignedUrl(String(doc.storage_path), 60 * 60);

      return {
        id: String(doc.id),
        name: String(doc.file_name),
        category: String(doc.requirement_key ?? 'documento_generico'),
        signedUrl: signed.data?.signedUrl ?? '',
      };
    })
  );

  const notes = String(application.notes ?? '');

  const payload: CopilotClientPayload = {
    client: {
      fullName: String(clientProfile.full_name ?? ''),
      email: String(clientProfile.email ?? ''),
      phone: pickFromAdminFields(adminFields, ['phone', 'telefono', 'phone_number']),
      taxCode: pickFromAdminFields(adminFields, ['tax_code', 'codice_fiscale', 'cf']),
      vatNumber: pickFromAdminFields(adminFields, ['vat_number', 'partita_iva', 'piva']),
      address: pickFromAdminFields(adminFields, ['address', 'indirizzo']),
      city: pickFromAdminFields(adminFields, ['city', 'citta']),
      province: pickFromAdminFields(adminFields, ['province', 'provincia']),
      zip: pickFromAdminFields(adminFields, ['zip', 'cap']),
      birthDate: pickFromAdminFields(adminFields, ['birth_date', 'data_nascita']),
      birthPlace: pickFromAdminFields(adminFields, ['birth_place', 'luogo_nascita']),
    },
    practice: {
      key: String(
        tender?.grant_slug ?? tender?.external_grant_id ?? 'generica'
      ),
      requestedAmount: Number(pickFromAdminFields(adminFields, ['requested_amount', 'importo_richiesto']) ?? 0) || undefined,
      projectDescription:
        pickFromAdminFields(adminFields, ['project_description', 'descrizione_progetto']) ?? (notes || undefined),
      applicationId: String(application.id),
      title: String(tender?.title ?? 'Pratica'),
      updatedAt: String(application.updated_at ?? ''),
      tenderMetadata: (tender?.metadata ?? {}) as Record<string, unknown>,
    },
    documents: documents.filter((doc) => doc.signedUrl),
  };

  return payload;
}
