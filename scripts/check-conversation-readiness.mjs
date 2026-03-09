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

async function run() {
  const demonymState = { cookie: null };
  const demonymFirstReply = await sendMessage('Sono un giovane under35 calabrese, cerco fondo perduto', demonymState);
  assert(
    demonymFirstReply.nextQuestionField === 'fundingGoal',
    `demonym readiness flow should ask for fundingGoal, but got: ${demonymFirstReply.nextQuestionField} (Action: ${demonymFirstReply.action}, Intent: ${demonymFirstReply.mode})`,
  );
  const demonymSecondReply = await sendMessage('voglio aprire una nuova attività imprenditoriale', demonymState);
  assert(demonymSecondReply.nextQuestionField !== 'location', 'demonym flow should ask location confirmation only once');

  const genericState = { cookie: null };
  await sendMessage('ciao', genericState);
  await sendMessage('voglio un bando', genericState);
  const genericReply = await sendMessage('calabria', genericState);
  assert(genericReply.action !== 'run_scan', 'generic profile should not trigger scan immediately');
  assert(genericReply.needsClarification !== false, 'generic profile should ask clarification');

  const targetState = { cookie: null };
  await sendMessage('voglio aprire una nuova attività imprenditoriale', targetState);
  await sendMessage('calabria', targetState);
  const targetReply = await sendMessage('ho 27 anni e sono disoccupato', targetState);
  assert(targetReply.action === 'run_scan', 'south youth startup profile should trigger scan');

  console.log(`PASS conversation-readiness against ${baseUrl}`);
}

run().catch((error) => {
  console.error(`FAIL conversation-readiness: ${error.message}`);
  process.exit(1);
});
