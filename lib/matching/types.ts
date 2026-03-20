export type ScanChannel = 'scanner' | 'chat';
export type ScanStrictness = 'standard' | 'high';

export type AvailabilityStatus = 'open' | 'incoming';
export type HardStatus = 'eligible' | 'unknown' | 'not_eligible';

export type ScanResultLike = {
  id: string;
  title: string;
  authorityName: string;
  deadlineAt: string | null;
  sourceUrl: string;
  score: number;
  matchScore: number;
  matchReasons: string[];
  mismatchFlags: string[];
  requirements: string[];
  availabilityStatus?: AvailabilityStatus;
  hardStatus?: HardStatus;
  aidForm?: string | null;
  aidIntensity?: string | null;
  budgetTotal?: number | null;
  economicOffer?: Record<string, unknown> | null;
  probabilityScore?: number;
  feasibilityScore?: number;
  isClickDay?: boolean;
  isSpecialArea?: boolean;
  specialAreaType?: 'zes' | 'sisma' | 'montana' | null;
};

export type CandidateLike<T extends ScanResultLike = ScanResultLike> = {
  result: T;
  contributionMatched: boolean;
};

export type IncentiviDoc = {
  id?: string | number;
  title?: string;
  description?: string;
  authorityName?: string;
  openDate?: string;
  closeDate?: string;
  regions?: string[] | string;
  sectors?: string[] | string;
  beneficiaries?: string[] | string;
  dimensions?: string[] | string;
  purposes?: string[] | string;
  supportForm?: string[] | string;
  ateco?: string[] | string;
  costMin?: string | number;
  costMax?: string | number;
  grantMin?: string | number;
  grantMax?: string | number;
  coverageMinPercent?: string | number;
  coverageMaxPercent?: string | number;
  displayAmountLabel?: string;
  displayProjectAmountLabel?: string;
  displayCoverageLabel?: string;
  institutionalLink?: string;
  url?: string;
  score?: number;
};

export type NormalizedMatchingProfile = {
  businessExists: boolean | null;
  region: string | null;
  investmentRegion?: string | null;
  userRegionCanonical: string | null;
  sector: string | null;
  fundingGoal: string | null;
  ateco: string | null;
  activityType: string | null;
  contributionPreference: string | null;
  employees: number | null;
  age: number | null;
  ageBand?: 'under35' | 'over35' | null;
  employmentStatus: string | null;
  budget: number | null;
  requestedContribution: number | null;
  atecoDigits: string[];
  
  // Advanced Intelligence Fields
  teamMajority?: "female" | "youth" | "mixed" | "none" | null;
  agricultureStatus?: "has_land_iap" | "no_land_iap" | "unknown" | null;
  tech40?: boolean | null;
  professionalRegister?: boolean | null;
  isThirdSector?: boolean | null;
  propertyStatus?: 'owned' | 'rented_registered' | 'none' | null;
  foundationYear?: number | null;
  annualTurnover?: number | null;
  isInnovative?: boolean | null;
  companySize?: 'micro' | 'piccola' | 'media' | 'grande' | null;
};

export type ScanMissingSignal =
  | 'fundingGoal'
  | 'location'
  | 'businessContext'
  | 'founderEligibility'
  | 'topicPrecision';

export type ProfilePriorityRule = {
  tokens: string[];
  score: number;
};

export type DatasetSnapshot = {
  id: string;
  source: string;
  versionHash: string;
  fetchedAt: string;
  isActive: boolean;
  docCount: number;
  docs: IncentiviDoc[];
};
