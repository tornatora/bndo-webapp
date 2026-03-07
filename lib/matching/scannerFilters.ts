import type { IncentiviDoc } from '@/lib/matching/types';

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string') as string[];
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function parseDateField(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function filterClosedCalls(docs: IncentiviDoc[], now = new Date()): IncentiviDoc[] {
  return docs.filter((doc) => {
    const closeDate = parseDateField(doc.closeDate);
    if (!closeDate) return true;
    const isMidnightUtc =
      closeDate.getUTCHours() === 0 &&
      closeDate.getUTCMinutes() === 0 &&
      closeDate.getUTCSeconds() === 0 &&
      closeDate.getUTCMilliseconds() === 0;
    const deadline = isMidnightUtc ? new Date(closeDate.getTime() + 24 * 60 * 60 * 1000 - 1) : closeDate;
    return now.getTime() <= deadline.getTime();
  });
}

export function filterWrongRegion(docs: IncentiviDoc[], userRegionCanonical: string | null): IncentiviDoc[] {
  if (!userRegionCanonical) return docs;
  const userNorm = userRegionCanonical.toLowerCase().trim();
  return docs.filter((doc) => {
    const regions = asStringArray(doc.regions);
    if (regions.length === 0) return true;
    const regionsNorm = regions.map((r) => r.toLowerCase().trim());
    if (regionsNorm.includes('italia') || regionsNorm.includes('nazionale')) return true;
    return regionsNorm.includes(userNorm);
  });
}
