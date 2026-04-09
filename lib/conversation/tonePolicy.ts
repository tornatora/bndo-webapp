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

function ensureMaxSentences(text: string, max = 10) {
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
    .replace(/^grande domanda!?\s*/i, '')
    .replace(/^certamente!?\s*/i, '')
    .replace(/^assolutamente!?\s*/i, '')
    .replace(/\bti dico subito\b/gi, 'ti aiuto subito')
    .replace(/\bok\b/gi, 'va bene');
}

/**
 * Apply tone policy for the final response.
 * - 'quasi_amichevole': Profiling/clarification. Short, warm, 1 question. Max 4 sentences.
 * - 'professionale': QA/measure. Full consultant depth. Max 10 sentences.
 * - 'qa_completo': Deep QA. Max 14 sentences, no truncation.
 */
export function applyTonePolicy(
  text: string,
  style: 'quasi_amichevole' | 'professionale' | 'qa_completo' = 'quasi_amichevole'
) {
  const base = sanitizeBase(text);
  const smoothed = smoothOpenings(base);

  if (style === 'qa_completo') {
    const clipped = ensureMaxSentences(smoothed, 14);
    const dedupedQuestions = keepSingleQuestion(splitSentences(clipped)).join(' ').trim();
    return clampLength(ensureSingleQuestionMark(dedupedQuestions), 2000);
  }

  const maxSentences = style === 'professionale' ? 10 : 4;
  const maxChars = style === 'professionale' ? 1200 : 500;
  const clipped = ensureMaxSentences(smoothed, maxSentences);
  const dedupedQuestions = keepSingleQuestion(splitSentences(clipped)).join(' ').trim();
  const compact = clampLength(ensureSingleQuestionMark(dedupedQuestions), maxChars);
  if (style === 'professionale') return compact;

  if (!/[.!?]$/.test(compact)) return `${compact}.`;
  return compact;
}
