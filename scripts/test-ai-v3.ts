import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { UserProfile } from '../lib/conversation/types';

async function testAIV3() {
    console.log('🚀 --- STARTING ORCHESTRATOR V3 ULTIMATE INTELLIGENCE TEST --- 🚀\n');

    console.log('🔹 CASE 1: Deep Reasoning & Sector Deduction');
    console.log('Scenario: User mentions "vigneti" and "impianto imbottigliamento"');
    
    const profile1: Partial<UserProfile> = {
        location: { region: 'Toscana', municipality: null }
    };
    
    const message1 = 'Giorno. Abbiamo dei vigneti nel Chianti e vorremmo ammodernare tutto l\'impianto di imbottigliamento. Di cosa possiamo approfittare?';
    
    const result1 = await runTwoPassChat(message1, profile1, []);
    
    console.log('🧠 Reasoning:', (result1 as any).reasoning || 'N/A');
    console.log('🔍 Mental Model:', result1.mental_model);
    console.log('💡 Strategic Note:', result1.strategic_note);
    console.log('📍 Deduced Sector:', result1.mergedProfile.sector);
    console.log('📍 Deduced Goal:', result1.mergedProfile.fundingGoal);
    console.log('--------------------------------------------------\n');

    console.log('🔹 CASE 2: Strategic Continuity');
    console.log('Scenario: Asking a followup that refers to the "bottling" goal');

    const message2 = 'Quanto tempo ci vuole per avere i soldi?';
    const history2 = [
        { role: 'user', text: message1 },
        { role: 'assistant', text: 'Capisco perfettamente. Con dei vigneti nel Chianti, il settore agricolo offre diverse opportunità, specialmente per l\'agroindustria. Per l’imbottigliamento ci sono bando Agrisolare o PSR.' }
    ];

    const result2 = await runTwoPassChat(message2, result1.mergedProfile, history2);

    console.log('🧠 Reasoning:', (result2 as any).reasoning || 'N/A');
    console.log('💡 Strategic Note (should mention Sabatini or PSR):', result2.strategic_note);
    console.log('--------------------------------------------------\n');
}

testAIV3().catch(console.error);
