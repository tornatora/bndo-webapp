import type {
  PiaAutomationDocumentSlot,
  PiaAutomationInputs,
  PiaAutomationProject,
  PiaAutomationUserProfile,
} from './types';

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

function pickNumber(adminFields: unknown, keys: string[]) {
  const raw = pickFromAdminFields(adminFields, keys);
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function safeLower(s: string) {
  return (s || '').toLowerCase();
}

function guessMimeType(fileName: string) {
  const lower = safeLower(fileName);
  if (lower.endsWith('.p7m')) return 'application/pkcs7-mime';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

function makePortalFileName(requirementKey: string, originalName: string) {
  const clean = (originalName || 'documento').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  // Prefix with requirement key to avoid Invitalia "Allegato già presente" clashes.
  return `${requirementKey}__${clean}`;
}

async function fetchSignedFileBytes(supabaseAdmin: any, storagePath: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from('application-documents').createSignedUrl(storagePath, 60 * 15);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('signedUrl mancante per documento');

  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`download documento fallito: ${res.status}`);
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

export async function loadPiaAutomationInputs(params: {
  supabaseAdmin: any;
  applicationId: string;
}): Promise<PiaAutomationInputs> {
  const { supabaseAdmin, applicationId } = params;

  const { data: app, error: appError } = await supabaseAdmin
    .from('tender_applications')
    .select('id, company_id, tender_id, notes')
    .eq('id', applicationId)
    .maybeSingle();
  if (appError) throw new Error(appError.message);
  if (!app) throw new Error('Pratica non trovata');

  const { data: crm, error: crmError } = await supabaseAdmin
    .from('company_crm')
    .select('admin_fields')
    .eq('company_id', app.company_id)
    .maybeSingle();
  if (crmError) throw new Error(crmError.message);

  const adminFields = crm?.admin_fields ?? {};

  const fullName = pickFromAdminFields(adminFields, ['full_name', 'nome', 'nominativo', 'legal_rep_name']) ?? '';
  const parts = fullName.split(' ').filter(Boolean);
  const firstName = pickFromAdminFields(adminFields, ['first_name', 'nome']) ?? (parts[0] ?? '');
  const lastName = pickFromAdminFields(adminFields, ['last_name', 'cognome']) ?? (parts.slice(1).join(' ') ?? '');

  const user: PiaAutomationUserProfile = {
    firstName: firstName || 'Mario',
    lastName: lastName || 'Rossi',
    taxCode: pickFromAdminFields(adminFields, ['tax_code', 'codice_fiscale', 'cf']),
    vatNumber: pickFromAdminFields(adminFields, ['vat_number', 'partita_iva', 'piva']),
    vatOpenDate: pickFromAdminFields(adminFields, [
      'vat_open_date',
      'piva_open_date',
      'data_apertura_piva',
      'data_apertura_partita_iva',
      'data_apertura_partitaiva',
    ]),
    email: pickFromAdminFields(adminFields, ['email', 'email_address', 'user_email']),
    pec: pickFromAdminFields(adminFields, ['pec', 'email_pec']),
    phone: pickFromAdminFields(adminFields, ['phone', 'telefono', 'phone_number']),
    birthDate: pickFromAdminFields(adminFields, ['birth_date', 'data_nascita']),
    birthPlace: pickFromAdminFields(adminFields, ['birth_place', 'luogo_nascita']),
    sex: pickFromAdminFields(adminFields, ['sex', 'sesso']),
    tipoImpresa: pickFromAdminFields(adminFields, ['tipo_impresa', 'tipologia_impresa', 'tipologia_proponente']),
    address: {
      country: pickFromAdminFields(adminFields, ['country', 'nazione', 'nazione_residenza']) ?? 'Italia',
      region: pickFromAdminFields(adminFields, ['region', 'regione', 'regione_residenza']),
      province: pickFromAdminFields(adminFields, ['province', 'provincia', 'provincia_residenza']),
      city: pickFromAdminFields(adminFields, ['city', 'citta', 'comune', 'comune_residenza']),
      street: pickFromAdminFields(adminFields, ['address', 'indirizzo']),
      civic: pickFromAdminFields(adminFields, ['civico']),
      zip: pickFromAdminFields(adminFields, ['zip', 'cap']),
    },
  };

  const project: PiaAutomationProject = {
    title: pickFromAdminFields(adminFields, ['project_title', 'titolo_progetto', 'titolo']),
    description:
      pickFromAdminFields(adminFields, ['project_description', 'descrizione_progetto']) ??
      (app.notes ? String(app.notes) : undefined),
    ateco: pickFromAdminFields(adminFields, ['ateco', 'codice_ateco']),
    requestedContribution: pickNumber(adminFields, ['requested_amount', 'importo_richiesto', 'contributo_richiesto']),
    iban: pickFromAdminFields(adminFields, ['iban']),
  };

  const { data: docs, error: docsError } = await supabaseAdmin
    .from('application_documents')
    .select('id, file_name, storage_path, requirement_key, created_at')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (docsError) throw new Error(docsError.message);

  const latestByKey: Record<string, any> = {};
  for (const doc of docs ?? []) {
    const key = String((doc as any).requirement_key ?? '').trim();
    if (!key) continue;
    if (latestByKey[key]) continue;
    latestByKey[key] = doc;
  }

  const documents: Record<string, PiaAutomationDocumentSlot | undefined> = {};
  for (const [key, doc] of Object.entries(latestByKey)) {
    try {
      const originalName = String((doc as any).file_name ?? `${key}.pdf`);
      const storagePath = String((doc as any).storage_path ?? '');
      if (!storagePath) continue;
      const buffer = await fetchSignedFileBytes(supabaseAdmin, storagePath);
      documents[key] = {
        requirementKey: key,
        fileName: makePortalFileName(key, originalName),
        mimeType: guessMimeType(originalName),
        buffer,
      };
    } catch {
      // Best-effort: missing docs shouldn't crash the whole automation.
    }
  }

  return { user, project, documents };
}
