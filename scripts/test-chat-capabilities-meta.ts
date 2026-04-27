import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'capabilities-limited-meta',
      fn: async () => {
        const turn = await collectTurn({ message: 'cosa puoi fare e su quali bandi aiuti?' });
        assert(
          includesAny(turn.text, ['resto al sud 2.0', 'autoimpiego centro-nord']),
          'Manca perimetro capability limited sui due bandi',
        );
        assert(includesAny(turn.text, ['verifica requisiti', 'regione']), 'Manca next step operativo');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
