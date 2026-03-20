
export type CachePayload<T> = {
  fetchedAt: string; // ISO
  docs: T[];
};

const DEFAULT_CACHE_PATH = '/tmp/bndo-bandi-cache.json';

export function getBandiCachePath() {
  return process.env.BANDI_CACHE_PATH?.trim() || DEFAULT_CACHE_PATH;
}

// File-based cache is disabled in Edge Runtime.
// We rely on Supabase (primary) or the bundled seed (fallback).

export async function writeBandiCache<T>(docs: T[]) {
  return { path: 'disabled-on-edge', fetchedAt: new Date().toISOString(), count: docs.length };
}

export async function readBandiCache<T>(): Promise<CachePayload<T> | null> {
  return null;
}

export async function readBundledBandiSeed<T>(): Promise<CachePayload<T> | null> {
  try {
    // Dynamic import is supported in Edge
    const seedModule = await import('@/data/bndo-bandi-cache.seed.json');
    const parsed = seedModule.default as CachePayload<T>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray((parsed as { docs?: unknown }).docs)) return null;
    return parsed;
  } catch {
    return null;
  }
}
