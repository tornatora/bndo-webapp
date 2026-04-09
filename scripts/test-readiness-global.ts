
import { evaluateProfileCompleteness } from '../lib/conversation/profileCompleteness';
import { evaluateAdaptiveScanReadiness } from '../lib/conversation/adaptiveScanReadiness';
import { UserProfile } from '../lib/conversation/types';

function createProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    location: { region: null, municipality: null },
    fundingGoal: null,
    businessExists: null,
    sector: null,
    activityType: null,
    age: null,
    ageBand: null,
    employmentStatus: null,
    revenueOrBudgetEUR: null,
    budgetAnswered: false,
    ateco: null,
    legalForm: null,
    employees: null,
    contributionPreference: null,
    locationNeedsConfirmation: false,
    ...overrides
  } as UserProfile;
}

function testReadiness() {
  console.log("--- Testing Global Readiness Hardening ---");

  const cases = [
    {
      name: "Startup Hasty (BnB in Sicilia)",
      profile: createProfile({
        location: { region: 'Sicilia', municipality: null },
        fundingGoal: 'voglio aprire un bnb',
        businessExists: false,
        sector: 'turismo'
      }),
      expectedReady: false
    },
    {
      name: "PMI Hasty (Ditta in Lombardia, acquisto macchinari)",
      profile: createProfile({
        location: { region: 'Lombardia', municipality: null },
        fundingGoal: 'acquisto macchinari',
        businessExists: true,
        sector: 'manifattura'
      }),
      expectedReady: false // Missing economic signal (budget/employees)
    },
    {
      name: "Startup Complete",
      profile: createProfile({
        location: { region: 'Sicilia', municipality: null },
        fundingGoal: 'voglio aprire un bnb e ristrutturarlo',
        businessExists: false,
        sector: 'turismo',
        age: 30,
        employmentStatus: 'disoccupato',
        revenueOrBudgetEUR: 50000
      }),
      expectedReady: true
    },
    {
      name: "PMI Complete",
      profile: createProfile({
        location: { region: 'Lombardia', municipality: null },
        fundingGoal: 'acquisto macchinari industria 4.0',
        businessExists: true,
        sector: 'manifattura',
        employees: 10,
        revenueOrBudgetEUR: 100000
      }),
      expectedReady: true
    }
  ];

  cases.forEach(c => {
    const completeness = evaluateProfileCompleteness(c.profile);
    const adaptive = evaluateAdaptiveScanReadiness(c.profile);
    
    // We strictly use completeness.level === 'strong_ready' in orchestrator now
    const isActuallyReady = completeness.level === 'strong_ready' && adaptive.ready;
    
    console.log(`\nCase: ${c.name}`);
    console.log(`Level: ${completeness.level}`);
    console.log(`Adaptive Ready: ${adaptive.ready}`);
    console.log(`Missing Signals: ${completeness.missingSignals.join(', ')}`);
    console.log(`Is Actually Ready (Final Action): ${isActuallyReady}`);
    
    if (isActuallyReady !== c.expectedReady) {
      console.error(`FAILED: Expected ready=${c.expectedReady}, got ${isActuallyReady}`);
    } else {
      console.log("SUCCESS");
    }
  });
}

testReadiness();
