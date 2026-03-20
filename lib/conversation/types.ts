export type ContributionPreference =
  | 'fondo_perduto'
  | 'finanziamento_agevolato'
  | 'credito_imposta'
  | 'voucher'
  | 'misto'
  | 'non_importa';

export type UserProfile = {
  activityType: string | null;
  businessExists: boolean | null;
  sector: string | null;
  ateco: string | null;
  atecoAnswered: boolean;
  location: { region: string | null; municipality: string | null; investmentRegion?: string | null };
  locationNeedsConfirmation?: boolean;
  age: number | null;
  ageBand?: 'under35' | 'over35' | null;
  employmentStatus: string | null;
  legalForm: string | null;
  employees: number | null;
  revenueOrBudgetEUR: number | null;
  requestedContributionEUR: number | null;
  budgetAnswered: boolean;
  fundingGoal: string | null;
  contributionPreference: ContributionPreference | null;
  contactEmail: string | null;
  contactPhone: string | null;
  
  // Advanced Intelligence Fields
  teamMajority: 'female' | 'youth' | 'mixed' | null;
  agricultureStatus: 'has_land_iap' | 'no_land_iap' | null;
  tech40: boolean | null;
  professionalRegister: boolean | null;
  isThirdSector: boolean | null;
  propertyStatus: 'owned' | 'rented_registered' | 'none' | null;
  foundationYear: number | null;
  annualTurnover: number | null;
  isInnovative: boolean | null;
  activeMeasureId?: string | null;
  activeMeasureTitle?: string | null;

  slotSource?: Partial<
    Record<
      | 'activityType'
      | 'businessExists'
      | 'sector'
      | 'ateco'
      | 'location'
      | 'age'
      | 'ageBand'
      | 'employmentStatus'
      | 'legalForm'
      | 'employees'
      | 'budget'
      | 'requestedContributionEUR'
      | 'fundingGoal'
      | 'contributionPreference'
      | 'teamMajority'
      | 'agricultureStatus'
      | 'tech40'
      | 'professionalRegister'
      | 'isThirdSector'
      | 'propertyStatus'
      | 'foundationYear'
      | 'annualTurnover'
      | 'isInnovative',
      'explicit' | 'demonym' | 'inferred'
    >
  >;
};

export type Step =
  | 'activityType'
  | 'sector'
  | 'legalForm'
  | 'ateco'
  | 'location'
  | 'employees'
  | 'fundingGoal'
  | 'budget'
  | 'contributionPreference'
  | 'teamMajority'
  | 'agricultureStatus'
  | 'tech40'
  | 'professionalRegister'
  | 'isThirdSector'
  | 'propertyStatus'
  | 'foundationYear'
  | 'annualTurnover'
  | 'isInnovative'
  | 'contactEmail'
  | 'contactPhone'
  | 'preScanConfirm'
  | 'ready';

export type NextBestField = Exclude<Step, 'ready'>;

export type ConversationMode = 'qa' | 'profiling' | 'handoff' | 'scan_ready';

export type ConversationAction =
  | 'ask_clarification'
  | 'run_scan'
  | 'answer_measure_question'
  | 'answer_general_qa'
  | 'no_result_explanation'
  | 'handoff_human';

export type ScanReadinessReason =
  | 'ready'
  | 'missing:fundingGoal'
  | 'missing:location'
  | 'missing:businessContext'
  | 'missing:founderEligibility'
  | 'missing:topicPrecision'
  | 'missing:unknown';

export type ConversationResponseMeta = {
  nextQuestionField?: NextBestField | null;
  profileCompletenessScore?: number;
  scanReadinessReason?: ScanReadinessReason;
  questionReasonCode?: ScanReadinessReason;
  action?: ConversationAction;
};

export type ProfileFieldMemory = {
  lastUpdatedAt: string;
  source: 'user' | 'extractor' | 'system';
};

export type ProfileMemory = Partial<Record<NextBestField, ProfileFieldMemory>>;

export type Session = {
  step: Step;
  userProfile: UserProfile;
  profileMemory?: ProfileMemory;
  lastScanHash?: string | null;
  askedCounts?: Partial<Record<Step, number>>;
  lastAskedStep?: Step | null;
  recentTurns?: Array<{ role: 'user' | 'assistant'; text: string }>;
  qaMode?: boolean;
  humanHandoffRequested?: boolean;
  humanHandoffCompleted?: boolean;
};
