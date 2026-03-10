import type { GrantEvaluation, PipelineResult, MatchDimension } from './unifiedPipeline';
import type { NormalizedMatchingProfile } from './types';

/**
 * EXPLAINABILITY ENGINE
 * Traduce i risultati tecnici del pipeline in motivazioni chiare e comprensibili
 * per l'utente finale. Output in italiano, orientato alla decisione.
 */

export type GrantExplanation = {
  grantId: string;
  /** Motivazioni positive in linguaggio utente (es. "Compatibile con investimento in Calabria") */
  strengths: string[];
  /** Elementi da verificare o potenzialmente bloccanti */
  caveats: string[];
  /** Dati mancanti che migliorerebbero la valutazione */
  missingData: string[];
  /** Livello di affidabilità della valutazione */
  confidence: 'alta' | 'media' | 'bassa';
};

/** Mappa dimensione → modello di frase utente */
const DIMENSION_TEMPLATES: Record<MatchDimension, {
  positive: (note: string, profile: NormalizedMatchingProfile) => string;
  caveat: (note: string, profile: NormalizedMatchingProfile) => string;
}> = {
  territory: {
    positive: (_n, p) => p.userRegionCanonical
      ? `Compatibile con investimento in ${p.userRegionCanonical}`
      : 'Territorio compatibile',
    caveat: (_n, _p) => 'Da verificare: territorio / regione di investimento',
  },
  purpose: {
    positive: (_n, p) => p.fundingGoal
      ? `Coerente con il tuo obiettivo: ${p.fundingGoal.slice(0, 60)}`
      : 'Finalità coerente con il progetto',
    caveat: (_n, _p) => 'Da verificare: finalità del progetto',
  },
  subject: {
    positive: (_n, p) => p.businessExists === false
      ? 'Adatto a nuove imprese / startup'
      : p.businessExists === true
        ? 'Adatto a impresa già attiva'
        : 'Categoria beneficiario compatibile',
    caveat: (_n, _p) => 'Da verificare: tipologia di beneficiario',
  },
  sector: {
    positive: (_n, p) => p.sector
      ? `Settore compatibile: ${p.sector}`
      : 'Settore di attività compatibile',
    caveat: (_n, _p) => 'Da verificare: settore / codice ATECO',
  },
  stage: {
    positive: (_n, p) => p.businessExists === false
      ? 'Adatto a chi deve ancora avviare'
      : 'Adatto allo stadio attuale della tua impresa',
    caveat: (_n, _p) => 'Da verificare: fase di sviluppo dell\'impresa',
  },
  expenses: {
    positive: (_n, p) => p.budget
      ? `Budget compatibile: €${p.budget.toLocaleString('it-IT')}`
      : 'Range di investimento compatibile',
    caveat: (_n, _p) => 'Da verificare: importo investimento',
  },
  status: {
    positive: (note, _p) => note.includes('aperto') ? 'Bando attualmente aperto' : note.includes('arrivo') ? 'Bando in arrivo a breve' : 'Bando disponibile',
    caveat: (_n, _p) => 'Da verificare: stato apertura del bando',
  },
  special: {
    positive: (note, _p) => note || 'Requisiti speciali soddisfatti',
    caveat: (_n, _p) => 'Da verificare: requisiti speciali',
  },
};

/**
 * Genera spiegazione user-facing per un singolo bando
 */
export function explainGrant(
  evaluation: GrantEvaluation,
  profile: NormalizedMatchingProfile,
): GrantExplanation {
  const strengths: string[] = [];
  const caveats: string[] = [];
  const missingData: string[] = [];

  for (const dim of evaluation.dimensions) {
    const template = DIMENSION_TEMPLATES[dim.dimension];
    if (!template) continue;

    if (dim.compatible && dim.score >= 80) {
      strengths.push(template.positive(dim.note || '', profile));
    } else if (dim.confidence === 'low') {
      caveats.push(template.caveat(dim.note || '', profile));
      // Identifica i dati mancanti
      if (dim.dimension === 'sector' && !profile.sector) missingData.push('Settore / codice ATECO');
      if (dim.dimension === 'expenses' && !profile.budget) missingData.push('Importo investimento');
      if (dim.dimension === 'subject' && profile.businessExists === null) missingData.push('Tipo impresa (nuova / esistente)');
      if (dim.dimension === 'territory' && !profile.userRegionCanonical) missingData.push('Regione di investimento');
      if (dim.dimension === 'stage' && profile.businessExists === null) missingData.push('Fase aziendale');
    } else if (!dim.compatible) {
      caveats.push(dim.note || template.caveat(dim.note || '', profile));
    }
  }

  // Ensure at least 1 strength
  if (strengths.length === 0 && evaluation.totalScore >= 65) {
    strengths.push('Compatibile con il profilo inserito');
  }

  // Determine overall confidence
  const lowConfCount = evaluation.dimensions.filter(d => d.confidence === 'low').length;
  const confidence: GrantExplanation['confidence'] = lowConfCount >= 3 ? 'bassa' : lowConfCount >= 1 ? 'media' : 'alta';

  return {
    grantId: evaluation.grantId,
    strengths: [...new Set(strengths)].slice(0, 3),
    caveats: [...new Set(caveats)].slice(0, 3),
    missingData: [...new Set(missingData)],
    confidence,
  };
}

/**
 * Genera spiegazioni per tutti i risultati primari del pipeline
 */
export function explainResults(
  result: PipelineResult,
  profile: NormalizedMatchingProfile,
): GrantExplanation[] {
  return result.primary.map(eval_ => explainGrant(eval_, profile));
}
