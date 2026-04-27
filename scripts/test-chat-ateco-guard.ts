import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'ateco-lock-rule-rsud',
      fn: async () => {
        const turn = await collectTurn({ message: 'su resto al sud 2.0 se ho già avuto stesso ateco nei 6 mesi?' });
        assert(includesAny(turn.text, ['ateco', '6 mesi']), 'Manca regola ATECO/6 mesi');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
