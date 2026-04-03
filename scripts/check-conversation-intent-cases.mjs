import { postConversationMessage } from './utils/conversationSse.mjs';

const baseUrl = process.env.CONVERSATION_BASE_URL || 'http://127.0.0.1:3300';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

async function sendConversation(message, state) {
  const response = await postConversationMessage(baseUrl, message, { cookie: state.cookie });
  if (!response.ok) {
    throw new Error(`conversation HTTP ${response.status}: ${response.json?.error ?? 'unknown error'}`);
  }
  state.cookie = response.cookie ?? state.cookie;
  return response.json;
}

async function runCase(caseDef) {
  const state = { cookie: null };
  const replies = [];
  for (const message of caseDef.turns) {
    const reply = await sendConversation(message, state).then(r => { console.log(r); return r; });
    replies.push(reply);
  }
  const finalReply = replies[replies.length - 1];
  if (!finalReply) throw new Error(`${caseDef.id}: no replies`);

  for (const check of caseDef.checks) {
    check({ replies, finalReply });
  }
}

const cases = [
  {
    id: 'agri-existing-sicilia-no-stupid-sector-question',
    turns: ['Ho un impresa agricola in Sicilia'],
    checks: [
      ({ finalReply }) => {
        assert(finalReply.userProfile?.businessExists === true, 'expected businessExists=true');
      },
      ({ finalReply }) => {
        const sector = normalizeText(finalReply.userProfile?.sector);
        assert(sector.includes('agricolt'), `expected sector agriculture, got "${finalReply.userProfile?.sector ?? ''}"`);
      },
      ({ finalReply }) => {
        assert(normalizeText(finalReply.userProfile?.location?.region) === 'sicilia', 'expected region Sicilia');
      },
      ({ finalReply }) => {
        const next = String(finalReply.nextQuestionField || '');
        assert(
          ['fundingGoal', 'budget', 'contributionPreference'].includes(next),
          `expected nextQuestionField fundingGoal|budget|contributionPreference, got "${next}"`,
        );
      },
      ({ finalReply }) => {
        const text = normalizeText(finalReply.assistantText);
        assert(!text.includes('in che settore operi'), 'assistant asked redundant sector question');
      },
    ],
  },
  {
    id: 'demonym-confirmation-only-once',
    turns: ['Sono under35 calabrese disoccupato', 'Voglio aprire una nuova attività imprenditoriale'],
    checks: [
      ({ replies }) => {
        const firstField = String(replies[0].nextQuestionField || '');
        assert(
          firstField === 'fundingGoal' || firstField === 'activityType',
          `expected first follow-up fundingGoal/activityType, got ${replies[0].nextQuestionField}`
        );
      },
      ({ finalReply }) => {
        const next = String(finalReply.nextQuestionField || '');
        assert(next !== 'location', `expected location confirmation only once, got nextQuestionField="${next}"`);
      },
    ],
  },
  {
    id: 'south-target-scan-priority-cluster',
    turns: ['Sono under35 calabrese disoccupato', 'Voglio aprire una nuova attività imprenditoriale in Calabria'],
    checks: [
      async ({ finalReply }) => {
        const profile = finalReply.userProfile;
        assert(profile, 'missing userProfile');
        const scanRes = await fetch(`${baseUrl.replace(/\/$/, '')}/api/scan-bandi`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userProfile: {
              location: profile.location ? { region: profile.location.region, municipality: profile.location.municipality } : null,
              region: profile.location?.region,
              businessExists: profile.businessExists,
              age: profile.age,
              ageBand: profile.ageBand,
              employmentStatus: profile.employmentStatus,
              fundingGoal: profile.fundingGoal,
              sector: profile.sector,
              contributionPreference: profile.contributionPreference,
            },
            mode: 'fast',
            channel: 'chat',
            strictness: 'high',
            limit: 10,
          }),
        });
        const scanJson = await scanRes.json();
        assert(scanRes.ok, `scan failed HTTP ${scanRes.status}`);
        const titles = Array.isArray(scanJson.results) ? scanJson.results.map((r) => String(r.title || '')) : [];
        const lower = titles.map(t => t.toLowerCase());
        const idxResto = lower.findIndex(t => t.includes('resto al sud'));
        const idxFusese = lower.findIndex(t => t.includes('fusese') || t.includes('fund for self employment'));
        const idxOn = lower.findIndex(t => t.includes('oltre nuove imprese') || t.includes('nuove imprese a tasso zero'));
        
        assert(idxResto >= 0 && idxFusese >= 0 && idxOn >= 0, `missing strategic cluster: ${titles.join(' | ')}`);
        assert(idxResto <= idxFusese && idxFusese <= idxOn, `unexpected order: ${titles.join(' | ')}`);
      },
    ],
  },
  {
    id: 'no-double-activity-type-question',
    turns: ['Ciao', 'Devo aprire un agriturismo in Calabria'],
    checks: [
      ({ finalReply }) => {
        assert(finalReply.userProfile?.businessExists === false, 'expected businessExists=false for "devo aprire"');
      },
      ({ finalReply }) => {
        const sector = normalizeText(finalReply.userProfile?.sector ?? '');
        assert(sector.includes('agricolt') || sector.includes('turism'), 'expected sector agriculture/tourism from agriturismo');
      },
      ({ replies }) => {
        const activityQuestion = 'attivita e gia operativa o devi ancora costituirla';
        let count = 0;
        for (const r of replies) {
          const t = normalizeText(r?.assistantText ?? '');
          if (t.includes('attivita') && (t.includes('gia operativa') || t.includes('devi ancora costituirla'))) count++;
        }
        assert(count <= 1, 'should not ask "aprire o gia attiva" more than once');
      },
    ],
  },
];

async function run() {
  for (const caseDef of cases) {
    const state = { cookie: null };
    const replies = [];
    for (const message of caseDef.turns) {
      const reply = await sendConversation(message, state).then(r => { console.log(r); return r; });
      replies.push(reply);
    }
    const finalReply = replies[replies.length - 1];
    for (const check of caseDef.checks) {
      await check({ replies, finalReply });
    }
    console.log(`PASS ${caseDef.id}`);
  }
  console.log(`PASS conversation-intent-cases against ${baseUrl}`);
}

run().catch((error) => {
  console.error(`FAIL conversation-intent-cases: ${error.message}`);
  process.exit(1);
});
