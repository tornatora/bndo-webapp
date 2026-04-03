import { selectModelForTurn } from '../lib/ai/conversationOrchestrator';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  const models = {
    simpleModel: 'gpt-4.1-mini',
    complexModel: 'gpt-4o'
  };

  const simple = selectModelForTurn({
    intent: 'profiling',
    action: 'ask_clarification',
    message: 'ok grazie',
    groundedContext: null,
    citationsCount: 0,
    models
  });
  assert(simple.modelUsed === models.simpleModel, 'Simple turn should use mini model');

  const technical = selectModelForTurn({
    intent: 'measure_question',
    action: 'answer_measure_question',
    message: 'Quali requisiti e spese ammissibili ha Resto al Sud 2.0?',
    groundedContext: 'context',
    citationsCount: 2,
    models
  });
  assert(technical.modelUsed === models.complexModel, 'Technical turn should use complex model');
  assert(technical.complexity === 'complex', 'Technical turn should be complex');

  const normative = selectModelForTurn({
    intent: 'general_qa',
    action: 'answer_general_qa',
    message: 'Mi spieghi il de minimis su questo bando?',
    groundedContext: null,
    citationsCount: 0,
    models
  });
  assert(normative.modelUsed === models.complexModel, 'Normative questions should use complex model');

  console.log('PASS chat-model-routing');
}

run();
