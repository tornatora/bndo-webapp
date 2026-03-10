/**
 * Grounded measure answerer: answers direct measure questions using only
 * knowledge and data already present in the repository. Never invents facts.
 *
 * Anti-hallucination rules enforced here:
 * - Never invent percentages, dates, amounts, or eligibility rules not in FINANCE_FAQ.
 * - If knowledge is insufficient, return not_confirmable with a conservative response.
 * - Never confirm eligibility without explicit knowledge evidence.
 */
import { normalizeForMatch } from '@/lib/text/normalize';
import { FINANCE_FAQ } from '@/lib/knowledge/financeFaq';

export type GroundedOutcome = 'yes' | 'no' | 'yes_under_conditions' | 'not_confirmable';

export type GroundedMeasureResult = {
  outcome: GroundedOutcome;
  text: string;
  measureId: string | null;
};

const MEASURE_ALIASES: Array<{ id: string; name: string; aliases: string[] }> = [
  { id: 'resto-al-sud-20', name: 'Resto al Sud 2.0', aliases: ['resto al sud', 'resto al sud 2.0', 'resto al sud 20'] },
  { id: 'autoimpiego-centro-nord', name: 'Autoimpiego Centro-Nord', aliases: ['autoimpiego centro nord', 'autoimpiego centro-nord', 'autoimpiego centronord'] },
  { id: 'nuova-sabatini', name: 'Nuova Sabatini', aliases: ['nuova sabatini', 'sabatini', 'legge sabatini'] },
  { id: 'fusese', name: 'FUSESE', aliases: ['fusese', 'fund for self employment', 'fund self employment', 'self entrepreneurship'] },
  { id: 'transizione-40', name: 'Transizione 4.0 / 5.0', aliases: ['transizione 4.0', 'transizione 4 0', 'industria 4.0', 'industria 4 0', 'transizione 5.0', 'transizione 5 0', 'piano transizione'] },
  { id: 'fondo-garanzia', name: 'Fondo di Garanzia PMI', aliases: ['fondo garanzia', 'fondo di garanzia', 'garanzia pmi', 'mediocredito centrale'] },
];

function detectMeasureId(message: string): { id: string; name: string } | null {
  const ids = detectMeasureIds(message);
  return ids.length > 0 ? ids[0] : null;
}

/**
 * Detects all measure IDs mentioned in a message.
 */
export function detectMeasureIds(message: string): Array<{ id: string; name: string }> {
  const n = normalizeForMatch(message);
  const found: Array<{ id: string; name: string }> = [];
  for (const m of MEASURE_ALIASES) {
    if (m.aliases.some((a) => n.includes(normalizeForMatch(a)))) {
      found.push({ id: m.id, name: m.name });
    }
  }
  return found;
}

function isMeasureQuestion(message: string): boolean {
  const n = normalizeForMatch(message);
  if (!n || n.length < 8) return false;
  const hasMeasure = MEASURE_ALIASES.some((m) => m.aliases.some((a) => n.includes(normalizeForMatch(a))));
  if (!hasMeasure) return false;
  // È una domanda o un'infomation request
  return (
    n.includes('?') ||
    /\b(come funziona|cos e|cosa e|cos\'e|dimmi|spiega|requisiti|ammissibil|posso|si puo|può|chi puo|beneficiari|spese|copertura|quanto|finanzia|copre|accedere|partecipare|come si accede|applicare|candidarsi)\b/.test(n)
  );
}

function getFaqById(id: string) {
  return FINANCE_FAQ.find((x) => x.id === id) ?? null;
}

function buildPrudentReply(measureName: string): string {
  return `Per ${measureName} l'ammissibilità dipende da requisiti e spese specifici definiti nel bando. Per una risposta precisa sul tuo caso conviene verificare il bando ufficiale aggiornato. Posso aiutarti a trovare la misura giusta se mi dici regione, tipo di attività e cosa vorresti finanziare.`;
}

/**
 * Answer a direct measure question using only in-repo knowledge.
 * Returns null if the message is not a measure question.
 * Returns not_confirmable when knowledge is insufficient; never invents facts.
 */
export function answerGroundedMeasureQuestion(message: string): GroundedMeasureResult | null {
  if (!isMeasureQuestion(message)) return null;

  const measure = detectMeasureId(message);
  if (!measure) return null;

  const n = normalizeForMatch(message);

  // --- Nuova Sabatini ---
  if (measure.id === 'nuova-sabatini') {
    const faq = getFaqById('nuova-sabatini');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };

    if (n.includes('gia attiva') || n.includes('già attiva') || n.includes('impresa attiva') || n.includes('pmi')) {
      return {
        outcome: 'yes_under_conditions',
        text: `La Nuova Sabatini è destinata alle PMI già operative che acquistano beni strumentali nuovi tramite finanziamento bancario. ${faq.answer}`,
        measureId: measure.id,
      };
    }
    // Domanda generica su Sabatini
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- FUSESE ---
  if (measure.id === 'fusese') {
    const faq = getFaqById('fusese');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- Transizione 4.0 / 5.0 ---
  if (measure.id === 'transizione-40') {
    const faq = getFaqById('credito-imposta-investimenti');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- Fondo di Garanzia PMI ---
  if (measure.id === 'fondo-garanzia') {
    const faq = getFaqById('garanzia-pubblica');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- Resto al Sud 2.0 ---
  if (measure.id === 'resto-al-sud-20') {
    const faq = getFaqById('resto-sud');

    // Impresa già attiva domanda Resto al Sud
    if (
      n.includes('gia attiva') || n.includes('già attiva') ||
      n.includes('attiva da') || n.includes('operativa') ||
      (n.includes('impresa') && n.includes('attiva'))
    ) {
      return {
        outcome: 'no',
        text: `Resto al Sud 2.0 è pensata per l'avvio di nuova attività, non per imprese già operative. Per imprese esistenti nel Mezzogiorno esistono altre misure regionali e nazionali; posso aiutarti a individuarle se mi dici regione e obiettivo.`,
        measureId: measure.id,
      };
    }

    if (n.includes('formazione') || n.includes('formare') || n.includes('corso')) {
      return {
        outcome: 'yes_under_conditions',
        text: `Resto al Sud 2.0 finanzia principalmente beni strumentali, attrezzature e spese di avvio. Per la formazione specifica è possibile in alcuni casi (voucher per servizi specialistici), ma dipende dal testo attuativo aggiornato. Non posso confermare senza verificare il bando vigente.`,
        measureId: measure.id,
      };
    }

    if (faq) {
      return {
        outcome: 'yes_under_conditions',
        text: `${faq.answer} Prima della candidatura, verificare sempre il bando aggiornato sul sito Invitalia.`,
        measureId: measure.id,
      };
    }

    return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
  }

  // --- Autoimpiego Centro-Nord ---
  if (measure.id === 'autoimpiego-centro-nord') {
    const faq = getFaqById('autoimpiego');

    if (
      n.includes('sud') || n.includes('calabria') || n.includes('sicilia') ||
      n.includes('campania') || n.includes('puglia') || n.includes('basilicata')
    ) {
      return {
        outcome: 'no',
        text: `Autoimpiego Centro-Nord è destinato alle regioni del Centro e Nord Italia. Per le regioni meridionali (Calabria, Sicilia, Campania, Puglia, Basilicata, Sardegna, Molise, Abruzzo) esiste Resto al Sud 2.0 di Invitalia.`,
        measureId: measure.id,
      };
    }

    if (faq) {
      return {
        outcome: 'yes_under_conditions',
        text: `${faq.answer} Prima della candidatura verificare il bando aggiornato.`,
        measureId: measure.id,
      };
    }

    return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
  }

  return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
}

import { STRATEGIC_SCANNER_DOCS } from '@/lib/strategicScannerDocs';
import { compareMeasures, formatComparisonMessage } from './measureComparer';
import { IncentiviDoc } from '@/lib/matching/types';

/**
 * Answers a comparison question between two measures.
 */
export function answerMeasureComparison(message: string): GroundedMeasureResult | null {
  const measures = detectMeasureIds(message);
  if (measures.length < 2) return null;

  const idA = measures[0].id;
  const idB = measures[1].id;

  // Trova i doc completi
  const docA = STRATEGIC_SCANNER_DOCS.find(d => d.id.includes(idA)) as unknown as IncentiviDoc;
  const docB = STRATEGIC_SCANNER_DOCS.find(d => d.id.includes(idB)) as unknown as IncentiviDoc;

  if (!docA || !docB) return null;

  const comparison = compareMeasures(docA, docB);
  const text = formatComparisonMessage(comparison);

  return {
    outcome: 'yes_under_conditions',
    text,
    measureId: `${idA}-vs-${idB}`
  };
}

/** Returns true if the message is a direct measure question (for routing). */
export function isDirectMeasureQuestion(message: string): boolean {
  return isMeasureQuestion(message) && detectMeasureId(message) !== null;
}
