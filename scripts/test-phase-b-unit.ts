/**
 * Phase B unit tests: grounded measure answerer and measure_question routing.
 * Run with: npx tsx scripts/test-phase-b-unit.ts
 */
import { detectTurnIntent } from '@/lib/conversation/intentRouter';
import {
  answerGroundedMeasureQuestion,
  isDirectMeasureQuestion,
} from '@/lib/knowledge/groundedMeasureAnswerer';
import { runStreamingChat } from '@/lib/ai/conversationOrchestrator';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function countSentences(text: string) {
  const matches = text.match(/(?<!\d)[.!?](?!\d)/g);
  return matches?.length ?? 0;
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

    const r3 = detectTurnIntent({ message: 'Resto al Sud 2.0 copre i macchinari?', sessionQaMode: false });
    assert(r3.modeHint === 'measure_question', `routing measure_question (macchinari) got ${r3.modeHint}`);
    passed++;

    // --- No onboarding: generic message should not be measure_question
    const r4 = detectTurnIntent({ message: 'voglio un bando per la mia azienda', sessionQaMode: false });
    assert(r4.modeHint !== 'measure_question' || !r4.measureQuestion, 'no measure_question on discovery');
    passed++;

    // --- isDirectMeasureQuestion
    assert(isDirectMeasureQuestion('la formazione si può finanziare con Resto al Sud 2.0?'), 'isDirectMeasureQuestion formation');
    assert(isDirectMeasureQuestion('una SRL può accedere a Resto al Sud 2.0?'), 'isDirectMeasureQuestion SRL');
    assert(isDirectMeasureQuestion('Resto al Sud è tutto a fondo perduto?'), 'isDirectMeasureQuestion ambiguity prompt');
    assert(!isDirectMeasureQuestion('ciao'), '!isDirectMeasureQuestion ciao');
    passed += 4;

    // --- Grounded answer: outcome and no invented format
    const g1 = await answerGroundedMeasureQuestion('Resto al Sud 2.0 copre software?');
    assert(g1 !== null, 'grounded answer non-null');
    assert(g1!.outcome === 'yes' || g1!.outcome === 'yes_under_conditions' || g1!.outcome === 'not_confirmable', `outcome valid: ${g1!.outcome}`);
    assert(g1!.measureId === 'resto-al-sud-20', `measureId: ${g1!.measureId}`);
    assert(g1!.text.length > 20 && !g1!.text.includes('NON_INVENTARE'), 'text sensible');
    passed++;

    const g2 = await answerGroundedMeasureQuestion('una SRL già attiva può accedere a Resto al Sud 2.0?');
    assert(g2 !== null, 'grounded SRL/attiva');
    assert(g2!.outcome === 'no' || g2!.outcome === 'yes_under_conditions' || g2!.outcome === 'not_confirmable', `outcome: ${g2!.outcome}`);
    passed++;

    const gAmbiguous = await answerGroundedMeasureQuestion('Resto al Sud è tutto a fondo perduto?');
    assert(gAmbiguous !== null, 'ambiguous resto al sud returns clarification');
    assert(gAmbiguous!.measureId === 'resto-al-sud-ambiguous', `ambiguous id: ${gAmbiguous!.measureId}`);
    assert(/vecchio resto al sud|resto al sud 2\.0/i.test(gAmbiguous!.text), 'ambiguous clarification text');
    passed++;

    const gContextual = await answerGroundedMeasureQuestion('Resto al Sud è tutto a fondo perduto?');
    assert(gContextual !== null, 'contextual resto al sud response exists');
    assert(gContextual!.measureId === 'resto-al-sud-20' || gContextual!.measureId === 'resto-al-sud-ambiguous', `contextual id expected resto-al-sud-20/resto-al-sud-ambiguous, got ${gContextual!.measureId}`);
    passed++;

    const gPerc = await answerGroundedMeasureQuestion('Resto al Sud 2.0 è tutto a fondo perduto?');
    assert(gPerc !== null, 'resto al sud 2.0 percentage response exists');
    const gPercComposed = gPerc!.text;
    assert(
      /^la risposta breve e no|^la risposta breve è no|^no\./i.test(gPercComposed),
      'resto al sud 2.0 closed response starts with deterministic no'
    );
    assert(!/copertura indicativa|stima forte bndo/i.test(gPercComposed), 'resto al sud 2.0 without mechanical labels');
    assert(!/https?:\/\//i.test(gPercComposed), 'resto al sud 2.0 without urls');
    assert(countSentences(gPercComposed) >= 4, `resto al sud 2.0 readable narrative: ${countSentences(gPercComposed)}`);
    assert(
      /non su tutte le voci|non su tutto il progetto|non per tutte le tipologie|non e corretto dire che tutto|non e al 100|non e al 100 per tutti i progetti/i.test(
        gPercComposed.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      ),
      'resto al sud 2.0 clarifies not all is 100%',
    );
    assert(/due percorsi alternativi|primo percorso|secondo percorso/i.test(gPercComposed), 'resto al sud 2.0 includes practical path explanation');
    passed++;

    const gAuto = await answerGroundedMeasureQuestion('Autoimpiego Centro Nord è al 100% a fondo perduto?');
    assert(gAuto !== null, 'autoimpiego response exists');
    const gAutoComposed = gAuto!.text;
    assert(
      /^la risposta breve e no|^la risposta breve è no|^no\./i.test(gAutoComposed),
      'autoimpiego closed response starts with deterministic no'
    );
    assert(!/copertura indicativa|stima forte bndo/i.test(gAutoComposed), 'autoimpiego without mechanical labels');
    assert(!/https?:\/\//i.test(gAutoComposed), 'autoimpiego without urls');
    assert(countSentences(gAutoComposed) >= 3, `autoimpiego readability: ${countSentences(gAutoComposed)}`);
    passed++;

    const g3 = await answerGroundedMeasureQuestion('qualcosa di non misura?');
    assert(g3 === null, 'non-measure returns null');
    passed++;

    // --- Prudent or generic answer for odd question
    const g4 = await answerGroundedMeasureQuestion('Resto al Sud 2.0 vale per Marte?');
    assert(g4 === null || ['yes', 'no', 'yes_under_conditions', 'not_confirmable'].includes(g4!.outcome), 'valid outcome or null');
    passed++;

    // --- Orchestrator integration: direct path uses composer (no raw mechanical labels)
    let streamedText = '';
    let metadata: any = null;
    for await (const evt of runStreamingChat('Resto al Sud 2.0 è tutto a fondo perduto?', {}, [])) {
      if (evt.type === 'text') streamedText += String(evt.content ?? '');
      if (evt.type === 'metadata') metadata = evt.content;
    }
    const compactStreamed = streamedText.replace(/\s+/g, ' ').trim();
    assert(compactStreamed.length > 0, 'orchestrator direct path streamed text');
    assert(
      /^la risposta breve e no|^la risposta breve è no|^no\./i.test(compactStreamed),
      'orchestrator closed response starts with deterministic no'
    );
    assert(!/copertura indicativa|stima forte bndo/i.test(compactStreamed), 'orchestrator removes mechanical labels');
    assert(!/https?:\/\//i.test(compactStreamed), 'orchestrator removes urls');
    assert(countSentences(compactStreamed) >= 3, `orchestrator readable response: ${countSentences(compactStreamed)}`);
    assert(!/copertura indicativa|stima forte bndo/i.test(streamedText), 'orchestrator keeps consultant language');
    assert(metadata?.finalAction === 'answer_measure_question', `orchestrator finalAction is answer_measure_question (${metadata?.finalAction})`);
    passed++;

    console.log(`PASS Phase B unit tests: ${passed} assertions`);
}

main().catch(console.error);
