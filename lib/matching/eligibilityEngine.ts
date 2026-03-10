import { NormalizedMatchingProfile, IncentiviDoc } from './types';
import { normalizeForMatch } from './profileNormalizer';

export type EligibilityResult = {
  eligible: boolean;
  reason: string | null;
};

/**
 * ENGINE DI ELIGIBILITY RIGOROSO
 * Esegue check deterministici binari (Pass/Fail) prima del matching.
 */
export function evaluateHardEligibility(
  profile: NormalizedMatchingProfile,
  grant: IncentiviDoc
): EligibilityResult {
  const title = (grant.title || '').toLowerCase();
  const description = (grant.description || '').toLowerCase();
  const beneficiaries = (Array.isArray(grant.beneficiaries) ? grant.beneficiaries : [grant.beneficiaries || ''])
    .map(b => String(b).toLowerCase());
  const combinedText = `${title} ${description} ${beneficiaries.join(' ')}`;

  // 1. REQUISITO ETÀ (UNDER 35 / GIOVANI)
  const isYouthBando = combinedText.includes('giovan') || combinedText.includes('under 35') || combinedText.includes('u35');
  const userIsYouth = profile.age !== null && profile.age <= 35 || profile.ageBand === 'under35';
  const userIsOver35 = profile.age !== null && profile.age > 35 || profile.ageBand === 'over35';

  if (isYouthBando && userIsOver35) {
    return { eligible: false, reason: 'Bando riservato a giovani / under 35' };
  }

  // 2. REQUISITO TERRITORIALE (INVESTMENT REGION PRIORITARIO)
  const userRegion = profile.userRegionCanonical;
  if (userRegion) {
    const grantRegions = (Array.isArray(grant.regions) ? grant.regions : [grant.regions || ''])
      .map(r => String(r).toLowerCase());
    
    const isStrictlyRegional = grantRegions.length > 0 && !grantRegions.some(r => 
        ['italia', 'nazionale', 'tutte', 'tutto il territorio'].includes(r)
    );

    if (isStrictlyRegional) {
      const hasRegionMatch = grantRegions.some(r => r.includes(userRegion.toLowerCase()) || userRegion.toLowerCase().includes(r));
      if (!hasRegionMatch) {
         return { eligible: false, reason: `Bando non disponibile nella regione di investimento (${userRegion})` };
      }
    }
  }

  // 3. STATO AZIENDALE (STARTUP VS ESISTENTE)
  if (profile.businessExists !== null) {
      const onlyStartup = combinedText.includes('solo nuove imprese') || combinedText.includes('aspiranti imprenditori') || combinedText.includes('essere costituite');
      const onlyExisting = combinedText.includes('imprese già attive') || combinedText.includes('già costituite') || combinedText.includes('esistenti');

      if (profile.businessExists === true && onlyStartup && !combinedText.includes('pmi')) {
          return { eligible: false, reason: 'Bando riservato a nuove imprese / startup' };
      }
      if (profile.businessExists === false && onlyExisting) {
          return { eligible: false, reason: 'Bando riservato a imprese già attive' };
      }
  }

  // 4. SETTORE (HARD EXCLUSION AGRICOLTURA/PESCA)
  const sector = profile.sector?.toLowerCase() || '';
  const isAgri = sector.includes('agricol') || sector.includes('alleva') || sector.includes('pesca');
  const bandoExcludesAgri = combinedText.includes('esclusa agricoltura') || combinedText.includes('tranne agricoltura');
  
  if (isAgri && bandoExcludesAgri) {
      return { eligible: false, reason: 'Il bando esclude esplicitamente il settore agricolo' };
  }

  // 5. NICCHIE ESTREME (es. Audiovisivo, Cinema) vs Intento Generale (es. Turismo, Bar)
  const isAudiovisivo = combinedText.includes('audiovisiv') || combinedText.includes('cinematografic') || title.includes(' film ') || title.includes('produzioni televisive');
  if (isAudiovisivo) {
      const g = profile.fundingGoal?.toLowerCase() || '';
      const s = sector;
      const userWantsAudioVisual = g.includes('audiovisiv') || s.includes('audiovisiv') || g.includes('cinema') || s.includes('cinema') || g.includes('film') || s.includes('film');
      // Se è un bando audiovisivo ma l'utente *ha specificato* qualcosa che non c'entra nulla (es. turismo, bar, etc.)
      if (!userWantsAudioVisual && (g.length > 5 || s.length > 5)) {
          return { eligible: false, reason: 'Bando di nicchia (Audiovisivo/Cinema) incompatibile con il settore richiesto' };
      }
  }

  return { eligible: true, reason: null };
}
