import { postConversationMessage } from './utils/conversationSse.mjs';
const baseUrl = process.env.CONVERSATION_BASE_URL || process.env.SCANNER_BASE_URL || 'http://localhost:3300';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sendMessage(message, state) {
  const response = await postConversationMessage(baseUrl, message, { cookie: state.cookie });
  if (!response.ok) {
    throw new Error(`conversation HTTP ${response.status}: ${response.json?.error ?? 'unknown error'}`);
  }
  state.cookie = response.cookie ?? state.cookie;
  return response.json;
}

async function run() {
  const demonymState = { cookie: null };
  const demonymFirstReply = await sendMessage('Sono un giovane under35 calabrese, cerco fondo perduto', demonymState);
  assert(
    ['fundingGoal', 'activityType'].includes(String(demonymFirstReply.nextQuestionField || '')),
    `demonym readiness flow should ask for fundingGoal/activityType, but got: ${demonymFirstReply.nextQuestionField} (Action: ${demonymFirstReply.action}, Intent: ${demonymFirstReply.mode})`,
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
  assert(
    targetReply.action === 'run_scan' ||
      targetReply.readyToScan === true ||
      ['sector', 'activityType', 'budget', 'fundingGoal'].includes(String(targetReply.nextQuestionField || '')),
    'south youth startup profile should progress to scan or ask a final high-signal clarification',
  );

  console.log(`PASS conversation-readiness against ${baseUrl}`);
}

run().catch((error) => {
  console.error(`FAIL conversation-readiness: ${error.message}`);
  process.exit(1);
});
