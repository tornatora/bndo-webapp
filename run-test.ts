import { evaluateProfileCompleteness } from './lib/conversation/profileCompleteness';

const profile = {
  location: { region: 'Sicilia', municipality: null },
  sector: 'turismo',
  fundingGoal: 'aprire un bnb in sicilia',
  businessExists: false,
  activityType: 'Da costituire'
}
const comp = evaluateProfileCompleteness(profile as any);
console.log("Missing:", comp.missingSignals);
console.log("Next priority:", comp.nextPriorityField);

