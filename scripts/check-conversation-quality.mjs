const baseUrl = process.env.CONVERSATION_BASE_URL || process.env.SCANNER_BASE_URL || 'http://localhost:3300';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCookieHeader(setCookieRaw) {
  if (!setCookieRaw) return null;
  const parts = setCookieRaw.split(/,(?=[^;]+=[^;]+)/g);
  for (const part of parts) {
    const token = part.split(';', 1)[0]?.trim();
    if (!token) continue;
    if (token.startsWith('bndo_assistant_session=')) return token;
  }
  return null;
}

function countQuestions(text) {
  return (text.match(/\?/g) ?? []).length;
}

async function sendMessage(message, state) {
  const headers = { 'content-type': 'application/json' };
  if (state.cookie) headers.cookie = state.cookie;
  const response = await fetch(`${baseUrl}/api/conversation`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`conversation HTTP ${response.status}: ${json?.error ?? 'unknown error'}`);
  }
  const setCookie = parseCookieHeader(response.headers.get('set-cookie'));
  if (setCookie) state.cookie = setCookie;
  return json;
}

async function runFlow(messages) {
  const state = { cookie: null };
  const replies = [];
  for (const message of messages) {
    const reply = await sendMessage(message, state);
    replies.push(reply);
  }
  return replies;
}

async function run() {
  const demonymReplies = await runFlow([
    'Sono un giovane under35 calabrese, cerco fondo perduto',
    'Voglio aprire una nuova attività imprenditoriale',
  ]);
  const demonymLast = demonymReplies[demonymReplies.length - 1];
  const demonymText = String(demonymLast.assistantText ?? '').toLowerCase();
  assert(
    demonymText.includes('calabria') && (demonymText.includes('vuoi avviare') || demonymText.includes('in un altra regione')),
    'demonym flow should ask contextual region confirmation',
  );

  const profileReplies = await runFlow([
    'ciao',
    'voglio aprire una nuova attivita in calabria',
    'ho 27 anni e sono disoccupato',
  ]);

  for (const reply of profileReplies) {
    const assistantText = String(reply.assistantText ?? '');
    assert(assistantText.length <= 230, 'assistant reply too verbose');
    assert(countQuestions(assistantText) <= 1, 'assistant asks more than one question');
  }

  const targetReply = profileReplies[profileReplies.length - 1];
  assert(targetReply.readyToScan === true, 'target profile should be scan-ready');
  assert(
    targetReply.scanReadinessReason === 'ready' || targetReply.scanReadinessReason === undefined,
    'scanReadinessReason should be ready for target profile',
  );

  const genericReplies = await runFlow(['ciao', 'voglio un bando', 'ok', 'ok']);
  const askedFields = genericReplies
    .map((entry) => entry.nextQuestionField ?? null)
    .filter((field) => typeof field === 'string');

  let identicalChain = 1;
  for (let i = 1; i < askedFields.length; i += 1) {
    if (askedFields[i] === askedFields[i - 1]) {
      identicalChain += 1;
    } else {
      identicalChain = 1;
    }
    assert(identicalChain <= 2, 'same question field repeated too many consecutive times');
  }

  const genericLast = genericReplies[genericReplies.length - 1];
  assert(genericLast.readyToScan === false, 'generic incomplete profile should not start scan');
  assert(
    String(genericLast.scanReadinessReason ?? '').startsWith('missing:') || genericLast.scanReadinessReason === undefined,
    'generic profile should provide missing readiness reason',
  );

  console.log(`PASS conversation-quality against ${baseUrl}`);
}

run().catch((error) => {
  console.error(`FAIL conversation-quality: ${error.message}`);
  process.exit(1);
});
