import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'timing-rsud-istruttoria',
      fn: async () => {
        const turn = await collectTurn({ message: 'entro quanto tempo invitalia risponde su resto al sud 2.0?' });
        assert(includesAny(turn.text, ['90 giorni', 'istruttoria', 'presentazione']), 'Mancano tempi risposta istruttoria');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
