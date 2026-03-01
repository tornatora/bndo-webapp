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
  const clipped = ensureMaxSentences(smoothed, 7);
  if (style === 'professionale') return clipped;

  // "Quasi amichevole": warm but concise.
  if (!/[.!?]$/.test(clipped)) return `${clipped}.`;
  return clipped;
}

