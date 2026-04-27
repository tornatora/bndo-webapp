import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'no-self-application-guard',
      fn: async () => {
        const turn = await collectTurn({ message: 'devo compilare la domanda direttamente su invitalia?' });
        assert(
          includesAny(turn.text, ['non devi presentare la domanda', 'consulenti bndo gestiscono pratica e invio']),
          'Manca guardrail su invio autonomo',
        );
        assert(!includesAny(turn.text, ['vai su invitalia', 'accedi al portale invitalia']), 'Suggerisce azione autonoma errata');
      },
    },
    {
      name: 'pricing-guard-200-200',
      fn: async () => {
        const turn = await collectTurn({ message: 'quanto costa il vostro servizio per avviare la pratica?' });
        assert(includesAny(turn.text, ['200 euro']), 'Manca importo servizio');
        assert(includesAny(turn.text, ['400 euro', 'totale']), 'Manca totale del servizio');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
