
import { normalizeProfile } from '../lib/matching/profileNormalizer';
import { evaluateProfileCompleteness } from '../lib/conversation/profileCompleteness';
import { isPreScanReady } from '../lib/conversation/scanReadiness';

function simulate(message: string, initialProfile: any = {}) {
    // Basic extraction simulation based on my code changes
    const profile = { ...initialProfile };
    
    if (message.includes("Calabria")) profile.region = "Calabria";
    if (message.includes("avviare")) profile.businessExists = false;
    if (message.includes("macchinari")) profile.fundingGoal = "acquisto macchinari";
    if (message.includes("attiva")) profile.businessExists = true;
    if (message.includes("manifatturiera")) profile.sector = "manifatturiero";
    
    // Multi-region
    if (message.includes("sede in Puglia") && message.includes("investimento in Lazio")) {
        profile.region = "Puglia";
        profile.investmentRegion = "Lazio";
    }

    const normalized = normalizeProfile(profile);
    const evaluation = evaluateProfileCompleteness(normalized);
    const ready = isPreScanReady(normalized);
    
    return {
        input: message,
        extractedProfile: normalized,
        readyToScan: ready,
        profileCompletenessScore: evaluation.score,
        nextPriorityField: evaluation.nextPriorityField
    };
}

console.log(JSON.stringify({
    a: simulate("Voglio avviare in Calabria"),
    b: simulate("azienda manifatturiera", { region: "Calabria", businessExists: true, fundingGoal: "macchinari" }),
    c: simulate("Ho sede in Puglia ma investimento in Lazio"),
}, null, 2));
