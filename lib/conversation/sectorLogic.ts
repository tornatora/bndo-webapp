/**
 * Sector Logic Protection
 * Implements a "Global Sector Lock" to prevent generic funding goals or activities 
 * (e.g., "ristrutturazioni", "acquisto macchinari") from overwriting a clearly 
 * established core sector (e.g., "turismo", "agricoltura").
 */

export const CORE_SECTORS = [
  'turismo',
  'agricoltura',
  'manifattura',
  'commercio',
  'artigianato',
  'edilizia',
  'ict',
  'servizi',
  'sanita',
  'formazione',
  'cultura',
  'energia',
  'moda',
  'design',
  'ristorazione',
  'logistica',
  'trasporti',
  'professioni',
  'terzo settore'
] as const;

export const ACTIVITY_WORDS = [
  'ristrutturazioni',
  'ristrutturazione',
  'opere murarie',
  'lavori',
  'macchinari',
  'attrezzature',
  'impianti',
  'arredi',
  'arredamento',
  'software',
  'pc',
  'hardware',
  'consulenza',
  'formazione',
  'personale',
  'assunzioni',
  'avvio',
  'apertura',
  'investimento',
  'acquisto',
  'spese',
  'gestione',
  'affitto',
  'materie prime'
] as const;

/**
 * Returns true if the established sector is a core one and 
 * the new extracted string looks like a generic activity word 
 * that shouldn't overwrite the core sector.
 */
export function isSectorProtected(currentSector: string | null, extractedSector: string | null): boolean {
  if (!currentSector || !extractedSector) return false;

  const current = currentSector.toLowerCase().trim();
  const extracted = extractedSector.toLowerCase().trim();

  // 1. Check if current is a core sector
  const isCurrentCore = CORE_SECTORS.some(core => 
    current === core || current.includes(core) || core.includes(current)
  );

  if (!isCurrentCore) return false;

  // 2. Check if extracted is an activity word
  const isExtractedActivity = ACTIVITY_WORDS.some(act => 
    extracted === act || extracted.includes(act) || act.includes(extracted)
  );

  return isExtractedActivity;
}
