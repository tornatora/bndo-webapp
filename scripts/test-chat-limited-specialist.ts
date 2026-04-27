import { runStreamingChat } from '../lib/ai/conversationOrchestrator';
import type { UserProfile } from '../lib/conversation/types';
import { LIMITED_CHAT_SCOPE_NOTICE } from '../shared/config';

type StreamResult = {
  text: string;
  metadata: Record<string, unknown> | null;
};

const LIMITED_OPTIONS = {
  limitedSpecialistMode: true,
  allowedMeasures: ['resto-al-sud-20', 'autoimpiego-centro-nord'],
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, snippets: string[]) {
  const normalizedText = normalize(text);
  return snippets.some((snippet) => normalizedText.includes(normalize(snippet)));
}

async function collectTurn(args: {
  message: string;
  profile?: Partial<UserProfile>;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<StreamResult> {
  const chunks: string[] = [];
  let metadata: Record<string, unknown> | null = null;

  for await (const event of runStreamingChat(args.message, args.profile ?? {}, args.history ?? [], LIMITED_OPTIONS)) {
    if (event.type === 'text') chunks.push(String(event.content ?? ''));
    if (event.type === 'metadata') metadata = (event.content ?? null) as Record<string, unknown> | null;
    if (event.type === 'error') throw new Error(String(event.content ?? 'stream error'));
  }

  return {
    text: chunks.join('').replace(/\s+/g, ' ').trim(),
    metadata,
  };
}

async function run() {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';

  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const record = (name: string, fn: () => Promise<void>) =>
    fn()
      .then(() => results.push({ name, ok: true }))
      .catch((error) => results.push({ name, ok: false, detail: String((error as Error)?.message ?? error) }));

  await record('scope-enforcement-out-of-scope-bandi', async () => {
    const turn = await collectTurn({ message: 'Mi spieghi Nuova Sabatini per investimenti macchinari?' });
    assert(includesAny(turn.text, [LIMITED_CHAT_SCOPE_NOTICE]), 'Scope notice non presente per domanda fuori scope');
    assert(
      !includesAny(turn.text, ['nuova sabatini finanzia', 'smart&start', 'on tasso zero']),
      'La risposta contiene spiegazioni operative su bandi fuori scope',
    );
  });

  await record('triage-generic-prompt', async () => {
    const turn = await collectTurn({ message: 'Cosa puoi fare?' });
    assert(!includesAny(turn.text, [LIMITED_CHAT_SCOPE_NOTICE]), 'Non deve comparire scope notice su prompt in-scope');
    assert(
      includesAny(turn.text, ['in quale regione', 'regione verra avviata', 'regione verrà avviata']),
      'Non è partita la domanda di triage iniziale sulla regione',
    );
  });

  await record('generic-expenses-question-served', async () => {
    const turn = await collectTurn({ message: 'quali spese sono ammissibili?' });
    assert(turn.text.length > 60, 'Risposta troppo breve/vuota su domanda generica spese ammissibili');
    assert(turn.text.length < 520, 'Risposta troppo prolissa su domanda generica spese ammissibili');
    assert(!includesAny(turn.text, [LIMITED_CHAT_SCOPE_NOTICE]), 'Scope notice non deve comparire su domanda in-scope');
    assert(
      includesAny(turn.text, ['spese', 'non rientrano', 'non ammesse']),
      'Mancano dettagli operativi su spese ammissibili/non ammesse',
    );
    assert(
      includesAny(turn.text, ['verifica requisiti', 'continuiamo qui']),
      'Manca CTA soft finale',
    );
    const questionCount = (turn.text.match(/\?/g) ?? []).length;
    assert(questionCount <= 1, 'La risposta deve avere al massimo una domanda finale');
  });

  await record('service-model-no-self-application', async () => {
    const turn = await collectTurn({ message: 'Come faccio a presentare la domanda su Invitalia?' });
    assert(
      includesAny(turn.text, ['non devi inviare', 'non devi presentare', 'ti guidiamo noi']),
      'Manca il vincolo BNDO (niente invio autonomo su Invitalia)',
    );
    assert(includesAny(turn.text, ['verifica requisiti', 'continuiamo qui']), 'Manca CTA soft finale');
    assert(
      !includesAny(turn.text, ['vai su invitalia', 'accedi al portale invitalia', 'presenta la domanda su invitalia']),
      'La risposta suggerisce ancora invio autonomo su Invitalia',
    );
  });

  await record('deep-qa-resto-100', async () => {
    const turn = await collectTurn({ message: 'Resto al Sud 2.0 è tutto al 100% a fondo perduto?' });
    assert(includesAny(turn.text, ['resto al sud 2.0']), 'Risposta non ancorata a Resto al Sud 2.0');
    assert(includesAny(turn.text, ['voucher', '100%']), 'Mancano dettagli tecnici su voucher/copertura');
    assert(
      includesAny(turn.text, ['non per tutte', 'non su tutte', 'non tutto il progetto', 'non equivale', 'non è sempre al 100', 'dipende']),
      'Manca la spiegazione sulle limitazioni del 100%',
    );
  });

  await record('deep-qa-autoimpiego-territory', async () => {
    const turn = await collectTurn({ message: 'Autoimpiego Centro Nord vale anche per Sicilia e Calabria?' });
    assert(includesAny(turn.text, ['centro e nord']), 'Manca la regola territoriale Centro-Nord');
    assert(includesAny(turn.text, ['resto al sud 2.0']), 'Manca il reindirizzamento corretto a Resto al Sud 2.0');
  });

  await record('memory-multi-turn-no-reset', async () => {
    const history: { role: 'user' | 'assistant'; text: string }[] = [];

    const turn1 = await collectTurn({ message: 'Sono in Lombardia' });
    history.push({ role: 'user', text: 'Sono in Lombardia' }, { role: 'assistant', text: turn1.text });
    const profile1 = (turn1.metadata?.mergedProfile ?? {}) as Partial<UserProfile>;
    assert(includesAny(JSON.stringify(profile1), ['Lombardia']), 'La regione non è stata memorizzata nel profilo');

    const turn2 = await collectTurn({
      message: 'Ho 29 anni',
      profile: profile1,
      history,
    });
    assert(
      !includesAny(turn2.text, ['in quale regione', 'quale regione']),
      'La chat ha perso memoria e richiede di nuovo la regione',
    );
    assert(
      includesAny(turn2.text, ['stato occupazionale', 'disoccupato', 'inoccupato', 'inattivo']),
      'La chat non avanza al passo successivo del triage',
    );
  });

  await record('generic-no-band-context-inference', async () => {
    const turn = await collectTurn({
      message: 'quali spese sono ammissibili?',
      profile: { location: { region: 'Lombardia' } as any },
    });
    assert(
      includesAny(turn.text, ['autoimpiego centro', 'autoimpiego']),
      'Con regione Centro-Nord deve inferire Autoimpiego Centro-Nord nel testo',
    );
  });

  const passed = results.filter((entry) => entry.ok).length;
  const total = results.length;
  const failed = results.filter((entry) => !entry.ok);

  for (const result of results) {
    if (result.ok) {
      console.log(`PASS ${result.name}`);
    } else {
      console.error(`FAIL ${result.name}: ${result.detail}`);
    }
  }

  process.env.OPENAI_API_KEY = originalKey;

  if (failed.length > 0) {
    throw new Error(`test-chat-limited-specialist failed (${passed}/${total} passed)`);
  }

  console.log(`PASS test-chat-limited-specialist (${passed}/${total})`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
