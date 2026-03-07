/**
 * Grounded measure answerer: answers direct measure questions using only
 * knowledge and data already present in the repository. No external retrieval as primary.
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
  { id: 'autoimpiego-centro-nord', name: 'Autoimpiego Centro-Nord', aliases: ['autoimpiego centro nord', 'autoimpiego', 'centro nord'] },
];

function detectMeasureId(message: string): { id: string; name: string } | null {
  const n = normalizeForMatch(message);
  for (const m of MEASURE_ALIASES) {
    if (m.aliases.some((a) => n.includes(normalizeForMatch(a)))) return { id: m.id, name: m.name };
  }
  return null;
}

function isMeasureQuestion(message: string): boolean {
  const n = normalizeForMatch(message);
  if (!n || n.length < 10) return false;
  const hasMeasure = MEASURE_ALIASES.some((m) => m.aliases.some((a) => n.includes(normalizeForMatch(a))));
  if (!hasMeasure) return false;
  const questionPatterns = [
    'si puo finanziare', 'si può finanziare', 'posso finanziare', 'copre', 'coprono', 'vale per', 'valgono per',
    'ammissibil', 'spese ammissibili', 'puo accedere', 'può accedere', 'posso accedere', 'srl puo', 'srl può',
    'impresa gia attiva', 'impresa già attiva', 'gia attiva', 'già attiva', 'formazione', 'software', 'macchinari',
    'beneficiari', 'requisiti', 'puo partecipare', 'può partecipare', 'rientra', 'inclus'
  ];
  return questionPatterns.some((p) => n.includes(p)) || n.includes('?');
}

/** In-repo knowledge: expense/beneficiary/business rules per measure (from FINANCE_FAQ and spec). */
function getMeasureKnowledge(measureId: string): { expenses: string; beneficiary: string; business: string } {
  const resto = FINANCE_FAQ.find((x) => x.id === 'resto-sud');
  const autoimpiego = FINANCE_FAQ.find((x) => x.id === 'autoimpiego');
  if (measureId === 'resto-al-sud-20' && resto) {
    return {
      expenses: 'Finanzia investimenti e spese di avvio. La norma privilegia beni strumentali e consulenze; per la formazione specifica va verificato il testo attuativo (possibile sì sotto condizioni).',
      beneficiary: 'Sostiene attività nelle regioni del Mezzogiorno (Sicilia, Sardegna, Calabria, Puglia, Basilicata, Campania, Molise, Abruzzo) e aree del sisma.',
      business: 'Misura per avvio di attività (nuova attività).',
    };
  }
  if (measureId === 'autoimpiego-centro-nord' && autoimpiego) {
    return {
      expenses: 'Supporta con contributi e finanziamenti; coerenza spese investimenti vs gestione è fondamentale.',
      beneficiary: 'Avvio di attività nelle regioni Centro e Nord Italia. Supporta giovani e soggetti svantaggiati.',
      business: 'Misura per avvio di attività (nuova impresa).',
    };
  }
  return { expenses: '', beneficiary: '', business: '' };
}

function buildPrudentReply(measureName: string): string {
  return `Per ${measureName} l’ammissibilità dipende da requisiti e spese specifici. Per una risposta precisa sul tuo caso conviene verificare il bando aggiornato o darmi regione, tipo di attività e cosa vorresti finanziare così posso proporti una shortlist coerente.`;
}

/**
 * Answer a direct measure question using only in-repo knowledge.
 * Returns not_confirmable when knowledge is insufficient; never invents facts.
 */
export function answerGroundedMeasureQuestion(message: string): GroundedMeasureResult | null {
  const n = normalizeForMatch(message);
  if (!isMeasureQuestion(message)) return null;

  const measure = detectMeasureId(message);
  if (!measure) return null;

  const knowledge = getMeasureKnowledge(measure.id);

  // Expense-related question
  if (n.includes('formazione') || n.includes('formare') || n.includes('corso')) {
    if (measure.id === 'resto-al-sud-20' && knowledge.expenses) {
      return {
        outcome: 'yes_under_conditions',
        text: `${measure.name} finanzia investimenti e spese di avvio; la norma privilegia beni strumentali e consulenze. Per la formazione in particolare è possibile in alcuni casi (voucher servizi specialistici o testo attuativo). Per confermare se un corso specifico è coperto serve verificare il bando aggiornato.`,
        measureId: measure.id,
      };
    }
    return {
      outcome: 'not_confirmable',
      text: buildPrudentReply(measure.name),
      measureId: measure.id,
    };
  }

  if (n.includes('software') || n.includes('macchinari') || n.includes('beni strumentali') || n.includes('digitalizz')) {
    if (knowledge.expenses) {
      return {
        outcome: 'yes',
        text: `Sì, ${measure.name} prevede il finanziamento di investimenti e in molti casi beni strumentali, software e digitalizzazione. I dettagli sono nel bando aggiornato.`,
        measureId: measure.id,
      };
    }
    return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
  }

  // Beneficiary / legal form
  if (n.includes('srl') || n.includes('s r l') || n.includes('impresa') || n.includes('pmi') || n.includes('puo accedere') || n.includes('può accedere')) {
    if (knowledge.beneficiary) {
      const businessMatch = n.includes('gia attiva') || n.includes('già attiva') || n.includes('attiva');
      if (businessMatch && measure.id === 'resto-al-sud-20') {
        return {
          outcome: 'no',
          text: `${measure.name} è pensata per l’avvio di nuova attività. Per imprese già operative esistono altre misure; posso aiutarti a individuarle in base a regione e obiettivo.`,
          measureId: measure.id,
        };
      }
      return {
        outcome: 'yes_under_conditions',
        text: `${measure.name}: ${knowledge.beneficiary} ${knowledge.business} Per confermare i requisiti sul tuo caso (forma giuridica, regione, tipo attività) serve il bando aggiornato o i tuoi dati per una shortlist.`,
        measureId: measure.id,
      };
    }
    return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
  }

  // Generic measure question: return FAQ-based answer if we have one
  const faqResto = FINANCE_FAQ.find((x) => x.id === 'resto-sud');
  const faqAuto = FINANCE_FAQ.find((x) => x.id === 'autoimpiego');
  if (measure.id === 'resto-al-sud-20' && faqResto) {
    return {
      outcome: 'yes_under_conditions',
      text: `${faqResto.answer} Per sicurezza operativa, prima della candidatura verifico sempre l’aggiornamento ufficiale del bando.`,
      measureId: measure.id,
    };
  }
  if (measure.id === 'autoimpiego-centro-nord' && faqAuto) {
    return {
      outcome: 'yes_under_conditions',
      text: `${faqAuto.answer} Per confermare sul tuo caso conviene verificare il bando aggiornato.`,
      measureId: measure.id,
    };
  }

  return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
}

/** Returns true if the message is a direct measure question (for routing). */
export function isDirectMeasureQuestion(message: string): boolean {
  return isMeasureQuestion(message) && detectMeasureId(message) !== null;
}
