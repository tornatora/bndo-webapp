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
  location: { region: string | null; municipality: string | null };
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
      | 'contributionPreference',
      'explicit' | 'demonym' | 'inferred'
    >
  >;
};

export type Step =
  | 'activityType'
  | 'sector'
  | 'ateco'
  | 'location'
  | 'employees'
  | 'fundingGoal'
  | 'budget'
  | 'contributionPreference'
  | 'contactEmail'
  | 'contactPhone'
  | 'ready';

export type NextBestField = Exclude<Step, 'ready'>;

export type ConversationMode = 'qa' | 'profiling' | 'handoff' | 'scan_ready';

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
