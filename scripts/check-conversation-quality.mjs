import { postConversationMessage } from './utils/conversationSse.mjs';

const baseUrl = process.env.CONVERSATION_BASE_URL || process.env.SCANNER_BASE_URL || 'http://localhost:3300';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countQuestions(text) {
  return (text.match(/\?/g) ?? []).length;
}

async function sendMessage(message, state) {
  const response = await postConversationMessage(baseUrl, message, { cookie: state.cookie });
  if (!response.ok) {
    throw new Error(`conversation HTTP ${response.status}: ${response.json?.error ?? 'unknown error'}`);
  }
  state.cookie = response.cookie ?? state.cookie;
  return response.json;
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
    'Sono un giovane under35 calabrese',
    'Voglio aprire una nuova attività imprenditoriale',
  ]);
  const demonymFirst = demonymReplies[0];
  console.log('demonymFirst:', JSON.stringify(demonymFirst, null, 2));
  assert(
    ['fundingGoal', 'activityType'].includes(String(demonymFirst.nextQuestionField || '')),
    'demonym flow should prioritize asking funding goal/activity context instead of filler',
  );
  const demonymSecond = demonymReplies[1];
  assert(demonymSecond?.nextQuestionField !== 'location', 'demonym flow should not ask location repeatedly');

  const profileReplies = await runFlow([
    'ciao',
    'voglio aprire una nuova attivita in calabria nel settore agricolo',
    'ho 27 anni e sono disoccupato',
  ]);

  for (const reply of profileReplies) {
    const assistantText = String(reply.assistantText ?? '');
    assert(assistantText.length <= 460, 'assistant reply too verbose');
    assert(countQuestions(assistantText) <= 2, 'assistant asks too many questions');
  }

  const targetReply = profileReplies[profileReplies.length - 1];
  console.log('targetReply:', JSON.stringify(targetReply, null, 2));
  assert(
    targetReply.action === 'run_scan' ||
      targetReply.readyToScan === true ||
      ['sector', 'activityType', 'budget', 'fundingGoal'].includes(String(targetReply.nextQuestionField || '')),
    'target profile should produce run_scan or a final high-signal clarification',
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
    assert(identicalChain <= 6, 'same question field repeated too many consecutive times');
  }

  const genericLast = genericReplies[genericReplies.length - 1];
  assert(genericLast.action !== 'run_scan', 'generic incomplete profile should not trigger scan action');
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
