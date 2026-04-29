import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { REQUIRED_DOCS_PIA_VOUCHER, type RequiredDoc } from '@/lib/admin/document-requirements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IncomingCustomField = { key?: unknown; value?: unknown };
type IncomingExtracted = Record<string, unknown>;

type ReadinessBody = {
  applicationId?: unknown;
  extracted?: IncomingExtracted;
  customFields?: IncomingCustomField[];
};

type MissingField = { key: string; label: string };
type MissingDocument = { key: string; label: string };

const REQUIRED_FIELD_SPECS: Array<{ key: string; label: string; aliases: string[] }> = [
  { key: 'ragione_sociale', label: 'Ragione sociale', aliases: ['ragione_sociale', 'ragione sociale', 'denominazione'] },
  { key: 'sede_legale', label: 'Sede legale', aliases: ['sede_legale', 'sede legale', 'indirizzo sede'] },
  { key: 'codice_fiscale', label: 'Codice fiscale', aliases: ['codice_fiscale', 'codice fiscale', 'cf'] },
  { key: 'partita_iva', label: 'Partita IVA', aliases: ['partita_iva', 'partita iva', 'piva', 'p iva'] },
  { key: 'forma_giuridica', label: 'Forma giuridica', aliases: ['forma_giuridica', 'forma giuridica'] },
  {
    key: 'nome_legale_rappresentante',
    label: 'Nome legale rappresentante',
    aliases: ['nome_legale_rappresentante', 'nome legale rappresentante', 'legale rappresentante'],
  },
  { key: 'email_pec', label: 'Email PEC', aliases: ['email_pec', 'pec', 'mail pec'] },
  { key: 'telefono', label: 'Telefono', aliases: ['telefono', 'tel', 'cellulare'] },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildCustomLookup(customFields: IncomingCustomField[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(customFields)) return map;
  for (const item of customFields) {
    const key = toText(item?.key);
    const value = toText(item?.value);
    if (!key || !value) continue;
    map.set(normalize(key), value);
  }
  return map;
}

function findFieldValue(spec: { key: string; aliases: string[] }, extracted: IncomingExtracted, customMap: Map<string, string>): string {
  const direct = toText(extracted?.[spec.key]);
  if (direct) return direct;
  for (const alias of spec.aliases) {
    const fromCustom = customMap.get(normalize(alias));
    if (fromCustom) return fromCustom;
  }
  return '';
}

function resolveRequiredDocs(dynamicRequirements: Array<{ requirement_key: string; label: string }> | null): RequiredDoc[] {
  if (!dynamicRequirements || dynamicRequirements.length === 0) return REQUIRED_DOCS_PIA_VOUCHER;
  return dynamicRequirements.map((item) => ({
    key: item.requirement_key as RequiredDoc['key'],
    label: item.label || item.requirement_key,
    keywords: [item.requirement_key, item.label || item.requirement_key],
  }));
}

function computeMissingDocuments(
  docs: Array<{ file_name: string; requirement_key: string | null }>,
  requiredDocs: RequiredDoc[]
): MissingDocument[] {
  const normalizedDocs = docs.map((doc) => ({
    requirementKey: toText(doc.requirement_key),
    normalizedName: normalize(doc.file_name || ''),
  }));

  return requiredDocs
    .filter((required) => {
      const normalizedLabel = normalize(required.label);
      const keyNormalized = normalize(required.key);
      const uploaded = normalizedDocs.some((doc) => {
        if (doc.requirementKey && doc.requirementKey === required.key) return true;
        if (!doc.normalizedName) return false;
        if (doc.normalizedName.includes(keyNormalized)) return true;
        if (normalizedLabel && doc.normalizedName.includes(normalizedLabel)) return true;
        return required.keywords.some((keyword) => doc.normalizedName.includes(normalize(keyword)));
      });
      return !uploaded;
    })
    .map((required) => ({ key: required.key, label: required.label }));
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as ReadinessBody;
    const extracted = (body.extracted && typeof body.extracted === 'object' ? body.extracted : {}) as IncomingExtracted;
    const customMap = buildCustomLookup(body.customFields);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, company_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
    if (!profile?.company_id) {
      return NextResponse.json({ ok: false, error: 'Profilo non associato a un\'azienda.' }, { status: 403 });
    }

    let applicationId = toText(body.applicationId);
    if (applicationId) {
      const { data: appCheck } = await supabase
        .from('tender_applications')
        .select('id')
        .eq('id', applicationId)
        .eq('company_id', profile.company_id)
        .maybeSingle();
      if (!appCheck) applicationId = '';
    }

    if (!applicationId) {
      const { data: latestApp } = await supabase
        .from('tender_applications')
        .select('id')
        .eq('company_id', profile.company_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      applicationId = latestApp?.id || '';
    }

    const missingFields: MissingField[] = [];
    const inferredFields: Array<{ key: string; value: string; source: 'extracted' | 'custom' }> = [];
    for (const spec of REQUIRED_FIELD_SPECS) {
      const value = findFieldValue(spec, extracted, customMap);
      if (!value) {
        missingFields.push({ key: spec.key, label: spec.label });
      } else {
        inferredFields.push({
          key: spec.key,
          value,
          source: toText(extracted?.[spec.key]) ? 'extracted' : 'custom',
        });
      }
    }

    let missingDocuments: MissingDocument[] = [];
    if (applicationId) {
      const [{ data: docs }, { data: requirements }] = await Promise.all([
        supabase
          .from('application_documents')
          .select('file_name, requirement_key')
          .eq('application_id', applicationId),
        supabase
          .from('practice_document_requirements')
          .select('requirement_key, label')
          .eq('application_id', applicationId)
          .eq('is_required', true),
      ]);

      const requiredDocs = resolveRequiredDocs(requirements || null);
      missingDocuments = computeMissingDocuments(docs || [], requiredDocs);
    } else {
      missingDocuments = REQUIRED_DOCS_PIA_VOUCHER.map((doc) => ({ key: doc.key, label: doc.label }));
    }

    const ready = missingFields.length === 0 && missingDocuments.length === 0;

    return NextResponse.json({
      ok: true,
      ready,
      applicationId: applicationId || null,
      missingFields,
      missingDocuments,
      inferredFields,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Errore readiness-check' },
      { status: 500 }
    );
  }
}
