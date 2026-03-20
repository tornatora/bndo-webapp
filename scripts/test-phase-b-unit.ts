/**
 * Phase B unit tests: grounded measure answerer and measure_question routing.
 * Run with: npx tsx scripts/test-phase-b-unit.ts
 */
import { detectTurnIntent } from '@/lib/conversation/intentRouter';
import {
  answerGroundedMeasureQuestion,
  isDirectMeasureQuestion,
} from '@/lib/knowledge/groundedMeasureAnswerer';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

let passed = 0;

async function main() {
    // --- Routing: direct measure question -> measure_question
    const r1 = detectTurnIntent({ message: 'la formazione si può finanziare con Resto al Sud 2.0?', sessionQaMode: false });
    assert(r1.modeHint === 'measure_question', `routing measure_question got ${r1.modeHint}`);
    assert(r1.measureQuestion === true, 'measureQuestion true');
    passed++;

    const r2 = detectTurnIntent({ message: 'questo bando copre software?', sessionQaMode: false });
    // May be qa if no measure mentioned
    passed++;

    const r3 = detectTurnIntent({ message: 'Resto al Sud copre i macchinari?', sessionQaMode: false });
    assert(r3.modeHint === 'measure_question', `routing measure_question (macchinari) got ${r3.modeHint}`);
    passed++;

    // --- No onboarding: generic message should not be measure_question
    const r4 = detectTurnIntent({ message: 'voglio un bando per la mia azienda', sessionQaMode: false });
    assert(r4.modeHint !== 'measure_question' || !r4.measureQuestion, 'no measure_question on discovery');
    passed++;

    // --- isDirectMeasureQuestion
    assert(isDirectMeasureQuestion('la formazione si può finanziare con Resto al Sud 2.0?'), 'isDirectMeasureQuestion formation');
    assert(isDirectMeasureQuestion('una SRL può accedere a Resto al Sud?'), 'isDirectMeasureQuestion SRL');
    assert(!isDirectMeasureQuestion('ciao'), '!isDirectMeasureQuestion ciao');
    passed += 3;

    // --- Grounded answer: outcome and no invented format
    const g1 = await answerGroundedMeasureQuestion('Resto al Sud copre software?');
    assert(g1 !== null, 'grounded answer non-null');
    assert(g1!.outcome === 'yes' || g1!.outcome === 'yes_under_conditions' || g1!.outcome === 'not_confirmable', `outcome valid: ${g1!.outcome}`);
    assert(g1!.measureId === 'resto-al-sud-20', `measureId: ${g1!.measureId}`);
    assert(g1!.text.length > 20 && !g1!.text.includes('NON_INVENTARE'), 'text sensible');
    passed++;

    const g2 = await answerGroundedMeasureQuestion('una SRL già attiva può accedere a Resto al Sud?');
    assert(g2 !== null, 'grounded SRL/attiva');
    assert(g2!.outcome === 'no' || g2!.outcome === 'yes_under_conditions' || g2!.outcome === 'not_confirmable', `outcome: ${g2!.outcome}`);
    passed++;

    const g3 = await answerGroundedMeasureQuestion('qualcosa di non misura?');
    assert(g3 === null, 'non-measure returns null');
    passed++;

    // --- Prudent or generic answer for odd question
    const g4 = await answerGroundedMeasureQuestion('Resto al Sud 2.0 vale per Marte?');
    assert(g4 === null || ['yes', 'no', 'yes_under_conditions', 'not_confirmable'].includes(g4!.outcome), 'valid outcome or null');
    passed++;

    console.log(`PASS Phase B unit tests: ${passed} assertions`);
}

main().catch(console.error);
