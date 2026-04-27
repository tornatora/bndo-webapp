import {
  practiceKeyFromTitle,
  practiceTitle,
  practiceTypeFromGrantSlug,
  type PracticeType
} from '@/lib/bandi';

type ResolvePracticeTitleArgs = {
  tenderTitle?: string | null;
  tenderGrantSlug?: string | null;
  tenderExternalGrantId?: string | null;
  applicationNotes?: string | null;
  paymentGrantTitle?: string | null;
  paymentGrantSlug?: string | null;
  paymentPracticeType?: string | null;
  onboardingGrantSlug?: string | null;
  onboardingPracticeType?: string | null;
  fallbackTitle?: string;
};

function extractMetaFromNotes(notesRaw: string | null | undefined) {
  const notes = String(notesRaw ?? '').trim();
  if (!notes) return { practiceType: null as PracticeType | null, grantSlug: null as string | null };

  const practiceTypeMatch = notes.match(/\[\[bndo:practice_type=([a-z0-9_]+)\]\]/i);
  const grantSlugMatch = notes.match(/\[\[bndo:grant_slug=([a-z0-9_-]+)\]\]/i);

  const practiceType = resolvePracticeTypeFromRaw(practiceTypeMatch?.[1] ?? null);
  const grantSlug = String(grantSlugMatch?.[1] ?? '').trim() || null;

  return { practiceType, grantSlug };
}

function normalizeToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function resolvePracticeTypeFromRaw(value: string | null | undefined): PracticeType | null {
  const normalized = normalizeToken(value);
  if (!normalized) return null;
  if (
    normalized === 'resto_sud_2_0' ||
    normalized === 'resto_al_sud_2_0' ||
    normalized === 'restoalsud2_0' ||
    normalized === 'restoalsud'
  ) {
    return 'resto_sud_2_0';
  }
  if (
    normalized === 'autoimpiego_centro_nord' ||
    normalized === 'autoimpiegocentronord'
  ) {
    return 'autoimpiego_centro_nord';
  }
  if (normalized === 'generic' || normalized === 'generica' || normalized === 'pratica_agevolata') {
    return 'generic';
  }
  return null;
}

export function resolvePracticeTypeForContext(args: ResolvePracticeTitleArgs): PracticeType | null {
  const notesMeta = extractMetaFromNotes(args.applicationNotes ?? null);
  return (
    notesMeta.practiceType ??
    practiceTypeFromGrantSlug(notesMeta.grantSlug ?? null) ??
    practiceTypeFromGrantSlug(args.tenderGrantSlug ?? null) ??
    practiceTypeFromGrantSlug(args.tenderExternalGrantId ?? null) ??
    resolvePracticeTypeFromRaw(args.paymentPracticeType ?? null) ??
    practiceTypeFromGrantSlug(args.paymentGrantSlug ?? null) ??
    practiceTypeFromGrantSlug(args.paymentPracticeType ?? null) ??
    resolvePracticeTypeFromRaw(args.onboardingPracticeType ?? null) ??
    practiceTypeFromGrantSlug(args.onboardingGrantSlug ?? null) ??
    practiceTypeFromGrantSlug(args.onboardingPracticeType ?? null) ??
    practiceKeyFromTitle(args.tenderTitle ?? null) ??
    practiceKeyFromTitle(args.paymentGrantTitle ?? null) ??
    null
  );
}

export function resolvePracticeTitleForContext(args: ResolvePracticeTitleArgs) {
  const tenderTitle = String(args.tenderTitle ?? '').trim();
  if (tenderTitle) return tenderTitle;

  const paymentTitle = String(args.paymentGrantTitle ?? '').trim();
  if (paymentTitle) return paymentTitle;

  const resolvedPracticeType = resolvePracticeTypeForContext(args);
  if (resolvedPracticeType) return practiceTitle(resolvedPracticeType);

  return args.fallbackTitle ?? 'Pratica';
}
