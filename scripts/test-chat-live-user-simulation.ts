import { randomUUID } from 'node:crypto';

type ChatResponse = {
  status: number;
  text: string;
  cookieHeader: string;
  rawEventCount: number;
};

type SingleTurnCase = {
  name: string;
  message: string;
  minLength?: number;
  mustIncludeAny?: string[];
  mustNotIncludeAny?: string[];
};

type MultiTurnStep = {
  message: string;
  minLength?: number;
  mustIncludeAny?: string[];
  mustNotIncludeAny?: string[];
};

type MultiTurnScenario = {
  name: string;
  steps: MultiTurnStep[];
};

const BASE_URL = (process.env.BNDO_CHAT_BASE_URL || 'https://bndo.it').replace(/\/+$/, '');
const ENDPOINT = `${BASE_URL}/api/conversation`;

const OUT_OF_SCOPE_BANDI = ['nuova sabatini', 'smart&start', 'on - oltre nuove imprese a tasso zero'];
const BAD_SELF_APPLICATION_HINTS = [
  'vai su invitalia',
  'accedi al portale invitalia',
  'presenta la domanda su invitalia',
  'compila la domanda su invitalia',
  'inoltra la domanda su invitalia',
];
const BAD_AGE_POLICY_HINTS = [
  'under 56',
  'under 55',
  '56 anni',
  '55 anni',
  '18-56',
  '18 - 56',
  '18–56',
  '18-55',
  '18 - 55',
  '18–55',
  'fino a 56',
  'fino a 55',
];

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

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function parseTextFromSse(payload: string) {
  const lines = payload.split('\n').map((line) => line.trim()).filter(Boolean);
  const textChunks: string[] = [];
  let eventCount = 0;

  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      const event = JSON.parse(raw) as { type?: string; content?: string };
      eventCount += 1;
      if (event.type === 'text') {
        textChunks.push(String(event.content ?? ''));
      }
    } catch {
      // ignore malformed event
    }
  }

  return {
    text: textChunks.join('').replace(/\s+/g, ' ').trim(),
    eventCount,
  };
}

function appendCookies(existingCookieHeader: string, setCookieValues: string[]) {
  const jar = new Map<string, string>();

  for (const pair of existingCookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (!name || rest.length === 0) continue;
    jar.set(name.trim(), rest.join('=').trim());
  }

  for (const setCookie of setCookieValues) {
    const cookiePart = setCookie.split(';')[0] ?? '';
    const [name, ...rest] = cookiePart.trim().split('=');
    if (!name || rest.length === 0) continue;
    jar.set(name.trim(), rest.join('=').trim());
  }

  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function sendChatTurn(args: { message: string; cookieHeader?: string; conversationId?: string }): Promise<ChatResponse> {
  const body = {
    message: args.message,
    interactionId: randomUUID().slice(0, 24),
    conversationId: args.conversationId,
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args.cookieHeader ? { cookie: args.cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });

  const headersAny = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof headersAny.getSetCookie === 'function' ? headersAny.getSetCookie() : [];
  const fallbackSingle = response.headers.get('set-cookie');
  if (fallbackSingle) setCookies.push(fallbackSingle);

  const rawPayload = await response.text();
  const parsed = parseTextFromSse(rawPayload);

  return {
    status: response.status,
    text: parsed.text,
    cookieHeader: appendCookies(args.cookieHeader ?? '', setCookies),
    rawEventCount: parsed.eventCount,
  };
}

async function sendTurnWithRetry(args: { message: string; cookieHeader?: string; conversationId?: string; attempts?: number }) {
  const attempts = args.attempts ?? 2;
  let lastError: Error | null = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const out = await sendChatTurn(args);
      if (out.status >= 500) throw new Error(`HTTP ${out.status}`);
      if (!out.text || out.text.length < 8) throw new Error('Risposta vuota o troppo corta');
      return out;
    } catch (error) {
      lastError = error as Error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError ?? new Error('Turn failed');
}

function runResponseAssertions(stepName: string, text: string, rules: {
  minLength?: number;
  mustIncludeAny?: string[];
  mustNotIncludeAny?: string[];
}) {
  const minLength = rules.minLength ?? 50;
  assert(text.length >= minLength, `${stepName}: risposta troppo corta (${text.length})`);
  assert(!includesAny(text, OUT_OF_SCOPE_BANDI), `${stepName}: contaminazione bandi fuori scope`);
  assert(!includesAny(text, BAD_SELF_APPLICATION_HINTS), `${stepName}: istruzione errata su invio autonomo Invitalia`);
  assert(!includesAny(text, BAD_AGE_POLICY_HINTS), `${stepName}: policy età errata (55/56)`);

  if (rules.mustIncludeAny?.length) {
    assert(includesAny(text, rules.mustIncludeAny), `${stepName}: manca contenuto atteso (${rules.mustIncludeAny.join(' | ')})`);
  }
  if (rules.mustNotIncludeAny?.length) {
    assert(!includesAny(text, rules.mustNotIncludeAny), `${stepName}: trovato contenuto vietato (${rules.mustNotIncludeAny.join(' | ')})`);
  }
}

const SINGLE_TURN_CASES: SingleTurnCase[] = [
  {
    name: 'single-01-capabilities',
    message: 'Cosa puoi fare esattamente per me?',
    mustIncludeAny: ['resto al sud 2.0', 'autoimpiego centro-nord'],
  },
  {
    name: 'single-02-over35',
    message: 'Ho 42 anni, posso partecipare?',
    mustIncludeAny: ['18', '35'],
  },
  {
    name: 'single-03-expenses-rsud',
    message: 'Quali spese sono ammissibili su Resto al Sud 2.0?',
    mustIncludeAny: ['spese', 'ammissibili'],
  },
  {
    name: 'single-04-expenses-acn',
    message: 'Autoimpiego centro nord: spese NON ammesse?',
    mustIncludeAny: ['non', 'ammess'],
  },
  {
    name: 'single-05-time-rsud',
    message: 'In quanto tempo arriva una risposta su resto al sud 2.0?',
    mustIncludeAny: ['90', 'istruttoria'],
  },
  {
    name: 'single-06-territory-acn',
    message: 'Sono in Emilia Romagna, rientro in autoimpiego centro nord?',
    mustIncludeAny: ['autoimpiego centro-nord'],
  },
  {
    name: 'single-07-territory-south',
    message: 'Vivo in Puglia, quale dei due bandi è più adatto?',
    mustIncludeAny: ['resto al sud 2.0'],
  },
  {
    name: 'single-07b-calabria-age-policy',
    message: 'Sono in Calabria, come funziona?',
    mustIncludeAny: ['35', 'resto al sud 2.0'],
    mustNotIncludeAny: ['55', '56', 'under 56', 'under 55', '18-55', '18-56'],
  },
  {
    name: 'single-08-pricing-service',
    message: 'Quanto costa BNDO per la pratica?',
    mustIncludeAny: ['200 euro', 'avvio', 'invio'],
  },
  {
    name: 'single-09-no-money',
    message: 'Se non ho soldi per pagare BNDO posso usare il servizio?',
    mustIncludeAny: ['200 euro', 'area riservata'],
  },
  {
    name: 'single-10-out-of-scope-sabatini',
    message: 'Mi spieghi Nuova Sabatini?',
    mustIncludeAny: ['resto al sud 2.0', 'autoimpiego centro-nord'],
  },
  {
    name: 'single-11-out-of-scope-smartstart',
    message: 'Come funziona Smart&Start?',
    mustIncludeAny: ['solo', 'due bandi'],
  },
  {
    name: 'single-12-docs',
    message: 'Che documenti devo preparare prima di partire?',
    mustIncludeAny: ['document', 'onboarding'],
  },
  {
    name: 'single-13-cta-check',
    message: 'Voglio partecipare, dimmi il prossimo passo operativo',
    mustIncludeAny: ['verifica requisiti'],
  },
  {
    name: 'single-14-invitalia-self',
    message: 'Mi conviene fare da solo la domanda su invitalia?',
    mustIncludeAny: ['non devi presentare', 'consulenti bndo'],
  },
  {
    name: 'single-15-ateco',
    message: 'Se ho già una partita iva con ateco da 8 mesi sono fuori?',
    mustIncludeAny: ['ateco'],
  },
  {
    name: 'single-16-naspi',
    message: 'Prendo NASpI, posso accedere?',
    mustIncludeAny: ['naspi'],
  },
  {
    name: 'single-17-cofounder',
    message: 'Se ho 39 anni ma socio 28 anni possiamo fare domanda?',
    mustIncludeAny: ['socio', 'requisit'],
  },
  {
    name: 'single-18-investment',
    message: 'Con investimento di 140mila euro quale mi consigli?',
    mustIncludeAny: ['invest', 'requisit'],
  },
  {
    name: 'single-19-generic-help',
    message: 'Non so da dove iniziare',
    mustIncludeAny: ['regione', 'verifica requisiti'],
  },
  {
    name: 'single-20-blank-guard',
    message: 'ciao',
    minLength: 15,
  },
  {
    name: 'single-21-female-young',
    message: 'Donna 27 anni, disoccupata, vivo a Milano: cosa posso fare?',
    mustIncludeAny: ['autoimpiego centro-nord', 'verifica requisiti'],
  },
  {
    name: 'single-22-south-young',
    message: 'Uomo 24 anni in Campania, progetto food delivery: che bando?',
    mustIncludeAny: ['resto al sud 2.0'],
  },
  {
    name: 'single-23-legal-form',
    message: 'Meglio ditta individuale o srls?',
    mustIncludeAny: ['forma', 'domanda'],
  },
  {
    name: 'single-24-timing-start',
    message: 'Posso iniziare l’attività prima della domanda?',
    mustIncludeAny: ['domanda', 'ammiss'],
  },
  {
    name: 'single-25-pmi-question',
    message: 'Sono già impresa attiva da 2 anni, posso usare questi bandi?',
    mustIncludeAny: ['requisit', 'beneficiar'],
  },
];

const MULTI_TURN_SCENARIOS: MultiTurnScenario[] = [
  {
    name: 'multi-01-triage-progression-lazio',
    steps: [
      { message: 'Cosa puoi fare per me?', mustIncludeAny: ['resto al sud 2.0', 'autoimpiego centro-nord'] },
      { message: 'Vivo nel Lazio', mustIncludeAny: ['anni', 'stato occupazionale'], mustNotIncludeAny: ['in quale regione'] },
      { message: 'Ho 29 anni', mustIncludeAny: ['stato occupazionale', 'disoccup'] },
      { message: 'Sono disoccupato da 7 mesi', mustIncludeAny: ['forma', 'ateco', 'invest'] },
      { message: 'Voglio procedere', mustIncludeAny: ['verifica requisiti', 'bndo'] },
    ],
  },
  {
    name: 'multi-02-triage-progression-puglia',
    steps: [
      { message: 'Vorrei capire se posso fare domanda', mustIncludeAny: ['regione'] },
      { message: 'Puglia', mustIncludeAny: ['anni'] },
      { message: '31 anni', mustIncludeAny: ['stato occupazionale'] },
      { message: 'inoccupato', mustIncludeAny: ['forma', 'attivita', 'ateco'] },
      { message: 'Facciamolo', mustIncludeAny: ['resto al sud 2.0', 'verifica requisiti'] },
    ],
  },
  {
    name: 'multi-03-context-summary',
    steps: [
      { message: 'Sono in Lombardia', mustIncludeAny: ['anni', 'stato occupazionale'] },
      { message: 'Ho 27 anni e sono disoccupato', mustIncludeAny: ['forma', 'ateco', 'invest'] },
      { message: 'Ateco consulenza IT e investimento 45mila', mustIncludeAny: ['autoimpiego centro-nord'] },
      {
        message: 'Riassumi i miei dati e dimmi il prossimo passo',
        mustIncludeAny: ['lombardia', '27', 'verifica requisiti'],
      },
    ],
  },
  {
    name: 'multi-04-out-of-scope-interruption',
    steps: [
      { message: 'Vivo in Emilia Romagna e ho 30 anni', mustIncludeAny: ['stato occupazionale', 'autoimpiego centro-nord'] },
      { message: 'Ok ma spiegami Smart&Start', mustIncludeAny: ['solo', 'due bandi'] },
      { message: 'Torniamo a noi, sono disoccupato', mustIncludeAny: ['forma', 'ateco', 'invest'] },
      { message: 'Prossimo passo?', mustIncludeAny: ['verifica requisiti'] },
    ],
  },
  {
    name: 'multi-05-pricing-and-flow',
    steps: [
      { message: 'Posso fare tutto da solo su Invitalia?', mustIncludeAny: ['non devi presentare', 'consulenti bndo'] },
      { message: 'Quanto pago?', mustIncludeAny: ['200 euro', 'avvio', 'invio'] },
      { message: 'Ok voglio partire', mustIncludeAny: ['verifica requisiti'] },
    ],
  },
  {
    name: 'multi-06-memory-no-repeat-region',
    steps: [
      { message: 'Sono in Toscana', mustIncludeAny: ['anni', 'età', 'eta'] },
      { message: 'Ho 34 anni', mustIncludeAny: ['stato occupazionale'] },
      { message: 'Disoccupato', mustIncludeAny: ['forma', 'ateco', 'invest'], mustNotIncludeAny: ['in quale regione'] },
      { message: 'SRLS, attività estetica, 60k', mustIncludeAny: ['autoimpiego centro-nord', 'verifica requisiti'] },
    ],
  },
  {
    name: 'multi-07-age-over-limit-case',
    steps: [
      { message: 'Ho 43 anni in Lazio', mustIncludeAny: ['35', 'socio', 'assetto societario'] },
      { message: 'Posso coinvolgere mia sorella di 30 anni', mustIncludeAny: ['requisit', 'verifica requisiti'] },
      { message: 'Come procediamo adesso?', mustIncludeAny: ['verifica requisiti', 'bndo'] },
    ],
  },
  {
    name: 'multi-08-deep-expenses-followup',
    steps: [
      { message: 'Spese ammissibili?', mustIncludeAny: ['ammissibili', 'non ammesse'] },
      { message: 'E software + consulenze tecniche?', mustIncludeAny: ['software', 'consulenz'] },
      { message: 'E personale dipendente?', mustIncludeAny: ['personale', 'non ammess'] },
      { message: 'Ok voglio candidarmi', mustIncludeAny: ['verifica requisiti'] },
    ],
  },
];

async function runSingleTurnSuite() {
  const failures: string[] = [];
  let passed = 0;

  for (const testCase of SINGLE_TURN_CASES) {
    try {
      const response = await sendTurnWithRetry({ message: testCase.message, conversationId: randomUUID() });
      assert(response.status === 200, `${testCase.name}: HTTP ${response.status}`);
      assert(response.rawEventCount > 0, `${testCase.name}: stream eventi vuoto`);
      runResponseAssertions(testCase.name, response.text, {
        minLength: testCase.minLength,
        mustIncludeAny: testCase.mustIncludeAny,
        mustNotIncludeAny: testCase.mustNotIncludeAny,
      });
      passed += 1;
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      const detail = `${testCase.name}: ${String((error as Error)?.message ?? error)}`;
      failures.push(detail);
      console.error(`FAIL ${detail}`);
    }
  }

  return { passed, total: SINGLE_TURN_CASES.length, failures };
}

async function runMultiTurnSuite() {
  const failures: string[] = [];
  let passed = 0;

  for (const scenario of MULTI_TURN_SCENARIOS) {
    let cookieHeader = '';
    const conversationId = randomUUID();

    try {
      for (let i = 0; i < scenario.steps.length; i += 1) {
        const step = scenario.steps[i]!;
        const response = await sendTurnWithRetry({
          message: step.message,
          cookieHeader,
          conversationId,
          attempts: 3,
        });

        cookieHeader = response.cookieHeader;
        assert(response.status === 200, `${scenario.name}/step-${i + 1}: HTTP ${response.status}`);
        assert(response.rawEventCount > 0, `${scenario.name}/step-${i + 1}: stream eventi vuoto`);
        runResponseAssertions(`${scenario.name}/step-${i + 1}`, response.text, {
          minLength: step.minLength,
          mustIncludeAny: step.mustIncludeAny,
          mustNotIncludeAny: step.mustNotIncludeAny,
        });
      }

      passed += 1;
      console.log(`PASS ${scenario.name}`);
    } catch (error) {
      const detail = `${scenario.name}: ${String((error as Error)?.message ?? error)}`;
      failures.push(detail);
      console.error(`FAIL ${detail}`);
    }
  }

  return { passed, total: MULTI_TURN_SCENARIOS.length, failures };
}

async function run() {
  console.log(`Running live simulation against: ${ENDPOINT}`);

  const single = await runSingleTurnSuite();
  const multi = await runMultiTurnSuite();

  const totalPassed = single.passed + multi.passed;
  const total = single.total + multi.total;
  const allFailures = [...single.failures, ...multi.failures];

  console.log(`\nSUMMARY: ${totalPassed}/${total} suites passed`);
  if (allFailures.length > 0) {
    console.error('FAILED CASES:');
    for (const failure of allFailures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('PASS test-chat-live-user-simulation');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
