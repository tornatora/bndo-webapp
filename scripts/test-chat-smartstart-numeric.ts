import { LIMITED_CHAT_SCOPE_NOTICE } from '../shared/config';
import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'smartstart-out-of-scope',
      fn: async () => {
        const turn = await collectTurn({ message: 'quanto copre Smart&Start in percentuale?' });
        assert(includesAny(turn.text, [LIMITED_CHAT_SCOPE_NOTICE]), 'Manca scope notice su Smart&Start');
        assert(!includesAny(turn.text, ['smart&start finanzia', 'smart&start copre']), 'Spiegazione operativa fuori scope presente');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
