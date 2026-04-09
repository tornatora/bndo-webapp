import { evaluateAdaptiveScanReadiness } from './lib/conversation/adaptiveScanReadiness';

const profile1 = {
  location: { region: 'Sicilia', municipality: null },
  sector: 'turismo',
  fundingGoal: 'aprire un bnb in sicilia',
  businessExists: false,
  activityType: 'Da costituire'
}

const evaluated = evaluateAdaptiveScanReadiness(profile1 as any);
console.log("ready", evaluated.ready);
console.log("missingSignals", evaluated.missingSignals);

