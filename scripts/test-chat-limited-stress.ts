import { LIMITED_CHAT_SCOPE_NOTICE } from '../shared/config';
import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

const OUT_OF_SCOPE_TOKENS = ['nuova sabatini', 'smart&start', 'on - oltre nuove imprese'];
const BAD_AGE_POLICY_TOKENS = ['under 56', 'under 55', '56 anni', '55 anni', '18-55', '18-56', 'fino a 55', 'fino a 56'];

function assertNoOutOfScope(text: string) {
  assert(!includesAny(text, OUT_OF_SCOPE_TOKENS), 'Contaminazione fuori scope rilevata');
}

function assertNoOldAgePolicy(text: string) {
  assert(!includesAny(text, BAD_AGE_POLICY_TOKENS), 'Rilevata policy età legacy (55/56) non consentita');
}

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'stress-01-generic-what-can-you-do',
      fn: async () => {
        const turn = await collectTurn({ message: 'cosa puoi fare per me?' });
        assert(includesAny(turn.text, [LIMITED_CHAT_SCOPE_NOTICE]), 'Manca perimetro limitato');
        assert(includesAny(turn.text, ['verifica requisiti', 'quiz']), 'Manca CTA verso verifica requisiti');
      },
    },
    {
      name: 'stress-02-generic-over-35',
      fn: async () => {
        const turn = await collectTurn({ message: 'ho 41 anni, ci sono chance?' });
        assert(turn.text.length > 120, 'Risposta troppo corta su over 35');
        assert(
          includesAny(turn.text, ['maggioranza delle quote', '50% + 1', 'maggioranza della governance', 'amministrazione']),
          'Manca regola societaria esplicita per over 35',
        );
        assertNoOutOfScope(turn.text);
        assertNoOldAgePolicy(turn.text);
      },
    },
    {
      name: 'stress-02b-calabria-no-legacy-age',
      fn: async () => {
        const turn = await collectTurn({ message: 'sono in Calabria, posso partecipare?' });
        assert(includesAny(turn.text, ['35', 'resto al sud 2.0']), 'Manca policy corretta o misura coerente');
        assertNoOldAgePolicy(turn.text);
      },
    },
    {
      name: 'stress-03-expenses-generic',
      fn: async () => {
        const turn = await collectTurn({ message: 'spese ammissibili in breve?' });
        assert(includesAny(turn.text, ['spese ammissibili', 'spese non ammesse']), 'Mancano regole spese');
        assert(includesAny(turn.text, ['resto al sud 2.0', 'autoimpiego centro-nord']), 'Manca doppio perimetro');
      },
    },
    {
      name: 'stress-04-pricing-hard-guard',
      fn: async () => {
        const turn = await collectTurn({ message: 'quanto costa BNDO per avviare e inviare la pratica?' });
        assert(includesAny(turn.text, ['200 euro', 'avvio pratica', 'invio pratica']), 'Manca pricing 200+200');
      },
    },
    {
      name: 'stress-05-out-of-scope-sabatini',
      fn: async () => {
        const turn = await collectTurn({ message: 'parlami della nuova sabatini' });
        assert(includesAny(turn.text, [LIMITED_CHAT_SCOPE_NOTICE]), 'Manca risposta scope su sabatini');
        assertNoOutOfScope(turn.text);
      },
    },
    {
      name: 'stress-06-time-to-response-rsud',
      fn: async () => {
        const turn = await collectTurn({ message: 'entro quanto arriva risposta per resto al sud 2.0?' });
        assert(includesAny(turn.text, ['90 giorni', 'istruttoria', 'invitalia']), 'Mancano tempi RSUD');
      },
    },
    {
      name: 'stress-07-acn-geography',
      fn: async () => {
        const turn = await collectTurn({ message: 'sono in Lazio, posso fare autoimpiego centro nord?' });
        assert(includesAny(turn.text, ['autoimpiego centro-nord', 'invitalia']), 'Manca dominio ACN');
        assert(turn.text.length > 100, 'Risposta troppo corta su ACN');
      },
    },
    {
      name: 'stress-08-naspi',
      fn: async () => {
        const turn = await collectTurn({ message: 'perdo la naspi se apro con resto al sud 2.0?' });
        assert(turn.text.length > 80, 'Risposta troppo corta su NASpI');
        assertNoOutOfScope(turn.text);
      },
    },
    {
      name: 'stress-09-ateco-broad',
      fn: async () => {
        const turn = await collectTurn({ message: 'ho gia ateco aperto da 7 mesi, sono fuori?' });
        assert(turn.text.length > 80, 'Risposta troppo corta su vincoli ATECO');
        assertNoOutOfScope(turn.text);
      },
    },
    {
      name: 'stress-10-empty-response-guard',
      fn: async () => {
        const turn = await collectTurn({ message: 'ciao' });
        assert(turn.textChunks > 0, 'Nessun chunk testuale (rischio risposta bianca)');
        assert(turn.text.length > 10, 'Risposta vuota/bianca');
      },
    },
    {
      name: 'stress-11-memory-multi-turn',
      fn: async () => {
        const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];

        const first = await collectTurn({ message: 'ho 29 anni e vivo in puglia', history });
        history.push({ role: 'user', text: 'ho 29 anni e vivo in puglia' });
        history.push({ role: 'assistant', text: first.text });

        const second = await collectTurn({ message: 'sono disoccupato da 5 mesi', history });
        history.push({ role: 'user', text: 'sono disoccupato da 5 mesi' });
        history.push({ role: 'assistant', text: second.text });

        const third = await collectTurn({ message: 'allora quale bando devo fare e cosa preparo?', history });
        assert(third.text.length > 120, 'Risposta finale troppo corta');
        assert(includesAny(third.text, ['resto al sud 2.0', 'autoimpiego centro-nord', 'verifica requisiti']), 'Manca instradamento finale');
        assertNoOutOfScope(third.text);
      },
    },
    {
      name: 'stress-12-no-invitalia-self-filing',
      fn: async () => {
        const turn = await collectTurn({ message: 'mi aiuti a compilare io da solo la domanda su invitalia?' });
        assert(!includesAny(turn.text, ['compila tu da solo su invitalia', 'presenta autonomamente']), 'Messaggio non coerente col servizio BNDO');
        assert(includesAny(turn.text, ['bndo', 'verifica requisiti']), 'Manca posizionamento servizio BNDO');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
