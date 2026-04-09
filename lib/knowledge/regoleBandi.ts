import type { UserProfile } from '@/lib/conversation/types';
import { FINANCE_FAQ } from '@/lib/knowledge/financeFaq';
import { normalizeForMatch } from '@/lib/text/normalize';

const UNCERTAIN_KEYWORDS = ['de minimis', 'massimale', 'aliquota', 'percentuale', 'scadenza', 'apertura', 'deadline'];

function detectFaqHits(message: string) {
  const n = normalizeForMatch(message);
  const hits = FINANCE_FAQ.filter((faq) =>
    faq.keywords.some((kw) => n.includes(normalizeForMatch(kw)))
  );
  return hits.slice(0, 6); // increased from 4 to 6 for better context
}

export function buildKnowledgeContext(message: string, profile: UserProfile) {
  const n = normalizeForMatch(message);
  const selected = detectFaqHits(message);

  // Always include foundational anchors for tone/terminology stability
  const method = FINANCE_FAQ.find((x) => x.id === 'method');
  const forms = FINANCE_FAQ.find((x) => x.id === 'forms');
  const merged = [method, forms, ...selected].filter(Boolean) as typeof FINANCE_FAQ;

  // Inject region-specific knowledge based on profile territory
  if (profile.location?.region) {
    const regionNorm = normalizeForMatch(profile.location.region);
    const isMezzogiorno = /calabria|campania|sicilia|puglia|basilicata|sardegna|molise|abruzzo/.test(regionNorm);
    const isCentroNord = !isMezzogiorno;

    if (isMezzogiorno) {
      const rs = FINANCE_FAQ.find((x) => x.id === 'resto-sud');
      if (rs && !merged.some((s) => s.id === rs.id)) merged.push(rs);
      const zes = FINANCE_FAQ.find((x) => x.id === 'zes');
      if (zes && !merged.some((s) => s.id === zes.id)) merged.push(zes);
    }
    if (isCentroNord) {
      const ai = FINANCE_FAQ.find((x) => x.id === 'autoimpiego');
      if (ai && !merged.some((s) => s.id === ai.id)) merged.push(ai);
    }
  }

  // If user is asking about startup/new business, add startup strategy context
  if (/non ho|non ancora|aprire|avviare|costituire|startup|nuova impresa/.test(n)) {
    const ss = FINANCE_FAQ.find((x) => x.id === 'startup-strategy');
    if (ss && !merged.some((s) => s.id === ss.id)) merged.push(ss);
  }

  // If user mentions agriculture
  if (/agricol|terreno|iap|azienda agricola|coltivazione|allevamento/.test(n)) {
    const ag = FINANCE_FAQ.find((x) => x.id === 'agricoltura-psr');
    if (ag && !merged.some((s) => s.id === ag.id)) merged.push(ag);
  }

  // If user mentions cumulo/combining grants
  if (/cumul|insieme|combinare|due bandi|sovrapporre/.test(n)) {
    const cu = FINANCE_FAQ.find((x) => x.id === 'cumulo-misure');
    if (cu && !merged.some((s) => s.id === cu.id)) merged.push(cu);
  }

  const uniq = Array.from(new Map(merged.map((x) => [x.id, x])).values()).slice(0, 8);
  if (!uniq.length) return null;
  return uniq.map((x, i) => `${i + 1}. [${x.topic}]: ${x.answer}`).join('\n');
}

export function answerFaq(message: string) {
  const hits = detectFaqHits(message);
  if (!hits.length) return null;

  // Return top 2 hits for richer context (merged into one response)
  const main = hits[0]!;
  const secondary = hits[1];

  const maybeVolatile =
    main.volatile ||
    UNCERTAIN_KEYWORDS.some((kw) => normalizeForMatch(message).includes(normalizeForMatch(kw)));

  const verifyNote = maybeVolatile
    ? ' Per sicurezza operativa, prima della candidatura verifico sempre l\'aggiornamento ufficiale del bando attivo.'
    : '';

  if (secondary && secondary.id !== main.id && !secondary.volatile) {
    return `${main.answer}${verifyNote}\n\nNote aggiuntive su ${secondary.topic}: ${secondary.answer}`;
  }

  return `${main.answer}${verifyNote}`;
}
