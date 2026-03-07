/**
 * Phase A unit tests: intentRouter, profileExtractor, confidenceMetadata.
 * Run with: npx tsx scripts/test-phase-a-unit.ts
 */
import { detectTurnIntent } from '@/lib/conversation/intentRouter';
import { extractProfileFromMessage } from '@/lib/engines/profileExtractor';
import { computeConfidenceMetadata } from '@/lib/engines/confidenceMetadata';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

let passed = 0;

// --- intentRouter ---
const ir1 = detectTurnIntent({ message: 'Come funziona il fondo perduto?', sessionQaMode: false });
assert(ir1.modeHint === 'qa', `intent: qa got ${ir1.modeHint}`);
passed++;

const ir2 = detectTurnIntent({ message: 'voglio parlare con un consulente umano', sessionQaMode: false });
assert(ir2.modeHint === 'handoff_human', `intent: handoff got ${ir2.modeHint}`);
passed++;

const ir3 = detectTurnIntent({ message: 'procediamo con il matching', sessionQaMode: false });
assert(ir3.modeHint === 'scan_refine', `intent: scan_refine got ${ir3.modeHint}`);
passed++;

const ir4 = detectTurnIntent({ message: 'ok grazie', sessionQaMode: false });
assert(ir4.modeHint === 'small_talk', `intent: small_talk got ${ir4.modeHint}`);
passed++;

const ir5 = detectTurnIntent({ message: 'ciao', sessionQaMode: false });
assert(ir5.greeting, 'intent: greeting');
passed++;

const ir6 = detectTurnIntent({ message: '', sessionQaMode: false });
assert(!ir6.greeting && !ir6.smallTalk, 'intent: empty message');
passed++;

// --- profileExtractor ---
const ex1 = extractProfileFromMessage('Sono calabrese');
assert(ex1.updates.location?.region === 'Calabria', `region from demonym got ${ex1.updates.location?.region}`);
passed++;

const ex2 = extractProfileFromMessage('Ho un impresa agricola in Sicilia');
assert(ex2.updates.location?.region === 'Sicilia', `region explicit got ${ex2.updates.location?.region}`);
assert(Boolean(ex2.updates.sector?.includes('agricolt')), `sector agriculture got ${ex2.updates.sector}`);
assert(ex2.updates.businessExists === true, `businessExists true got ${String(ex2.updates.businessExists)}`);
passed++;

const ex3 = extractProfileFromMessage('50.000 euro di investimento');
assert(ex3.updates.revenueOrBudgetEUR === 50000, `budget 50k got ${ex3.updates.revenueOrBudgetEUR}`);
passed++;

const ex4 = extractProfileFromMessage('Sono under35 disoccupato');
assert(ex4.updates.ageBand === 'under35', `ageBand under35 got ${ex4.updates.ageBand}`);
assert(ex4.updates.employmentStatus === 'disoccupato', `employment got ${ex4.updates.employmentStatus}`);
passed++;

const ex5 = extractProfileFromMessage('Vorrei aprire una nuova attivita');
assert(ex5.updates.activityType === 'Da costituire', `activityType got ${ex5.updates.activityType}`);
passed++;

// --- confidenceMetadata ---
const cm1 = computeConfidenceMetadata({ aiSource: 'openai', needsClarification: false });
assert(cm1.assistantConfidence === 0.9, `confidence openai got ${cm1.assistantConfidence}`);
passed++;

const cm2 = computeConfidenceMetadata({ aiSource: 'openai', needsClarification: true });
assert(cm2.assistantConfidence === 0.83, `confidence openai+clarify got ${cm2.assistantConfidence}`);
passed++;

const cm3 = computeConfidenceMetadata({ aiSource: 'budget' });
assert(cm3.assistantConfidence >= 0.7 && cm3.assistantConfidence <= 1, `confidence in range got ${cm3.assistantConfidence}`);
passed++;

const cm4 = computeConfidenceMetadata({ aiSource: null, hasErrorPrompt: true });
assert(cm4.assistantConfidence === 0.62, `confidence error got ${cm4.assistantConfidence}`);
passed++;

console.log(`PASS Phase A unit tests: ${passed} assertions`);
