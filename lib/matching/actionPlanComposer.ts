import type { GrantEvaluation, PipelineResult } from './unifiedPipeline';
import type { NormalizedMatchingProfile } from './types';
import { explainGrant, type GrantExplanation } from './explainabilityEngine';
import { analyzeGaps, type GapAnalysisResult } from './gapAnalysis';

/**
 * ACTION PLAN COMPOSER
 * Prende l'output del pipeline + explainability + gap analysis e produce
 * un piano d'azione strutturato che il sistema mostra all'utente.
 */

export type EligibilityStatus = 'strong_fit' | 'possible_fit' | 'not_fit' | 'fit_if_completed';

export type GrantFitResult = {
  grantId: string;
  title: string;
  status: EligibilityStatus;
  explanation: GrantExplanation;
  /** Motivo principale di esclusione (solo per not_fit) */
  exclusionReason: string | null;
};

export type ActionPlan = {
  /** Bandi con alta compatibilità */
  strongFits: GrantFitResult[];
  /** Bandi possibili ma da verificare */
  possibleFits: GrantFitResult[];
  /** Bandi esclusi (con motivazione) */
  excluded: GrantFitResult[];
  /** Prossime azioni raccomandate per l'utente */
  nextActions: string[];
  /** Analisi gap del profilo */
  gapAnalysis: GapAnalysisResult;
};

function classifyGrant(evaluation: GrantEvaluation): EligibilityStatus {
  if (evaluation.hardExcluded) return 'not_fit';
  if (evaluation.totalScore >= 80) return 'strong_fit';
  if (evaluation.totalScore >= 65) return 'possible_fit';
  if (evaluation.totalScore >= 50 && evaluation.warnings.length > 0) return 'fit_if_completed';
  return 'not_fit';
}

/**
 * Genera il piano d'azione completo dai risultati del pipeline
 */
export function composeActionPlan(
  pipelineResult: PipelineResult,
  profile: NormalizedMatchingProfile,
): ActionPlan {
  const strongFits: GrantFitResult[] = [];
  const possibleFits: GrantFitResult[] = [];
  const excluded: GrantFitResult[] = [];

  // Processa bandi primari e borderline
  const allRelevant = [...pipelineResult.primary, ...pipelineResult.borderline];

  for (const evaluation of allRelevant) {
    const status = classifyGrant(evaluation);
    const explanation = explainGrant(evaluation, profile);

    const result: GrantFitResult = {
      grantId: evaluation.grantId,
      title: evaluation.title,
      status,
      explanation,
      exclusionReason: null,
    };

    if (status === 'strong_fit') {
      strongFits.push(result);
    } else if (status === 'possible_fit' || status === 'fit_if_completed') {
      possibleFits.push(result);
    }
  }

  // Processa top esclusi (massimo 3, con motivazione)
  const topExcluded = pipelineResult.excluded
    .filter(e => e.hardExcluded && e.hardExclusionReason)
    .slice(0, 3);

  for (const evaluation of topExcluded) {
    excluded.push({
      grantId: evaluation.grantId,
      title: evaluation.title,
      status: 'not_fit',
      explanation: {
        grantId: evaluation.grantId,
        strengths: [],
        caveats: [evaluation.hardExclusionReason || 'Non compatibile con il profilo'],
        missingData: [],
        confidence: 'alta',
      },
      exclusionReason: evaluation.hardExclusionReason,
    });
  }

  // Gap analysis
  const gapAnalysis = analyzeGaps(profile, pipelineResult);

  // Genera azioni raccomandate
  const nextActions: string[] = [];

  // Top gap
  if (gapAnalysis.gaps.length > 0) {
    const topGap = gapAnalysis.gaps[0];
    if (topGap.impact === 'alto') {
      nextActions.push(`Fornisci: ${topGap.field.replace('_', ' ')} — può migliorare significativamente i risultati`);
    }
  }

  // Conferma ATECO
  if (!profile.ateco && strongFits.length > 0) {
    nextActions.push('Conferma il codice ATECO per verificare l\'ammissibilità definitiva');
  }

  // Budget
  if (profile.budget === null && (strongFits.length + possibleFits.length) > 0) {
    nextActions.push('Indica l\'importo indicativo dell\'investimento per filtrare meglio');
  }

  // Preferenza contributo
  if (!profile.fundingGoal?.toLowerCase().includes('fondo perduto') && strongFits.some(f => f.explanation.strengths.some(s => s.includes('fondo perduto')))) {
    nextActions.push('Specifica se preferisci fondo perduto, finanziamento agevolato, o mix');
  }

  // Se pochi risultati
  if (strongFits.length === 0 && possibleFits.length > 0) {
    nextActions.push('Completa il profilo per confermare i bandi possibili individuati');
  }

  if (strongFits.length === 0 && possibleFits.length === 0) {
    nextActions.push('Il profilo non è ancora sufficiente per risultati precisi. Rispondi alle domande per migliorare la ricerca');
  }

  return {
    strongFits: strongFits.slice(0, 5),
    possibleFits: possibleFits.slice(0, 3),
    excluded: excluded.slice(0, 3),
    nextActions: nextActions.slice(0, 3),
    gapAnalysis,
  };
}
