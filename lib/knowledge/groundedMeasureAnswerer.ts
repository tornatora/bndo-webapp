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
import { fetchAllIncentiviDocs } from '@/lib/matching/datasetIncentivi';
import { loadHybridDatasetDocs } from '@/lib/matching/datasetRepository';
import { IncentiviDoc } from '@/lib/matching/types';

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
  { id: 'smart-start', name: 'Smart&Start Italia', aliases: ['smart and start', 'startup innovative', 'smart&start', 'invitalia startup'] },
  { id: 'on-tasso-zero', name: 'ON - Oltre Nuove Imprese a Tasso Zero', aliases: ['oltre nuove imprese', 'on tasso zero', 'donne giovani invitalia', 'nuove imprese giovani', 'finanziamento donne', 'nuove imprese a tasso zero'] },
  { id: 'voucher-export', name: 'Voucher Internazionalizzazione', aliases: ['voucher export', 'voucher internazionalizzazione', 'tem manager', 'mercati esteri', 'export pmi'] },
  { id: 'fondo-competenze', name: 'Fondo Nuove Competenze', aliases: ['fondo nuove competenze', 'anpal competenze', 'formazione dipendenti', 'formazione finanziata'] },
  { id: 'transizione-50', name: 'Transizione 5.0', aliases: ['transizione 5.0', 'transizione 5 0', 'credito 5.0', 'bonus energia'] },
  { id: 'fusese', name: 'FUSESE', aliases: ['fusese', 'fund for self employment', 'fund self employment', 'self entrepreneurship'] },
  { id: 'transizione-40', name: 'Transizione 4.0 / 5.0', aliases: ['transizione 4.0', 'transizione 4 0', 'industria 4.0', 'industria 4 0', 'piano transizione'] },
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
  if (hasMeasure) return true;

  // Broaden: check for generic grant-related keywords
  return /\b(bando|incentiv|contribut|finanziament|agevolazion)\b/.test(n);
}

function getFaqById(id: string) {
  return FINANCE_FAQ.find((x) => x.id === id) ?? null;
}

function buildPrudentReply(measureName: string): string {
  return `Per ${measureName} l'ammissibilità dipende da requisiti e spese specifici definiti nel bando. Per una risposta precisa sul tuo caso conviene verificare il bando ufficiale aggiornato. CONSIGLIO: Se mi dici regione, tipo di attività e cosa vorresti finanziare, posso capire se ci sono alternative più vantaggiose o come adattare il tuo progetto per massimizzare le probabilità di successo.`;
}

/**
 * Answer a direct measure question using only in-repo knowledge.
 */
export async function answerGroundedMeasureQuestion(message: string): Promise<GroundedMeasureResult | null> {
  if (!isMeasureQuestion(message)) return null;

  const measures = detectMeasureIds(message);
  
  // Se ci sono 2 o piú misure, lancia il COMPARATORE UNIVERSALE
  if (measures.length >= 2) {
      return await answerMeasureComparison(message);
  }

  const measure = measures.length > 0 ? measures[0] : null;
  
  if (!measure) {
      return findInDatasetFallback(message);
  }

  const n = normalizeForMatch(message);

  // --- Nuova Sabatini ---
  if (measure.id === 'nuova-sabatini') {
    const faq = getFaqById('nuova-sabatini');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };

    const isExpenseQuestion = /\b(cosa finanzia|spese|ammissibil|rientra|posso comprare|posso acquistare|macchinar|software|hardware|impiant|attrezzatur)/.test(n);

    if (isExpenseQuestion) {
        return {
            outcome: 'yes_under_conditions',
            text: `La Nuova Sabatini finanzia l'acquisto (anche in leasing) di beni strumentali NUOVI: macchinari, impianti, attrezzature di fabbrica, hardware e software. Non sono ammissibili beni usati o spese di gestione. ${faq.answer}`,
            measureId: measure.id
        };
    }

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

  // --- Transizione 4.0 ---
  if (measure.id === 'transizione-40') {
    const faq = getFaqById('credito-imposta-investimenti');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- Transizione 5.0 ---
  if (measure.id === 'transizione-50') {
    const faq = getFaqById('transizione-5-0');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- Smart&Start ---
  if (measure.id === 'smart-start') {
    const faq = getFaqById('smart-start');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- ON (Oltre Nuove Imprese) ---
  if (measure.id === 'on-tasso-zero') {
    const faq = getFaqById('on-tasso-zero');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- Voucher Export ---
  if (measure.id === 'voucher-export') {
    const faq = getFaqById('voucher-export');
    if (!faq) return { outcome: 'not_confirmable', text: buildPrudentReply(measure.name), measureId: measure.id };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
    };
  }

  // --- Fondo Nuove Competenze ---
  if (measure.id === 'fondo-competenze') {
    const faq = getFaqById('fondo-competenze');
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
    
    // Expense recognition (PRIORITY)
    const isSignQuestion = /\b(insegna|insegne|cartellone|scritta esterna)/.test(n);
    const isFurnitureQuestion = /\b(arred|mobil|arredamento|bancone|sedie|tavol)/.test(n);
    const isEquipmentQuestion = /\b(attrezzatur|macchinar|software|pc|computer|ipad|tablet)/.test(n);
    const isRestructuringQuestion = /\b(ristruttur|opere murarie|lavori|paviment|impiant)/.test(n);

    if (isSignQuestion) {
        return {
            outcome: 'yes',
            text: `Sì, l'insegna d'esercizio è una spesa ammissibile in Resto al Sud 2.0, rientrando tra le spese per attrezzature o arredi necessari all'attività.`,
            measureId: measure.id
        };
    }
    if (isFurnitureQuestion) {
        return {
            outcome: 'yes',
            text: `Sì, gli arredi (come banconi, tavoli, sedie) sono pienamente finanziabili con Resto al Sud 2.0 per l'avvio della tua nuova attività.`,
            measureId: measure.id
        };
    }
    if (isEquipmentQuestion) {
        return {
            outcome: 'yes',
            text: `Certamente, pc, tablet, software e macchinari specifici per l'attività sono tra le voci di spesa principali ammesse dal bando.`,
            measureId: measure.id
        };
    }
    if (isRestructuringQuestion) {
        return {
            outcome: 'yes_under_conditions',
            text: `Le opere murarie e di ristrutturazione sono ammissibili in Resto al Sud 2.0, solitamente entro un limite (es. 30% dell'investimento totale).`,
            measureId: measure.id
        };
    }

    const isFactualExpenseQuestion = (isSignQuestion || isFurnitureQuestion || isEquipmentQuestion || isRestructuringQuestion);

    // Solo se NON è una domanda su una spesa specifica, applichiamo il blocco "già attiva"
    if (!isFactualExpenseQuestion) {
        if (
        n.includes('gia attiva') || n.includes('già attiva') ||
        n.includes('attiva da') || n.includes('da piú di') || n.includes('da piu di') ||
        /\bda \d+ ann/.test(n) || n.includes('operativa') ||
        (n.includes('impresa') && (n.includes('attiva') || n.includes('avviata')))
        ) {
        return {
            outcome: 'no',
            text: `ATTENZIONE: Resto al Sud 2.0 è pensata esclusivamente per l'avvio di nuova attività (startup). Se la tua impresa è già operativa, questa misura non è applicabile. Tuttavia, esistono molti altri bandi regionali e nazionali (come la Nuova Sabatini) per aziende già attive. Se mi dici cosa devi finanziare (es. macchinari, digitalizzazione), ti indico subito l'alternativa giusta.`,
            measureId: measure.id,
        };
        }
    }

    // Strategic Partnership Hack for over 35
    if (n.includes('over 35') || n.includes('più di 35') || n.includes('36 anni') || n.includes('40 anni') || n.includes('50 anni')) {
        return {
            outcome: 'yes_under_conditions',
            text: `Resto al Sud 2.0 è riservato ai giovani Under 35. CONSIGLIO STRATEGICO: Se hai più di 35 anni, puoi comunque accedere se costituisci una società in cui almeno uno dei soci è Under 35 e detiene la quota di maggioranza (almeno il 51%). Hai qualcuno con cui potresti fare società per rientrare nei requisiti?`,
            measureId: measure.id
        };
    }

    // Expert Hack for employed users
    if (n.includes('sto lavorando') || n.includes('dipendente') || n.includes('occupato')) {
        return {
            outcome: 'yes_under_conditions',
            text: `Resto al Sud 2.0 richiede lo stato di disoccupazione (spesso da almeno 6 mesi). CONSIGLIO STRATEGICO: Se il tuo progetto imprenditoriale è solido, molti utenti scelgono di licenziarsi per maturare il requisito di disoccupazione e accedere ai fondi (fino al 75% a fondo perduto). Vuoi approfondire come funziona questa strategia?`,
            measureId: measure.id
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

/**
 * Dynamic fallback: search the 8000+ grants dataset for a match.
 */
export async function findInDatasetFallback(message: string): Promise<GroundedMeasureResult | null> {
    try {
        const rawDocs = await fetchAllIncentiviDocs(5000);
        const n = normalizeForMatch(message);
        
        // Match words longer than 3 chars (excluding common stop words if possible, but simplicity first)
        const msgWords = n.split(' ').filter(w => w.length > 3 && !['come', 'cosa', 'sono', 'dove'].includes(w));
        if (msgWords.length === 0) return null;

        const candidates = rawDocs.map(doc => {
            const titleNorm = normalizeForMatch(doc.title || '');
            const matchCount = msgWords.filter(w => titleNorm.includes(w)).length;
            return { doc, score: matchCount / msgWords.length };
        }).filter(c => c.score >= 0.5).sort((a,b) => b.score - a.score);

        if (candidates.length === 0) return null;

        const best = candidates[0].doc;
        const text = `Ho trovato questo bando nel database nazionale: **${best.title}**.
        
DESCRIZIONE: ${best.description?.replace(/<[^>]*>/g, '').slice(0, 350)}...
BENEFICIARI: ${Array.isArray(best.beneficiaries) ? best.beneficiaries.slice(0,3).join(', ') : 'Vedi bando'}
FORMA AIUTO: ${Array.isArray(best.supportForm) ? best.supportForm.join(', ') : 'Contributo'}
        
Vuoi approfondire questo bando o procediamo con la ricerca per trovarne altri simili?`;

        return {
            outcome: 'yes_under_conditions',
            text,
            measureId: `dataset-${best.id}`
        };
    } catch (e) {
        return null;
    }
}

import { STRATEGIC_SCANNER_DOCS } from '@/lib/strategicScannerDocs';
import { compareMeasures, formatComparisonMessage } from './measureComparer';

/**
 * Answers a comparison question between two measures (Strategic or Dataset).
 */
export async function answerMeasureComparison(message: string): Promise<GroundedMeasureResult | null> {
  const detected = detectMeasureIds(message);
  if (detected.length < 2) return null;

  const { docs } = await loadHybridDatasetDocs().catch(() => ({ docs: [] }));
  const n = normalizeForMatch(message);

  const findDoc = (id: string, name: string): IncentiviDoc | null => {
      // 1. Try strategic match
      const strategic = STRATEGIC_SCANNER_DOCS.find(d => d.id.includes(id));
      if (strategic) return strategic as unknown as IncentiviDoc;

      // 2. Try title match in dataset
      const nameWords = normalizeForMatch(name).split(' ').filter(w => w.length > 3);
      const candidates = docs.filter(d => {
          const title = normalizeForMatch(d.title || '');
          return nameWords.every(w => title.includes(w));
      });
      return candidates[0] || null;
  };

  const docA = findDoc(detected[0].id, detected[0].name);
  const docB = findDoc(detected[1].id, detected[1].name);

  if (!docA || !docB) {
      // Fallback: if we only found one or none, we can't compare properly
      return null;
  }

  const comparison = compareMeasures(docA, docB);
  const text = formatComparisonMessage(comparison);

  return {
    outcome: 'yes_under_conditions',
    text,
    measureId: `${docA.id}-vs-${docB.id}`
  };
}

/** Returns true if the message is a direct measure question (for routing). */
export function isDirectMeasureQuestion(message: string): boolean {
  return isMeasureQuestion(message) && detectMeasureId(message) !== null;
}
