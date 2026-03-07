import { runUnifiedPipeline } from '../lib/matching/unifiedPipeline';
import { normalizeProfileInput } from '../lib/matching/profileNormalizer';
import { loadHybridDatasetDocs } from '../lib/matching/datasetRepository';

async function testRigor() {
  const { docs } = await loadHybridDatasetDocs();
  console.log(`Loaded ${docs.length} docs`);

  const cases = [
    {
      id: 'SICILIA_AGRICOLO_SOFTWARE',
      profile: {
        businessExists: true,
        region: 'Sicilia',
        sector: 'agricoltura',
        fundingGoal: 'sviluppo software gestione agricola',
        revenueOrBudgetEUR: 50000,
        employees: 3,
      }
    },
    {
      id: 'CAMPANIA_TURISMO_RISTRUTTURAZIONE',
      profile: {
        businessExists: true,
        region: 'Campania',
        sector: 'turismo',
        fundingGoal: 'ristrutturazione hotel e riqualificazione energetica',
        revenueOrBudgetEUR: 200000,
        employees: 5,
      }
    },
    {
      id: 'LOMBARDIA_DIGITALE_MACCHINARI',
      profile: {
        businessExists: true,
        region: 'Lombardia',
        sector: 'digitale',
        fundingGoal: 'acquisto macchinari cnc e software 4.0',
        revenueOrBudgetEUR: 100000,
        employees: 10,
        ateco: '62.01.00'
      }
    }
  ];

  for (const c of cases) {
    console.log(`\n--- TEST CASE: ${c.id} ---`);
    const normalized = normalizeProfileInput(c.profile);
    const result = runUnifiedPipeline({
      profile: normalized,
      grants: docs,
      options: { strictness: 'high' }
    });

    console.log(`Primary results: ${result.primary.length}`);
    result.primary.slice(0, 5).forEach(g => {
      console.log(`[${g.totalScore}] ${g.title}`);
      console.log(`  Why: ${g.whyFit.join(', ')}`);
    });

    const outOfRegion = result.primary.filter(g => {
        const regionsNote = g.dimensions.find(d => d.dimension === 'territory')?.note ?? '';
        return regionsNote.toLowerCase().includes('escluso') || regionsNote.toLowerCase().includes('altri territori');
    });
    
    if (outOfRegion.length > 0) {
        console.error(`FAIL: ${outOfRegion.length} out-of-region results found in primary!`);
    } else {
        console.log('PASS: No out-of-region results in primary.');
    }
  }
}

testRigor().catch(console.error);
