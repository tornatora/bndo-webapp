import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'business-already-active-rsud',
      fn: async () => {
        const turn = await collectTurn({ message: 'ho una impresa già attiva da 2 anni: posso accedere a resto al sud 2.0?' });
        assert(includesAny(turn.text, ['no', 'nuove attivita', 'nuove attività']), 'Manca guardrail su impresa già attiva');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
