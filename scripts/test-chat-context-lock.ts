import type { UserProfile } from '../lib/conversation/types';
import { assert, collectTurn, includesAny, runCases } from './chat-limited-test-helpers';

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  await runCases([
    {
      name: 'context-lock-triage-progression',
      fn: async () => {
        const history: { role: 'user' | 'assistant'; text: string }[] = [];

        const t1 = await collectTurn({ message: 'Sono in Lombardia' });
        history.push({ role: 'user', text: 'Sono in Lombardia' }, { role: 'assistant', text: t1.text });
        const p1 = (t1.metadata?.mergedProfile ?? {}) as Partial<UserProfile>;

        const t2 = await collectTurn({ message: 'ho 29 anni', history, profile: p1 });
        history.push({ role: 'user', text: 'ho 29 anni' }, { role: 'assistant', text: t2.text });
        const p2 = (t2.metadata?.mergedProfile ?? p1) as Partial<UserProfile>;

        assert(!includesAny(t2.text, ['in quale regione']), 'Ha perso contesto regione al turno 2');
        assert(includesAny(t2.text, ['stato occupazionale', 'disoccupato', 'inoccupato']), 'Non avanza al passo successivo');

        const t3 = await collectTurn({ message: 'sono disoccupato', history, profile: p2 });
        assert(!includesAny(t3.text, ['in quale regione']), 'Reset contesto regione al turno 3');
        assert(!includesAny(t3.text, ['quanti anni hai']), 'Reset contesto età al turno 3');
      },
    },
  ]);

  process.env.OPENAI_API_KEY = originalKey;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
