
import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { UserProfile } from '../lib/conversation/types';

async function testAIV4() {
    console.log('👑 --- STARTING ORCHESTRATOR V4 SOVEREIGN INTELLIGENCE TEST --- 👑\n');

    console.log('🔹 CASE 1: Hypothesis-Driven Profiling & Mind Reading');
    console.log('Scenario: User mentions "hotel a Rimini" and "ristrutturazione"');
    
    const profile1: Partial<UserProfile> = {};
    const message1 = 'Salve, abbiamo un piccolo hotel a Rimini e vorremmo ristrutturare le camere il prossimo inverno. Cosa c\'è per noi?';
    
    const result1 = await runTwoPassChat(message1, profile1, []);
    
    console.log('🧠 Reasoning:', (result1 as any).reasoning || 'N/A');
    console.log('🧐 Self-Critique:', (result1 as any).self_critique || 'N/A');
    console.log('🔮 Hypotheses:', (result1 as any).hypotheses);
    console.log('📍 Deduced Sector (should be turismo):', result1.mergedProfile.sector);
    console.log('--------------------------------------------------\n');

    console.log('🔹 CASE 2: Proactive Risk Assessment');
    console.log('Scenario: User says "partita IVA aperta ieri" and wants a big grant');

    const profile2: Partial<UserProfile> = {
        location: { region: 'Lazio', municipality: null },
        fundingGoal: 'acquisto capannone industriale'
    };
    const message2 = 'Piacere, ho aperto la partita IVA ieri come ditta individuale e vorrei un fondo perduto per comprare un capannone da 1 milione.';

    const result2 = await runTwoPassChat(message2, profile2, []);

    console.log('🧠 Reasoning:', (result2 as any).reasoning || 'N/A');
    console.log('⚠️ Risk Assessment:', (result2 as any).risk_assessment);
    console.log('💡 Strategic Note:', result2.strategic_note);
    console.log('--------------------------------------------------\n');
}

testAIV4().catch(console.error);
