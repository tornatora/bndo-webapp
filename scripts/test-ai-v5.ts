
import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { UserProfile } from '../lib/conversation/types';

async function testAIV5() {
    console.log('🔮 --- STARTING ORCHESTRATOR V5 THE ORACLE (SINGULARITY) TEST --- 🔮\n');

    console.log('🔹 CASE 1: High Success Probability & Strategic Synthesis');
    console.log('Scenario: Innovative Startup in Campania with budget and Youth Team');
    
    const profile1: Partial<UserProfile> = {
        location: { region: 'Campania', municipality: null },
        businessExists: false,
        fundingGoal: 'sviluppo piattaforma software AI per medicina',
        revenueOrBudgetEUR: 150000,
        teamMajority: 'mixed',
        isInnovative: true
    };
    const message1 = 'Salve, siamo un team di giovani under 35 a Napoli e vogliamo lanciare una startup innovativa che usa l\'AI per diagnosi mediche. Abbiamo un budget di 150k euro.';
    
    const result1 = await runTwoPassChat(message1, profile1, []);
    
    console.log('📈 Success Probability:', (result1 as any).success_probability + '%' || 'N/A');
    console.log('✨ Strategic Synthesis:', result1.strategic_synthesis);
    console.log('💡 Strategic Note:', result1.strategic_note);
    console.log('--------------------------------------------------\n');

    console.log('🔹 CASE 2: Low Success Probability & Risk Detection');
    console.log('Scenario: Simple shop renovation, low budget, no innovation');

    const profile2: Partial<UserProfile> = {
        location: { region: 'Lombardia', municipality: 'Milano' },
        fundingGoal: 'tinteggiatura pareti negozio'
    };
    const message2 = 'Vorrei dei soldi a fondo perduto per ridipingere le pareti del mio negozio a Milano.';

    const result2 = await runTwoPassChat(message2, profile2, []);

    console.log('📈 Success Probability:', (result2 as any).success_probability + '%' || 'N/A');
    console.log('⚠️ Risk Assessment:', (result2 as any).risk_assessment);
    console.log('✨ Strategic Synthesis:', result2.strategic_synthesis);
    console.log('--------------------------------------------------\n');
}

testAIV5().catch(console.error);
