import { runUnifiedPipeline } from '../lib/matching/unifiedPipeline.ts';
import { normalizeProfileInput } from '../lib/matching/profileNormalizer.ts';
import { loadHybridDatasetDocs } from '../lib/matching/datasetRepository.ts';
import fs from 'fs';

async function testMatching() {
  const { docs } = await loadHybridDatasetDocs();
  console.log(`Loaded ${docs.length} docs`);

  const profile = normalizeProfileInput({
    businessExists: false,
    region: 'Lombardia',
    sector: 'digitale',
    fundingGoal: 'sviluppo software',
    revenueOrBudgetEUR: 50000,
    employees: 3,
  });

  const result = runUnifiedPipeline({
    profile: profile,
    grants: docs,
    options: { strictness: 'high' }
  });

  console.log(`Primary results: ${result.primary.length}`);
  console.log(`Borderline results: ${result.borderline.length}`);
  console.log(`Excluded results: ${result.excluded.length}`);
  
  if (result.primary.length > 0) {
    result.primary.slice(0, 3).forEach(g => {
      console.log(`[${g.totalScore}] ${g.title}`);
      console.log(`  Why: ${g.whyFit.join(', ')}`);
    });
  } else {
    // let's see why they were excluded
    const notExcluded = result.evaluations.filter(e => !e.hardExcluded);
    console.log(`Not hard excluded: ${notExcluded.length}`);
    notExcluded.slice(0, 5).forEach(e => {
        console.log(`[${e.totalScore}] ${e.title} - ${e.band}`);
        e.dimensions.forEach(d => {
            console.log(`  ${d.dimension}: ${d.score} (${d.note})`);
        });
    });
  }
}

testMatching().catch(console.error);