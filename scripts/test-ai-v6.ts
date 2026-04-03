
import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { UserProfile } from '../lib/conversation/types';

async function testAIV6() {
    console.log('🤝 --- STARTING ORCHESTRATOR V6 THE MENTOR (HYPER-HUMAN) TEST --- 🤝\n');

    console.log('🔹 CASE 1: Sentiment Analysis & Expert Nugget (Stressed User)');
    console.log('Scenario: User is worried about "de minimis" and deadlines');
    
    const profile1: Partial<UserProfile> = {
        location: { region: 'Sicilia', municipality: null },
        fundingGoal: 'acquisto macchinari'
    };
    const message1 = 'Guarda, sono preoccupatissimo perché non capisco nulla di de minimis e ho paura di perdere la scadenza del bando per i macchinari. Potete aiutarmi o è troppo tardi?';
    
    const result1 = await runTwoPassChat(message1, profile1, []);
    
    console.log('🎭 Commercial Pulse:', (result1 as any).commercial_pulse || 'N/A');
    console.log('💎 Expert Nugget:', (result1 as any).expert_nugget || 'N/A');
    console.log('📈 Success Probability:', (result1 as any).success_probability + '%' || 'N/A');
    console.log('✨ Strategic Synthesis:', result1.strategic_synthesis);
    console.log('--------------------------------------------------\n');

    console.log('🔹 CASE 2: Expert Interaction (Pragmatic Pro)');
    console.log('Scenario: User asks about cumulability of tax credits');

    const profile2: Partial<UserProfile> = {
        location: { region: 'Lombardia', municipality: 'Milano' },
        fundingGoal: 'transizione 5.0'
    };
    const message2 = 'Ciao, sto valutando la Transizione 5.0. Mi date un dettaglio tecnico sulla cumulabilità con la Nuova Sabatini? Siete meglio di ChatGPT o dite le solite cose?';

    const result2 = await runTwoPassChat(message2, profile2, []);

    console.log('🎭 Commercial Pulse:', (result2 as any).commercial_pulse || 'N/A');
    console.log('💎 Expert Nugget:', (result2 as any).expert_nugget || 'N/A');
    console.log('✨ Strategic Synthesis:', result2.strategic_synthesis);
    console.log('--------------------------------------------------\n');
}

testAIV6().catch(console.error);
