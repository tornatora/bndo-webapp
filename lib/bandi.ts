import type { getSupabaseAdmin } from '@/lib/supabase/admin';

export type PracticeType = 'resto_sud_2_0' | 'autoimpiego_centro_nord';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

const BANDI: Record<
  PracticeType,
  {
    title: string;
    authority_name: string;
    summary: string;
  }
> = {
  resto_sud_2_0: {
    title: 'Resto al Sud 2.0',
    authority_name: 'Invitalia',
    summary: 'Bando Resto al Sud 2.0 (assistenza completa BNDO).'
  },
  autoimpiego_centro_nord: {
    title: 'Autoimpiego Centro Nord',
    authority_name: 'Invitalia',
    summary: 'Bando Autoimpiego Centro Nord (assistenza completa BNDO).'
  }
};

export function practiceTitle(type: PracticeType) {
  return BANDI[type].title;
}

export function practiceKeyFromTitle(title: string | null | undefined): PracticeType | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('resto')) return 'resto_sud_2_0';
  if (t.includes('autoimpiego')) return 'autoimpiego_centro_nord';
  return null;
}

export async function ensureBandoTenderId(admin: SupabaseAdmin, practiceType: PracticeType) {
  const meta = BANDI[practiceType];

  const { data: existing } = await admin
    .from('tenders')
    .select('id')
    .eq('title', meta.title)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const farFuture = new Date('2099-12-31T23:59:59.000Z').toISOString();
  const { data: created, error } = await admin
    .from('tenders')
    .insert({
      authority_name: meta.authority_name,
      title: meta.title,
      deadline_at: farFuture,
      summary: meta.summary,
      dossier_url: null,
      supplier_portal_url: null,
      cpv_code: null,
      procurement_value: null
    })
    .select('id')
    .single();

  if (error || !created?.id) {
    throw new Error(error?.message ?? 'Impossibile creare il bando.');
  }

  return created.id;
}

export async function ensureBandoApplication(admin: SupabaseAdmin, companyId: string, practiceType: PracticeType) {
  const tenderId = await ensureBandoTenderId(admin, practiceType);

  const { data: app, error } = await admin
    .from('tender_applications')
    .upsert(
      {
        company_id: companyId,
        tender_id: tenderId,
        status: 'draft',
        supplier_registry_status: 'pending',
        notes: 'In attesa documenti base.'
      },
      { onConflict: 'company_id,tender_id' }
    )
    .select('id, tender_id')
    .single();

  if (error || !app?.id) {
    throw new Error(error?.message ?? 'Impossibile creare la pratica.');
  }

  return { applicationId: app.id, tenderId: app.tender_id as string };
}

