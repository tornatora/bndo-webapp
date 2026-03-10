
import { runUnifiedPipeline } from '../lib/matching/unifiedPipeline';
import { STRATEGIC_SCANNER_DOCS } from '../lib/strategicScannerDocs';
import { normalizeProfile } from '../lib/matching/profileNormalizer';

const profile = normalizeProfile({
    region: 'Calabria',
    businessExists: false,
    ageBand: 'under35',
    fundingGoal: 'avvio attività manifatturiera'
});

const results = runUnifiedPipeline({
    profile,
    grants: STRATEGIC_SCANNER_DOCS as any
});

console.log("Top result:", results.primary[0]?.title, "Score:", results.primary[0]?.totalScore);
const resto = results.evaluations.find(e => e.grantId === 'strategic-resto-al-sud-20');
console.log("Resto al Sud 2.0 Evaluation:", JSON.stringify(resto, null, 2));
