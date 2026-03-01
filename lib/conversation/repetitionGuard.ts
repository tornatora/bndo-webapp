function normalizeForSimilarity(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return normalizeForSimilarity(value)
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean);
}

function jaccardTokens(a: string, b: string) {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (!sa.size && !sb.size) return 1;
  let inter = 0;
  for (const v of sa) {
    if (sb.has(v)) inter += 1;
  }
  const union = sa.size + sb.size - inter;
  return union <= 0 ? 0 : inter / union;
}

function prefixSimilarity(a: string, b: string) {
  const an = normalizeForSimilarity(a);
  const bn = normalizeForSimilarity(b);
  if (!an || !bn) return 0;
  const min = Math.min(an.length, bn.length);
  let same = 0;
  for (let i = 0; i < min; i += 1) {
    if (an[i] !== bn[i]) break;
    same += 1;
  }
  return same / min;
}

export function similarityScore(a: string, b: string) {
  const tokenScore = jaccardTokens(a, b);
  const prefixScore = prefixSimilarity(a, b);
  return tokenScore * 0.75 + prefixScore * 0.25;
}

export function findClosestSimilarReply(args: {
  candidate: string;
  recentAssistantReplies: string[];
  threshold?: number;
}) {
  const threshold = args.threshold ?? 0.82;
  let bestScore = 0;
  let closest: string | null = null;
  for (const prev of args.recentAssistantReplies) {
    const s = similarityScore(args.candidate, prev);
    if (s > bestScore) {
      bestScore = s;
      closest = prev;
    }
  }
  return {
    tooSimilar: bestScore >= threshold,
    score: bestScore,
    closest
  };
}

