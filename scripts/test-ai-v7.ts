
import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { UserProfile } from '../lib/conversation/types';

async function testAIV7() {
    console.log('🏛️ --- STARTING ORCHESTRATOR V7 THE ARCHITECT (OMNISCIENT) TEST --- 🏛️\n');

    console.log('🔹 CASE 1: Deep Normative Analysis & Roadmap (Transizione 5.0)');
    
    const profile1: Partial<UserProfile> = {
        location: { region: 'Lombardia', municipality: 'Milano' },
        fundingGoal: 'efficienza energetica macchinari'
    };
    const message1 = 'Vogliamo investire 500k in nuovi macchinari interconnessi per ridurre i consumi del 10%. Mi serve onniscienza: cosa dice la legge esattamente e come dobbiamo muoverci mese per mese?';
    
    const result1 = await runTwoPassChat(message1, profile1, []);
    
    console.log('⚖️ Normative Deep Dive:', (result1 as any).normative_deep_dive || 'N/A');
    console.log('🏗️ Execution Roadmap:', (result1 as any).execution_roadmap?.join(' → ') || 'N/A');
    console.log('💎 Expert Nugget:', (result1 as any).expert_nugget || 'N/A');
    console.log('✨ Strategic Synthesis:', result1.strategic_synthesis);
    console.log('--------------------------------------------------\n');

    console.log('🔹 CASE 2: Strategic Complexity (Omniscient Tier)');
    console.log('Scenario: Complex integration of multiple measures');

    const profile2: Partial<UserProfile> = {
        location: { region: 'Puglia', municipality: 'Bari' },
        fundingGoal: 'nuova ditta agricola giovani'
    };
    const message2 = 'Siamo tre giovani che vogliono aprire un ditta agricola innovativa in Puglia. Serve un piano perfetto: Sabatini, De Minimis, e fondi regionali. Progetta la nostra vittoria.';

    const result2 = await runTwoPassChat(message2, profile2, []);

    console.log('⚖️ Normative Deep Dive:', (result2 as any).normative_deep_dive || 'N/A');
    console.log('🏗️ Execution Roadmap:', (result2 as any).execution_roadmap?.join(' → ') || 'N/A');
    console.log('✨ Strategic Synthesis:', result2.strategic_synthesis);
    console.log('--------------------------------------------------\n');
}

testAIV7().catch(console.error);
