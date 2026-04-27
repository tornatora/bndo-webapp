import { LIMITED_CHAT_SCOPE_NOTICE } from '../shared/config';
import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'non-empty-response-generic-expenses',
      fn: async () => {
        const turn = await collectTurn({ message: 'quali spese sono ammissibili?' });
        assert(turn.textChunks > 0, 'Nessun chunk testuale emesso (risposta bianca)');
        assert(turn.text.length > 120, 'Risposta troppo corta su spese ammissibili');
      },
    },
    {
      name: 'scope-guard-out-of-scope-measure',
      fn: async () => {
        const turn = await collectTurn({ message: 'mi spieghi Nuova Sabatini?' });
        assert(includesAny(turn.text, [LIMITED_CHAT_SCOPE_NOTICE]), 'Manca scope notice su misura fuori dominio');
        assert(!includesAny(turn.text, ['nuova sabatini finanzia', 'smart&start']), 'Sono presenti dettagli operativi fuori scope');
      },
    },
    {
      name: 'no-self-application-on-invitalia',
      fn: async () => {
        const turn = await collectTurn({ message: 'come presento la domanda su invitalia?' });
        assert(
          includesAny(turn.text, ['non devi presentare la domanda', 'consulenti bndo gestiscono pratica e invio']),
          'Manca il guardrail BNDO su invio pratica',
        );
      },
    },
    {
      name: 'pricing-service-guard',
      fn: async () => {
        const turn = await collectTurn({ message: 'se non ho soldi per pagare la pratica bndo posso usare il servizio?' });
        assert(includesAny(turn.text, ['200 euro', '400 euro']), 'Manca policy prezzo 200+200');
        assert(!includesAny(turn.text, ['puoi usarlo anche se non hai soldi']), 'Risposta permissiva errata sul pagamento');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
