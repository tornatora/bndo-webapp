/**
 * Profile Completeness Engine
 *
 * Classifica il profilo come:
 *   - not_ready:    dati insufficienti, continua a chiedere
 *   - weak_ready:   3 pilastri presenti ma info aggiuntive mancanti
 *   - strong_ready: profilo sufficiente per lanciare lo scanner
 *
 * REGOLA: lo scanner parte SOLO con strong_ready.
 *
 * Criteri per strong_ready:
 *   1. Regione/territorio rilevante chiaro
 *   2. Stato impresa (attiva / da costituire / startup)
 *   3. Obiettivo chiaro (fundingGoal) O Settore esplicito
 *   4. Settore O descrizione business abbastanza specifica
 *   5. Almeno uno tra: budget, forma giuridica, dato soggettivo (età/occupazione) se pertinente
 *
 * Eccezione per impresa già attiva: i dati soggettivi (età/occupazione) non sono
 * requisiti obbligatori per strong_ready, basta avere settore + obiettivo.
 */
import type { UserProfile } from '@/lib/conversation/types';

export type ProfileReadinessLevel = 'not_ready' | 'weak_ready' | 'strong_ready';

export type ProfileCompletenessResult = {
  level: ProfileReadinessLevel;
  /** Campo con massima priorità da chiedere se level != strong_ready */
  nextPriorityField: string | null;
  /** Segnali mancanti in ordine di priorità */
  missingSignals: string[];
  /** Score grezzo 0-100 */
  score: number;
};

/** Controlla se il fundingGoal è abbastanza specifico (non generico finanziario) */
function isSpecificGoal(goal: string | null | undefined): boolean {
  if (!goal || goal.trim().length < 5) return false;
  const g = goal.toLowerCase().trim();
  // Parole generiche che non danno informazioni concrete sul progetto
  const genericTerms = /^(bando|bandi|contributo|contributi|fondo perduto|finanziamento|finanziamenti|agevolazione|agevolazioni|incentivo|incentivi|misura|misure|fondi|aiut)$/;
  if (genericTerms.test(g)) return false;
  return true;
}

/** Controlla se il settore è sufficientemente specifico */
function isSpecificSector(sector: string | null | undefined): boolean {
  if (!sector || sector.trim().length < 3) return false;
  return true;
}

/** L'impresa è già costituita / già attiva */
function isExistingBusiness(profile: UserProfile): boolean {
  return profile.businessExists === true;
}

/** 
 * Valuta il profilo e restituisce il livello di completeness 
 * con indicazioni sul prossimo campo da chiedere.
 */
export function evaluateProfileCompleteness(profile: UserProfile): ProfileCompletenessResult {
  const missing: string[] = [];

  // === PILASTRO 1: Territorio ===
  const hasRegion = Boolean(profile.location?.region?.trim());
  if (!hasRegion) missing.push('location');

  // === PILASTRO 2: Stato impresa ===
  const hasBusinessStatus =
    profile.businessExists !== null ||
    Boolean(profile.activityType?.trim());
  if (!hasBusinessStatus) missing.push('businessContext');

  // === PILASTRO 3: Obiettivo / Settore ===
  const hasSpecificGoal = isSpecificGoal(profile.fundingGoal);
  const hasSpecificSector = isSpecificSector(profile.sector) || Boolean(profile.ateco?.trim());
  const hasTopicClarity = hasSpecificGoal || hasSpecificSector;
  if (!hasTopicClarity) {
    // Se uno dei due manca, chiedi prima il fundingGoal poi il settore
    if (!hasSpecificGoal) missing.push('fundingGoal');
    else if (!hasSpecificSector) missing.push('sector');
  }

  // === CAMPO AGGIUNTIVO (5o requisito): almeno uno tra budget/forma/dato soggettivo ===
  const existingBiz = isExistingBusiness(profile);
  const hasAdditionalContext =
    profile.revenueOrBudgetEUR !== null ||
    profile.budgetAnswered ||
    Boolean(profile.legalForm?.trim()) ||
    profile.employees !== null ||
    // Per nuove attività, i dati del fondatore sono rilevanti
    (!existingBiz && (
      profile.age !== null ||
      Boolean(profile.ageBand) ||
      Boolean(profile.employmentStatus?.trim())
    )) ||
    // Per imprese esistenti, settore + obiettivo + regione bastano se entrambi presenti
    (existingBiz && hasSpecificGoal && hasSpecificSector);

  if (!hasAdditionalContext) {
    // Per nuove attività: mancano dati fondatore
    if (!existingBiz) {
      missing.push('founderData');
    } else {
      // Per esistenti: se abbiamo già settore+obiettivo, il 5o campo è opzionale per strong_ready
      // Non aggiungiamo a missing se già abbiamo goal+sector
      if (!(hasSpecificGoal && hasSpecificSector)) {
        missing.push('additionalContext');
      }
    }
  }

  // === CALCOLO SCORE grezzo (0-100) ===
  const pillars = [
    hasRegion,
    hasBusinessStatus,
    hasSpecificGoal,
    hasSpecificSector,
    hasAdditionalContext,
  ];
  const completedCount = pillars.filter(Boolean).length;
  const score = Math.round((completedCount / pillars.length) * 100);

  // === DETERMINAZIONE LEVEL ===
  let level: ProfileReadinessLevel;

  const criticalMissing = missing.filter(s => ['location', 'businessContext', 'fundingGoal'].includes(s));
  const hasBothTopics = hasSpecificGoal && hasSpecificSector;

  if (missing.includes('location') || missing.includes('businessContext')) {
    // Mancano pilastri fondamentali
    level = 'not_ready';
  } else if (!hasTopicClarity) {
    // Abbiamo chi e dove, ma non abbiamo idea di cosa
    level = 'not_ready';
  } else if (missing.length === 0) {
    level = 'strong_ready';
  } else if (missing.length === 1 && missing[0] === 'founderData' && existingBiz) {
    // Caso speciale: impresa esistente con goal+settore chiari → strong_ready
    level = 'strong_ready';
  } else if (missing.length <= 1 && !criticalMissing.length) {
    // Solo un campo aggiuntivo mancante, ma tutti i pilastri critici ci sono
    level = hasBothTopics ? 'strong_ready' : 'weak_ready';
  } else {
    level = 'weak_ready';
  }

  // === NEXT PRIORITY FIELD ===
  const priorityOrder = ['location', 'businessContext', 'fundingGoal', 'sector', 'founderData', 'additionalContext'];
  const nextPriorityField = missing.sort((a, b) => {
    const ia = priorityOrder.indexOf(a);
    const ib = priorityOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  })[0] ?? null;

  return { level, nextPriorityField, missingSignals: missing, score };
}

/** Shorthand: true se e solo se il profilo è strong_ready */
export function isStrongReady(profile: UserProfile): boolean {
  return evaluateProfileCompleteness(profile).level === 'strong_ready';
}

/** Shorthand: true se il profilo ha i 3 pilastri (anche senza campo aggiuntivo) */
export function isWeakReady(profile: UserProfile): boolean {
  const r = evaluateProfileCompleteness(profile);
  return r.level === 'weak_ready' || r.level === 'strong_ready';
}
