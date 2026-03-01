import fs from 'node:fs/promises';

export type CachePayload<T> = {
  fetchedAt: string; // ISO
  docs: T[];
};

const DEFAULT_CACHE_PATH = '/tmp/bndo-bandi-cache.json';

export function getBandiCachePath() {
  return process.env.BANDI_CACHE_PATH?.trim() || DEFAULT_CACHE_PATH;
}

export async function writeBandiCache<T>(docs: T[]) {
  const payload: CachePayload<T> = { fetchedAt: new Date().toISOString(), docs };
  const path = getBandiCachePath();
  await fs.writeFile(path, JSON.stringify(payload), 'utf8');
  return { path, fetchedAt: payload.fetchedAt, count: docs.length };
}

export async function readBandiCache<T>(): Promise<CachePayload<T> | null> {
  const path = getBandiCachePath();
  try {
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as CachePayload<T>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray((parsed as any).docs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readBundledBandiSeed<T>(): Promise<CachePayload<T> | null> {
  try {
    const module = await import('@/data/bndo-bandi-cache.seed.json');
    const parsed = module.default as CachePayload<T>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray((parsed as { docs?: unknown }).docs)) return null;
    return parsed;
  } catch {
    return null;
  }
}
