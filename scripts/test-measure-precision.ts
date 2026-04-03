import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { UserProfile } from '../lib/conversation/types';

async function testMeasurePrecision() {
    console.log('🚀 Phase 30: Testing Measure Q&A Precision\n');

    const emptyProfile: Partial<UserProfile> = {};
    const activeProfile: Partial<UserProfile> = { businessExists: true };

    const cases = [
        {
            name: 'Case A: Signage in Resto al Sud (Direct Question)',
            message: 'Insegna rientra in Resto al Sud?',
            profile: emptyProfile,
            expectedIntent: 'measure_question',
            expectedContain: "insegna d'esercizio è una spesa ammissibile"
        },
        {
            name: 'Case B: Furniture in Resto al Sud (Already Active Enterprise - Fact Check)',
            message: 'Posso comprare i mobili con Resto al Sud?',
            profile: activeProfile,
            expectedIntent: 'measure_question',
            expectedContain: "gli arredi (come banconi, tavoli, sedie) sono pienamente finanziabili"
        },
        {
            name: 'Case C: Machinery in Sabatini (Specific Expense)',
            message: 'Sabatini finanzia macchinari?',
            profile: emptyProfile,
            expectedIntent: 'measure_question',
            expectedContain: "macchinari, impianti, attrezzature di fabbrica"
        },
        {
            name: 'Case D: Generic Already Active Avoidance (Profile update with measure mention)',
            message: 'Ho la mia impresa a Roma da 5 anni, Resto al Sud mi da fondi?',
            profile: emptyProfile,
            expectedIntent: 'measure_question',
            expectedContain: "misura specifica per l'AVVIO di nuove attività"
        }
    ];

    let passed = 0;
    for (const c of cases) {
        console.log(`Testing ${c.name}...`);
        const result = await runTwoPassChat(c.message, c.profile);
        
        const intentOk = result.intent === c.expectedIntent;
        const textOk = result.groundedContext?.toLowerCase().includes(c.expectedContain.toLowerCase());

        if (intentOk && textOk) {
            console.log(`✅ Passed\n`);
            passed++;
        } else {
            console.error(`❌ Failed`);
            console.error(`   Expected Intent: ${c.expectedIntent}, Got: ${result.intent}`);
            console.error(`   Expected Content: "${c.expectedContain}"`);
            console.error(`   Got Grounded Text: "${result.groundedContext}"\n`);
        }
    }

    console.log(`Result: ${passed}/${cases.length} passed.`);
    if (passed === cases.length) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

testMeasurePrecision().catch(err => {
    console.error(err);
    process.exit(1);
});
