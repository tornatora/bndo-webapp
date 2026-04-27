import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'autoimpiego-100-guard',
      fn: async () => {
        const turn = await collectTurn({ message: 'Autoimpiego Centro-Nord copre tutto al 100%?' });
        assert(includesAny(turn.text, ['autoimpiego centro-nord']), 'Risposta non ancorata ad ACN');
        assert(includesAny(turn.text, ['100%']), 'Manca riferimento al 100%');
        assert(includesAny(turn.text, ['non', 'dipende', 'non tutte']), 'Manca guardrail su copertura non totale');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
