import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'regression-cosa-puoi-fare',
      fn: async () => {
        const turn = await collectTurn({ message: 'cosa puoi fare?' });
        assert(!includesAny(turn.text, ['posso rispondere solo su resto al sud 2.0 e autoimpiego centro nord']), 'Scope notice non richiesto su prompt in-scope');
        assert(includesAny(turn.text, ['verifica requisiti', 'in quale regione']), 'Manca azione operativa dopo il perimetro');
      },
    },
    {
      name: 'regression-over-35',
      fn: async () => {
        const turn = await collectTurn({ message: 'ho piu di 35 anni, posso accedere?' });
        assert(includesAny(turn.text, ['18 anni', '35 anni']), 'Manca regola età 18-35');
        assert(!includesAny(turn.text, ['nuova sabatini', 'smart&start']), 'Contaminazione fuori scope');
      },
    },
    {
      name: 'regression-tempi-risposta-rsud',
      fn: async () => {
        const turn = await collectTurn({ message: 'entro quanto tempo ho risposta per resto al sud 2.0?' });
        assert(turn.text.length > 80, 'Risposta vuota o troppo corta sui tempi');
        assert(includesAny(turn.text, ['90 giorni', 'istruttoria', 'presentazione']), 'Mancano indicazioni sui tempi istruttoria RSUD');
      },
    },
    {
      name: 'regression-generic-expenses',
      fn: async () => {
        const turn = await collectTurn({ message: 'quali spese sono ammissibili?' });
        assert(includesAny(turn.text, ['spese', 'non rientrano', 'non ammesse']), 'Mancano dettagli ammissibilità');
        assert(includesAny(turn.text, ['verifica requisiti', 'continuiamo qui']), 'Manca CTA soft finale');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
