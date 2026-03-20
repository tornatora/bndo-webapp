export type ChatAction = 
  | 'ask_clarification'
  | 'run_scan'
  | 'refine_after_scan'
  | 'answer_measure_question'
  | 'answer_general_qa'
  | 'no_result_explanation'
  | 'handoff_human'
  | 'small_talk'
  | 'off_topic';

import type { UserFundingProfile } from '../../types/userFundingProfile';

export interface ChatDecisionModel {
  intent: 'profiling' | 'scan_ready' | 'general_qa' | 'measure_question' | 'discovery' | 'small_talk' | 'handoff_human' | 'off_topic' | 'unknown';
  action: ChatAction;
  reasoning: string; 
  response_text?: string; // New: Direct assistant response prose
  self_critique?: string;
  strategic_note?: string; 
  extracted_profile_entities: Partial<UserFundingProfile> & {
    mental_model?: string;
    hypotheses?: string[];
    risk_assessment?: string;
    success_probability?: number; // Probabilità di successo stimata (0-100)
    strategic_synthesis?: string; // Sintesi folgorante della strategia vincente
    commercial_pulse?: string; // Nuova: Analisi del sentiment e urgenza dell'utente
    expert_nugget?: string; // Nuova: Dettaglio tecnico/legale ultra-specifico
    execution_roadmap?: string[]; // Nuova: Piano d'azione cronologico (Mese 1, Mese 2...)
    normative_deep_dive?: string; // Nuova: Riferimento oracolare a legge/comma specifico
  };
  missing_fields: string[];
  ambiguities: string[];
  strategicFeedback?: string;
  groundedContext?: string | null;
}
