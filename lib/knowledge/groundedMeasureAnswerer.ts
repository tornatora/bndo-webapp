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
import { resolveMeasureFactsById, type ResolvedMeasureFacts } from '@/lib/matching/measureFactsResolver';

export type GroundedOutcome = 'yes' | 'no' | 'yes_under_conditions' | 'not_confirmable';

export type GroundedMeasureResult = {
  outcome: GroundedOutcome;
  text: string;
  measureId: string | null;
  measureName?: string | null;
  factSource?: 'scanner_dataset' | 'faq' | 'mixed' | 'none';
  groundingStatus?: 'grounded' | 'estimated_with_warning' | 'degraded' | 'none';
  factsSnapshot?: {
    aidForm: string | null;
    aidIntensity: string | null;
    hasVoucher: boolean;
    coversUpTo100: boolean;
    displayAmountLabel: string | null;
    displayProjectAmountLabel: string | null;
    displayCoverageLabel: string | null;
    sourceUrl: string | null;
  };
};

export type GroundedMeasureContext = {
  activeMeasureId?: string | null;
  activeMeasureTitle?: string | null;
};

const AMBIGUOUS_RESTO_SUD_ID = 'resto-al-sud-ambiguous';

const MEASURE_ALIASES: Array<{ id: string; name: string; aliases: string[] }> = [
  { id: 'resto-al-sud-20', name: 'Resto al Sud 2.0', aliases: ['resto al sud 2.0', 'resto al sud 20', 'resto al sud 2 0'] },
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
  { id: 'zes-unica', name: 'ZES Unica', aliases: ['zes', 'zes unica', 'zona economica speciale', 'bonus sud'] },
  { id: 'simest', name: 'SIMEST Fondo 394', aliases: ['simest', 'fondo 394', 'export simest'] },
  { id: 'contratto-sviluppo', name: 'Contratto di Sviluppo', aliases: ['contratto di sviluppo', 'cds invitalia', 'grandi investimenti'] },
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
  if (containsRestoAlSudAmbiguousReference(n)) {
    found.push({ id: AMBIGUOUS_RESTO_SUD_ID, name: 'Resto al Sud (da chiarire)' });
  }
  for (const m of MEASURE_ALIASES) {
    if (m.aliases.some((a) => n.includes(normalizeForMatch(a)))) {
      found.push({ id: m.id, name: m.name });
    }
  }
  return found;
}

function isContextualGrantQuestion(message: string): boolean {
  const n = normalizeForMatch(message);
  if (!n || n.length < 2) return false;
  if (/\?$/.test(message.trim())) return true;
  return /\b(chi|cosa|come|quando|quanto|quale|quali|requisit|scadenz|beneficiar|ammissibil|spes|document|partecip|fondo perduto|voucher|copertura|percentual)\b/.test(
    n,
  );
}

function hasFocusedMeasureContext(context?: GroundedMeasureContext | null): boolean {
  return Boolean(String(context?.activeMeasureId ?? '').trim() || String(context?.activeMeasureTitle ?? '').trim());
}

function isStrictFocusedGrantContext(context?: GroundedMeasureContext | null): boolean {
  const id = String(context?.activeMeasureId ?? '').trim();
  if (!id) return false;
  if (/^incentivi-\d+$/i.test(id)) return true;
  if (MEASURE_ALIASES.some((entry) => entry.id === id)) return false;
  return id !== AMBIGUOUS_RESTO_SUD_ID;
}

function isMeasureQuestion(message: string, context?: GroundedMeasureContext | null): boolean {
  const n = normalizeForMatch(message);
  if (!n || n.length < 8) return false;
  const hasMeasure = detectMeasureIds(message).length > 0;
  if (hasMeasure) return true;

  // Broaden: check for generic grant-related keywords
  if (/\b(bando|incentiv|contribut|finanziament|agevolazion)\b/.test(n)) return true;
  return hasFocusedMeasureContext(context) && isContextualGrantQuestion(message);
}

function asksOtherBandiInStrictFocus(
  normalizedMessage: string,
  detectedMeasures: Array<{ id: string; name: string }>,
  focusedMeasure: { id: string; name: string } | null,
): boolean {
  if (
    /\b(altri bandi|altro bando|un altro bando|bando diverso|altra misura|altri incentivi|altre misure|altri contributi)\b/.test(
      normalizedMessage,
    )
  ) {
    return true;
  }
  if (!detectedMeasures.length) return false;
  if (!focusedMeasure) return true;
  const focusedIdNorm = normalizeForMatch(focusedMeasure.id);
  const focusedNameNorm = normalizeForMatch(focusedMeasure.name);
  return detectedMeasures.some((measure) => {
    const candidateIdNorm = normalizeForMatch(measure.id);
    const candidateNameNorm = normalizeForMatch(measure.name);
    const sameId =
      candidateIdNorm === focusedIdNorm ||
      candidateIdNorm.includes(focusedIdNorm) ||
      focusedIdNorm.includes(candidateIdNorm);
    const sameName =
      candidateNameNorm === focusedNameNorm ||
      candidateNameNorm.includes(focusedNameNorm) ||
      focusedNameNorm.includes(candidateNameNorm);
    return !(sameId || sameName);
  });
}

function buildStrictFocusRedirectReply(measureName: string): string {
  return `In questa chat posso aiutarti solo su ${measureName}. Per confrontare o chiedere informazioni su altri bandi, usa il pulsante “Chat AI” nel menù a sinistra.`;
}

function getFaqById(id: string) {
  return FINANCE_FAQ.find((x) => x.id === id) ?? null;
}

function buildPrudentReply(measureName: string): string {
  return `Per ${measureName} l'ammissibilità dipende dai requisiti ufficiali e dalle spese che vuoi presentare. Ti aiuto volentieri in modo pratico: se mi dici regione, tipo di attività e investimento previsto, posso darti subito una valutazione molto più precisa.`;
}

function normalizedMeasureFromContext(context?: GroundedMeasureContext | null): { id: string; name: string } | null {
  const id = String(context?.activeMeasureId ?? '').trim();
  if (id === 'resto-al-sud-20') return { id, name: 'Resto al Sud 2.0' };
  if (id === 'autoimpiego-centro-nord') return { id, name: 'Autoimpiego Centro-Nord' };
  if (id && id !== AMBIGUOUS_RESTO_SUD_ID) {
    const byAlias = MEASURE_ALIASES.find((entry) => entry.id === id);
    if (byAlias) return { id: byAlias.id, name: byAlias.name };
  }

  const titleNorm = normalizeForMatch(String(context?.activeMeasureTitle ?? ''));
  if (!titleNorm) return null;
  if (titleNorm.includes('resto al sud 2') || titleNorm.includes('resto al sud 20')) {
    return { id: 'resto-al-sud-20', name: 'Resto al Sud 2.0' };
  }
  if (titleNorm.includes('autoimpiego') && titleNorm.includes('centro')) {
    return { id: 'autoimpiego-centro-nord', name: 'Autoimpiego Centro-Nord' };
  }
  const aliasHit = MEASURE_ALIASES.find((entry) =>
    entry.aliases.some((alias) => titleNorm.includes(normalizeForMatch(alias))),
  );
  if (aliasHit) return { id: aliasHit.id, name: aliasHit.name };

  const fallbackTitle = String(context?.activeMeasureTitle ?? '').trim();
  if (id && fallbackTitle) {
    return { id, name: fallbackTitle };
  }
  if (id) return { id, name: 'questo bando' };
  if (fallbackTitle) return { id: fallbackTitle, name: fallbackTitle };
  return null;
}

function containsRestoAlSudAmbiguousReference(messageNorm: string) {
  const mentionsRestoSud = /\bresto al sud\b/.test(messageNorm);
  if (!mentionsRestoSud) return false;
  const explicit20 = /\bresto al sud (2 0|20|2)\b/.test(messageNorm);
  return !explicit20;
}

function asksAllFunded(messageNorm: string) {
  return /\b(tutto|interamente|completamente|100|100%)\b/.test(messageNorm) && /\bfondo perduto\b/.test(messageNorm);
}

function asksVoucherOrPercent(messageNorm: string) {
  return /\b(voucher|100|100%|fondo perduto|copertura|percentual|aliquota)\b/.test(messageNorm);
}

function buildHumanEconomicRecap(facts: Awaited<ReturnType<typeof resolveMeasureFactsById>>) {
  if (!facts) return '';
  const segments: string[] = [];
  if (facts.aidIntensity) {
    segments.push(`coperture che possono arrivare a ${facts.aidIntensity}`);
  }
  if (facts.economicOffer?.displayAmountLabel) {
    segments.push(facts.economicOffer.displayAmountLabel);
  }
  if (!segments.length && facts.aidForm) {
    segments.push(facts.aidForm);
  }
  return segments.join(', ');
}

function toFactsSnapshot(facts: ResolvedMeasureFacts | null | undefined): GroundedMeasureResult['factsSnapshot'] | undefined {
  if (!facts) return undefined;
  return {
    aidForm: facts.aidForm ?? null,
    aidIntensity: facts.aidIntensity ?? null,
    hasVoucher: Boolean(facts.hasVoucher),
    coversUpTo100: Boolean(facts.coversUpTo100),
    displayAmountLabel: facts.economicOffer?.displayAmountLabel ?? null,
    displayProjectAmountLabel: facts.economicOffer?.displayProjectAmountLabel ?? null,
    displayCoverageLabel: facts.economicOffer?.displayCoverageLabel ?? null,
    sourceUrl: facts.sourceUrl ?? null,
  };
}

function grantIdLookupKeys(grantId: string): string[] {
  const trimmed = String(grantId || '').trim();
  if (!trimmed) return [];
  const raw = trimmed.replace(/^incentivi-/i, '').trim();
  const keys = new Set<string>([trimmed, raw]);
  if (raw && /^\d+$/.test(raw)) keys.add(`incentivi-${raw}`);
  return Array.from(keys).filter(Boolean);
}

function docLookupKeys(doc: IncentiviDoc): string[] {
  const id = String(doc.id ?? '').trim();
  if (!id) return [];
  return Array.from(new Set([id, `incentivi-${id}`]));
}

function compactList(value: unknown, limit = 4) {
  const items = Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : typeof value === 'string'
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  return items.slice(0, limit);
}

function formatDateLabel(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function resolveCoverageFromDoc(doc: IncentiviDoc) {
  const direct = String(doc.displayCoverageLabel ?? '').trim();
  if (direct) return direct;
  const min = Number(String(doc.coverageMinPercent ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  const max = Number(String(doc.coverageMaxPercent ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (hasMin && hasMax) {
    return Math.round(min) === Math.round(max) ? `${Math.round(max)}%` : `${Math.round(min)}% - ${Math.round(max)}%`;
  }
  if (hasMax) return `${Math.round(max)}%`;
  if (hasMin) return `${Math.round(min)}%`;
  return null;
}

function resolveGenericMeasureFacts(doc: IncentiviDoc, measureId: string, measureName: string) {
  const aidFormList = compactList(doc.supportForm, 4);
  const aidForm = aidFormList.length ? aidFormList.join(', ') : null;
  const aidIntensity = resolveCoverageFromDoc(doc);
  const textBlob = normalizeForMatch(
    [doc.description, doc.displayCoverageLabel, doc.displayAmountLabel, doc.displayProjectAmountLabel].filter(Boolean).join(' '),
  );
  const hasVoucher = /\bvoucher\b/.test(textBlob) || aidFormList.some((entry) => normalizeForMatch(entry).includes('voucher'));
  const coversUpTo100 = /100/.test(String(aidIntensity ?? '')) || /\b100\b|\bal 100\b/.test(textBlob);
  return {
    outcome: 'yes_under_conditions' as const,
    measureId,
    measureName,
    factSource: 'scanner_dataset' as const,
    groundingStatus: 'grounded' as const,
    factsSnapshot: {
      aidForm,
      aidIntensity,
      hasVoucher,
      coversUpTo100,
      displayAmountLabel: String(doc.displayAmountLabel ?? '').trim() || null,
      displayProjectAmountLabel: String(doc.displayProjectAmountLabel ?? '').trim() || null,
      displayCoverageLabel: aidIntensity,
      sourceUrl: String(doc.institutionalLink ?? doc.url ?? '').trim() || null,
    },
  };
}

function buildGrantSpecificReply(message: string, doc: IncentiviDoc, measureName: string) {
  const n = normalizeForMatch(message);
  const beneficiaries = compactList(doc.beneficiaries, 5);
  const sectors = compactList(doc.sectors, 4);
  const regions = compactList(doc.regions, 4);
  const supportForm = compactList(doc.supportForm, 3);
  const deadline = formatDateLabel(doc.closeDate);
  const opening = formatDateLabel(doc.openDate);
  const coverage = resolveCoverageFromDoc(doc);
  const amountLabel = String(doc.displayAmountLabel ?? doc.displayProjectAmountLabel ?? '').trim() || null;
  const cleanDescription =
    String(doc.description ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220) || null;

  if (/\b(chi puo|chi può|beneficiar|destinatar|a chi)\b/.test(n)) {
    const who = beneficiaries.length ? beneficiaries.join(', ') : 'i beneficiari indicati nel bando';
    const area = regions.length ? ` con focus su ${regions.join(', ')}` : '';
    return `Per ${measureName} i destinatari principali sono ${who}${area}. Se vuoi, nel prossimo messaggio ti dico subito se il tuo profilo rientra nei requisiti chiave.`;
  }

  if (/\b(cosa finanz|spes|ammissibil|costi|investiment)\b/.test(n)) {
    const forms = supportForm.length ? supportForm.join(', ') : 'agevolazioni dedicate';
    const desc = cleanDescription ? ` In concreto il bando copre: ${cleanDescription}.` : '';
    return `${measureName} finanzia ${forms}.${desc} Se vuoi ti aiuto a capire se le tue spese rientrano davvero tra quelle ammesse.`;
  }

  if (/\b(scadenz|quando|apertur|entro|data)\b/.test(n)) {
    if (deadline && opening) {
      return `${measureName} risulta aperto dal ${opening} con scadenza al ${deadline}. Ti conviene preparare i documenti prima possibile per arrivare pronto alla candidatura.`;
    }
    if (deadline) {
      return `${measureName} ha come scadenza disponibile il ${deadline}. Se vuoi ti preparo subito una checklist pratica per non arrivare in ritardo.`;
    }
    return `Per ${measureName} la data di scadenza non è valorizzata in modo affidabile nel dataset attivo: prima dell’invio pratica la verifichiamo sempre su fonte ufficiale.`;
  }

  if (/\b(territorio|regione|dove|area)\b/.test(n)) {
    const area = regions.length ? regions.join(', ') : 'territorio indicato dal bando';
    return `${measureName} è attivo su ${area}. Se vuoi, in base alla tua sede ti dico subito se hai priorità o limiti territoriali.`;
  }

  if (/\b(100|100%|fondo perduto|copertura|percentual|voucher|importo|quanto)\b/.test(n)) {
    const coverageText = coverage ? `La copertura indicata è ${coverage}.` : 'La copertura varia in base alla voce di spesa e ai requisiti.';
    const amountText = amountLabel ? ` L’importo indicativo della misura è ${amountLabel}.` : '';
    return `Dipende dal tipo di spesa. ${coverageText}${amountText} Se vuoi, nel prossimo messaggio ti faccio una valutazione concreta sul tuo progetto.`;
  }

  const intro = cleanDescription
    ? `${measureName} in sintesi: ${cleanDescription}.`
    : `${measureName} è una misura attiva di finanza agevolata con regole specifiche su requisiti, spese e tempistiche.`;
  const support = supportForm.length ? ` Prevede ${supportForm.join(', ')}.` : '';
  const scope = sectors.length ? ` È pensato soprattutto per ${sectors.join(', ')}.` : '';
  const close = deadline ? ` La scadenza indicata è ${deadline}.` : '';
  return `${intro}${support}${scope}${close} Se vuoi, ti faccio subito una verifica pratica sul tuo caso reale.`;
}

async function findDocByFocusedContext(
  measure: { id: string; name: string },
  context?: GroundedMeasureContext | null,
): Promise<IncentiviDoc | null> {
  const { docs } = await loadHybridDatasetDocs().catch(() => ({ docs: [] as IncentiviDoc[] }));
  if (!docs.length) return null;

  const idCandidates = new Set<string>();
  for (const key of grantIdLookupKeys(measure.id)) idCandidates.add(key);
  for (const key of grantIdLookupKeys(String(context?.activeMeasureId ?? ''))) idCandidates.add(key);

  if (idCandidates.size > 0) {
    for (const doc of docs) {
      const keys = docLookupKeys(doc);
      if (keys.some((key) => idCandidates.has(key))) return doc;
    }
  }

  const title = normalizeForMatch(String(context?.activeMeasureTitle ?? measure.name ?? ''));
  if (!title) return null;
  const titleTokens = title.split(' ').filter((token) => token.length >= 4).slice(0, 8);
  if (!titleTokens.length) return null;

  const scored = docs
    .map((doc) => {
      const titleNorm = normalizeForMatch(doc.title ?? '');
      const descNorm = normalizeForMatch(doc.description ?? '');
      const haystack = `${titleNorm} ${descNorm}`;
      let score = 0;
      for (const token of titleTokens) {
        if (titleNorm.includes(token)) score += 3;
        else if (haystack.includes(token)) score += 1;
      }
      return { doc, score };
    })
    .filter((item) => item.score >= Math.max(3, Math.ceil(titleTokens.length * 0.5)))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.doc ?? null;
}

/**
 * Answer a direct measure question using only in-repo knowledge.
 */
export async function answerGroundedMeasureQuestion(
  message: string,
  context?: GroundedMeasureContext | null,
): Promise<GroundedMeasureResult | null> {
  if (!isMeasureQuestion(message, context)) return null;

  const n = normalizeForMatch(message);
  const detectedMeasures = detectMeasureIds(message);
  const measures = detectedMeasures.filter((measure) => measure.id !== AMBIGUOUS_RESTO_SUD_ID);
  const contextMeasure = normalizedMeasureFromContext(context);
  const strictFocused = isStrictFocusedGrantContext(context);
  const hasAmbiguousResto = containsRestoAlSudAmbiguousReference(n);

  if (strictFocused && asksOtherBandiInStrictFocus(n, detectedMeasures, contextMeasure)) {
    const measureName = contextMeasure?.name ?? 'questo bando';
    return {
      outcome: 'not_confirmable',
      text: buildStrictFocusRedirectReply(measureName),
      measureId: contextMeasure?.id ?? null,
      measureName,
      factSource: 'none',
      groundingStatus: 'none',
    };
  }
  
  // Se ci sono 2 o piú misure, lancia il COMPARATORE UNIVERSALE
  if (!strictFocused && measures.length >= 2) {
      return await answerMeasureComparison(message);
  }

  const measure = strictFocused
    ? contextMeasure ?? (measures.length > 0 ? measures[0] : null)
    : measures.length > 0
      ? measures[0]
      : hasAmbiguousResto
        ? contextMeasure
        : contextMeasure;
  
  if (!measure) {
      if (hasAmbiguousResto) {
        return {
          outcome: 'not_confirmable',
          text: 'Per darti una risposta precisa devo prima allineare la misura: intendi il vecchio Resto al Sud oppure Resto al Sud 2.0? Appena me lo confermi ti rispondo in modo netto su percentuali e fondo perduto.',
          measureId: AMBIGUOUS_RESTO_SUD_ID,
          measureName: 'Resto al Sud (da chiarire)',
          factSource: 'none',
          groundingStatus: 'none',
        };
      }
      return findInDatasetFallback(message);
  }

  // --- Nuova Sabatini ---
  if (measure.id === 'nuova-sabatini') {
    const faq = getFaqById('nuova-sabatini');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };

    const isExpenseQuestion = /\b(cosa finanzia|spese|ammissibil|rientra|posso comprare|posso acquistare|macchinar|software|hardware|impiant|attrezzatur)/.test(n);

    if (isExpenseQuestion) {
        return {
            outcome: 'yes_under_conditions',
            text: `La Nuova Sabatini finanzia l'acquisto (anche in leasing) di beni strumentali NUOVI: macchinari, impianti, attrezzature di fabbrica, hardware e software. Non sono ammissibili beni usati o spese di gestione. ${faq.answer}`,
            measureId: measure.id,
            factSource: 'faq',
            groundingStatus: 'grounded',
        };
    }

    if (n.includes('gia attiva') || n.includes('già attiva') || n.includes('impresa attiva') || n.includes('pmi')) {
      return {
        outcome: 'yes_under_conditions',
        text: `La Nuova Sabatini è destinata alle PMI già operative che acquistano beni strumentali nuovi tramite finanziamento bancario. ${faq.answer}`,
        measureId: measure.id,
        factSource: 'faq',
        groundingStatus: 'grounded',
      };
    }
    // Domanda generica su Sabatini
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- FUSESE ---
  if (measure.id === 'fusese') {
    const faq = getFaqById('fusese');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Transizione 4.0 ---
  if (measure.id === 'transizione-40') {
    const faq = getFaqById('credito-imposta-investimenti');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Transizione 5.0 ---
  if (measure.id === 'transizione-50') {
    const faq = getFaqById('transizione-5-0');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Smart&Start ---
  if (measure.id === 'smart-start') {
    const faq = getFaqById('smart-start');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- ON (Oltre Nuove Imprese) ---
  if (measure.id === 'on-tasso-zero') {
    const faq = getFaqById('on-tasso-zero');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Voucher Export ---
  if (measure.id === 'voucher-export') {
    const faq = getFaqById('voucher-export');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Fondo Nuove Competenze ---
  if (measure.id === 'fondo-competenze') {
    const faq = getFaqById('fondo-competenze');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Fondo di Garanzia PMI ---
  if (measure.id === 'fondo-garanzia') {
    const faq = getFaqById('garanzia-pubblica');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- ZES Unica ---
  if (measure.id === 'zes-unica') {
    const faq = getFaqById('zes');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: buildPrudentReply(measure.name),
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- SIMEST ---
  if (measure.id === 'simest') {
    const faq = getFaqById('simest-394'); // Needs to match actual ID from financeFaq.ts if any, assuming generic for now
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: `Il fondo SIMEST sostiene l'internazionalizzazione delle imprese italiane (es. fiere, e-commerce, insediamento all'estero) con finanziamenti agevolati e quote a fondo perduto. ${buildPrudentReply(measure.name)}`,
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Contratto di Sviluppo ---
  if (measure.id === 'contratto-sviluppo') {
    const faq = getFaqById('contratto-sviluppo');
    if (!faq)
      return {
        outcome: 'not_confirmable',
        text: `Il Contratto di Sviluppo finanzia grandi progetti di investimento (solitamente oltre i 20 milioni di euro, o 7.5 milioni per trasformazione agricola o turismo). ${buildPrudentReply(measure.name)}`,
        measureId: measure.id,
        factSource: 'none',
        groundingStatus: 'none',
      };
    return {
      outcome: 'yes_under_conditions',
      text: faq.answer,
      measureId: measure.id,
      factSource: 'faq',
      groundingStatus: 'grounded',
    };
  }

  // --- Resto al Sud 2.0 ---
  if (measure.id === 'resto-al-sud-20') {
    const faq = getFaqById('resto-sud');
    const facts = await resolveMeasureFactsById(measure.id, measure.name);
    
    // Expense recognition (PRIORITY)
    const isSignQuestion = /\b(insegna|insegne|cartellone|scritta esterna)/.test(n);
    const isFurnitureQuestion = /\b(arred|mobil|arredamento|bancone|sedie|tavol)/.test(n);
    const isEquipmentQuestion = /\b(attrezzatur|macchinar|software|pc|computer|ipad|tablet)/.test(n);
    const isRestructuringQuestion = /\b(ristruttur|opere murarie|lavori|paviment|impiant)/.test(n);

    if (isSignQuestion) {
        return {
            outcome: 'yes',
            text: `Sì, l'insegna d'esercizio è una spesa ammissibile in Resto al Sud 2.0, rientrando tra le spese per attrezzature o arredi necessari all'attività.`,
            measureId: measure.id,
            measureName: measure.name,
            factSource: 'faq',
            groundingStatus: 'grounded',
        };
    }
    if (isFurnitureQuestion) {
        return {
            outcome: 'yes',
            text: `Sì, gli arredi (come banconi, tavoli, sedie) sono pienamente finanziabili con Resto al Sud 2.0 per l'avvio della tua nuova attività.`,
            measureId: measure.id,
            measureName: measure.name,
            factSource: 'faq',
            groundingStatus: 'grounded',
        };
    }
    if (isEquipmentQuestion) {
        return {
            outcome: 'yes',
            text: `Certamente, pc, tablet, software e macchinari specifici per l'attività sono tra le voci di spesa principali ammesse dal bando.`,
            measureId: measure.id,
            measureName: measure.name,
            factSource: 'faq',
            groundingStatus: 'grounded',
        };
    }
    if (isRestructuringQuestion) {
        return {
            outcome: 'yes_under_conditions',
            text: `Le opere murarie e di ristrutturazione sono ammissibili in Resto al Sud 2.0, solitamente entro un limite (es. 30% dell'investimento totale).`,
            measureId: measure.id,
            measureName: measure.name,
            factSource: 'faq',
            groundingStatus: 'grounded',
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
            text: `No. Resto al Sud 2.0 è una misura per nuove attività, quindi non è in linea con imprese già operative. Se la tua azienda è attiva, conviene orientarsi su bandi per investimenti e innovazione dedicati a imprese esistenti.`,
            measureId: measure.id,
            measureName: measure.name,
            factSource: 'faq',
            groundingStatus: 'grounded',
        };
        }
    }

    // Strategic Partnership Hack for over 35
    if (n.includes('over 35') || n.includes('più di 35') || n.includes('36 anni') || n.includes('40 anni') || n.includes('50 anni')) {
        return {
            outcome: 'yes_under_conditions',
            text: `Per gli over 35 l'accesso a Resto al Sud 2.0 è possibile solo in forma societaria, a condizione che la compagine includa soci under 35 (disoccupati) che detengano almeno il 51% delle quote societarie.`,
            measureId: measure.id,
            measureName: measure.name,
            factSource: 'faq',
            groundingStatus: 'grounded',
        };
    }

    // Expert Hack for employed users
    if (n.includes('sto lavorando') || n.includes('dipendente') || n.includes('occupato')) {
        return {
            outcome: 'yes_under_conditions',
            text: `Dipende. In molti casi è richiesto uno stato occupazionale specifico al momento della domanda. Se oggi sei occupato, va verificato se rientri nei requisiti aggiornati prima di impostare la candidatura.`,
            measureId: measure.id,
            measureName: measure.name,
            factSource: 'faq',
            groundingStatus: 'grounded',
        };
    }

    if (n.includes('formazione') || n.includes('formare') || n.includes('corso')) {
      return {
        outcome: 'yes_under_conditions',
        text: `Resto al Sud 2.0 finanzia principalmente beni strumentali, attrezzature e spese di avvio. Per la formazione specifica è possibile in alcuni casi (voucher per servizi specialistici), ma dipende dal testo attuativo aggiornato. Non posso confermare senza verificare il bando vigente.`,
        measureId: measure.id,
        measureName: measure.name,
        factSource: 'faq',
        groundingStatus: 'degraded',
      };
    }

    if (facts && (facts.aidIntensity || facts.aidForm)) {
      const recap = buildHumanEconomicRecap(facts);
      const asksAll = asksAllFunded(n);
      const hasStrongVoucherSignal = facts.hasVoucher && facts.coversUpTo100;

      if (asksAll && hasStrongVoucherSignal) {
        return {
          outcome: 'yes_under_conditions',
          text: `Sì. Resto al Sud 2.0 include una componente voucher che può arrivare al 100% su voci specifiche e con massimali definiti. Non equivale a dire che tutto il progetto è sempre al 100%: la misura resta composta da componenti diverse.`,
          measureId: measure.id,
          measureName: measure.name,
          factSource: 'scanner_dataset',
          groundingStatus: 'estimated_with_warning',
          factsSnapshot: toFactsSnapshot(facts),
        };
      }

      if (asksAll && !hasStrongVoucherSignal) {
        return {
          outcome: 'yes_under_conditions',
          text: `Sì. Resto al Sud 2.0 prevede una componente al 100% sul percorso voucher, ma non su tutte le voci dell'intero progetto. La parte investimenti segue percentuali più basse (${recap || 'in base a spesa e profilo'}).`,
          measureId: measure.id,
          measureName: measure.name,
          factSource: facts ? 'mixed' : 'faq',
          groundingStatus: 'estimated_with_warning',
          factsSnapshot: toFactsSnapshot(facts),
        };
      }

      return {
        outcome: 'yes_under_conditions',
        text: `Sì. Resto al Sud 2.0 prevede componenti a fondo perduto e una parte voucher. La percentuale cambia in base alla voce di costo (${recap || 'e ai limiti della misura'}).`,
        measureId: measure.id,
        measureName: measure.name,
        factSource: 'scanner_dataset',
        groundingStatus: hasStrongVoucherSignal ? 'estimated_with_warning' : 'grounded',
        factsSnapshot: toFactsSnapshot(facts),
      };
    }

    if (faq) {
      return {
        outcome: 'yes_under_conditions',
        text: `${faq.answer} Prima della candidatura, verificare sempre il bando aggiornato sul sito Invitalia.`,
        measureId: measure.id,
        measureName: measure.name,
        factSource: 'faq',
        groundingStatus: 'grounded',
      };
    }

    return {
      outcome: 'not_confirmable',
      text: buildPrudentReply(measure.name),
      measureId: measure.id,
      measureName: measure.name,
      factSource: 'none',
      groundingStatus: 'none',
    };
  }

  // --- Autoimpiego Centro-Nord ---
  if (measure.id === 'autoimpiego-centro-nord') {
    const faq = getFaqById('autoimpiego');
    const facts = await resolveMeasureFactsById(measure.id, measure.name);

    if (
      n.includes('sud') || n.includes('calabria') || n.includes('sicilia') ||
      n.includes('campania') || n.includes('puglia') || n.includes('basilicata')
    ) {
      return {
        outcome: 'no',
        text: `Autoimpiego Centro-Nord è destinato alle regioni del Centro e Nord Italia. Per le regioni meridionali (Calabria, Sicilia, Campania, Puglia, Basilicata, Sardegna, Molise, Abruzzo) esiste Resto al Sud 2.0 di Invitalia.`,
        measureId: measure.id,
        measureName: measure.name,
        factSource: 'faq',
        groundingStatus: 'grounded',
      };
    }

    const asksVoucher = asksVoucherOrPercent(n);
    if (facts && asksVoucher) {
      const recap = buildHumanEconomicRecap(facts);
      const asksAll = asksAllFunded(n);
      const hasStrongVoucherSignal = facts.hasVoucher && facts.coversUpTo100;

      if (asksAll && hasStrongVoucherSignal) {
        return {
          outcome: 'yes_under_conditions',
          text: `Sì. Su Autoimpiego Centro-Nord esistono configurazioni con voucher fino al 100% su voci specifiche. Non significa che ogni spesa sia sempre coperta al 100%, perché la misura resta selettiva per tipologia di costo e profilo (${recap || 'con coperture variabili'}).`,
          measureId: measure.id,
          measureName: measure.name,
          factSource: 'scanner_dataset',
          groundingStatus: 'estimated_with_warning',
          factsSnapshot: toFactsSnapshot(facts),
        };
      }

      if (asksAll && !hasStrongVoucherSignal) {
        return {
          outcome: 'no',
          text: `No. Su Autoimpiego Centro-Nord non è corretto dire che tutto è al 100% su ogni voce. La struttura economica resta variabile in base al tipo di spesa (${recap || 'e ai limiti del bando'}).`,
          measureId: measure.id,
          measureName: measure.name,
          factSource: 'scanner_dataset',
          groundingStatus: 'grounded',
          factsSnapshot: toFactsSnapshot(facts),
        };
      }

      return {
        outcome: 'yes_under_conditions',
        text: `Sì. Autoimpiego Centro-Nord prevede componenti a fondo perduto e può includere voucher. La copertura non è uguale per tutte le voci, perché dipende dalle spese presentate (${recap || 'e dalle regole attive'}). Se vuoi, facciamo una simulazione pratica sulla tua idea d'investimento.`,
        measureId: measure.id,
        measureName: measure.name,
        factSource: 'scanner_dataset',
        groundingStatus: hasStrongVoucherSignal ? 'estimated_with_warning' : 'grounded',
        factsSnapshot: toFactsSnapshot(facts),
      };
    }

    if (faq) {
      return {
        outcome: 'yes_under_conditions',
        text: `${faq.answer} Prima della candidatura verificare il bando aggiornato.`,
        measureId: measure.id,
        measureName: measure.name,
        factSource: facts ? 'mixed' : 'faq',
        groundingStatus: facts ? 'estimated_with_warning' : 'grounded',
        factsSnapshot: toFactsSnapshot(facts),
      };
    }

    if (facts && (facts.aidForm || facts.aidIntensity)) {
      const recap = buildHumanEconomicRecap(facts);
      return {
        outcome: 'yes_under_conditions',
        text: `Autoimpiego Centro-Nord ha una struttura agevolativa attiva (${recap || 'con percentuali variabili'}). Ti conviene una verifica finale sul bando vigente prima dell’invio pratica.`,
        measureId: measure.id,
        measureName: measure.name,
        factSource: 'scanner_dataset',
        groundingStatus: 'estimated_with_warning',
        factsSnapshot: toFactsSnapshot(facts),
      };
    }

    return {
      outcome: 'not_confirmable',
      text: buildPrudentReply(measure.name),
      measureId: measure.id,
      measureName: measure.name,
      factSource: 'none',
      groundingStatus: 'none',
    };
  }

  const focusedDoc = await findDocByFocusedContext(measure, context);
  if (focusedDoc) {
    const text = buildGrantSpecificReply(message, focusedDoc, focusedDoc.title?.trim() || measure.name);
    return {
      ...resolveGenericMeasureFacts(focusedDoc, measure.id, focusedDoc.title?.trim() || measure.name),
      text,
      measureName: focusedDoc.title?.trim() || measure.name,
    };
  }

  return {
    outcome: 'not_confirmable',
    text: buildPrudentReply(measure.name),
    measureId: measure.id,
    measureName: measure.name,
    factSource: 'none',
    groundingStatus: 'none',
  };
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
        const shortDescription = best.description?.replace(/<[^>]*>/g, '').slice(0, 260) || 'Descrizione non disponibile in forma estesa.';
        const beneficiaries =
          Array.isArray(best.beneficiaries) && best.beneficiaries.length > 0
            ? best.beneficiaries.slice(0, 3).join(', ')
            : 'da verificare sul testo ufficiale';
        const supportForm =
          Array.isArray(best.supportForm) && best.supportForm.length > 0
            ? best.supportForm.join(', ')
            : 'contributo agevolato';

        const text = `Sì, ho trovato un bando molto pertinente: ${best.title}. In sintesi: ${shortDescription}. È rivolto soprattutto a ${beneficiaries} e prevede una forma di aiuto tipo ${supportForm}. Se vuoi, nel prossimo messaggio ti faccio una valutazione pratica su requisiti reali, probabilità di idoneità e prossimi passi.`;

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

function removeUrls(text: string) {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\[[^\]]+]\((https?:\/\/[^)]+)\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function removeMechanicalLabels(text: string) {
  return text
    .replace(/\bforma aiuto:\s*/gi, '')
    .replace(/\bcopertura indicativa:\s*/gi, '')
    .replace(/\bstima forte bndo:\s*/gi, '')
    .replace(/\bcopertura indicativa\b/gi, 'copertura')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

const KNOWN_MEASURE_NAMES: Record<string, string> = {
  'resto-al-sud-20': 'Resto al Sud 2.0',
  'autoimpiego-centro-nord': 'Autoimpiego Centro-Nord',
  'nuova-sabatini': 'Nuova Sabatini',
  'smart-start': 'Smart&Start Italia',
  'on-tasso-zero': 'ON - Oltre Nuove Imprese a Tasso Zero',
  'voucher-export': 'Voucher Internazionalizzazione',
  'fondo-competenze': 'Fondo Nuove Competenze',
  'transizione-50': 'Transizione 5.0',
  'transizione-40': 'Transizione 4.0 / 5.0',
  fusese: 'FUSESE',
  'fondo-garanzia': 'Fondo di Garanzia PMI',
};

function sanitizeInsight(text: string) {
  const cleaned = text
    .replace(/^\s*(s(i|ì)\.|no\.)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstSentence = splitSentences(cleaned)[0] ?? cleaned;
  return firstSentence.replace(/\s+/g, ' ').trim();
}

function withTerminalPeriod(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function normalizeMeasureName(result: GroundedMeasureResult) {
  if (result.measureName && result.measureName.trim()) return result.measureName.trim();
  if (result.measureId && KNOWN_MEASURE_NAMES[result.measureId]) return KNOWN_MEASURE_NAMES[result.measureId];
  return 'questa misura';
}

function compactLabel(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function ensureOpeningPrefix(opening: string, text: string) {
  const cleaned = text.trim();
  if (!cleaned) return opening;
  if (/^(s(i|ì)\.|no\.|dipende\.)/i.test(cleaned)) return cleaned;
  return `${opening} ${cleaned}`;
}

function softHumanizeText(text: string) {
  return text
    .replace(/\bATTENZIONE:\s*/gi, '')
    .replace(/\bCONSIGLIO STRATEGICO:\s*/gi, '')
    .replace(/\bNOVIT[AÀ]\s+CRITICA:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildSmartFollowUpQuestion(message: string) {
  const n = normalizeForMatch(message);
  const hasRegion = /\b(abruzzo|basilicata|calabria|campania|emilia romagna|friuli|lazio|liguria|lombardia|marche|molise|piemonte|puglia|sardegna|sicilia|toscana|trentino|umbria|veneto)\b/.test(
    n,
  );
  const hasBudget = /\b\d[\d\.,]*\s*(euro|€|k)\b/.test(n);
  const hasActivity = /\b(bar|ristor|agricol|turism|commerc|artigian|servizi|startup|impresa|azienda|studio|profession)\b/.test(
    n,
  );
  const hasStageHint = /\b(avviare|aprire|nuova|costitu|gia attiva|già attiva|esistente|operativa)\b/.test(n);

  if (!hasRegion && !hasActivity) {
    return 'Se vuoi, dimmi regione e tipo di attività e ti faccio una verifica concreta sul tuo caso.';
  }
  if (!hasBudget && hasRegion && hasActivity) {
    return 'Se vuoi, aggiungi l’investimento che hai in mente e ti dico subito quale percorso conviene davvero.';
  }
  if (!hasStageHint) {
    return 'Se vuoi, ti faccio una verifica precisa: mi basta capire se stai aprendo una nuova attività o se hai già un’impresa attiva.';
  }
  return 'Se vuoi, nel prossimo messaggio ti faccio una verifica rapida sul tuo caso reale con i dati che mi hai già dato.';
}

function compactConsultantBody(text: string, maxSentences = 2) {
  const cleaned = softHumanizeText(removeMechanicalLabels(removeUrls(text)));
  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) return cleaned;
  return sentences.slice(0, maxSentences).join(' ').trim();
}

function buildRestoAlSudClosedNarrative() {
  return [
    'Sì. Resto al Sud 2.0 prevede una specifica opzione al 100% a fondo perduto, ma non per tutte le tipologie di investimento.',
    'In pratica hai due percorsi alternativi.',
    'Primo percorso: voucher avvio, con copertura al 100% sulle spese ammesse; il massimale è 40.000 euro e può arrivare a 50.000 euro per alcune spese tecnologiche o digitali.',
    'Secondo percorso: contributo sugli investimenti più strutturati; in questo caso la percentuale scende al 75% fino a 120.000 euro e al 70% tra 120.000 e 200.000 euro.',
    'Quindi non è corretto dire che tutto il progetto è sempre al 100%: dipende dal percorso che scegli e dalle spese che presenti.',
    'Se vuoi, dimmi in due righe il tuo progetto e ti dico subito quale percorso è più adatto al tuo caso.',
  ].join(' ');
}

function buildAutoimpiegoClosedNarrative(coverageLabel: string | null, amountLabel: string | null) {
  const lines: string[] = [
    'Sì. Autoimpiego Centro-Nord può includere una componente con copertura molto alta, fino al 100% su alcune voci specifiche.',
    'Non significa però che tutte le spese del progetto siano sempre finanziate al 100%.',
  ];
  if (amountLabel) {
    lines.push(`Il riferimento economico attuale della misura è ${amountLabel}.`);
  }
  if (coverageLabel) {
    lines.push(`Sulle altre componenti della pratica la copertura varia (${coverageLabel}).`);
  } else {
    lines.push('La percentuale finale dipende dalla tipologia di spesa e dal profilo del richiedente.');
  }
  lines.push(buildSmartFollowUpQuestion('autoimpiego centro nord'));
  return lines.join(' ');
}

function buildClosedConsultantReply(message: string, result: GroundedMeasureResult, baseText: string) {
  const n = normalizeForMatch(message);
  const asksAll = asksAllFunded(n);
  const asksEconomic = asksAll || asksVoucherOrPercent(n);
  const measureName = normalizeMeasureName(result);
  const facts = result.factsSnapshot;
  const coverageLabel = compactLabel(
    facts?.displayCoverageLabel || facts?.aidIntensity || (facts?.coversUpTo100 ? 'fino al 100% su alcune componenti' : null),
  );
  const amountLabel = compactLabel(facts?.displayAmountLabel || facts?.displayProjectAmountLabel || null);
  const hasStrongVoucherSignal = Boolean(facts?.hasVoucher && facts?.coversUpTo100);
  const voucherPotentialMeasure = result.measureId === 'resto-al-sud-20' || result.measureId === 'autoimpiego-centro-nord';
  const hasVoucherPotential =
    hasStrongVoucherSignal ||
    Boolean(facts?.hasVoucher) ||
    voucherPotentialMeasure ||
    /voucher|100%|fondo perduto/.test(normalizeForMatch([facts?.aidForm, facts?.aidIntensity, baseText].filter(Boolean).join(' ')));

  if (result.outcome === 'not_confirmable') {
    const safe = compactConsultantBody(baseText, 2);
    return ensureOpeningPrefix('Per darti una risposta precisa devo prima chiarire un dettaglio.', safe);
  }

  if (!asksEconomic) {
    const opening = result.outcome === 'no' ? 'No.' : result.outcome === 'yes' ? 'Sì.' : 'Dipende.';
    const safe = compactConsultantBody(baseText, 2);
    const firstLine = ensureOpeningPrefix(opening, safe);
    return `${firstLine} ${buildSmartFollowUpQuestion(message)}`;
  }

  // Guardrail anti-contraddizione: su domande "tutto al 100%?" prevale il fact snapshot.
  const effectiveOutcome: GroundedOutcome =
    asksAll
      ? result.outcome === 'no' && !hasVoucherPotential
        ? 'no'
        : hasVoucherPotential
          ? 'yes_under_conditions'
          : result.outcome
      : result.outcome;
  const opening = effectiveOutcome === 'no' ? 'No.' : 'Sì.';

  if (result.measureId === 'resto-al-sud-20' && asksAll && effectiveOutcome !== 'no') {
    return buildRestoAlSudClosedNarrative();
  }
  if (result.measureId === 'autoimpiego-centro-nord' && asksAll && effectiveOutcome !== 'no') {
    return buildAutoimpiegoClosedNarrative(coverageLabel || null, amountLabel || null);
  }

  const lines: string[] = [];
  if (asksAll) {
    if (effectiveOutcome === 'no') {
      lines.push(`${opening} ${measureName} non è una misura al 100% su tutto il progetto.`);
      lines.push('La copertura cambia in base alla voce di spesa e ai requisiti specifici previsti dal bando.');
    } else {
      lines.push(`${opening} ${measureName} prevede una componente che può arrivare al 100% a fondo perduto, ma non su tutte le voci.`);
      lines.push('In pratica una parte delle spese può essere coperta integralmente, mentre altre restano su percentuali più basse.');
    }
  } else if (effectiveOutcome === 'yes') {
    lines.push(`${opening} La voce che hai indicato risulta ammissibile in ${measureName}.`);
  } else if (effectiveOutcome === 'no') {
    lines.push(`${opening} La voce che hai indicato non risulta ammissibile in ${measureName}.`);
  } else {
    lines.push(`${opening} ${measureName} è una misura mista e la copertura dipende dalla tipologia di spesa.`);
  }

  if (amountLabel) lines.push(`Il riferimento economico attuale della misura è ${amountLabel}.`);
  if (coverageLabel) {
    lines.push(`Sulle altre componenti della pratica la copertura varia (${coverageLabel}).`);
  } else if (asksAll || effectiveOutcome === 'yes_under_conditions') {
    lines.push('Le altre voci non seguono automaticamente il 100% e possono avere percentuali più basse.');
  }
  if (asksAll && effectiveOutcome !== 'no') {
    lines.push('In sintesi, la quota al 100% vale solo per una parte specifica della misura e non per l’intero progetto.');
  }
  const insight = sanitizeInsight(softHumanizeText(baseText));
  if (insight && insight.length >= 32 && !asksAll) {
    lines.push(withTerminalPeriod(insight));
  }
  lines.push(buildSmartFollowUpQuestion(message));
  return lines.join(' ');
}

export function isClosedMeasureQuestion(message: string) {
  const raw = message.trim();
  const n = normalizeForMatch(raw);
  const hasClosedSignal =
    /(^| )e tutto( |$)|(^| )e al 100( |$)|(^| )e 100( |$)|fondo perduto|voucher|copre|rientra|si puo|si può|ammissibil|vale|posso/.test(
      n,
    );
  return hasClosedSignal && (raw.includes('?') || isDirectMeasureQuestion(message));
}

function isBareMeasurePing(message: string, result: GroundedMeasureResult): boolean {
  if (!result.measureId || result.measureId === AMBIGUOUS_RESTO_SUD_ID) return false;
  const n = normalizeForMatch(message).replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return false;
  const hasDecisionWord = /\b(quanto|quali|come|quando|chi|requisit|scadenz|copre|copertura|fondo perduto|voucher|ammissibil|posso|conviene|funziona|e|è)\b/.test(
    n,
  );
  if (hasDecisionWord) return false;
  const measures = detectMeasureIds(message).filter((item) => item.id !== AMBIGUOUS_RESTO_SUD_ID);
  return measures.length === 1;
}

function buildBareMeasureOverview(result: GroundedMeasureResult): string {
  const measureName = normalizeMeasureName(result);
  const facts = result.factsSnapshot;
  const amountLabel = compactLabel(facts?.displayAmountLabel || facts?.displayProjectAmountLabel || null);
  const coverageLabel = compactLabel(facts?.displayCoverageLabel || facts?.aidIntensity || null);

  if (result.measureId === 'resto-al-sud-20') {
    return [
      'Sì, Resto al Sud 2.0 è la misura Invitalia per avviare nuove attività nel Mezzogiorno.',
      'La misura è strutturata su due percorsi: voucher avvio e contributo su investimenti più ampi.',
      'Il voucher può arrivare al 100% sulle voci ammesse; sul percorso investimenti la percentuale è più bassa.',
      amountLabel ? `In concreto oggi la misura indica: ${amountLabel}.` : 'Gli importi variano in base al canale scelto e alla tipologia di spesa.',
      'Quindi non è corretto dire che tutto il progetto è sempre al 100%.',
      buildSmartFollowUpQuestion('resto al sud 2.0'),
    ].join(' ');
  }

  if (result.measureId === 'autoimpiego-centro-nord') {
    return [
      'Sì, Autoimpiego Centro-Nord è una misura per l’avvio di nuove attività nelle regioni del Centro e Nord.',
      'Anche qui non tutte le spese seguono la stessa percentuale: dipende dal tipo di costo che presenti.',
      coverageLabel ? `La copertura si muove su questo perimetro: ${coverageLabel}.` : 'La copertura viene definita in base alla configurazione della domanda.',
      amountLabel ? `In concreto oggi la misura indica: ${amountLabel}.` : 'Gli importi variano in base al progetto e alle voci ammesse.',
      buildSmartFollowUpQuestion('autoimpiego centro nord'),
    ].join(' ');
  }

  return [
    `Sì, ${measureName} è una misura attiva di finanza agevolata.`,
    amountLabel ? `In concreto oggi la misura indica: ${amountLabel}.` : 'Gli importi dipendono dalla tipologia di progetto e dalle spese ammesse.',
    coverageLabel ? `Copertura prevista: ${coverageLabel}.` : 'La copertura varia in base ai requisiti e alla voce di costo.',
    buildSmartFollowUpQuestion(measureName),
  ].join(' ');
}

export function composeConsultantMeasureReply(message: string, result: GroundedMeasureResult): string {
  const closedQuestion = isClosedMeasureQuestion(message);
  const n = normalizeForMatch(message);
  const economicQuestion = asksAllFunded(n) || asksVoucherOrPercent(n);
  let text = compactConsultantBody(result.text, 2);

  if (isBareMeasurePing(message, result)) {
    return buildBareMeasureOverview(result);
  }

  if (closedQuestion) {
    return buildClosedConsultantReply(message, result, text);
  }

  const opening =
    result.outcome === 'no' ? 'No.' : result.outcome === 'not_confirmable' ? 'Per risponderti con precisione serve un chiarimento.' : 'Sì.';
  if (result.outcome === 'not_confirmable') {
    return ensureOpeningPrefix(opening, text);
  }

  const measureName = normalizeMeasureName(result);
  const facts = result.factsSnapshot;
  const amountLabel = compactLabel(facts?.displayAmountLabel || facts?.displayProjectAmountLabel || null);
  const coverageLabel = compactLabel(facts?.displayCoverageLabel || facts?.aidIntensity || null);
  const pieces: string[] = [];
  pieces.push(ensureOpeningPrefix(opening, text));
  if (economicQuestion && amountLabel) pieces.push(`Per ${measureName} il riferimento economico attuale è ${amountLabel}.`);
  if (economicQuestion && coverageLabel && !/100/.test(coverageLabel)) {
    pieces.push(`La copertura dipende dalla voce di spesa e in genere si muove su ${coverageLabel}.`);
  } else if (!economicQuestion && result.outcome === 'yes_under_conditions') {
    pieces.push('La conferma finale dipende dai requisiti specifici del bando e dalla tua situazione reale.');
  }
  pieces.push(economicQuestion
    ? buildSmartFollowUpQuestion(message)
    : buildSmartFollowUpQuestion(message));
  return pieces.join(' ');
}
