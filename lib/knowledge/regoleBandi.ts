import type { UserProfile } from '@/lib/conversation/types';
import { FINANCE_FAQ } from '@/lib/knowledge/financeFaq';
import { normalizeForMatch } from '@/lib/conversation/intentRouter';

const UNCERTAIN_KEYWORDS = ['de minimis', 'massimale', 'aliquota', 'percentuale', 'scadenza', 'apertura'];

function detectFaqHits(message: string) {
  const n = normalizeForMatch(message);
  const hits = FINANCE_FAQ.filter((faq) => faq.keywords.some((kw) => n.includes(normalizeForMatch(kw))));
  return hits.slice(0, 4);
}

export function buildKnowledgeContext(message: string, profile: UserProfile) {
  const n = normalizeForMatch(message);
  const selected = detectFaqHits(message);

  // Keep base anchors always available for stable tone/accuracy.
  const method = FINANCE_FAQ.find((x) => x.id === 'method');
  const forms = FINANCE_FAQ.find((x) => x.id === 'forms');
  const merged = [method, forms, ...selected].filter(Boolean) as typeof FINANCE_FAQ;

  if (profile.location?.region && /calabria|campania|sicilia|puglia|basilicata|sardegna|molise|abruzzo/.test(n)) {
    const rs = FINANCE_FAQ.find((x) => x.id === 'resto-sud');
    if (rs && !merged.some((s) => s.id === rs.id)) merged.push(rs);
  }

  const uniq = Array.from(new Map(merged.map((x) => [x.id, x])).values()).slice(0, 6);
  if (!uniq.length) return null;
  return uniq.map((x, i) => `${i + 1}. ${x.topic}: ${x.answer}`).join('\n');
}

export function answerFaq(message: string) {
  const hits = detectFaqHits(message);
  if (!hits.length) return null;
  const main = hits[0]!;
  const maybeVolatile = main.volatile || UNCERTAIN_KEYWORDS.some((kw) => normalizeForMatch(message).includes(normalizeForMatch(kw)));
  const verifyNote = maybeVolatile
    ? ' Per sicurezza operativa, prima della candidatura verifico sempre l’aggiornamento ufficiale del bando attivo.'
    : '';
  return `${main.answer}${verifyNote}`;
}

