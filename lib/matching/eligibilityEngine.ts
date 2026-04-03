import { NormalizedMatchingProfile, IncentiviDoc } from './types';

export type EligibilityResult = {
  eligible: boolean;
  reason: string | null;
};

// Helper per match intelligente (previene "difesa" in "condifesa" ma permette "agricol" in "agricoltura")
export const flexibleMatch = (text: string, kw: string): boolean => {
    const t = text.toLowerCase();
    const k = kw.toLowerCase();
    const trimmed = k.trim();
    
    if (trimmed.length === 0) return false;

    // Se la keyword ha spazi INTERNI, usala come frase fissa (include)
    if (trimmed.includes(' ')) {
        return t.includes(trimmed);
    }
    
    // Se la keyword è molto corta (< 4 caratteri), usa match rigoroso con confini di parola
    // Questo protegge acronimi sensibili come "ZES", "FVG", "PSR", "CUP"
    if (trimmed.length < 4) {
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        return regex.test(t);
    }
    
    // Se la keyword è corta (< 5 caratteri), usa match rigoroso con confini di parola
    // Questo protegge "app", "auto", "sede", "arma", "coni".
    if (trimmed.length < 5) {
        // Escape special chars
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        return regex.test(t);
    }
    
    // Altrimenti permetti match di sottostringa (radici come "agricol", "audiovisiv", "sigarette")
    return t.includes(trimmed);
};

/**
 * NICHE SECTOR DEFINITIONS
 * Array of [nicheKeywords, nicheLabel] tuples.
 * If the grant matches ANY keyword in a group and the user doesn't mention any of them,
 * the grant is hard-excluded.
 */
const NICHE_SECTORS: Array<{ keywords: string[]; label: string }> = [
  { keywords: ['agricol', 'alleva', 'coltiv'], label: 'nicchia agricola' },
  { keywords: ['audiovisiv', 'cinematografic', ' film ', 'produzioni televisive', 'cortometraggi', 'lungometraggi'], label: 'Audiovisivo/Cinema' },
  { keywords: [' attività sportiv', ' associazione sportiva', ' società sportiva', ' coni ', 'atletica', 'impianti sportivi'], label: 'Sport/Atletica' },
  { keywords: ['ecclesiastic', 'parrocchi', 'dioces', 'culto', 'edilizia di culto', 'istitut religios'], label: 'Enti religiosi' },
  { keywords: [' difesa militare', ' forze armate', ' esercito ', ' marina militare', ' aeronautica militare'], label: 'Difesa/Militare' },
  { keywords: ['navigazione', 'armatori', 'cantieri navali', 'flotta', 'pesca marittim', 'acquacoltura'], label: 'Marittimo/Pesca' },
  { keywords: ['editoria', 'librari', 'case editric', 'giornali', 'testate giornalistiche'], label: 'Editoria' },
  { keywords: ['tessile', ' moda ', 'abbigliamento', 'calzatur', 'pelle', 'cuoio', 'tessuto', 'maglieria'], label: 'Tessile/Moda' },
  { keywords: ['chimica', 'farmaceutic', 'cosmetica', 'biocidi', 'detergen', 'vetro', 'ceramica industriale'], label: 'Chimica/Farmaceutica' }
];

/**
 * ENGINE DI ELIGIBILITY RIGOROSO V2
 * Esegue check deterministici binari (Pass/Fail) prima del matching.
 * Ogni regola è un firewall: se fallisce, il bando è escluso, stop.
 */
export function evaluateHardEligibility(
  profile: NormalizedMatchingProfile,
  grant: IncentiviDoc
): EligibilityResult {
  const title = (grant.title || '').toLowerCase();
  const description = (grant.description || '').toLowerCase().slice(0, 1500);
  const beneficiaries = (Array.isArray(grant.beneficiaries) ? grant.beneficiaries : [grant.beneficiaries || ''])
    .map(b => String(b).toLowerCase());
  const combinedText = `${title} ${description} ${beneficiaries.join(' ')}`;

  // ── 1. REQUISITO ETÀ (UNDER 35 / GIOVANI) ──────────────────────────
  const isYouthBando = combinedText.includes('giovan') || combinedText.includes('under 35') || combinedText.includes('u35');
  const userIsOver35 = (profile.age !== null && profile.age > 35) || profile.ageBand === 'over35';

  if (isYouthBando && userIsOver35) {
    return { eligible: false, reason: 'Bando riservato a giovani / under 35' };
  }

  // ── 2. REQUISITO TERRITORIALE (INVESTMENT REGION PRIORITARIO) ───────
  const userRegion = profile.userRegionCanonical;
  if (userRegion) {
    const grantRegions = (Array.isArray(grant.regions) ? grant.regions : [grant.regions || ''])
      .map(r => String(r).toLowerCase().trim())
      .filter(Boolean);

    const isNational = grantRegions.length === 0 || grantRegions.every(r => !r) || grantRegions.some(r =>
      ['italia', 'nazionale', 'tutte', 'tutto il territorio', 'tutte le regioni'].includes(r)
    );

    if (!isNational) {
      const userLower = userRegion.toLowerCase();
      const hasRegionMatch = grantRegions.some(r => r && (r.includes(userLower) || userLower.includes(r)));
      if (!hasRegionMatch) {
        return { eligible: false, reason: `Bando non disponibile nella regione (${userRegion})` };
      }
    }
  }

  // ── 3. STATO AZIENDALE (STARTUP VS ESISTENTE) ──────────────────────
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

  // ── 4. NICCHIE ESTREME & ETHICAL FIREWALL ────────────────────────
  const fundingGoal = profile.fundingGoal?.toLowerCase() || '';
  const sector = profile.sector?.toLowerCase() || '';
  const userContext = `${sector} ${fundingGoal} ${(profile.activityType || '').toLowerCase()}`;
  const userHasContext = userContext.trim().length > 5;

  if (userHasContext) {
    for (const niche of NICHE_SECTORS) {
      const grantIsNiche = niche.keywords.some(kw => flexibleMatch(combinedText, kw));
      if (!grantIsNiche) continue;

      const userWantsNiche = niche.keywords.some(kw => flexibleMatch(userContext, kw));
      if (!userWantsNiche) {
        return { eligible: false, reason: `Bando di nicchia (${niche.label}) incompatibile con il profilo` };
      }
    }
  }

  // ── 5. SETTORE (HARD EXCLUSION AGRICOLTURA/PESCA) ──────────────────
  const isAgri = flexibleMatch(sector, 'agricol') || flexibleMatch(sector, 'alleva') || flexibleMatch(sector, 'pesca');
  const bandoExcludesAgri = combinedText.includes('esclusa agricoltura') || combinedText.includes('tranne agricoltura');

  if (isAgri && bandoExcludesAgri) {
    return { eligible: false, reason: 'Il bando esclude esplicitamente il settore agricolo' };
  }

  // ── 6. BUDGET RANGE (HARD EXCLUSION) ──────────────────────────────
  if (profile.budget !== null && profile.budget > 0) {
    const costMin = typeof grant.costMin === 'number' ? grant.costMin : (typeof grant.costMin === 'string' ? Number(grant.costMin) : null);
    const costMax = typeof grant.costMax === 'number' ? grant.costMax : (typeof grant.costMax === 'string' ? Number(grant.costMax) : null);

    // Tightened envelope: 0.3x - 3x
    if (costMin !== null && Number.isFinite(costMin) && costMin > 0 && profile.budget < costMin * 0.3) {
      return { eligible: false, reason: `Investimento minimo richiesto (€${costMin.toLocaleString('it-IT')}) molto superiore al tuo budget` };
    }
    if (costMax !== null && Number.isFinite(costMax) && costMax > 0 && profile.budget > costMax * 3) {
      return { eligible: false, reason: `Il tuo budget (€${profile.budget.toLocaleString('it-IT')}) supera sensibilmente il tetto massimo del bando (€${costMax.toLocaleString('it-IT')})` };
    }
  }

  // ── 7. REQUISITO ATECO (PRECISION MATCHING) ────────────────────────
  if (profile.ateco && grant.ateco) {
      const uAteco = profile.ateco.replace(/\./g, ''); // 6201
      const gAtecoList = String(grant.ateco).toLowerCase();
      
      // Se il bando specifica dei codici, e il nostro non è tra questi (e non è un bando "tutti i settori")
      const excludesAteco = !gAtecoList.includes(uAteco.slice(0, 2)) && 
                            !gAtecoList.includes(uAteco) && 
                            !gAtecoList.includes('tutti') &&
                            gAtecoList.length > 5; // Evitiamo falsi positivi su liste cortissime o vuote

      if (excludesAteco) {
          return { eligible: false, reason: `Bando non applicabile al tuo codice ATECO (${profile.ateco})` };
      }
  }

  // ── 8. DATA DI CHIUSURA (REALE) ────────────────────────────────────
  if (grant.closeDate) {
      const now = new Date();
      const close = new Date(grant.closeDate);
      if (close < now && (now.getTime() - close.getTime() > 24 * 60 * 60 * 1000)) { // 1 giorno di grazia
          return { eligible: false, reason: `Bando chiuso il ${close.toLocaleDateString('it-IT')}` };
      }
  }

  return { eligible: true, reason: null };
}
