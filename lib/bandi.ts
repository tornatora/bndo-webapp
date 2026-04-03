import type { getSupabaseAdmin } from '@/lib/supabase/admin';

export type PracticeType = 'resto_sud_2_0' | 'autoimpiego_centro_nord' | 'generic';
export type GrantSlug = 'resto-al-sud-2-0' | 'autoimpiego-centro-nord' | 'generica';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
type PracticeConfig = {
  slug: GrantSlug;
  title: string;
  authority_name: string;
  summary: string;
  startFeeCents: number;
  currency: 'eur';
  paymentCtaLabel: string;
  didRequired: boolean;
};

const BANDI: Record<PracticeType, PracticeConfig> = {
  resto_sud_2_0: {
    slug: 'resto-al-sud-2-0',
    title: 'Resto al Sud 2.0',
    authority_name: 'Invitalia',
    summary: 'Bando Resto al Sud 2.0 (assistenza completa BNDO).',
    startFeeCents: 5000,
    currency: 'eur',
    paymentCtaLabel: 'Avvia pratica e salta la fila',
    didRequired: true,
  },
  autoimpiego_centro_nord: {
    slug: 'autoimpiego-centro-nord',
    title: 'Autoimpiego Centro Nord',
    authority_name: 'Invitalia',
    summary: 'Bando Autoimpiego Centro Nord (assistenza completa BNDO).',
    startFeeCents: 5000,
    currency: 'eur',
    paymentCtaLabel: 'Avvia pratica e salta la fila',
    didRequired: true,
  },
  generic: {
    slug: 'generica',
    title: 'Pratica Agevolata',
    authority_name: 'Ente Erogatore',
    summary: 'Assistenza professionale per la presentazione della pratica di agevolazione.',
    startFeeCents: 5000,
    currency: 'eur',
    paymentCtaLabel: 'Avvia la pratica',
    didRequired: false,
  }
};


export function practiceTitle(type: PracticeType) {
  return BANDI[type].title;
}

export function getPracticeConfig(type: PracticeType) {
  return BANDI[type];
}

export function listPracticeConfigs() {
  return Object.entries(BANDI).map(([practiceType, config]) => ({
    practiceType: practiceType as PracticeType,
    ...config
  }));
}

export function grantSlugFromPracticeType(type: PracticeType): GrantSlug {
  return BANDI[type].slug;
}

export function practiceTypeFromGrantSlug(slug: string | null | undefined): PracticeType | null {
  const normalized = String(slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) return null;
  if (normalized === 'resto-sud-2-0' || normalized === 'resto-al-sud-2-0') return 'resto_sud_2_0';
  if (normalized === 'autoimpiego-centro-nord') return 'autoimpiego_centro_nord';
  return 'generic';
}

export function practiceStartFeeCents(type: PracticeType) {
  return BANDI[type].startFeeCents;
}

export function practiceStartFeeEUR(type: PracticeType) {
  return Math.round(BANDI[type].startFeeCents) / 100;
}

export function practiceCurrency(type: PracticeType) {
  return BANDI[type].currency;
}

export function practiceCtaLabel(type: PracticeType) {
  return BANDI[type].paymentCtaLabel;
}

export function practiceTypeFromQuizBandoType(rawValue: string | null | undefined): PracticeType | null {
  const value = String(rawValue ?? '')
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (value === 'sud') return 'resto_sud_2_0';
  if (value === 'centro_nord') return 'autoimpiego_centro_nord';
  return null;
}

export function practiceKeyFromTitle(title: string | null | undefined): PracticeType | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('resto') || t.includes('resto-al-sud')) return 'resto_sud_2_0';
  if (t.includes('autoimpiego') || t.includes('centro nord')) return 'autoimpiego_centro_nord';
  const bySlug = practiceTypeFromGrantSlug(t);
  if (bySlug) return bySlug;
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

  // Ensure the company has a "match" for this tender so RLS allows reading tender details (title, etc.)
  // from the client dashboard. This is created server-side with service role.
  await admin.from('tender_matches').upsert(
    {
      company_id: companyId,
      tender_id: tenderId,
      relevance_score: 1,
      status: 'new'
    },
    { onConflict: 'company_id,tender_id' }
  );

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
