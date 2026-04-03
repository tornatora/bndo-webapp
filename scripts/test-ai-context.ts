
import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { UserProfile } from '../lib/conversation/types';

async function testAIContext() {
    console.log('--- TEST 1: Context Retention ---');
    const initialProfile: Partial<UserProfile> = {
        location: { region: 'Lazio', municipality: null },
        businessExists: true
    };
    
    const history = [
        { role: 'user', text: 'Ciao, ho una PMI nel Lazio e vorrei dei fondi.' },
        { role: 'assistant', text: 'Ciao! Ottimo, ho segnato che sei nel Lazio. Cosa vorresti finanziare esattamente?' }
    ];

    const message = 'Come ti dicevo prima, vorrei acquistare nuovi macchinari per la produzione.';
    
    console.log('Sending message:', message);
    const result = await runTwoPassChat(message, initialProfile, history);
    
    console.log('Intent:', result.intent);
    console.log('Action:', result.finalAction);
    console.log('Extracted Goal:', result.mergedProfile.fundingGoal);
    console.log('Missing Fields:', result.missing_fields);

    console.log('\n--- TEST 2: Pivot to QA ---');
    const message2 = 'Senti, ma cos\'è il de minimis?';
    const result2 = await runTwoPassChat(message2, result.mergedProfile, [
        ...history,
        { role: 'user', text: message },
        { role: 'assistant', text: 'Ho capito, macchinari. Che settore?' }
    ]);
    
    console.log('Intent (should be general_qa):', result2.intent);
    console.log('Action (should be answer_general_qa):', result2.finalAction);
}

testAIContext().catch(console.error);
