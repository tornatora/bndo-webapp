export type BndoReleaseMode = 'full' | 'limited';

type ComingSoonGrant = {
  title: string;
  authorityName: string;
};

export type LimitedActiveBando = {
  id: 'resto-al-sud-20' | 'autoimpiego-centro-nord';
  title: 'Resto al Sud 2.0' | 'Autoimpiego Centro Nord';
};

const LIMITED_MODE = 'limited';

const LIMITED_ACTIVE_BANDI_LABELS = ['Resto al Sud 2.0', 'Autoimpiego Centro Nord'] as const;

const LIMITED_BANDO_HINTS = [
  'sabatini',
  'smart start',
  'smart&start',
  'oltre nuove imprese',
  'on tasso zero',
  'fusese',
  'transizione 4 0',
  'transizione 5 0',
  'fondo garanzia',
  'zes',
  'simest',
  'contratto di sviluppo',
  'voucher internazionalizzazione',
  'fondo nuove competenze',
] as const;

const LIMITED_RESTO_HINTS = [
  'resto al sud',
  'resto al sud 2 0',
  'resto al sud 20',
  'resto al sud 2',
] as const;
const LIMITED_AUTOIMPIEGO_HINTS = [
  'autoimpiego centro nord',
  'autoimpiego centro-nord',
  'centro nord autoimpiego',
] as const;

const LIMITED_DISCOVERY_HINTS = [
  'altri bandi',
  'altro bando',
  'nuovi bandi',
  'nuove opportunita',
  'catalogo bandi',
  'scanner bandi',
  'fammi una ricerca',
  'cerca bandi',
  'elenco bandi',
] as const;

export const LIMITED_CHAT_SCOPE_NOTICE =
  'Per il momento posso rispondere solo su Resto al Sud 2.0 e Autoimpiego Centro Nord di Invitalia.';

export const LIMITED_COMING_SOON_BANDI: ComingSoonGrant[] = [
  { title: 'ON - Oltre Nuove Imprese a Tasso Zero', authorityName: 'Invitalia' },
  { title: 'Smart&Start Italia', authorityName: 'Invitalia' },
  { title: 'Nuova Sabatini', authorityName: 'MIMIT' },
  { title: 'FUSESE', authorityName: 'Programma europeo' },
];

function normalizeMode(raw: string | null | undefined): BndoReleaseMode | null {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'full') return 'full';
  if (normalized === LIMITED_MODE) return 'limited';
  return null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRestoAlSud20Title(normalizedTitle: string) {
  if (!normalizedTitle.includes('resto al sud')) return false;
  return (
    normalizedTitle.includes('resto al sud 2 0') ||
    normalizedTitle.includes('resto al sud 20') ||
    normalizedTitle.endsWith('resto al sud 2')
  );
}

function isAutoimpiegoCentroNordTitle(normalizedTitle: string) {
  return normalizedTitle.includes('autoimpiego') && normalizedTitle.includes('centro') && normalizedTitle.includes('nord');
}

function normalizeLimitedBandoId(value: string) {
  return normalizeText(value).replace(/\s+/g, '-');
}

export function resolveBndoReleaseMode(): BndoReleaseMode {
  const serverValue = normalizeMode(process.env.BNDO_RELEASE_MODE);
  if (serverValue) return serverValue;
  const publicValue = normalizeMode(process.env.NEXT_PUBLIC_BNDO_RELEASE_MODE);
  if (publicValue) return publicValue;
  return 'limited';
}

export function isLimitedReleaseMode() {
  return resolveBndoReleaseMode() === LIMITED_MODE;
}

export function isLimitedCatalogGrantTitle(title: string) {
  const normalized = normalizeText(title);
  return isRestoAlSud20Title(normalized) || isAutoimpiegoCentroNordTitle(normalized);
}

export function resolveLimitedActiveBandoFromTitle(title: string): LimitedActiveBando | null {
  const normalized = normalizeText(title);
  if (!normalized) return null;
  if (isRestoAlSud20Title(normalized)) {
    return { id: 'resto-al-sud-20', title: 'Resto al Sud 2.0' };
  }
  if (isAutoimpiegoCentroNordTitle(normalized)) {
    return { id: 'autoimpiego-centro-nord', title: 'Autoimpiego Centro Nord' };
  }
  return null;
}

export function resolveLimitedActiveBandoFromId(id: string): LimitedActiveBando | null {
  const normalized = normalizeLimitedBandoId(id);
  if (!normalized) return null;
  if (normalized.includes('resto-al-sud-20') || normalized.includes('resto-al-sud-2-0')) {
    return { id: 'resto-al-sud-20', title: 'Resto al Sud 2.0' };
  }
  if (normalized.includes('autoimpiego-centro-nord')) {
    return { id: 'autoimpiego-centro-nord', title: 'Autoimpiego Centro Nord' };
  }
  return null;
}

export function mentionsLimitedActiveBando(message: string) {
  return Boolean(resolveLimitedActiveBandoFromMessage(message));
}

export function resolveLimitedActiveBandoFromMessage(message: string): LimitedActiveBando | null {
  const normalized = normalizeText(message);
  if (!normalized) return null;
  const mentionsResto = LIMITED_RESTO_HINTS.some((hint) => normalized.includes(normalizeText(hint)));
  const mentionsAutoimpiego = LIMITED_AUTOIMPIEGO_HINTS.some((hint) => normalized.includes(normalizeText(hint)));
  if (mentionsResto && !mentionsAutoimpiego) {
    return { id: 'resto-al-sud-20', title: 'Resto al Sud 2.0' };
  }
  if (!mentionsResto && mentionsAutoimpiego) {
    return { id: 'autoimpiego-centro-nord', title: 'Autoimpiego Centro Nord' };
  }
  return null;
}

export function shouldBlockLimitedChatMessage(message: string) {
  const normalized = normalizeText(message);
  if (!normalized) return false;

  if (LIMITED_DISCOVERY_HINTS.some((hint) => normalized.includes(hint))) {
    return true;
  }

  return LIMITED_BANDO_HINTS.some((hint) => normalized.includes(hint));
}

export function getLimitedActiveBandiLabels() {
  return [...LIMITED_ACTIVE_BANDI_LABELS];
}
