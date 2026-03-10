/**
 * Profile Completeness Engine V2 – Rigoroso
 *
 * PRINCIPIO: il consulente BNDO raccoglie abbastanza informazioni per capire
 * davvero il cliente prima di avviare lo scanner. Non basta "regione + attiva".
 *
 * Classifica il profilo come:
 *   - not_ready:        dati fondamentali mancanti, impossibile procedere
 *   - soft_scan_ready:   i pilastri base ci sono ma servono ancora info chiave
 *   - hard_scan_ready:   il profilo ha tutto il necessario → chiedi conferma pre-scan
 *   - strong_ready:     confermato, lancia lo scanner
 *
 * Criteri OBBLIGATORI per hard_scan_ready / strong_ready:
 *   1. Regione chiara (non negata, non ambigua)
 *   2. Stato impresa esplicito (attiva / da costituire / startup)
 *   3. Obiettivo specifico (fundingGoal con termine concreto)
 *   4. Settore esplicito (agricoltura, manifattura, ICT, turismo, ecc.)
 *   5. Almeno uno tra:
 *      - budget/investimento indicativo (revenueOrBudgetEUR > 0 O budgetAnswered)
 *      - preferenza forma contributo (fondo perduto / finanziamento / indifferente)
 *      - numero dipendenti (employees)
 *      - forma giuridica (legalForm)
 *   Per nuove attività: anche età O stato occupazionale del fondatore
 *
 * NOTA: per imprese ESISTENTI i dati del fondatore (età/occupazione)
 * non sono obbligatori ma contano come 5° campo se presenti.
 */
import type { UserProfile } from '@/lib/conversation/types';

export type ProfileReadinessLevel = 'not_ready' | 'soft_scan_ready' | 'hard_scan_ready' | 'strong_ready';

export type ProfileCompletenessResult = {
  level: ProfileReadinessLevel;
  /** Campo con massima priorità da chiedere se level != strong_ready */
  nextPriorityField: string | null;
  /** Segnali mancanti in ordine di priorità */
  missingSignals: string[];
  /** Score grezzo 0-100 */
  score: number;
};

/** Controlla se il fundingGoal è abbastanza specifico (non termine generico finanziario) */
export function isSpecificGoal(goal: string | null | undefined): boolean {
  if (!goal || goal.trim().length < 5) return false;
  const g = goal.toLowerCase().trim();
  // Termini puramente finanziari che non descrivono un progetto concreto
  const genericTerms = /^(bando|bandi|contributo|contributi|fondo perduto|finanziamento|finanziamenti|agevolazione|agevolazioni|incentivo|incentivi|misura|misure|fondi|aiut|qualcosa|investiment)$/;
  if (genericTerms.test(g)) return false;
  // Troppo corto e generico
  if (g.split(/\s+/).length <= 1 && g.length < 8) return false;
  return true;
}

/** Controlla se il settore è sufficientemente specifico */
function isSpecificSector(sector: string | null | undefined): boolean {
  if (!sector || sector.trim().length < 3) return false;
  const generic = /^(altro|vari|generico|nessuno|non so|boh)$/i;
  if (generic.test(sector.trim())) return false;
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
  const hasRegion = Boolean(profile.location?.region?.trim() || profile.location?.investmentRegion?.trim()) && !profile.locationNeedsConfirmation;
  if (!hasRegion) {
    missing.push(profile.locationNeedsConfirmation ? 'locationConfirmation' : 'location');
  }

  // === PILASTRO 2: Stato impresa ===
  const hasBusinessStatus =
    profile.businessExists !== null ||
    Boolean(profile.activityType?.trim());
  if (!hasBusinessStatus) missing.push('businessContext');

  // === PILASTRO 3: Obiettivo concreto (obbligatorio) ===
  const hasSpecificGoal = isSpecificGoal(profile.fundingGoal);
  if (!hasSpecificGoal) missing.push('fundingGoal');

  // === PILASTRO 4: Settore esplicito (obbligatorio) ===
  const hasSpecificSector = isSpecificSector(profile.sector) || Boolean(profile.ateco?.trim());
  if (!hasSpecificSector) missing.push('sector');

  // === PILASTRO 5: Almeno un dato economico/operativo ===
  const existingBiz = isExistingBusiness(profile);
  
  const hasBudgetOrPreference =
    (profile.revenueOrBudgetEUR !== null && profile.revenueOrBudgetEUR > 0) ||
    profile.budgetAnswered ||
    Boolean(profile.contributionPreference?.trim()) ||
    profile.employees !== null ||
    Boolean(profile.legalForm?.trim());

  // Per nuove attività: accettiamo anche dati del fondatore come 5° pilastro
  const hasFounderData =
    !existingBiz && (
      profile.age !== null ||
      Boolean(profile.ageBand) ||
      Boolean(profile.employmentStatus?.trim())
    );

  const hasFifthPillar = hasBudgetOrPreference || hasFounderData;
  
  if (!hasFifthPillar) {
    // Per nuove attività: chiediamo dati fondatore (età/occupazione)
    if (!existingBiz) {
      missing.push('founderData');
    } else {
      // Per imprese esistenti: chiediamo budget o preferenza contributo
      missing.push('budgetOrPreference');
    }
  }

  // === CALCOLO SCORE grezzo (0-100) ===
  const pillars = [
    hasRegion,
    hasBusinessStatus,
    hasSpecificGoal,
    hasSpecificSector,
    hasFifthPillar,
  ];
  const completedCount = pillars.filter(Boolean).length;
  const score = Math.round((completedCount / pillars.length) * 100);

  // === DETERMINAZIONE LEVEL ===
  let level: ProfileReadinessLevel;

  const hasSoftCriterias = hasRegion && hasSpecificGoal && hasBusinessStatus;
  const hasHardCriterias = hasSoftCriterias && hasSpecificSector && (profile.employees !== null || profile.revenueOrBudgetEUR !== null || profile.budgetAnswered);

  if (!hasSoftCriterias) {
    level = 'not_ready';
  } else if (!hasHardCriterias) {
    // Abbiamo le info base ma non quelle per il matching preciso (Hard Scan)
    level = 'soft_scan_ready';
  } else if (missing.length === 0) {
    level = 'strong_ready';
  } else {
    level = 'hard_scan_ready';
  }


  // === NEXT PRIORITY FIELD ===
  const priorityOrder = ['location', 'locationConfirmation', 'businessContext', 'fundingGoal', 'sector', 'founderData', 'budgetOrPreference', 'additionalContext'];
  const nextPriorityField = [...missing].sort((a, b) => {
    const ia = priorityOrder.indexOf(a);
    const ib = priorityOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  })[0] ?? null;

  return { level, nextPriorityField, missingSignals: missing, score };
}

export function isHardScanReady(profile: UserProfile): boolean {
  const level = evaluateProfileCompleteness(profile).level;
  return level === 'hard_scan_ready' || level === 'strong_ready';
}

/** Shorthand: true se e solo se il profilo è strong_ready (scan già confermato) */
export function isStrongReady(profile: UserProfile): boolean {
  return evaluateProfileCompleteness(profile).level === 'strong_ready';
}

/** Shorthand: true se il profilo ha i pilastri base (Soft Scan) */
export function isSoftScanReady(profile: UserProfile): boolean {
  const r = evaluateProfileCompleteness(profile);
  return r.level !== 'not_ready';
}
