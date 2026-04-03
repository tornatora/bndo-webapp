
import { UserProfile } from '../lib/conversation/types';
import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';
import { validateProfileConstraint } from '../lib/conversation/profileMemory';

async function testMemory() {
    console.log('--- Phase 29: Memory & Advisory Intelligence Test ---\n');

    let profile: Partial<UserProfile> = {
        location: { region: 'Lazio', municipality: null },
        businessExists: true,
        activityType: 'PMI'
    };

    console.log('Case A: Goal Evolution (Persistence)');
    console.log('Initial profile goal: null');
    
    // Step 1: User says project name
    const step1 = await runTwoPassChat("Voglio aprire una pasticceria", profile);
    profile = step1.mergedProfile as UserProfile;
    console.log(`Step 1 (Extraction): goal = "${profile.fundingGoal}"`);

    // Step 2: User adds refinement
    const step2 = await runTwoPassChat("Sia biologica e senza glutine", profile);
    profile = step2.mergedProfile as UserProfile;
    console.log(`Step 2 (Evolution): goal = "${profile.fundingGoal}"`);

    if (profile.fundingGoal?.toLowerCase().includes('biologica') && profile.fundingGoal?.toLowerCase().includes('pasticceria')) {
        console.log('  ✅ Case A PASS: Goal evolved and persisted.\n');
    } else {
        console.log('  ❌ Case A FAIL: Goal did not persist correctly.\n');
    }

    console.log('Case B: Conflict Detection (Advisory)');
    const conflictingProfile: UserProfile = {
        ...profile,
        businessExists: true,
        activityType: 'Startup' // Contradiction: Existing Co + Startup
    } as any;

    const validation = validateProfileConstraint(conflictingProfile);
    console.log(`Validation result: ${validation.isValid ? 'Valid' : 'Invalid'}`);
    if (!validation.isValid) {
        console.log(`  Conflict reason: ${validation.conflictReason}`);
        console.log('  ✅ Case B PASS: Conflict detected.\n');
    } else {
        console.log('  ❌ Case B FAIL: Conflict missed.\n');
    }
}

testMemory().catch(console.error);
