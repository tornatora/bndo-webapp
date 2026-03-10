import { NormalizedMatchingProfile, IncentiviDoc } from '@/lib/matching/types';

export type RefineAdvice = {
  question: string | null;
  strategicAdvice: string | null;
};

/**
 * Result-aware refine question and advice generator.
 * Analyzes found grants to suggest the single most impactful question 
 * and/or a strategic suggestion (proactive consulting).
 */
export function buildResultAwareRefineQuestion(
  results: IncentiviDoc[],
  profile: NormalizedMatchingProfile
): RefineAdvice {
  let question: string | null = null;
  let strategicAdvice: string | null = null;

  if (results.length === 0) return { question, strategicAdvice };

  // --- STRATEGIC ADVICE: Proactive paths (The "Consultant" brain) ---
  
  // 1. Resto al Sud 2.0 Proactive Mention
  const hasRestoSud = results.some(r => r.id === 'strategic-resto-al-sud-20');
  const isTargetForRestoSud = !profile.businessExists && (profile.age === null || profile.age <= 35) && profile.userRegionCanonical === 'Calabria' || profile.userRegionCanonical === 'Sicilia' || profile.userRegionCanonical === 'Puglia' || profile.userRegionCanonical === 'Campania';

  if (hasRestoSud && isTargetForRestoSud) {
    strategicAdvice = "Dato il tuo profilo, la strada più vantaggiosa per te è certamente **Resto al Sud 2.0**. Sai che se apri una nuova impresa nel Mezzogiorno puoi usufruire di questa misura? Può darti fino al **100% di fondo perduto** combinando voucher di avvio e contributi sugli investimenti.";
  } else {
    // 2. Generic High Grant Advice
    const highGrantResults = results.filter(r => (Number(r.coverageMaxPercent) || 0) >= 80);
    if (highGrantResults.length >= 1 && !profile.fundingGoal?.toLowerCase().includes('fondo perduto')) {
        strategicAdvice = "Ho individuato diverse misure con alta percentuale di fondo perduto (oltre l'80%). Ti consiglio di concentrarti su queste per massimizzare l'agevolazione.";
    }
  }

  // --- REFINE QUESTIONS: Data gathering ---

  // 1. Check for Age (Youth/Under 35)
  const youthKeywords = ['giovani', 'under 35', 'u35', 'giovanile', 'nuove imprese'];
  const resultsWithYouthHint = results.filter(r => {
    const text = (r.title || '') + ' ' + (r.description || '') + ' ' + (r.purposes || []).toString();
    return youthKeywords.some(kw => text.toLowerCase().includes(kw));
  });

  if (resultsWithYouthHint.length >= 2 && profile.age === null && profile.ageBand === null) {
    question = "Molte delle opportunità individuate sono riservate a giovani imprenditori. Hai meno di 35 anni?";
  }

  // 2. Check for Gender
  const femaleKeywords = ['donne', 'femminile', 'imprenditorialità femminile', 'donne imprenditrici'];
  const resultsWithFemaleHint = results.filter(r => {
    const text = (r.title || '') + ' ' + (r.description || '') + ' ' + (r.beneficiaries || []).toString();
    return femaleKeywords.some(kw => text.toLowerCase().includes(kw));
  });

  if (!question && resultsWithFemaleHint.length >= 2 && !profile.fundingGoal?.toLowerCase().includes('femminile')) {
    question = "Alcuni bandi interessanti sono dedicati all'imprenditoria femminile. È il tuo caso?";
  }

  // 3. Check for Budget
  if (!question && profile.budget === null && !profile.fundingGoal?.includes('€')) {
    const highValueResults = results.filter(r => (Number(r.costMin) || 0) > 50000);
    if (highValueResults.length > 0) {
      question = "Per filtrare meglio i risultati, potresti indicarmi un budget indicativo per il tuo progetto?";
    }
  }

  return { question, strategicAdvice };
}
