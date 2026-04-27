import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'resto-sud-100-guard',
      fn: async () => {
        const turn = await collectTurn({ message: 'Resto al Sud 2.0 è tutto al 100% a fondo perduto?' });
        assert(includesAny(turn.text, ['resto al sud 2.0']), 'Risposta non ancorata a RSUD 2.0');
        assert(includesAny(turn.text, ['voucher', '100%']), 'Mancano dettagli su 100% / voucher');
        assert(
          includesAny(turn.text, ['non per tutte', 'non su tutte', 'non tutto il progetto', 'non equivale', 'dipende']),
          'Manca limitazione sul 100%',
        );
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
