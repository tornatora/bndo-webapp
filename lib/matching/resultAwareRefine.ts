import { NormalizedMatchingProfile, IncentiviDoc } from '@/lib/matching/types';

/**
 * Result-aware refine question generator.
 * Analyzes found grants to suggest the single most impactful question 
 * to further refine the results or confirm eligibility.
 */
export function buildResultAwareRefineQuestion(
  results: IncentiviDoc[],
  profile: NormalizedMatchingProfile
): string | null {
  if (results.length === 0) return null;

  // 1. Check for Age (Youth/Under 35)
  // If we have many youth-specific grants but don't know the user age
  const youthKeywords = ['giovani', 'under 35', 'u35', 'giovanile', 'nuove imprese'];
  const resultsWithYouthHint = results.filter(r => {
    const text = (r.title || '') + ' ' + (r.description || '') + ' ' + (r.purposes || []).toString();
    return youthKeywords.some(kw => text.toLowerCase().includes(kw));
  });

  if (resultsWithYouthHint.length >= 2 && profile.age === null && profile.ageBand === null) {
    return "Molte delle opportunità individuate sono riservate a giovani imprenditori. Hai meno di 35 anni?";
  }

  // 2. Check for Gender (Women/Imprenditoria femminile)
  const femaleKeywords = ['donne', 'femminile', 'imprenditorialità femminile', 'donne imprenditrici'];
  const resultsWithFemaleHint = results.filter(r => {
    const text = (r.title || '') + ' ' + (r.description || '') + ' ' + (r.beneficiaries || []).toString();
    return femaleKeywords.some(kw => text.toLowerCase().includes(kw));
  });

  if (resultsWithFemaleHint.length >= 2 && !profile.fundingGoal?.toLowerCase().includes('femminile')) {
    // We don't have a specific field for gender, but we can ask if it helps
    return "Alcuni bandi interessanti sono dedicati all'imprenditoria femminile. È il tuo caso?";
  }

  // 3. Check for Budget/Investment size
  // If we have results but don't know the budget, and the results have different cost tiers
  if (profile.budget === null && !profile.fundingGoal?.includes('€')) {
    const highValueResults = results.filter(r => (Number(r.costMin) || 0) > 50000);
    if (highValueResults.length > 0) {
      return "Per filtrare meglio i risultati, potresti indicarmi un budget indicativo per il tuo progetto?";
    }
  }

  // 4. Check for Digitalization/Innovation specific
  const digiKeywords = ['digitalizz', 'software', 'ecommerce', 'sito', 'tecnolog'];
  const resultsWithDigiHint = results.filter(r => {
    const text = (r.title || '') + ' ' + (r.description || '') + ' ' + (r.purposes || []).toString();
    return digiKeywords.some(kw => text.toLowerCase().includes(kw));
  });

  if (resultsWithDigiHint.length >= 3 && !profile.sector?.toLowerCase().includes('ict')) {
    return "Vedo diversi bandi per la digitalizzazione. Il tuo progetto prevede acquisto di software o sviluppo web?";
  }

  // Default fallback: if no specific question found, return a generic one or null
  return null;
}
