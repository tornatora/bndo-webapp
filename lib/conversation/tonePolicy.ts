function sanitizeBase(text: string) {
  return text
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureMaxSentences(text: string, max = 7) {
  const s = splitSentences(text);
  if (s.length <= max) return text.trim();
  return `${s.slice(0, max).join(' ').trim()}`;
}

function keepSingleQuestion(sentences: string[]) {
  const out: string[] = [];
  let questionSeen = false;
  for (const sentence of sentences) {
    const isQuestion = sentence.includes('?');
    if (isQuestion && questionSeen) continue;
    if (isQuestion) questionSeen = true;
    out.push(sentence);
  }
  return out;
}

function clampLength(text: string, maxChars: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const truncated = trimmed.slice(0, maxChars).trim();
  const lastStop = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('?'), truncated.lastIndexOf('!'));
  if (lastStop >= 80) return truncated.slice(0, lastStop + 1).trim();
  return `${truncated.replace(/[.,;:\s]+$/g, '').trim()}.`;
}

function ensureSingleQuestionMark(text: string) {
  const firstIdx = text.indexOf('?');
  if (firstIdx === -1) return text;
  const head = text.slice(0, firstIdx + 1);
  const tail = text
    .slice(firstIdx + 1)
    .replace(/\?/g, '.')
    .replace(/\s{2,}/g, ' ');
  return `${head}${tail}`.trim();
}

function smoothOpenings(text: string) {
  return text
    .replace(/^ciao!+\s*perfetto\.?\s*/i, 'Certo. ')
    .replace(/^perfetto\.?\s*perfetto\.?\s*/i, 'Perfetto. ')
    .replace(/\bti dico subito\b/gi, 'ti aiuto subito')
    .replace(/\bok\b/gi, 'va bene');
}

export function applyTonePolicy(text: string, style: 'quasi_amichevole' | 'professionale' = 'quasi_amichevole') {
  const base = sanitizeBase(text);
  const smoothed = smoothOpenings(base);
  const maxSentences = style === 'professionale' ? 4 : 2;
  const clipped = ensureMaxSentences(smoothed, maxSentences);
  const dedupedQuestions = keepSingleQuestion(splitSentences(clipped)).join(' ').trim();
  const compact = clampLength(ensureSingleQuestionMark(dedupedQuestions), style === 'professionale' ? 300 : 190);
  if (style === 'professionale') return compact;

  // "Quasi amichevole": warm but concise.
  if (!/[.!?]$/.test(compact)) return `${compact}.`;
  return compact;
}
