import { evaluateAdaptiveScanReadiness } from './lib/conversation/adaptiveScanReadiness';

const profile1 = {
  location: { region: 'Sicilia', municipality: null },
  sector: 'turismo',
  fundingGoal: 'aprire un bnb in sicilia',
  businessExists: false,
  activityType: 'Da costituire'
}

console.log("adaptiveReadiness:", evaluateAdaptiveScanReadiness(profile1 as any));
