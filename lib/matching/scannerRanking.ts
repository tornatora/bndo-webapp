import type { CandidateLike, ScanResultLike } from '@/lib/matching/types';

const AUTHORITY_TIER_1 = ['invitalia', 'ministero', 'regione'];
const AUTHORITY_TIER_2 = ['camera di commercio', 'camere di commercio', 'cciaa', 'unioncamere', 'agenzia nazionale'];

function classifyAuthority(authorityName: string | undefined): number {
  if (!authorityName) return 0;
  const norm = authorityName.toLowerCase();
  if (AUTHORITY_TIER_1.some((t) => norm.includes(t))) return 2;
  if (AUTHORITY_TIER_2.some((t) => norm.includes(t))) return 1;
  return 0;
}

export function preferReliableSources<T extends ScanResultLike>(candidates: CandidateLike<T>[]): CandidateLike<T>[] {
  return [...candidates].sort((a, b) => {
    const aPri = classifyAuthority(a.result.authorityName);
    const bPri = classifyAuthority(b.result.authorityName);
    if (aPri !== bPri) return bPri - aPri;
    return (b.result.score ?? 0) - (a.result.score ?? 0);
  });
}
