import { NormalizedMatchingProfile, IncentiviDoc } from './types';

export type EligibilityResult = {
  eligible: boolean;
  reason: string | null;
};

/**
 * NICHE SECTOR DEFINITIONS
 * Array of [nicheKeywords, nicheLabel] tuples.
 * If the grant matches ANY keyword in a group and the user doesn't mention any of them,
 * the grant is hard-excluded.
 */
const NICHE_SECTORS: Array<{ keywords: string[]; label: string }> = [
  { keywords: ['audiovisiv', 'cinematografic', ' film ', 'produzioni televisive', 'cortometraggi', 'lungometraggi'], label: 'Audiovisivo/Cinema' },
  { keywords: ['sport', ' coni ', 'atletica', 'federazione sportiva', 'associazione sportiva', 'impianti sportivi'], label: 'Sport/Atletica' },
  { keywords: ['ecclesiastic', 'parrocchi', 'dioces', 'culto', 'edilizia di culto', 'istitut religios'], label: 'Enti religiosi' },
  { keywords: ['difesa', 'militare', 'forze armate', 'armament'], label: 'Difesa/Militare' },
  { keywords: ['navigazione', 'armatori', 'cantieri navali', 'flotta', 'pesca marittim', 'acquacoltura'], label: 'Marittimo/Pesca' },
  { keywords: ['editoria', 'librari', 'case editric', 'giornali', 'testate giornalistiche'], label: 'Editoria' },
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

    const isNational = grantRegions.length === 0 || grantRegions.some(r =>
      ['italia', 'nazionale', 'tutte', 'tutto il territorio', 'tutte le regioni'].includes(r)
    );

    if (!isNational && grantRegions.length > 0) {
      const userLower = userRegion.toLowerCase();
      const hasRegionMatch = grantRegions.some(r => r.includes(userLower) || userLower.includes(r));
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

  // ── 4. SETTORE (HARD EXCLUSION AGRICOLTURA/PESCA) ──────────────────
  const sector = profile.sector?.toLowerCase() || '';
  const isAgri = sector.includes('agricol') || sector.includes('alleva') || sector.includes('pesca');
  const bandoExcludesAgri = combinedText.includes('esclusa agricoltura') || combinedText.includes('tranne agricoltura');

  if (isAgri && bandoExcludesAgri) {
    return { eligible: false, reason: 'Il bando esclude esplicitamente il settore agricolo' };
  }

  // ── 5. NICCHIE ESTREME ─────────────────────────────────────────────
  const fundingGoal = profile.fundingGoal?.toLowerCase() || '';
  const userContext = `${sector} ${fundingGoal} ${(profile.activityType || '').toLowerCase()}`;
  const userHasContext = userContext.trim().length > 5;

  if (userHasContext) {
    for (const niche of NICHE_SECTORS) {
      const grantIsNiche = niche.keywords.some(kw => combinedText.includes(kw));
      if (!grantIsNiche) continue;

      const userWantsNiche = niche.keywords.some(kw => userContext.includes(kw.trim()));
      if (!userWantsNiche) {
        return { eligible: false, reason: `Bando di nicchia (${niche.label}) incompatibile con il profilo` };
      }
    }
  }

  // ── 6. BUDGET RANGE (HARD EXCLUSION) ──────────────────────────────
  if (profile.budget !== null && profile.budget > 0) {
    const costMin = typeof grant.costMin === 'number' ? grant.costMin : (typeof grant.costMin === 'string' ? Number(grant.costMin) : null);
    const costMax = typeof grant.costMax === 'number' ? grant.costMax : (typeof grant.costMax === 'string' ? Number(grant.costMax) : null);

    // Exclude if user budget is less than 1/10th of the minimum required
    if (costMin !== null && Number.isFinite(costMin) && costMin > 0 && profile.budget < costMin * 0.1) {
      return { eligible: false, reason: `Investimento minimo richiesto (€${costMin.toLocaleString('it-IT')}) molto superiore al budget indicato` };
    }
    // Exclude if user budget is more than 10x the maximum allowed
    if (costMax !== null && Number.isFinite(costMax) && costMax > 0 && profile.budget > costMax * 10) {
      return { eligible: false, reason: `Budget utente molto superiore al tetto massimo del bando (€${costMax.toLocaleString('it-IT')})` };
    }
  }

  return { eligible: true, reason: null };
}
