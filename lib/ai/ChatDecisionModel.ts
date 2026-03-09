export type ChatAction = 
  | 'ask_clarification'
  | 'run_scan'
  | 'refine_after_scan'
  | 'answer_measure_question'
  | 'answer_general_qa'
  | 'no_result_explanation'
  | 'handoff_human'
  | 'small_talk';

import type { UserFundingProfile } from '../../types/userFundingProfile';

export interface ChatDecisionModel {
  intent: 'profiling' | 'scan_ready' | 'general_qa' | 'measure_question' | 'discovery' | 'small_talk' | 'handoff_human' | 'unknown';
  action: ChatAction;
  extracted_profile_entities: Partial<UserFundingProfile>;
  missing_fields: string[];
  ambiguities: string[];
}
