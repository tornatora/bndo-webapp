import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadActiveGrantUniverse } from '@/lib/matching/activeGrantIndex';
import type { IncentiviDoc } from '@/lib/matching/types';
import { isLimitedReleaseMode, isLimitedCatalogGrantTitle } from '@/shared/config/release-mode';

export const runtime = 'nodejs';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(30).default(12),
  q: z.string().trim().max(120).optional(),
  aidType: z
    .enum(['all', 'fondo_perduto', 'finanziamento_agevolato', 'credito_imposta', 'voucher', 'altro'])
    .default('all'),
  deadlineWindow: z.enum(['all', '30', '60', '90']).default('all'),
  authority: z.string().trim().max(120).optional(),
  sector: z.string().trim().max(120).optional(),
  beneficiary: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  geoScope: z.enum(['all', 'nazionale', 'territoriale']).default('all'),
  publishedWindow: z.enum(['all', '1', '7', '30']).default('all'),
  expiringSoon: z.enum(['all', 'yes']).default('all'),
  amountMin: z.coerce.number().int().min(0).optional(),
  amountMax: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['deadline', 'newest', 'amount_desc', 'title', 'fondo_perduto_first']).default('deadline'),
});

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function grantIdFromDoc(doc: IncentiviDoc, index: number): string {
  const rawId = String(doc.id ?? '').trim();
  if (rawId) return rawId.startsWith('incentivi-') ? rawId : `incentivi-${rawId}`;
  const fromUrl = String(doc.url ?? '').trim();
  if (fromUrl) return `url-${Buffer.from(fromUrl).toString('base64url').slice(0, 18)}`;
  const title = normalizeText(doc.title);
  return `title-${Buffer.from(`${title}-${index}`).toString('base64url').slice(0, 18)}`;
}

function titleIsLegacyQuiz(title: string): boolean {
  const normalized = normalizeText(title);
  return normalized.includes('resto al sud 2 0') || normalized.includes('autoimpiego centro nord');
}

function parseMoneyValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== 'string') return null;
  const raw = value.toLowerCase().trim();
  if (!raw) return null;

  let multiplier = 1;
  if (/(miliard|mld)/.test(raw)) multiplier = 1_000_000_000;
  else if (/(milion|mln)/.test(raw)) multiplier = 1_000_000;
  else if (/\bmila\b|\bk\b/.test(raw)) multiplier = 1_000;

  const match =
    raw.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?/g)?.find((entry) => /\d/.test(entry)) ?? null;
  if (!match) return null;

  const cleaned = match.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * multiplier);
}

function formatCurrency(value: number): string {
  return `€ ${Math.round(value).toLocaleString('it-IT')}`;
}

function pickAidType(doc: IncentiviDoc) {
  const support = asList(doc.supportForm).join(' ').toLowerCase();
  if (/(fondo perduto|contributo)/.test(support)) {
    return { key: 'fondo_perduto', label: 'Contributo a fondo perduto', amountSuffix: 'a fondo perduto' };
  }
  if (/(finanziament|prestito|anticipo rimborsabile)/.test(support)) {
    return { key: 'finanziamento_agevolato', label: 'Finanziamento agevolato', amountSuffix: 'di finanziamento agevolato' };
  }
  if (/(credito d imposta|agevolazione fiscale|credito)/.test(support)) {
    return { key: 'credito_imposta', label: "Credito d'imposta", amountSuffix: "di credito d'imposta" };
  }
  if (/voucher/.test(support)) {
    return { key: 'voucher', label: 'Voucher', amountSuffix: 'in voucher' };
  }
  return { key: 'altro', label: asList(doc.supportForm).slice(0, 2).join(', ') || 'Agevolazione', amountSuffix: null };
}

function computeAmountLabel(doc: IncentiviDoc, amountSuffix: string | null) {
  const directMax = [parseMoneyValue(doc.grantMax), parseMoneyValue(doc.costMax), parseMoneyValue(doc.costMin)]
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0];

  if (directMax) {
    return `Fino a ${formatCurrency(directMax)}${amountSuffix ? ` ${amountSuffix}` : ''}`;
  }

  const textAmount =
    typeof doc.displayAmountLabel === 'string' && doc.displayAmountLabel.trim()
      ? doc.displayAmountLabel.trim()
      : typeof doc.displayProjectAmountLabel === 'string' && doc.displayProjectAmountLabel.trim()
        ? doc.displayProjectAmountLabel.trim()
        : null;
  if (textAmount) return textAmount;
  return 'Importo agevolazione da verificare';
}

function computeMaxAmount(doc: IncentiviDoc): number | null {
  const max = [parseMoneyValue(doc.grantMax), parseMoneyValue(doc.costMax), parseMoneyValue(doc.costMin)]
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0];
  return typeof max === 'number' ? max : null;
}

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getFreshnessBadge(doc: IncentiviDoc): 'Uscito oggi' | 'Uscito ieri' | 'Uscito questa settimana' | null {
  const publishedAt = parseValidDate(doc.openDate) ?? parseValidDate((doc as { updatedAt?: unknown }).updatedAt);
  if (!publishedAt) return null;

  const now = new Date();
  const diffDays = Math.floor((startOfDayMs(now) - startOfDayMs(publishedAt)) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  if (diffDays === 0) return 'Uscito oggi';
  if (diffDays === 1) return 'Uscito ieri';
  if (diffDays <= 7) return 'Uscito questa settimana';
  return null;
}

function isExpiringSoon(doc: IncentiviDoc): boolean {
  if (!doc.closeDate) return false;
  const closeDate = new Date(doc.closeDate);
  if (Number.isNaN(closeDate.getTime())) return false;
  const days = (closeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 15;
}

function sortByDeadlineAndTitle(a: IncentiviDoc, b: IncentiviDoc): number {
  const ad = a.closeDate ? new Date(a.closeDate).getTime() : Number.POSITIVE_INFINITY;
  const bd = b.closeDate ? new Date(b.closeDate).getTime() : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'it');
}

function docPublishedAt(doc: IncentiviDoc): Date | null {
  return parseValidDate(doc.openDate) ?? parseValidDate((doc as { updatedAt?: unknown }).updatedAt);
}

function hasNationalScope(doc: IncentiviDoc): boolean {
  const regions = normalizeText(asList(doc.regions).join(' '));
  if (!regions) return false;
  return (
    regions.includes('tutta italia') ||
    regions.includes('territorio nazionale') ||
    regions.includes('nazionale') ||
    regions.includes('intero territorio')
  );
}

function includesAllTokens(haystack: string, queryValue: string): boolean {
  const tokens = normalizeText(queryValue)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => haystack.includes(token));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });
  }

  const {
    page,
    limit,
    q,
    aidType,
    deadlineWindow,
    authority,
    sector,
    beneficiary,
    region,
    geoScope,
    publishedWindow,
    expiringSoon,
    amountMin,
    amountMax,
    sort,
  } = parsed.data;
  const universe = await loadActiveGrantUniverse();
  const limitedMode = isLimitedReleaseMode();
  const queryNorm = normalizeText(q);
  const authorityNorm = normalizeText(authority);
  const sectorNorm = normalizeText(sector);
  const beneficiaryNorm = normalizeText(beneficiary);
  const regionNorm = normalizeText(region);

  const filtered = universe.docs
    .filter((doc) => {
      if (!limitedMode) return true;
      return isLimitedCatalogGrantTitle(String(doc.title ?? ''));
    })
    .filter((doc) => {
      if (!queryNorm) return true;
      const haystack = normalizeText(
        [
          doc.title,
          doc.authorityName,
          ...(asList(doc.supportForm) ?? []),
          ...(asList(doc.sectors) ?? []),
          doc.description,
        ]
          .filter(Boolean)
          .join(' '),
      );
      return queryNorm
        .split(' ')
        .filter(Boolean)
        .every((token) => haystack.includes(token));
    })
    .filter((doc) => {
      if (!authorityNorm) return true;
      return includesAllTokens(normalizeText(doc.authorityName), authorityNorm);
    })
    .filter((doc) => {
      if (!sectorNorm) return true;
      const haystack = normalizeText([...(asList(doc.sectors) ?? []), doc.description, doc.title].filter(Boolean).join(' '));
      return includesAllTokens(haystack, sectorNorm);
    })
    .filter((doc) => {
      if (!beneficiaryNorm) return true;
      const haystack = normalizeText([...(asList(doc.beneficiaries) ?? []), ...(asList(doc.dimensions) ?? []), doc.description].filter(Boolean).join(' '));
      return includesAllTokens(haystack, beneficiaryNorm);
    })
    .filter((doc) => {
      if (!regionNorm) return true;
      const haystack = normalizeText([...(asList(doc.regions) ?? []), doc.description, doc.title].filter(Boolean).join(' '));
      return includesAllTokens(haystack, regionNorm);
    })
    .filter((doc) => {
      if (geoScope === 'all') return true;
      const national = hasNationalScope(doc);
      if (geoScope === 'nazionale') return national;
      return !national;
    })
    .filter((doc) => {
      if (publishedWindow === 'all') return true;
      const publishedAt = docPublishedAt(doc);
      if (!publishedAt) return false;
      const maxDays = Number(publishedWindow);
      const diffDays = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= maxDays;
    })
    .filter((doc) => {
      if (aidType === 'all') return true;
      return pickAidType(doc).key === aidType;
    })
    .filter((doc) => {
      if (deadlineWindow === 'all' || !doc.closeDate) return true;
      const closeDate = new Date(doc.closeDate);
      if (Number.isNaN(closeDate.getTime())) return true;
      const diffDays = (closeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= Number(deadlineWindow);
    })
    .filter((doc) => {
      if (expiringSoon === 'all') return true;
      return isExpiringSoon(doc);
    })
    .filter((doc) => {
      if (typeof amountMin !== 'number' && typeof amountMax !== 'number') return true;
      const maxAmount = computeMaxAmount(doc);
      if (maxAmount === null) return false;
      if (typeof amountMin === 'number' && maxAmount < amountMin) return false;
      if (typeof amountMax === 'number' && maxAmount > amountMax) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'title') {
        return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'it');
      }
      if (sort === 'newest') {
        const ad = docPublishedAt(a)?.getTime() ?? 0;
        const bd = docPublishedAt(b)?.getTime() ?? 0;
        if (ad !== bd) return bd - ad;
        return sortByDeadlineAndTitle(a, b);
      }
      if (sort === 'amount_desc') {
        const ad = computeMaxAmount(a) ?? 0;
        const bd = computeMaxAmount(b) ?? 0;
        if (ad !== bd) return bd - ad;
        return sortByDeadlineAndTitle(a, b);
      }
      if (sort === 'fondo_perduto_first') {
        const priority = (doc: IncentiviDoc) => {
          const key = pickAidType(doc).key;
          if (key === 'fondo_perduto') return 0;
          if (key === 'voucher') return 1;
          if (key === 'finanziamento_agevolato') return 2;
          if (key === 'credito_imposta') return 3;
          return 4;
        };
        const ad = priority(a);
        const bd = priority(b);
        if (ad !== bd) return ad - bd;
        return sortByDeadlineAndTitle(a, b);
      }
      return sortByDeadlineAndTitle(a, b);
    });

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const pageItems = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    items: pageItems.map((doc, idx) => {
      const grantId = grantIdFromDoc(doc, offset + idx);
      const aid = pickAidType(doc);
      const freshnessBadge = getFreshnessBadge(doc);
      return {
        grantId,
        title: String(doc.title ?? 'Bando attivo'),
        authorityName: String(doc.authorityName ?? 'Ente non disponibile'),
        aidForm: aid.label,
        aidType: aid.key,
        incentiveAmountLabel: computeAmountLabel(doc, aid.amountSuffix),
        deadlineAt: doc.closeDate ?? null,
        sourceUrl: String(doc.institutionalLink ?? doc.url ?? ''),
        isLegacyQuizGrant: titleIsLegacyQuiz(String(doc.title ?? '')),
        freshnessBadge,
        isNew: Boolean(freshnessBadge),
        isExpiringSoon: isExpiringSoon(doc),
      };
    }),
    page,
    limit,
    total,
    hasMore: offset + pageItems.length < total,
    universeCount: universe.universeCount,
    universeMeta: {
      source: universe.source,
      fetchedAt: universe.fetchedAt,
      excludedEuCount: universe.excludedEuCount,
      excludedInactiveCount: universe.excludedInactiveCount,
      dedupedCount: universe.dedupedCount,
    },
  });
}
