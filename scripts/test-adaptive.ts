import { evaluateAdaptiveScanReadiness } from '../lib/conversation/adaptiveScanReadiness';

const profile = {
  businessExists: false,
  fundingGoal: 'aprire un bnb in sicilia',
  location: { region: 'Sicilia', municipality: null },
  sector: 'turismo',
  age: null,
  employmentStatus: null,
  activityType: null,
  ateco: null,
  atecoAnswered: false,
  legalForm: null,
  employees: null,
  revenueOrBudgetEUR: null,
  requestedContributionEUR: null,
  budgetAnswered: false,
  contributionPreference: null,
  contactEmail: null,
  contactPhone: null,
  teamMajority: null,
  agricultureStatus: null,
  tech40: null,
  professionalRegister: null,
  isThirdSector: null,
  propertyStatus: null,
  foundationYear: null,
  annualTurnover: null,
  isInnovative: null,
};

const res = evaluateAdaptiveScanReadiness(profile as any);
console.log("Ready:", res.ready);
console.log("Missing:", res.missingSignals);
