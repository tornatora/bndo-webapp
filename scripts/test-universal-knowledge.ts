import { answerGroundedMeasureQuestion } from '../lib/knowledge/groundedMeasureAnswerer';
import { fetchAllIncentiviDocs } from '../lib/matching/datasetIncentivi';

async function testUniversalKnowledge() {
    console.log('🚀 Phase 31: Testing Universal Grant Knowledge\n');

    const cases = [
        {
            name: 'Pillar Test: Smart&Start Italia',
            message: 'Cos’è Smart&Start?',
            contain: 'startup innovative'
        },
        {
            name: 'Pillar Test: Transizione 5.0',
            message: 'Come funziona Transizione 5.0?',
            contain: 'risparmio energetico'
        },
        {
            name: 'Dynamic Test: Niche Grant Search',
            message: 'Trovami informazioni su bando voucher internazionalizzazione',
            contain: 'mercati esteri'
        }
    ];

    let passed = 0;
    for (const c of cases) {
        console.log(`Testing ${c.name}...`);
        const result = await answerGroundedMeasureQuestion(c.message);
        
        if (result && result.text.toLowerCase().includes(c.contain.toLowerCase())) {
            console.log(`✅ Passed\n`);
            passed++;
        } else {
            console.error(`❌ Failed`);
            console.error(`   Expected contain: "${c.contain}"`);
            console.error(`   Got Text: "${result?.text || 'null'}"\n`);
        }
    }

    // Dynamic Database Test (finding something not in aliases)
    console.log('Testing Real Dynamic Database Search...');
    const all = await fetchAllIncentiviDocs(5000);
    if (all.length > 0) {
        const randomBando = all[10].title; // Just pick something
        console.log(`Searching for niche bando: "${randomBando}"`);
        const result = await answerGroundedMeasureQuestion(`Che mi dici del bando ${randomBando}?`);
        if (result && result.measureId?.startsWith('dataset-')) {
            console.log(`✅ Passed dynamic search (found: ${result.measureId})\n`);
            passed++;
        } else {
            console.error(`❌ Failed dynamic search (Got: ${result?.measureId})\n`);
        }
    }

    console.log(`Final Result: ${passed}/${cases.length + 1} passed.`);
    if (passed >= cases.length) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

testUniversalKnowledge().catch(err => {
    console.error(err);
    process.exit(1);
});
