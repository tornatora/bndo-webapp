import type { GrantEvaluation, PipelineResult } from './unifiedPipeline';
import type { NormalizedMatchingProfile } from './types';

/**
 * GAP ANALYSIS ENGINE
 * Identifica quali dati mancanti nel profilo utente avrebbero il massimo impatto
 * sulla qualità dei risultati, e ordina i gap per priorità.
 */

export type ProfileGap = {
  /** Nome del campo mancante */
  field: string;
  /** Impatto stimato: quanti bandi borderline diventerebbero primary */
  impact: 'alto' | 'medio' | 'basso';
  /** Domanda suggerita per raccogliere il dato */
  suggestedQuestion: string;
};

export type GapAnalysisResult = {
  /** Gaps ordinati dal più impattante al meno */
  gaps: ProfileGap[];
  /** La domanda più utile da porre */
  topQuestion: string | null;
  /** Score di completezza del profilo 0-100 */
  completenessScore: number;
};

const GAP_DEFINITIONS: Array<{
  field: string;
  check: (p: NormalizedMatchingProfile) => boolean;
  question: string;
  dimensions: string[];
}> = [
  {
    field: 'regione',
    check: (p) => !p.userRegionCanonical && !p.region,
    question: 'In quale regione si trova o si realizzerà il tuo progetto?',
    dimensions: ['territory'],
  },
  {
    field: 'settore',
    check: (p) => !p.sector && !p.ateco,
    question: 'Qual è il settore della tua attività? (es. manifattura, turismo, ICT, commercio)',
    dimensions: ['sector', 'purpose'],
  },
  {
    field: 'stato_impresa',
    check: (p) => p.businessExists === null,
    question: 'La tua impresa è già costituita o devi ancora avviarla?',
    dimensions: ['subject', 'stage'],
  },
  {
    field: 'obiettivo',
    check: (p) => !p.fundingGoal || p.fundingGoal.trim().length < 5,
    question: 'Per cosa ti serve il finanziamento? (es. macchinari, ristrutturazione, assunzioni, digitalizzazione)',
    dimensions: ['purpose'],
  },
  {
    field: 'budget',
    check: (p) => p.budget === null,
    question: 'Hai un budget indicativo per il tuo investimento?',
    dimensions: ['expenses'],
  },
  {
    field: 'ateco',
    check: (p) => !p.ateco,
    question: 'Conosci il codice ATECO della tua attività?',
    dimensions: ['sector'],
  },
  {
    field: 'dipendenti',
    check: (p) => p.employees === null,
    question: 'Quanti dipendenti ha la tua impresa?',
    dimensions: ['subject'],
  },
  {
    field: 'età',
    check: (p) => p.age === null && !p.ageBand,
    question: 'Quanti anni hai? Questo ci aiuta a trovare bandi riservati a giovani imprenditori.',
    dimensions: ['special'],
  },
];

/**
 * Analizza i gap del profilo e determina la priorità di ciascuno
 * basandosi sui risultati effettivi del pipeline
 */
export function analyzeGaps(
  profile: NormalizedMatchingProfile,
  pipelineResult: PipelineResult,
): GapAnalysisResult {
  const gaps: ProfileGap[] = [];

  for (const gapDef of GAP_DEFINITIONS) {
    if (!gapDef.check(profile)) continue; // no gap

    // Calcola l'impatto: quanti bandi borderline hanno basso score su questa dimensione?
    const affectedBorderline = pipelineResult.borderline.filter(eval_ =>
      eval_.dimensions.some(d =>
        gapDef.dimensions.includes(d.dimension) && d.confidence === 'low'
      )
    );
    const affectedExcluded = pipelineResult.excluded.filter(eval_ =>
      !eval_.hardExcluded && eval_.dimensions.some(d =>
        gapDef.dimensions.includes(d.dimension) && d.confidence === 'low'
      )
    );

    const totalAffected = affectedBorderline.length + affectedExcluded.length;
    const impact: ProfileGap['impact'] = totalAffected >= 3 ? 'alto' : totalAffected >= 1 ? 'medio' : 'basso';

    gaps.push({
      field: gapDef.field,
      impact,
      suggestedQuestion: gapDef.question,
    });
  }

  // Sort: alto > medio > basso
  const impactOrder = { alto: 0, medio: 1, basso: 2 };
  gaps.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  const completedFields = GAP_DEFINITIONS.filter(g => !g.check(profile)).length;
  const completenessScore = Math.round((completedFields / GAP_DEFINITIONS.length) * 100);

  return {
    gaps,
    topQuestion: gaps[0]?.suggestedQuestion || null,
    completenessScore,
  };
}
