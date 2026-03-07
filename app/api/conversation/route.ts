import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { addAIFallbackUsage, addPaidAIUsage, canUsePaidAI } from '@/lib/aiBudget';
import { detectTurnIntent, normalizeForMatch } from '@/lib/conversation/intentRouter';
import { nextBestFieldFromStep, naturalBridgeQuestion, questionFor } from '@/lib/conversation/questionPlanner';
import { emptyProfileMemory, getChangedFields, markProfileFields, summarizeProfileForPrompt } from '@/lib/conversation/profileMemory';
import { findClosestSimilarReply } from '@/lib/conversation/repetitionGuard';
import { composeAssistantReply } from '@/lib/conversation/responseComposer';
import { applyTonePolicy } from '@/lib/conversation/tonePolicy';
import { isMeasureUpdateQuestion, resolveMeasureUpdateReply } from '@/lib/knowledge/measureStatus';
import { answerFaq, buildKnowledgeContext as buildKnowledgeContextFromRules } from '@/lib/knowledge/regoleBandi';
import { normalizeProfileInput } from '@/lib/matching/profileNormalizer';
import { profileCompletenessScore } from '@/lib/matching/refineQuestion';
import { checkRateLimit } from '@/lib/security/rateLimit';
import type { ContributionPreference, ConversationMode, NextBestField, Session, Step, UserProfile } from '@/lib/conversation/types';

export const runtime = 'nodejs';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const AI_CHAT_V2_ENABLED = process.env.AI_CHAT_V2?.trim() !== 'false';
const CHAT_DETERMINISTIC_V3 = process.env.CHAT_DETERMINISTIC_V3?.trim() !== 'false';

const COOKIE_NAME = 'bndo_assistant_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

const payloadSchema = z.object({
  message: z.string().min(1).max(1200)
});

function inferMode(args: {
  handoffRequested: boolean;
  shouldScanNow: boolean;
  qaModeActive: boolean;
}): ConversationMode {
  if (args.handoffRequested) return 'handoff';
  if (args.shouldScanNow) return 'scan_ready';
  if (args.qaModeActive) return 'qa';
  return 'profiling';
}

function inferConfidence(args: {
  aiSource: 'openai' | 'disabled' | 'budget' | 'error' | null;
  hasErrorPrompt?: boolean;
  needsClarification?: boolean;
}) {
  const { aiSource, hasErrorPrompt, needsClarification } = args;
  if (hasErrorPrompt) return 0.62;
  if (aiSource === 'openai') return needsClarification ? 0.83 : 0.9;
  if (aiSource === 'budget') return needsClarification ? 0.72 : 0.79;
  if (aiSource === 'error') return needsClarification ? 0.68 : 0.75;
  return needsClarification ? 0.7 : 0.78;
}

function withConversationMeta(args: {
  userProfile: UserProfile;
  step: Step;
  assistantText: string;
  readyToScan: boolean;
  mode: ConversationMode;
  aiSource: 'openai' | 'disabled' | 'budget' | 'error' | null;
  needsClarification: boolean;
  hasErrorPrompt?: boolean;
  nextQuestionField?: NextBestField | null;
  profileCompletenessScore?: number;
  scanReadinessReason?: string;
  questionReasonCode?: string;
}) {
  const nextBestField: NextBestField | null =
    typeof args.nextQuestionField !== 'undefined' ? args.nextQuestionField : nextBestFieldFromStep(args.step);
  return {
    userProfile: args.userProfile,
    step: args.step,
    assistantText: args.assistantText,
    readyToScan: args.readyToScan,
    mode: args.mode,
    nextBestField,
    nextQuestionField: nextBestField,
    aiSource: args.aiSource,
    assistantConfidence: inferConfidence({
      aiSource: args.aiSource,
      hasErrorPrompt: args.hasErrorPrompt,
      needsClarification: args.needsClarification
    }),
    needsClarification: args.needsClarification,
    profileCompletenessScore: args.profileCompletenessScore,
    scanReadinessReason: args.scanReadinessReason ?? (args.readyToScan ? 'ready' : undefined),
    questionReasonCode: args.questionReasonCode ?? args.scanReadinessReason ?? (args.readyToScan ? 'ready' : undefined),
  };
}

function extractOpenAIText(json: any): string | null {
  try {
    if (typeof json?.output_text === 'string' && json.output_text.trim()) {
      return json.output_text.trim();
    }
    const out = json?.output;
    if (!Array.isArray(out)) return null;
    const parts: string[] = [];
    for (const item of out) {
      if (!item || item.type !== 'message' || item.role !== 'assistant') continue;
      const content = item.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
      }
    }
    const text = parts.join('').trim();
    return text ? text : null;
  } catch {
    return null;
  }
}

function extractUsageTokens(json: any): { input: number; output: number } {
  const input =
    Number(json?.usage?.input_tokens) ||
    Number(json?.usage?.prompt_tokens) ||
    Number(json?.usage?.total_input_tokens) ||
    0;
  const output =
    Number(json?.usage?.output_tokens) ||
    Number(json?.usage?.completion_tokens) ||
    Number(json?.usage?.total_output_tokens) ||
    0;
  return {
    input: Number.isFinite(input) ? Math.max(0, Math.floor(input)) : 0,
    output: Number.isFinite(output) ? Math.max(0, Math.floor(output)) : 0
  };
}

function cleanupAssistantText(text: string) {
  return text
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripRepeatedAssistantIntro(text: string) {
  const intro = /^ciao,\s*sono\s+il\s+tuo\s+assistente\s+bndo\.\s*/i;
  return text.replace(intro, '').trim();
}

function tokenizeForSimilarity(value: string) {
  return normalizeForMatch(value)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function isEchoSentence(sentence: string, userMessage: string) {
  const sNorm = normalizeForMatch(sentence);
  const uNorm = normalizeForMatch(userMessage);
  if (!sNorm || !uNorm) return false;
  if (sNorm === uNorm) return true;

  const echoPrefixes = [
    'hai scritto',
    'mi hai detto',
    'ok hai scritto',
    'perfetto hai scritto',
    'stai cercando',
    'quindi cerchi',
    'ho capito che'
  ];
  if (echoPrefixes.some((prefix) => sNorm.startsWith(prefix))) return true;

  if (uNorm.length >= 18 && sNorm.includes(uNorm)) return true;

  const userTokens = new Set(tokenizeForSimilarity(userMessage));
  const sentenceTokens = tokenizeForSimilarity(sentence);
  if (!userTokens.size || !sentenceTokens.length) return false;

  const overlapCount = sentenceTokens.filter((token) => userTokens.has(token)).length;
  const overlapRatio = overlapCount / sentenceTokens.length;
  if (overlapRatio >= 0.78 && sentenceTokens.length <= Math.max(8, userTokens.size + 2)) return true;
  if (overlapCount >= 3 && overlapRatio >= 0.3 && sentenceTokens.length <= 14) return true;

  return false;
}

function stripUserEchoFromReply(reply: string, userMessage: string) {
  if (!reply || !userMessage) return reply;
  const sentences = reply
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!sentences.length) return reply;

  const filtered = sentences.filter((sentence, index) => {
    const echo = isEchoSentence(sentence, userMessage);
    if (!echo) return true;
    // Remove echo sentences, especially at the beginning where they feel robotic.
    return index > 0 && sentence.length > 90;
  });
  if (!filtered.length) return reply;
  return filtered.join(' ').trim();
}

function enforceQaModeReply(text: string) {
  const n0 = normalizeForMatch(text);
  if (n0.includes('dimmi pure la domanda') || n0.includes('dimmi pure la prima domanda')) return text.trim();

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const hasNudge = (s: string) => {
    const n = normalizeForMatch(s);
    const hasProfilingQuestion =
      s.includes('?') &&
      /(region|attivit|costitu|ateco|settore|budget|import|contribut|finanzia|spesa|invest|dipendent|addett|mail|telefono)/.test(n);
    return (
      hasProfilingQuestion ||
      n.includes('quando sei pronto') ||
      n.includes('potresti dirmi') ||
      n.includes('puoi dirmi in una frase') ||
      n.includes('dimmi in una riga') ||
      n.includes('cosa vuoi finanziare') ||
      n.includes('quale la spesa principale') ||
      n.includes('qual e la spesa principale') ||
      n.includes('vorresti finanziare') ||
      n.includes('chiedere fondi') ||
      n.includes('obiettivo concreto') ||
      n.includes('investimento specifico') ||
      n.includes('hai in mente un investimento') ||
      n.includes('in che regione') ||
      n.includes('per capire meglio') ||
      n.includes('hai gia un attivita') ||
      n.includes('devi costituirla') ||
      n.includes('ateco') ||
      n.includes('budget') ||
      n.includes('contributo prefer')
    );
  };

  const filtered = sentences.filter((s) => !hasNudge(s));
  const core = (filtered.length ? filtered : sentences).join(' ').trim();
  if (!core || core.length < 20) return 'Fai pure la tua domanda, ti rispondo in modo concreto.';
  if (/[?]$/.test(core)) return core;
  return core;
}

function enforceConsultantDirectness(
  text: string,
  args: {
    shouldScanNow: boolean;
    questionHint: string | null;
  },
) {
  const { shouldScanNow, questionHint } = args;
  if (!text) return text;

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (shouldScanNow) {
    return 'Perfetto, avvio ora lo scanner BNDO per trovare i bandi più compatibili.';
  }

  const fluffPattern =
    /(se vuoi|quando vuoi|appena vuoi|dimmi pure la prossima domanda|posso affinare|ti aiuto subito|posso aiutarti|fammi sapere|se ti va|quando preferisci|allora|ottimo|perfetto,|in ogni caso)/i;

  const compact = sentences.filter((sentence) => {
    if (!sentence) return false;
    if (fluffPattern.test(sentence) && !sentence.includes('?')) return false;
    return true;
  });

  const finalSentences: string[] = [];
  let hasQuestion = false;
  for (const sentence of compact) {
    const normalized = normalizeForMatch(sentence);
    if (!normalized) continue;
    const isQuestion = sentence.includes('?');
    if (isQuestion && hasQuestion) continue;
    if (isQuestion) hasQuestion = true;
    finalSentences.push(sentence);
    if (finalSentences.length >= 2) break;
  }

  const joinedBeforeHint = finalSentences.join(' ').trim();
  const hasDataRequestPattern = /(dimmi|indicami|mi dai|mi dici|confermi|serve|per filtrare|per capire)/i.test(joinedBeforeHint);
  if (!hasQuestion && questionHint && finalSentences.length < 2 && !hasDataRequestPattern) {
    finalSentences.push(questionHint);
    hasQuestion = questionHint.includes('?');
  }

  const joined = finalSentences.join(' ').trim();
  if (!joined && questionHint) return questionHint;
  if (!joined) return 'Dammi un dettaglio in più e faccio un match preciso.';
  if (joined.length > 170) {
    const short = joined.slice(0, 170);
    const end = Math.max(short.lastIndexOf('.'), short.lastIndexOf('?'), short.lastIndexOf('!'));
    return end >= 70 ? short.slice(0, end + 1).trim() : `${short.replace(/[.,;:\s]+$/g, '').trim()}.`;
  }
  return joined;
}

type AiGenerationResult = {
  text: string | null;
  source: 'openai' | 'disabled' | 'budget' | 'error';
};

async function generateAssistantTextWithOpenAI(args: {
  userMessage: string;
  session: Session;
  profile: UserProfile;
  nextStep: Step;
  recap: string | null;
  attempt: number;
  questionHint: string | null;
  shouldScanNow: boolean;
  scanReady: boolean;
  isGreetingOnly: boolean;
  isFirstTouch: boolean;
  qaMode: boolean;
  questionLike: boolean;
  smallTalk: boolean;
  avoidReply?: string | null;
}): Promise<AiGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { text: null, source: 'disabled' };
  if (!(await canUsePaidAI())) return { text: null, source: 'budget' };

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';

  const {
    userMessage,
    session,
    profile,
    nextStep,
    recap,
    attempt,
    questionHint,
    shouldScanNow,
    scanReady,
    isGreetingOnly,
    isFirstTouch,
    qaMode,
    questionLike,
    smallTalk,
    avoidReply
  } = args;
  const knowledgeContext = buildKnowledgeContextFromRules(userMessage, profile);
  const profileSummary = summarizeProfileForPrompt(profile);
  const lastAssistant = [...(session.recentTurns ?? [])].reverse().find((t) => t.role === 'assistant')?.text ?? null;

  const system = [
    'Sei BNDO: consulente senior di finanza agevolata italiana. Umano con anni di esperienza. Mai AI, mai chatbot, mai assistente virtuale.',
    '',
    'IDENTITA E COMPETENZA:',
    "Conosci finanza agevolata, bandi pubblici, contributi a fondo perduto, finanziamenti agevolati, crediti d'imposta, voucher, Resto al Sud, FUSESE, Nuova Sabatini, ON, Smart&Start Italia.",
    'Quando un dettaglio non conosci o cambia, dici che lo verificherai con lo scanner.',
    'Non inventi mai scadenze, percentuali o condizioni specifiche di bandi.',
    '',
    'TONO E STILE:',
    'Lucido, concreto, veloce a capire. Autorevole ma caldo, mai burocratico. Varia struttura delle frasi e lessico naturalmente.',
    'Niente frasi fisse: no "Come posso aiutarti?", no "Perfetto!", no "Capisco!", no "Fammi sapere...", no "Se vuoi posso...".',
    "Non ripetere quello che ha detto l'utente. Non fare domande a raffica tipo interrogatorio.",
    'Massimo 1-2 frasi per risposta, dirette e operative. Zero markdown, liste, bullet points.',
    '',
    'CONVERSAZIONE:',
    "RISPONDI PRIMA alla domanda/esigenza concreta dell'utente, POI se serve chiedi UN solo dato critico, con naturalezza.",
    'Se i dati sono sufficienti per il matching, avvia lo scanner - non fare piu domande.',
    'Se manca UN solo dato critico, chiedilo naturalmente dopo la risposta.',
    "Se l'utente e confuso, chiarisci senza pedanteria. Se e diretto, sii diretto.",
    'Non ripetere domande gia risposte. Non chiedere dati gia nel profilo.',
    'Se vuole fare domande prima del profiling, rispondi alle sue domande senza forzare i dati nello stesso turno.',
    "Se Q&A mode: non chiedere profiling finche non chiede esplicitamente il matching.",
    "Se il messaggio e meta/conversazionale, evita di ridirigere meccanicamente al form.",
    'Se devi avviare lo scanner, dillo chiaramente in 1 frase sola.',
    'Se hai risposto in modo completo, chiudi anche senza domanda finale.',
    '',
    'ANTI-PATTERN:',
    'No "Ciao, sono il tuo assistente BNDO" dopo il primo saluto.',
    'No ripetizioni di struttura di frase. No tono da modulo/questionario.',
    'Niente filler words o preamboli.',
    '',
    avoidReply ? `ATTENZIONE: Non ripetere questa struttura: ${JSON.stringify(avoidReply)}` : null,
    '',
    'PRIMO MESSAGGIO (saluto puro):',
    "Se isFirstTouch=true e isGreetingOnly=true e messaggio e solo saluto, rispondi ESATTAMENTE:",
    '"Ciao, sono il tuo consulente BNDO. Dimmi in una frase cosa vuoi finanziare e dove operi."',
    '',
    'TUTTI I SUCCESSIVI: vai diritto al merito.'
  ]
    .filter(Boolean)
    .join('\n');

  const missingHint =
    nextStep === 'location'
      ? 'Regione (Comune opzionale)'
      : nextStep === 'activityType'
        ? needsFounderEligibilityData(profile)
          ? 'eta e stato occupazionale del proponente'
          : profile.businessExists === null
            ? 'attivita gia attiva o da costituire'
            : 'tipo di realta (PMI/startup/professionista/ETS)'
        : nextStep === 'fundingGoal'
          ? 'cosa vuoi finanziare (obiettivo concreto)'
          : nextStep === 'ateco'
            ? 'codice ATECO (anche 2 cifre) o descrizione attivita'
            : nextStep === 'sector'
              ? 'settore'
              : nextStep === 'employees'
                ? 'numero addetti'
                : nextStep === 'budget'
                  ? 'budget/investimento indicativo'
                  : nextStep === 'contributionPreference'
                    ? 'preferenza forma contributo'
                    : nextStep === 'contactEmail'
                      ? 'email di contatto'
                      : nextStep === 'contactPhone'
                        ? 'numero di telefono'
                    : 'nessuno';

    const user = [
    `Messaggio utente: ${JSON.stringify(userMessage)}`,
    `Greeting-only: ${isGreetingOnly ? 'si' : 'no'}`,
    `Primo contatto: ${isFirstTouch ? 'si' : 'no'}`,
    `Utente in modalita domande prima del profiling: ${wantsQuestionsFirst(userMessage) ? 'si' : 'no'}`,
    `Q&A mode attiva: ${qaMode ? 'si' : 'no'}`,
    `Messaggio e domanda: ${questionLike ? 'si' : 'no'}`,
    `Messaggio e small-talk: ${smallTalk ? 'si' : 'no'}`,
    '',
    lastAssistant ? `Ultima risposta assistente (non ripeterla): ${lastAssistant}` : null,
    '',
    `Profilo attuale (JSON): ${JSON.stringify(profile)}`,
    profileSummary ? `Profilo sintetico: ${profileSummary}` : null,
    `Step corrente: ${session.step}`,
    `Prossimo step consigliato: ${nextStep} (manca: ${missingHint})`,
    `Tentativo su questo step: ${attempt}`,
    recap ? `Recap breve (se utile): ${recap}` : null,
    questionHint ? `Domanda suggerita: ${questionHint}` : null,
    '',
    knowledgeContext ? `Contesto specialistico BNDO:\n${knowledgeContext}` : null,
    '',
    `Scan ready: ${scanReady ? 'si' : 'no'} | Avvio scan ora: ${shouldScanNow ? 'si' : 'no'}`
  ]
    .filter(Boolean)
    .join('\n');

  const history = (session.recentTurns ?? [])
    .slice(-8)
    .map((t) => `${t.role === 'user' ? 'Utente' : 'Assistente'}: ${t.text}`)
    .join('\n');

  const body = {
    model,
    input: [
      {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: system }]
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: history ? `${user}\n\nContesto recente:\n${history}` : user }]
      }
    ],
    temperature: 0.45,
    max_output_tokens: 180
  } as const;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7500);
    try {
      const res = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return { text: null, source: 'error' };
      const usage = extractUsageTokens(json);
      await addPaidAIUsage(usage.input, usage.output);
      return { text: extractOpenAIText(json), source: 'openai' };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { text: null, source: 'error' };
  }
}

const IT_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto'
] as const;

const REGION_DEMONYM_MAP: Array<{ region: (typeof IT_REGIONS)[number]; tokens: string[] }> = [
  { region: 'Abruzzo', tokens: ['abruzzese', 'abruzzesi'] },
  { region: 'Basilicata', tokens: ['lucano', 'lucana', 'lucani', 'lucane', 'basilicatese', 'basilicatesi'] },
  { region: 'Calabria', tokens: ['calabrese', 'calabresi'] },
  { region: 'Campania', tokens: ['campano', 'campana', 'campani', 'campane'] },
  { region: 'Emilia-Romagna', tokens: ['emiliano', 'emiliana', 'emiliani', 'emiliane', 'romagnolo', 'romagnola', 'romagnoli', 'romagnole'] },
  { region: 'Friuli-Venezia Giulia', tokens: ['friulano', 'friulana', 'friulani', 'friulane', 'giuliano', 'giuliana', 'giuliani', 'giuliane'] },
  { region: 'Lazio', tokens: ['laziale', 'laziali'] },
  { region: 'Liguria', tokens: ['ligure', 'liguri'] },
  { region: 'Lombardia', tokens: ['lombardo', 'lombarda', 'lombardi', 'lombarde'] },
  { region: 'Marche', tokens: ['marchigiano', 'marchigiana', 'marchigiani', 'marchigiane'] },
  { region: 'Molise', tokens: ['molisano', 'molisana', 'molisani', 'molisane'] },
  { region: 'Piemonte', tokens: ['piemontese', 'piemontesi'] },
  { region: 'Puglia', tokens: ['pugliese', 'pugliesi'] },
  { region: 'Sardegna', tokens: ['sardo', 'sarda', 'sardi', 'sarde'] },
  { region: 'Sicilia', tokens: ['siciliano', 'siciliana', 'siciliani', 'siciliane'] },
  { region: 'Toscana', tokens: ['toscano', 'toscana', 'toscani', 'toscane'] },
  { region: 'Trentino-Alto Adige', tokens: ['trentini', 'trentino', 'altoatesino', 'altoatesina', 'sudtirolese', 'sudtirolesi'] },
  { region: 'Umbria', tokens: ['umbro', 'umbra', 'umbri', 'umbre'] },
  { region: "Valle d'Aosta", tokens: ['valdostano', 'valdostana', 'valdostani', 'valdostane'] },
  { region: 'Veneto', tokens: ['veneto', 'veneta', 'veneti', 'venete'] },
];

function emptyProfile(): UserProfile {
  return {
    activityType: null,
    businessExists: null,
    sector: null,
    ateco: null,
    atecoAnswered: false,
    location: { region: null, municipality: null },
    locationNeedsConfirmation: false,
    age: null,
    ageBand: null,
    employmentStatus: null,
    legalForm: null,
    employees: null,
    revenueOrBudgetEUR: null,
    requestedContributionEUR: null,
    budgetAnswered: false,
    fundingGoal: null,
    contributionPreference: null,
    contactEmail: null,
    contactPhone: null,
    slotSource: {}
  };
}

function isProfileEmpty(p: UserProfile) {
  return (
    !p.activityType &&
    p.businessExists === null &&
    !p.sector &&
    !p.ateco &&
    p.atecoAnswered === false &&
    !p.location?.region &&
    !p.location?.municipality &&
    !p.locationNeedsConfirmation &&
    p.age === null &&
    !p.ageBand &&
    !p.employmentStatus &&
    !p.legalForm &&
    p.employees === null &&
    p.revenueOrBudgetEUR === null &&
    p.requestedContributionEUR === null &&
    p.budgetAnswered === false &&
    !p.fundingGoal &&
    !p.contributionPreference &&
    !p.contactEmail &&
    !p.contactPhone &&
    (!p.slotSource || Object.keys(p.slotSource).length === 0)
  );
}

function isGenericFundingGoal(text: string) {
  const n = normalizeForMatch(text);
  if (!n) return true;
  const words = n.split(' ').filter(Boolean);
  if (words.length <= 2) return true;
  if (
    /(cerco fondo perduto|cerco contribut|cerco agevolaz|voglio fondo perduto|voglio contribut|cerco un bando|voglio un bando)/.test(
      n,
    )
  ) {
    return true;
  }

  const generic = [
    'bando',
    'bandi',
    'finanziamento',
    'finanziamenti',
    'contributo',
    'contributi',
    'agevolazione',
    'agevolazioni',
    'fondo perduto',
    'voucher',
    'credito imposta',
    'credito d imposta',
    'incentivo',
    'incentivi'
  ];

  const hasGeneric = generic.some((g) => n.includes(g));
  if (!hasGeneric) return false;

  // If the user also provided specific intent keywords, treat as not generic.
  const specific = [
    'sito',
    'ecommerce',
    'macchin',
    'attrezz',
    'software',
    'digital',
    'ristruttur',
    'capannone',
    'energia',
    'fotovolta',
    'assunz',
    'formaz',
    'export',
    'internaz',
    'brevett',
    'ricerca',
    'sviluppo',
    'marketing',
    'pubblicit',
    'mezzi',
    'veicoli'
  ];
  const hasSpecific = specific.some((s) => n.includes(s));
  if (hasSpecific) return false;

  return words.length <= 12;
}

function hasTopicSignal(profile: UserProfile) {
  const ateco = (profile.ateco ?? '').trim();
  const hasAtecoDigits = /\d{2}/.test(ateco);
  if (hasAtecoDigits) return true;
  if (profile.sector && profile.sector.trim().length >= 3) return true;
  if (profile.fundingGoal && profile.fundingGoal.trim().length >= 6 && !isGenericFundingGoal(profile.fundingGoal)) return true;
  return false;
}

function hasPrecisionSignal(profile: UserProfile) {
  return Boolean(
    profile.budgetAnswered ||
      profile.contributionPreference ||
      profile.atecoAnswered ||
      profile.sector ||
      profile.employees !== null ||
      profile.requestedContributionEUR !== null ||
      ((profile.age !== null || profile.ageBand === 'under35' || profile.ageBand === 'over35') &&
        Boolean(profile.employmentStatus))
  );
}

function hasAgeSignal(profile: UserProfile) {
  return profile.age !== null || profile.ageBand === 'under35' || profile.ageBand === 'over35';
}

function needsFounderEligibilityData(profile: UserProfile) {
  return profile.businessExists === false && (!hasAgeSignal(profile) || !profile.employmentStatus);
}

function hasBusinessContext(profile: UserProfile) {
  return Boolean(profile.activityType?.trim()) || profile.businessExists !== null;
}

const SOUTH_PRIORITY_REGIONS = new Set(['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Molise', 'Puglia', 'Sardegna', 'Sicilia']);

type ScanMissingSignal = 'fundingGoal' | 'location' | 'businessContext' | 'founderEligibility' | 'topicPrecision';
type ScanAdaptiveReadiness = {
  ready: boolean;
  missingSignals: ScanMissingSignal[];
  southYouthStartupPriority: boolean;
};

function isSouthYouthStartupPriorityProfile(profile: UserProfile) {
  if (profile.businessExists !== false) return false;
  const regionRaw = profile.location?.region?.trim() ?? '';
  if (!regionRaw) return false;
  const region = IT_REGIONS.find((entry) => normalizeForMatch(entry) === normalizeForMatch(regionRaw)) ?? regionRaw;
  if (!SOUTH_PRIORITY_REGIONS.has(region)) return false;
  const age = profile.age ?? null;
  const youthByAge = age !== null && age >= 18 && age <= 35;
  const youthByBand = profile.ageBand === 'under35';
  if (!youthByAge && !youthByBand) return false;
  const employmentNorm = normalizeForMatch(profile.employmentStatus ?? '');
  return /(disoccupat|inoccupat|neet|working poor|senza lavoro|non occupat)/.test(employmentNorm);
}

function isScanReadyAdaptive(profile: UserProfile): ScanAdaptiveReadiness {
  const missingSignals: ScanMissingSignal[] = [];
  const southYouthStartupPriority = isSouthYouthStartupPriorityProfile(profile);

  if (!profile.fundingGoal?.trim()) missingSignals.push('fundingGoal');
  if (!profile.location?.region?.trim() || profile.locationNeedsConfirmation) missingSignals.push('location');
  if (!hasBusinessContext(profile)) missingSignals.push('businessContext');
  if (profile.businessExists === false && needsFounderEligibilityData(profile)) missingSignals.push('founderEligibility');

  const hasTopic = hasTopicSignal(profile);
  const hasPrecision = hasPrecisionSignal(profile);
  const goalText = profile.fundingGoal?.trim() ?? '';
  const goalIsGeneric = goalText ? isGenericFundingGoal(goalText) : true;
  if (!hasTopic || (!southYouthStartupPriority && goalIsGeneric && !hasPrecision)) {
    missingSignals.push('topicPrecision');
  }

  return {
    ready: missingSignals.length === 0,
    missingSignals,
    southYouthStartupPriority,
  };
}

function questionForStepWithProfile(step: Step, profile: UserProfile, seed: string, attempt: number) {
  if (step === 'location' && profile.locationNeedsConfirmation && profile.location?.region) {
    return `Perfetto, ho ${profile.location.region} come riferimento. Vuoi avviare l'attività in ${profile.location.region} o in un'altra regione?`;
  }

  if (attempt >= 2) {
    if (step === 'location') return 'Mi basta la regione (es. Calabria) e chiudo il filtro territoriale.';
    if (step === 'sector') return 'Indicami solo il settore principale (es. turismo, commercio, digitale).';
    if (step === 'ateco') return 'Se lo conosci, indicami il codice ATECO (anche 2 cifre).';
    if (step === 'budget') return "Mi dai un importo indicativo dell'investimento o del contributo richiesto?";
    if (step === 'fundingGoal') return 'Qual è la spesa principale che vuoi finanziare?';
    if (step === 'contributionPreference') return 'Preferisci fondo perduto, finanziamento agevolato o misto?';
  }

  if (step === 'activityType' && profile.businessExists === null) {
    return attempt >= 2
      ? "Per continuare mi confermi solo questo: hai gia un'attivita attiva oppure devi costituirla?"
      : "Per filtrare i bandi giusti devo capire se hai gia un'attivita attiva o se devi costituirla.";
  }

  if (step === 'activityType' && needsFounderEligibilityData(profile)) {
    return attempt >= 2
      ? "Per chiudere il check requisiti mi servono entrambi i dati: età (o conferma under35/over35) e stato occupazionale."
      : "Per verificare le misure corrette mi servono due dati: età (anche under35/over35) e stato occupazionale.";
  }

  return questionFor(step, seed, attempt);
}

function getNextStep(profile: UserProfile): Step {
  if (profile.locationNeedsConfirmation && profile.location?.region) return 'location';
  const readiness = isScanReadyAdaptive(profile);
  const hasStrongCoreSignals = Boolean(
    profile.fundingGoal?.trim() &&
      hasBusinessContext(profile) &&
      profile.location?.region &&
      (profile.businessExists !== false || !needsFounderEligibilityData(profile)),
  );
  if (readiness.missingSignals.includes('fundingGoal')) return 'fundingGoal';
  if (readiness.missingSignals.includes('businessContext')) return 'activityType';
  if (readiness.missingSignals.includes('location')) return 'location';
  if (readiness.missingSignals.includes('founderEligibility')) return 'activityType';
  if (readiness.missingSignals.includes('topicPrecision')) {
    if (hasStrongCoreSignals && (profile.sector?.trim() || profile.budgetAnswered || profile.requestedContributionEUR !== null)) {
      return 'ready';
    }
    if (!profile.sector?.trim()) return 'sector';
    if (!profile.budgetAnswered && profile.requestedContributionEUR === null) return 'budget';
    if (hasStrongCoreSignals) return 'ready';
    if (!profile.contributionPreference?.trim()) return 'contributionPreference';
    if (!profile.atecoAnswered) return 'ateco';
    return 'ready';
  }
  return 'ready';
}

function fallbackStepAfterStall(step: Step, profile: UserProfile): Step {
  if (step === 'activityType') {
    if (needsFounderEligibilityData(profile)) return 'activityType';
    if (profile.businessExists === null) {
      if (!profile.location?.region || profile.locationNeedsConfirmation) return 'location';
      if (!profile.fundingGoal) return 'fundingGoal';
      if (!profile.sector) return 'sector';
      return 'budget';
    }
    return 'fundingGoal';
  }
  if (step === 'fundingGoal') {
    if (profile.businessExists === null) return 'activityType';
    if (!profile.location?.region || profile.locationNeedsConfirmation) return 'location';
    if (!profile.sector) return 'sector';
  }
  if (step === 'location') {
    if (profile.businessExists === null) return 'activityType';
    if (needsFounderEligibilityData(profile)) return 'activityType';
    if (!profile.fundingGoal) return 'fundingGoal';
  }
  if (step === 'sector') {
    if (!profile.budgetAnswered && profile.requestedContributionEUR === null) return 'budget';
    if (!profile.contributionPreference) return 'contributionPreference';
  }
  if (step === 'budget') {
    if (!profile.sector) return 'sector';
    if (!profile.contributionPreference) return 'contributionPreference';
  }
  if (step === 'contributionPreference') {
    if (!profile.sector) return 'sector';
    if (!profile.budgetAnswered && profile.requestedContributionEUR === null) return 'budget';
  }
  if (step === 'ateco') {
    if (!profile.sector) return 'sector';
    if (!profile.budgetAnswered && profile.requestedContributionEUR === null) return 'budget';
  }
  return step;
}

function scanReadinessReasonForStep(step: Step, profile: UserProfile): string {
  if (step === 'ready') return 'ready';
  if (step === 'location') return 'missing:location';
  if (step === 'fundingGoal') return 'missing:fundingGoal';
  if (step === 'activityType') {
    return needsFounderEligibilityData(profile) ? 'missing:founderEligibility' : 'missing:businessContext';
  }
  return 'missing:topicPrecision';
}

function readSessionCookie(): Session | null {
  const raw = cookies().get(COOKIE_NAME)?.value ?? null;
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Session;
    if (!parsed?.userProfile) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCookie(session: Session) {
  const json = JSON.stringify(session);
  const value = Buffer.from(json, 'utf8').toString('base64url');
  cookies().set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS
  });
}

function hasCriticalRecapDelta(prev: UserProfile, next: UserProfile) {
  if (normalizeForMatch(prev.location?.region ?? '') !== normalizeForMatch(next.location?.region ?? '')) return true;
  if ((prev.businessExists ?? null) !== (next.businessExists ?? null)) return true;
  if ((prev.age ?? null) !== (next.age ?? null)) return true;
  if (normalizeForMatch(prev.employmentStatus ?? '') !== normalizeForMatch(next.employmentStatus ?? '')) return true;
  return false;
}

function parseEmployees(message: string): number | null {
  const lowered = message.toLowerCase();
  if (/\bsolo io\b|\bda solo\b|\bda sola\b/.test(lowered)) return 1;
  if (/\bnessun\b|\bzero\b/.test(lowered)) return 0;
  const m = lowered.match(/(\d{1,6})/);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 0 || n > 500000) return null;
  return n;
}

function messageMentionsEmployees(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  if (/\b\d{1,6}\b/.test(n) && n.split(' ').length <= 2) return true; // "8" / "10"
  return (
    n.includes('dipendent') ||
    n.includes('addett') ||
    n.includes('personale') ||
    n.includes('collaborator') ||
    n.includes('team') ||
    n.includes('siamo in') ||
    n.includes('siamo') && /\b\d{1,4}\b/.test(n)
  );
}

function parseBusinessExistsFromMessage(message: string): boolean | null {
  const n = normalizeForMatch(message);
  if (!n) return null;

  if (
    /(non ho (una |un )?(impresa|azienda|attivita)|da costituire|da aprire|devo aprire|devo avviare|voglio avviare|vorrei avviare|voglio aprire|vorrei aprire|sto avviando|sto aprendo|nuova attivita|nuova impresa|startup|autoimpiego)/.test(
      n
    )
  ) {
    return false;
  }

  if (
    /(gia attiva|già attiva|gia esistente|già esistente|impresa attiva|azienda attiva|ho gia un attivita|ho partita iva|ho un impresa|ho una impresa|ho un azienda|ho una azienda|abbiamo un impresa|abbiamo una azienda|sono titolare|impresa agricola|azienda agricola)/.test(
      n,
    )
  ) {
    return true;
  }

  return null;
}

function parseAge(message: string): number | null {
  const lowered = message.toLowerCase();
  const match =
    lowered.match(/\bho\s+(\d{2})\s+anni\b/) ??
    lowered.match(/\b(\d{2})\s+anni\b/) ??
    lowered.match(/\beta(?:')?\s*(?:di)?\s*(\d{2})\b/);
  if (!match?.[1]) return null;
  const age = Number.parseInt(match[1], 10);
  if (!Number.isFinite(age) || age < 16 || age > 100) return null;
  return age;
}

function parseAgeBand(message: string): UserProfile['ageBand'] {
  const lowered = normalizeForMatch(message);
  if (!lowered) return null;
  if (/\bunder\s*35\b|\bu35\b|meno di 35|sotto i 35|<\s*35|giovane\b/.test(lowered)) return 'under35';
  if (/\bover\s*35\b|oltre 35|piu di 35|sopra i 35|>\s*35/.test(lowered)) return 'over35';
  return null;
}

function detectRegionByDemonym(message: string): string | null {
  const norm = normalizeForMatch(message);
  if (!norm) return null;
  for (const entry of REGION_DEMONYM_MAP) {
    if (entry.tokens.some((token) => ` ${norm} `.includes(` ${normalizeForMatch(token)} `))) {
      return entry.region;
    }
  }
  return null;
}

type RegionSignal = { region: string; source: 'explicit' | 'demonym' };

function detectRegionSignal(message: string): RegionSignal | null {
  const norm = normalizeForMatch(message);
  for (const r of IT_REGIONS) {
    const rn = normalizeForMatch(r);
    if (` ${norm} `.includes(` ${rn} `)) return { region: r, source: 'explicit' };
  }
  const demonymRegion = detectRegionByDemonym(message);
  if (demonymRegion) return { region: demonymRegion, source: 'demonym' };
  return null;
}

function parseEmploymentStatus(message: string): string | null {
  const n = normalizeForMatch(message);
  if (!n) return null;
  if (/(disoccupat|senza lavoro|non occupat)/.test(n)) return 'disoccupato';
  if (/inoccupat/.test(n)) return 'inoccupato';
  if (/\bneet\b/.test(n)) return 'neet';
  if (/student/.test(n)) return 'studente';
  if (/(occupat|dipendent|lavoro dipendente|a tempo)/.test(n)) return 'occupato';
  if (/(autonom|partita iva|libero professionista)/.test(n)) return 'autonomo';
  return null;
}

function parseLegalForm(message: string): string | null {
  const n = normalizeForMatch(message);
  if (!n) return null;
  if (/\bsrls\b/.test(n)) return 'SRLS';
  if (/\bsrl\b/.test(n)) return 'SRL';
  if (/\bspa\b/.test(n)) return 'SPA';
  if (/\bsnc\b/.test(n)) return 'SNC';
  if (/\bsas\b/.test(n)) return 'SAS';
  if (/\bcooperativ/.test(n)) return 'Cooperativa';
  if (/\bditta individuale\b/.test(n)) return 'Ditta individuale';
  return null;
}

function parseBudgetEUR(message: string): number | null {
  const lowered = message.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!lowered) return null;

  // Ignore ages and similar demographic values ("ho 29 anni").
  if (/\b\d{1,3}\s+anni\b/.test(lowered) || /\beta(?:')?\s*(?:di)?\s*\d{1,3}\b/.test(lowered)) {
    return null;
  }

  // Capture a number with optional decimal and optional multiplier (k/m).
  const m = lowered.match(/(\d+(?:[.,]\d+)?)(?:\s*)(k|m|mila|milioni|milione)?/i);
  if (!m) return null;

  const rawNum = m[1]!.replace(/\./g, '').replace(',', '.'); // 50.000 -> 50000 ; 1,2 -> 1.2
  const base = Number.parseFloat(rawNum);
  if (!Number.isFinite(base) || base < 0) return null;

  const hasBudgetSignal =
    /\b(budget|investiment|spesa|fatturat|ricav|euro|eur|contribut|finanziament|importo|capitale)\b/.test(lowered) ||
    /\b\d+\s*(k|m|mila|milioni|milione)\b/.test(lowered) ||
    (/^\s*\d+(?:[.,]\d+)?\s*$/.test(lowered) && base >= 1000);
  if (!hasBudgetSignal) return null;

  const mult = (m[2] ?? '').toLowerCase();
  if (mult === 'k' || mult === 'mila') return Math.round(base * 1000);
  if (mult === 'm' || mult === 'milione' || mult === 'milioni') return Math.round(base * 1_000_000);
  return Math.round(base);
}

function parseRequestedContributionEUR(message: string): number | null {
  const lowered = message.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!lowered) return null;

  const hasRequestSignal =
    /\b(ho bisogno|mi serve|mi servono|vorrei ottenere|richiedo|richiesta|contributo|agevolazione|fondi)\b/.test(lowered);
  if (!hasRequestSignal) return null;

  return parseBudgetEUR(message);
}

function messageMentionsBudget(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    n.includes('budget') ||
    n.includes('fatturat') ||
    n.includes('ricav') ||
    n.includes('investiment') ||
    n.includes('spesa') ||
    n.includes('euro') ||
    n.includes('eur') ||
    /\b\d+(\s*)k\b/.test(n) ||
    /\b\d+(\s*)m\b/.test(n) ||
    n.includes('mila') ||
    n.includes('milion')
  );
}

function parseRegionAndMunicipality(message: string): { region: string | null; municipality: string | null } {
  const cleaned = message.trim();
  const norm = normalizeForMatch(cleaned);
  const regionSignal = detectRegionSignal(cleaned);
  const explicitRegionHit =
    IT_REGIONS.find((r) => normalizeForMatch(r) === norm) ??
    IT_REGIONS.find((r) => normalizeForMatch(r).includes(norm) || norm.includes(normalizeForMatch(r))) ??
    (regionSignal?.source === 'explicit' ? regionSignal.region : null);
  const demonymRegion = detectRegionByDemonym(cleaned);
  const regionHit =
    explicitRegionHit ??
    demonymRegion ??
    null;

  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
    const a = parts[0] ?? '';
    const b = parts[1] ?? '';
    const aIsRegion = IT_REGIONS.some((r) => normalizeForMatch(r) === normalizeForMatch(a));
    const bIsRegion = IT_REGIONS.some((r) => normalizeForMatch(r) === normalizeForMatch(b));
    if (aIsRegion && b) return { region: a, municipality: b };
    if (bIsRegion && a) return { region: b, municipality: a };
  }

  if (regionHit) return { region: regionHit, municipality: null };
  return { region: null, municipality: null };
}

function detectRegionAnywhere(message: string): string | null {
  return detectRegionSignal(message)?.region ?? null;
}

function userIsStatingOwnLocation(message: string) {
  const n = normalizeForMatch(message);
  // Heuristics: first person + location verbs, or explicit "regione:".
  return (
    n.includes('regione') ||
    n.includes('sono in') ||
    n.includes('siamo in') ||
    n.includes('operiamo in') ||
    n.includes('sede in') ||
    n.includes('ho sede') ||
    n.includes('mi trovo in') ||
    n.includes('mi trovo a') ||
    n.includes('azienda in') ||
    n.includes('attivita in') ||
    Boolean(detectRegionByDemonym(message))
  );
}

function extractAtecoFromMessage(message: string): string | null {
  const raw = message ?? '';
  const norm = normalizeForMatch(raw);
  const hasAtecoKeyword =
    norm.includes('ateco') ||
    norm.includes('codice ateco') ||
    norm.includes('codice attivita') ||
    norm.includes('cod attivita');

  // Prefer codes near the keyword "ateco".
  const idx = norm.indexOf('ateco');
  const window = idx >= 0 ? raw.slice(Math.max(0, idx - 120), Math.min(raw.length, idx + 220)) : raw;
  // Safe extraction:
  // - if user writes a dotted code (es. 62.01), accept it always
  // - if no dotted code, accept short numeric formats only when ATECO is explicitly mentioned
  const dotted = /\b(\d{2})\.(\d{1,2})(?:\.(\d{1,2}))?\b/;
  const m = window.match(dotted) ?? (hasAtecoKeyword ? window.match(/\b(\d{2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\b/) : null);
  if (!m) return null;
  const a = m[1];
  const b = m[2];
  const c = m[3];
  if (a && b && c) return `${a}.${b.padStart(2, '0')}.${c.padStart(2, '0')}`;
  if (a && b) return `${a}.${b.padStart(2, '0')}`;
  return a ?? null;
}

function parseActivityType(message: string): string | null {
  const v = normalizeForMatch(message);
  if (!v) return null;

  if (
    v.includes('costituir') ||
    v.includes('da costituire') ||
    v.includes('non ho attivita') ||
    v.includes('devo aprire') ||
    v.includes('devo avviare') ||
    v.includes('voglio avviare') ||
    v.includes('vorrei avviare') ||
    v.includes('voglio aprire') ||
    v.includes('vorrei aprire') ||
    v.includes('sto avviando') ||
    v.includes('sto aprendo') ||
    v.includes('avviare') ||
    v.includes('aprire attivita') ||
    v.includes('avvio attivita') ||
    v.includes('nuova attivita')
  ) {
    return 'Da costituire';
  }
  if (v.includes('startup')) return 'Startup';
  if (
    /(ho un impresa|ho una impresa|ho un azienda|ho una azienda|abbiamo un impresa|abbiamo una azienda|azienda attiva|impresa attiva|impresa agricola|azienda agricola)/.test(
      v,
    )
  ) {
    return 'PMI';
  }
  if (v.includes('pmi') || v.includes('piccola') || v.includes('media impresa')) return 'PMI';
  if (v.includes('srl') || v.includes('s r l') || v.includes('spa') || v.includes('s p a') || v.includes('snc') || v.includes('s a s')) return 'PMI';
  if (v.includes('professionista') || v.includes('libero professionista') || v.includes('partita iva')) return 'Professionista';
  if (v.includes('associazione') || v.includes('ets') || v.includes('terzo settore') || v.includes('onlus')) return 'ETS/Associazione';
  return null;
}

function extractSectorFromMessage(message: string): string | null {
  const raw = message.trim();
  if (raw.length < 3) return null;

  const m = raw.match(/settore\s*[:\-]?\s*([^\n,;.]{3,80})/i);
  if (m?.[1]) return m[1].trim();

  const n = normalizeForMatch(raw);
  const known = [
    { sector: 'agricoltura', hints: ['agricoltura', 'agricolo', 'agricola', 'agriturismo', 'agroalimentare', 'azienda agricola', 'impresa agricola'] },
    { sector: 'turismo', hints: ['turismo', 'turistica', 'turistico', 'ricettiva', 'ospitalita', 'hotel', 'b&b', 'b and b'] },
    { sector: 'ristorazione', hints: ['ristorazione', 'ristorante', 'bar', 'pizzeria', 'food'] },
    { sector: 'commercio', hints: ['commercio', 'negozio', 'retail', 'ecommerce', 'e commerce'] },
    { sector: 'manifattura', hints: ['manifattura', 'industria', 'produzione', 'fabbrica'] },
    { sector: 'artigianato', hints: ['artigianato', 'artigiano', 'bottega'] },
    { sector: 'edilizia', hints: ['edilizia', 'edile', 'costruzioni', 'cantiere'] },
    { sector: 'pesca', hints: ['pesca', 'ittico', 'acquacoltura'] },
    { sector: 'logistica', hints: ['logistica', 'magazzino', 'supply chain'] },
    { sector: 'trasporti', hints: ['trasporti', 'autotrasporto', 'mobilita'] },
    { sector: 'ICT', hints: ['ict', 'software', 'saas', 'digitale', 'ai', 'intelligenza artificiale', 'cybersecurity'] },
    { sector: 'servizi', hints: ['servizi', 'consulenza', 'professionale'] },
    { sector: 'sanita', hints: ['sanita', 'sanitario', 'medico', 'healthcare'] },
    { sector: 'formazione', hints: ['formazione', 'didattica', 'academy'] },
    { sector: 'cultura', hints: ['cultura', 'museo', 'museale', 'spettacolo'] },
    { sector: 'energia', hints: ['energia', 'energetico', 'fotovoltaico', 'rinnovabile', 'efficientamento'] },
    { sector: 'moda', hints: ['moda', 'fashion', 'abbigliamento'] },
    { sector: 'design', hints: ['design', 'arredo', 'interior'] },
  ];
  for (const entry of known) {
    if (entry.hints.some((hint) => ` ${n} `.includes(` ${normalizeForMatch(hint)} `))) return entry.sector;
  }
  return null;
}

function isAffirmativeConfirmation(message: string): boolean {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return /\b(si|sì|ok|confermo|esatto|corretto|va bene|proprio li|proprio li)\b/.test(n);
}

function extractFundingGoalFromMessage(message: string): string | null {
  const raw = message.trim();
  if (raw.length < 8) return null;
  const n = normalizeForMatch(raw);
  const humanConsultantOnly =
    /\b(consulen|persona|umano|ricontatt|richiam|farmi chiam|telefon|parlare con)\b/.test(n) &&
    !/\b(macchinar|software|digitalizz|attrezzatur|impiant|ristruttur|assunzion|marketing|ecommerce|sito web|negozio|laboratorio|arredi|mezzi)\b/.test(
      n
    );
  if (humanConsultantOnly) return null;
  const triggers = ['voglio', 'vorrei', 'mi serve', 'mi servono', 'devo', 'necessito', 'obiettivo', 'finanziare', 'acquistare'];
  const hit = triggers.find((t) => n.includes(t));
  if (!hit) return null;

  // Take the substring after the first trigger in the raw message (best-effort).
  const idx = n.indexOf(hit);
  if (idx < 0) return null;
  // Approximate mapping from normalized index to raw index: just fallback to raw.
  const after = raw.slice(Math.max(0, raw.toLowerCase().indexOf(hit.split(' ')[0] ?? hit) + (hit.split(' ')[0] ?? hit).length));
  const cleaned = after.replace(/^[:\-–—\s]+/, '').trim();
  if (!cleaned) return null;
  return cleaned.length > 180 ? `${cleaned.slice(0, 180).trim()}…` : cleaned;
}

function hasConcreteObjectiveSignal(message: string): boolean {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return /\b(finanz|invest|acquist|realizz|svilupp|ammodern|digitalizz|ristruttur|espander|assunz|aprire|avviare|avvio|apertura|startup|autoimpiego|fotovolta|macchinar|software|ecommerce|export|internazionalizz)\b/.test(
    n,
  );
}

function isQuestionLike(message: string) {
  const t = message.trim();
  if (!t) return false;
  if (t.includes('?')) return true;
  const n = normalizeForMatch(t);
  return (
    n.startsWith('come ') ||
    n.startsWith('cosa ') ||
    n.startsWith('quali ') ||
    n.startsWith('quanto ') ||
    n.startsWith('quando ') ||
    n.startsWith('posso ') ||
    n.startsWith('mi conviene') ||
    n.includes('differenza tra') ||
    n.includes('che cos') ||
    n.includes('requisiti') ||
    n.includes('spese ammiss') ||
    n.includes('a sportello') ||
    n.includes('de minimis')
  );
}

function isSmallTalkOnly(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  const compact = n.replace(/\s+/g, ' ').trim();
  const small = [
    'ok',
    'okay',
    'va bene',
    'perfetto',
    'bene',
    'grazie',
    'grazie mille',
    'ok grazie',
    'capito',
    'chiaro',
    'ciao',
    'salve'
  ];
  if (small.includes(compact)) return true;
  return compact.length <= 3;
}

function isGreeting(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    n === 'ciao' ||
    n === 'salve' ||
    n.includes('buongiorno') ||
    n.includes('buonasera') ||
    n.includes('buon pomeriggio') ||
    n.includes('hey') ||
    n.includes('ehi')
  );
}

function isConversationalIntent(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    n.includes('possiamo prima parlare') ||
    n.includes('parliamo prima') ||
    n.includes('prima parliamo') ||
    n.includes('spiegami meglio') ||
    n.includes('fammi capire') ||
    n.includes('non ho capito')
  );
}

function wantsQuestionsFirst(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    (n.includes('domand') && (n.includes('prima') || n.includes('qualche'))) ||
    n.includes('parlare prima') ||
    n.includes('prima di tutto')
  );
}

function wantsToProceedToMatching(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    n.includes('procediamo') ||
    n.includes('andiamo avanti') ||
    n.includes('passiamo al matching') ||
    n.includes('facciamo matching') ||
    n.includes('trova bandi') ||
    n.includes('scanner bandi')
  );
}

function wantsHumanConsultant(message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;
  return (
    (n.includes('consulente') && (n.includes('umano') || n.includes('persona') || n.includes('vero'))) ||
    n.includes('parlare con un consulente') ||
    n.includes('voglio parlare con un consulente') ||
    n.includes('farmi chiamare') ||
    n.includes('ricontattare') ||
    n.includes('contatto telefonico')
  );
}

function parseEmail(message: string): string | null {
  const m = message.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m?.[0]?.toLowerCase() ?? null;
}

function normalizePhone(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  v = v.replace(/[^\d+]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  if (!v.startsWith('+') && /^\d+$/.test(v)) {
    // Assume Italian local/international number without +.
    v = v;
  }
  const digitsOnly = v.replace(/\D/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return null;
  if (v.startsWith('+')) return `+${digitsOnly}`;
  return digitsOnly;
}

function parsePhone(message: string): string | null {
  const m = message.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!m?.[1]) return null;
  return normalizePhone(m[1]);
}

function shouldAttemptStepAnswer(step: Step, message: string) {
  const lowered = message.toLowerCase();
  if (!message.trim()) return false;
  if (wantsToProceedToMatching(message)) return false;

  if (step === 'location') return Boolean(parseRegionAndMunicipality(message).region || detectRegionAnywhere(message));
  if (step === 'budget') return Boolean(parseBudgetEUR(message) !== null || /\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/.test(lowered));
  if (step === 'contactEmail') return Boolean(parseEmail(message));
  if (step === 'contactPhone') return Boolean(parsePhone(message));
  if (step === 'activityType') return Boolean(parseActivityType(message));
  if (step === 'fundingGoal') return true;
  if (step === 'sector') return Boolean(extractSectorFromMessage(message));
  if (step === 'ateco') return Boolean(extractAtecoFromMessage(message) || /\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/.test(lowered));
  if (step === 'employees') return Boolean(parseEmployees(message) !== null);
  if (step === 'contributionPreference') return Boolean(parseContributionPreference(message));
  return false;
}

function isExplicitAnswerForStep(step: Step, message: string) {
  const n = normalizeForMatch(message);
  if (!n) return false;

  if (step === 'fundingGoal') {
    if (extractFundingGoalFromMessage(message)) return true;
    return /\b(macchinar|software|digitalizz|attrezzatur|impiant|ristruttur|assunzion|marketing|ecommerce|sito web|negozio|laboratorio|arredi|mezzi)\b/.test(
      n
    );
  }

  return shouldAttemptStepAnswer(step, message);
}

function genericQuestionReply(message: string) {
  const n = normalizeForMatch(message);
  if (!n || (!isQuestionLike(message) && !message.includes('?'))) return null;
  return 'Certo. Ti rispondo in modo pratico su requisiti, tempistiche e scelta del bando più adatto al tuo caso.';
}

function getNextHandoffStep(profile: UserProfile): Step {
  if (!profile.fundingGoal) return 'fundingGoal';
  if (!profile.activityType) return 'activityType';
  if (!profile.location.region) return 'location';
  if (!profile.budgetAnswered) return 'budget';
  if (!profile.contactEmail) return 'contactEmail';
  if (!profile.contactPhone) return 'contactPhone';
  return 'ready';
}

function profileRecap(profile: UserProfile) {
  const bits: string[] = [];
  const r = profile.location?.region ?? null;
  const m = profile.location?.municipality ?? null;
  if (r && m) bits.push(`${r} (${m})`);
  else if (r) bits.push(r);

  if (profile.activityType) bits.push(profile.activityType);
  if (profile.businessExists === true) bits.push('attivita gia avviata');
  if (profile.businessExists === false) bits.push('nuova attivita da avviare');

  const goal = (profile.fundingGoal ?? '').trim();
  if (goal) bits.push(goal.length > 80 ? `${goal.slice(0, 80).trim()}…` : goal);

  const sector = (profile.sector ?? '').trim();
  if (sector) bits.push(`settore ${sector}`);

  const ateco = (profile.ateco ?? '').trim();
  if (ateco && /\d{2}/.test(ateco)) bits.push(`ATECO ${ateco}`);
  if (profile.age !== null) bits.push(`${profile.age} anni`);
  if (profile.employmentStatus) bits.push(profile.employmentStatus);
  if (profile.legalForm) bits.push(profile.legalForm);

  return bits.length ? `Ok, mi segno: ${bits.join(' · ')}.` : null;
}

function answerFinanceQuestion(message: string): string | null {
  const faq = answerFaq(message);
  if (faq) return faq;

  const n = normalizeForMatch(message);
  if (!n) return null;

  if (n.includes('resto al sud')) {
    return 'Resto al Sud sostiene avvio o sviluppo di nuove attività nelle aree ammesse, con mix tra contributo e finanziamento. Se mi dai regione e obiettivo, ti dico subito se sei compatibile.';
  }

  if (n.includes('autoimpiego') || (n.includes('centro') && n.includes('nord'))) {
    return 'Autoimpiego Centro-Nord è una misura per nuove attività nelle regioni ammesse. Conta la coerenza tra territorio, profilo del proponente e spese previste.';
  }

  if (n.includes('differenza') && (n.includes('fondo perduto') || n.includes('contributo'))) {
    return "Fondo perduto: quota che non restituisci. Finanziamento agevolato: prestito con condizioni migliori; voucher e credito d'imposta sono strumenti mirati su spese specifiche.";
  }

  if (n.includes('ateco') && (n.includes('cos') || n.includes('che') || n.includes('trovo') || n.includes('dove'))) {
    return "Il codice ATECO identifica l'attività economica principale. Se non lo conosci, descrivimi cosa fai e ti propongo il codice più probabile.";
  }

  if (n.includes('de minimis')) {
    return 'Il de minimis è un tetto di aiuti pubblici su 3 esercizi. Per capire la tua capienza devo sapere se hai già ricevuto contributi negli ultimi 3 anni.';
  }

  if (n.includes('a sportello')) {
    return 'A sportello: conta l\'ordine di invio, quindi preparazione anticipata. A graduatoria: conta il punteggio del progetto entro una finestra temporale.';
  }

  if (n.includes('spese ammiss')) {
    return 'Le spese ammissibili dipendono dal bando: in genere investimenti, digitalizzazione, consulenze e talvolta personale/opere. Se mi dai il nome del bando, ti rispondo in modo preciso.';
  }

  const hasFinanceKeywords =
    n.includes('bando') ||
    n.includes('contribut') ||
    n.includes('agevol') ||
    n.includes('fondo') ||
    n.includes('voucher') ||
    n.includes('credito') ||
    n.includes('incentiv') ||
    n.includes('finanza') ||
    n.includes('requisit');
  if (hasFinanceKeywords && n.length >= 14) {
    return 'Dipende dal bando specifico: cambiano ente, territorio, beneficiari e spese. Se mi dici regione e obiettivo, ti rispondo in modo puntuale.';
  }

  return null;
}

function answerMetaQuestion(message: string): string | null {
  const n = normalizeForMatch(message);
  if (!n) return null;

  const asksWho =
    n.includes('chi sei') ||
    n.includes('cosa sai fare') ||
    n.includes('cosa puoi fare') ||
    n.includes('in cosa mi aiuti') ||
    n.includes('come funzioni') ||
    n.includes('sei intelligente') ||
    n.includes('sei capace') ||
    n.includes('mi puoi aiutare');

  if (!asksWho) return null;

  return 'Ti aiuto come un consulente BNDO: chiarisco i dubbi e poi faccio il matching sui bandi davvero compatibili, spiegando perché gli altri vanno esclusi.';
}

function answerConversationalIntent(message: string): string | null {
  const n = normalizeForMatch(message);
  if (!n) return null;

  if (n.includes('possiamo prima parlare') || n.includes('parliamo prima') || n.includes('prima parliamo')) {
    return 'Certo. Partiamo dalla tua domanda e poi passiamo al matching.';
  }

  if (wantsQuestionsFirst(message)) {
    return 'Certo, fai pure la prima domanda.';
  }

  if (n.includes('non ho capito') || n.includes('spiegami meglio') || n.includes('fammi capire')) {
    return 'Chiaro, te lo rispiego in modo semplice e diretto.';
  }

  if (n.includes('non so da dove iniziare') || n.includes('non so come iniziare')) {
    return 'Tranquillo, ci penso io a guidarti: ti faccio solo le domande essenziali.';
  }

  return null;
}

function parseContributionPreference(message: string): ContributionPreference | null {
  const v = normalizeForMatch(message);
  if (!v) return null;
  if (v.includes('fondo perduto')) return 'fondo_perduto';
  if (v.includes('credito') && v.includes('imposta')) return 'credito_imposta';
  if (v.includes('voucher')) return 'voucher';
  if (v.includes('agevolato') || v.includes('tasso zero') || v.includes('finanziamento')) return 'finanziamento_agevolato';
  if (v.includes('misto') || v.includes('mix')) return 'misto';
  if (v.includes('non importa') || v.includes('indifferente') || v.includes('qualsiasi')) return 'non_importa';
  return null;
}

function mergeProfile(base: UserProfile, updates: Partial<UserProfile>): UserProfile {
  const next: UserProfile = { ...base, ...updates } as UserProfile;
  if (updates.location) {
    next.location = { ...base.location, ...updates.location };
  }
  if (updates.slotSource) {
    next.slotSource = { ...(base.slotSource ?? {}), ...(updates.slotSource ?? {}) };
  }
  // Ensure nested objects exist.
  if (!next.location) next.location = { region: null, municipality: null };
  if (!next.slotSource) next.slotSource = {};
  return next;
}

function computeScanHash(profile: UserProfile) {
  // Only include fields relevant for matching/scoring. Keep stable ordering.
  const obj = {
    activityType: profile.activityType ?? null,
    businessExists: profile.businessExists ?? null,
    sector: profile.sector ?? null,
    ateco: profile.ateco ?? null,
    region: profile.location?.region ?? null,
    municipality: profile.location?.municipality ?? null,
    age: profile.age ?? null,
    ageBand: profile.ageBand ?? null,
    employmentStatus: profile.employmentStatus ?? null,
    legalForm: profile.legalForm ?? null,
    employees: profile.employees ?? null,
    revenueOrBudgetEUR: profile.revenueOrBudgetEUR ?? null,
    requestedContributionEUR: profile.requestedContributionEUR ?? null,
    fundingGoal: profile.fundingGoal ?? null,
    contributionPreference: profile.contributionPreference ?? null
  };
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function isScanReady(profile: UserProfile) {
  return isScanReadyAdaptive(profile).ready;
}

function applyAnswer(profile: UserProfile, step: Step, message: string): { profile: UserProfile; error: string | null } {
  const trimmed = message.trim();
  if (!trimmed) return { profile, error: 'Risposta vuota.' };

  if (step === 'activityType') {
    if (trimmed.length < 2) return { profile, error: 'Mi serve una descrizione un po piu chiara del tipo di attivita.' };
    const normalizedActivity = parseActivityType(trimmed) ?? trimmed;
    const inferredBusinessExists = parseBusinessExistsFromMessage(normalizedActivity);
    return {
      profile: {
        ...profile,
        activityType: normalizedActivity,
        businessExists: inferredBusinessExists ?? profile.businessExists,
        slotSource: {
          ...(profile.slotSource ?? {}),
          activityType: 'explicit',
          ...(inferredBusinessExists !== null ? { businessExists: 'inferred' as const } : {}),
        }
      },
      error: null
    };
  }

  if (step === 'sector') {
    if (trimmed.length < 2) return { profile, error: 'Mi dici il settore con una parola o due?' };
    return { profile: { ...profile, sector: trimmed, slotSource: { ...(profile.slotSource ?? {}), sector: 'explicit' } }, error: null };
  }

  if (step === 'ateco') {
    const lowered = trimmed.toLowerCase();
    if (/\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/.test(lowered)) {
      const desc = trimmed.replace(/\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/gi, '').trim();
      return {
        profile: {
          ...profile,
          ateco: desc || null,
          atecoAnswered: true,
          slotSource: { ...(profile.slotSource ?? {}), ateco: desc ? 'explicit' : 'inferred' },
        },
        error: null,
      };
    }
    if (trimmed.length < 2) return { profile, error: 'Mi scrivi il codice ATECO (anche 2 cifre) oppure una breve descrizione dell\'attivita.' };
    return {
      profile: { ...profile, ateco: trimmed, atecoAnswered: true, slotSource: { ...(profile.slotSource ?? {}), ateco: 'explicit' } },
      error: null,
    };
  }

  if (step === 'location') {
    const loc = parseRegionAndMunicipality(trimmed);
    if (!loc.region && profile.locationNeedsConfirmation && profile.location.region) {
      if (isAffirmativeConfirmation(trimmed)) {
        return {
          profile: {
            ...profile,
            locationNeedsConfirmation: false,
            slotSource: { ...(profile.slotSource ?? {}), location: 'explicit' },
          },
          error: null,
        };
      }
      const asksDifferentRegion = /\b(altro|altrove|un altra regione|altra regione|diversa regione)\b/.test(normalizeForMatch(trimmed));
      if (!asksDifferentRegion) {
        return {
          profile: {
            ...profile,
            locationNeedsConfirmation: false,
            slotSource: { ...(profile.slotSource ?? {}), location: 'explicit' },
          },
          error: null,
        };
      }
    }
    if (!loc.region) {
      return { profile, error: 'Mi scrivi la Regione? (es. Lombardia, Lazio, Campania)' };
    }
    return {
      profile: {
        ...profile,
        location: { region: loc.region, municipality: loc.municipality },
        locationNeedsConfirmation: false,
        slotSource: { ...(profile.slotSource ?? {}), location: 'explicit' },
      },
      error: null,
    };
  }

  if (step === 'employees') {
    const n = parseEmployees(trimmed);
    if (n === null) return { profile, error: 'Non riesco a capire il numero dipendenti. Puoi scrivere un numero?' };
    return { profile: { ...profile, employees: n, slotSource: { ...(profile.slotSource ?? {}), employees: 'explicit' } }, error: null };
  }

  if (step === 'budget') {
    const lowered = trimmed.toLowerCase();
    if (/\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/.test(lowered)) {
      return {
        profile: {
          ...profile,
          revenueOrBudgetEUR: null,
          budgetAnswered: true,
          slotSource: { ...(profile.slotSource ?? {}), budget: 'explicit' },
        },
        error: null,
      };
    }

    const n = parseBudgetEUR(trimmed);
    if (n === null) {
      return {
        profile,
        error: 'Non riesco a capire il budget/fatturato. Puoi scrivere un numero? (es. 50k, 120000) Oppure "non so".'
      };
    }

    return {
      profile: {
        ...profile,
        revenueOrBudgetEUR: n,
        requestedContributionEUR: profile.requestedContributionEUR ?? parseRequestedContributionEUR(trimmed),
        budgetAnswered: true,
        slotSource: { ...(profile.slotSource ?? {}), budget: 'explicit' }
      },
      error: null
    };
  }

  if (step === 'fundingGoal') {
    if (trimmed.length < 2) return { profile, error: 'Mi descrivi meglio l\'obiettivo?' };
    const hasObjectiveSignal = hasConcreteObjectiveSignal(trimmed);
    const hasOtherSignal =
      Boolean(parseActivityType(trimmed)) ||
      Boolean(detectRegionAnywhere(trimmed)) ||
      Boolean(extractAtecoFromMessage(trimmed)) ||
      Boolean(extractSectorFromMessage(trimmed)) ||
      parseEmployees(trimmed) !== null ||
      parseBudgetEUR(trimmed) !== null ||
      Boolean(parseContributionPreference(trimmed));

    if (!hasObjectiveSignal && hasOtherSignal) {
      return { profile, error: null };
    }

    if (isGenericFundingGoal(trimmed)) {
      if (hasOtherSignal) return { profile, error: null };
      return {
        profile,
        error: 'Ok. Per fare un match serio mi serve un dettaglio in piu: che cosa vuoi finanziare concretamente?'
      };
    }
    return {
      profile: {
        ...profile,
        fundingGoal: trimmed,
        businessExists: parseBusinessExistsFromMessage(trimmed) ?? profile.businessExists,
        slotSource: { ...(profile.slotSource ?? {}), fundingGoal: 'explicit' }
      },
      error: null
    };
  }

  if (step === 'contributionPreference') {
    const pref = parseContributionPreference(trimmed);
    if (!pref) {
      return {
        profile,
        error: "Non mi e chiaro. Preferisci fondo perduto, agevolato, voucher, credito d'imposta o misto?"
      };
    }
    return {
      profile: {
        ...profile,
        contributionPreference: pref,
        slotSource: { ...(profile.slotSource ?? {}), contributionPreference: 'explicit' },
      },
      error: null,
    };
  }

  if (step === 'contactEmail') {
    const email = parseEmail(trimmed);
    if (!email) return { profile, error: 'Mi serve una mail valida (es. nome@azienda.it).' };
    return { profile: { ...profile, contactEmail: email }, error: null };
  }

  if (step === 'contactPhone') {
    const phone = parsePhone(trimmed);
    if (!phone) return { profile, error: 'Mi serve un numero di telefono valido con almeno 8 cifre.' };
    return { profile: { ...profile, contactPhone: phone }, error: null };
  }

  return { profile, error: null };
}

export async function POST(req: Request) {
  const rate = checkRateLimit(req, { keyPrefix: 'conversation', windowMs: 60_000, max: 45 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Troppi messaggi ravvicinati. Riprova tra pochi secondi.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  try {
    const payload = payloadSchema.parse(await req.json());
    const message = payload.message;

    const existing = readSessionCookie();
    const session: Session =
      existing ?? { step: getNextStep(emptyProfile()), userProfile: emptyProfile(), lastScanHash: null, askedCounts: {}, lastAskedStep: null };

    const trimmed = String(message ?? '').trim();
    const turnIntent = detectTurnIntent({ message: trimmed, sessionQaMode: Boolean(session.qaMode) });
    const {
      questionLike,
      smallTalk,
      greeting,
      questionsFirst,
      proceedToMatching,
      asksHumanConsultant,
      conversationalIntent,
      qaModeActive
    } = turnIntent;
    const isNewSession = !existing || isProfileEmpty(session.userProfile);
    let profileMemory = session.profileMemory ?? emptyProfileMemory();
    const prefersChatBeforeProfiling =
      questionsFirst || (conversationalIntent && /\b(parlar|parliam|prima)\b/.test(normalizeForMatch(trimmed)));

    // Extract high-signal fields from any message (even if it's not the expected step).
    const extracted: Partial<UserProfile> = {};
    const detectedRegionSignal = detectRegionSignal(trimmed);
    const detectedRegion = detectedRegionSignal?.region ?? null;
    const existingRegion = session.userProfile.location.region;
    const isRegionChange =
      Boolean(existingRegion && detectedRegion) &&
      normalizeForMatch(existingRegion ?? '') !== normalizeForMatch(detectedRegion ?? '');
    const canOverrideRegion =
      existingRegion === null ||
      session.step === 'location' ||
      (userIsStatingOwnLocation(trimmed) && (isRegionChange || /in realt|corregg|ho sbagliat|non sono/i.test(trimmed)));
    if (detectedRegion && canOverrideRegion) {
      extracted.location = { region: detectedRegion, municipality: null };
      extracted.locationNeedsConfirmation = detectedRegionSignal?.source === 'demonym';
      if (detectedRegionSignal?.source === 'explicit') {
        extracted.locationNeedsConfirmation = false;
      }
      extracted.slotSource = { ...(extracted.slotSource ?? {}), location: detectedRegionSignal?.source === 'demonym' ? 'demonym' : 'explicit' };
    }
    const detectedAteco = extractAtecoFromMessage(trimmed);
    const atecoMentioned = normalizeForMatch(trimmed).includes('ateco');
    const hasDottedAtecoPattern = /\b\d{2}\.\d{1,2}(?:\.\d{1,2})?\b/.test(trimmed);
    if (detectedAteco && (session.step === 'ateco' || atecoMentioned || hasDottedAtecoPattern)) {
      extracted.ateco = detectedAteco;
      extracted.atecoAnswered = true;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), ateco: atecoMentioned ? 'explicit' : 'inferred' };
    }
    const detectedActivity = parseActivityType(trimmed);
    if (detectedActivity && (session.step === 'activityType' || !session.userProfile.activityType)) {
      extracted.activityType = detectedActivity;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), activityType: 'inferred' };
    }
    const detectedBusinessExists = parseBusinessExistsFromMessage(trimmed);
    if (detectedBusinessExists !== null) {
      extracted.businessExists = detectedBusinessExists;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), businessExists: 'inferred' };
    }
    const detectedAge = parseAge(trimmed);
    if (detectedAge !== null) {
      extracted.age = detectedAge;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), age: 'explicit' };
    }
    const detectedAgeBand = parseAgeBand(trimmed);
    if (detectedAgeBand) {
      extracted.ageBand = detectedAgeBand;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), ageBand: 'inferred' };
    }
    const detectedEmployment = parseEmploymentStatus(trimmed);
    if (detectedEmployment && (session.step === 'activityType' || !session.userProfile.employmentStatus)) {
      extracted.employmentStatus = detectedEmployment;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), employmentStatus: 'inferred' };
    }
    const detectedLegalForm = parseLegalForm(trimmed);
    if (detectedLegalForm && (session.step === 'activityType' || !session.userProfile.legalForm)) {
      extracted.legalForm = detectedLegalForm;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), legalForm: 'inferred' };
    }
    const detectedEmployees = parseEmployees(trimmed);
    if (
      detectedEmployees !== null &&
      (session.step === 'employees' || (session.userProfile.employees === null && messageMentionsEmployees(trimmed)))
    ) {
      extracted.employees = detectedEmployees;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), employees: 'explicit' };
    }
    const detectedBudget = parseBudgetEUR(trimmed);
    if (
      detectedBudget !== null &&
      (session.step === 'budget' || (!session.userProfile.budgetAnswered && messageMentionsBudget(trimmed)))
    ) {
      extracted.revenueOrBudgetEUR = detectedBudget;
      extracted.budgetAnswered = true;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), budget: 'explicit' };
    }
    const detectedRequestedContribution = parseRequestedContributionEUR(trimmed);
    if (
      detectedRequestedContribution !== null &&
      (session.step === 'budget' || session.userProfile.requestedContributionEUR === null)
    ) {
      extracted.requestedContributionEUR = detectedRequestedContribution;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), requestedContributionEUR: 'explicit' };
    }
    const detectedPref = parseContributionPreference(trimmed);
    if (detectedPref && (session.step === 'contributionPreference' || !session.userProfile.contributionPreference)) {
      extracted.contributionPreference = detectedPref;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), contributionPreference: 'explicit' };
    }
    const detectedEmail = parseEmail(trimmed);
    if (detectedEmail) extracted.contactEmail = detectedEmail;
    const detectedPhone = parsePhone(trimmed);
    if (detectedPhone) extracted.contactPhone = detectedPhone;

    const detectedSector = extractSectorFromMessage(trimmed);
    if (detectedSector && (session.step === 'sector' || !session.userProfile.sector)) {
      extracted.sector = detectedSector;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), sector: 'inferred' };
    }

    const detectedGoal = extractFundingGoalFromMessage(trimmed);
    if (detectedGoal && (session.step === 'fundingGoal' || !session.userProfile.fundingGoal)) {
      extracted.fundingGoal = detectedGoal;
      extracted.slotSource = { ...(extracted.slotSource ?? {}), fundingGoal: 'inferred' };
    }

    let profile = mergeProfile(session.userProfile, extracted);
    if (profile.age !== null) {
      profile.ageBand = profile.age <= 35 ? 'under35' : 'over35';
      profile.slotSource = { ...(profile.slotSource ?? {}), ageBand: profile.slotSource?.ageBand ?? 'inferred' };
    }
    const extractedChanged = getChangedFields(session.userProfile, profile);
    let profileProgressedThisTurn = extractedChanged.length > 0;
    if (extractedChanged.length) {
      profileMemory = markProfileFields(profileMemory, extractedChanged, 'extractor');
    }

    // If the message looks like a question, answer it but don't force validation errors.
    const measureUpdateReply =
      questionLike && isMeasureUpdateQuestion(trimmed) ? await resolveMeasureUpdateReply(trimmed) : null;
    const qa = questionLike && !measureUpdateReply ? answerFinanceQuestion(trimmed) : null;
    const metaQa = answerMetaQuestion(trimmed);
    const conversationalReply = answerConversationalIntent(trimmed);
    const handoffAlreadyOpen = Boolean(session.humanHandoffRequested && !session.humanHandoffCompleted);
    const handoffRequested = asksHumanConsultant || handoffAlreadyOpen;
    const handoffCompleted = Boolean(session.humanHandoffCompleted && !asksHumanConsultant);
    const hasQaAnswer = Boolean(
      questionLike || questionsFirst || conversationalIntent || measureUpdateReply || qa || metaQa || conversationalReply
    );

    // Special: greeting-only messages must ALWAYS start the BNDO triage.
    // This prevents stale cookies (previous profile) from producing unrelated "refine your search" replies.
    if (greeting && smallTalk && !qa && !measureUpdateReply) {
      const assistantText =
        "Ciao, sono il tuo assistente BNDO. Dimmi in una frase il tuo progetto (attivita gia attiva o da aprire) e cosa vuoi finanziare.";

      // Reset to a fresh profile on greeting-only, to avoid leaking old region/ATECO into a new chat.
      const freshProfile = mergeProfile(emptyProfile(), extracted);

      const nextSession: Session = {
        step: 'fundingGoal',
        userProfile: freshProfile,
        profileMemory,
        lastScanHash: null,
        askedCounts: { fundingGoal: 1 },
        lastAskedStep: 'fundingGoal',
        qaMode: false,
        humanHandoffRequested: false,
        humanHandoffCompleted: false,
        recentTurns: [
          { role: 'user', text: trimmed },
          { role: 'assistant', text: assistantText }
        ]
      };
      writeSessionCookie(nextSession);

      return NextResponse.json(
        withConversationMeta({
          userProfile: nextSession.userProfile,
          step: nextSession.step,
          assistantText,
          readyToScan: false,
          mode: 'profiling',
          aiSource: null,
          needsClarification: true
        })
      );
    }

    // Special: first-touch greeting should feel human and set context.
    if (greeting && isNewSession && !qa && !measureUpdateReply) {
      const assistantText =
        "Ciao, sono il tuo assistente BNDO. Dimmi in una frase il tuo progetto (attivita gia attiva o da aprire) e cosa vuoi finanziare.";

      const askedCounts = session.askedCounts ?? {};
      const attempt = (askedCounts.fundingGoal ?? 0) + 1;
      const nextSession: Session = {
        step: 'fundingGoal',
        userProfile: profile,
        profileMemory,
        lastScanHash: session.lastScanHash ?? null,
        askedCounts: { ...askedCounts, fundingGoal: attempt },
        lastAskedStep: 'fundingGoal',
        qaMode: false,
        humanHandoffRequested: false,
        humanHandoffCompleted: false,
        recentTurns: [...(session.recentTurns ?? []).slice(-6), { role: 'user', text: trimmed }, { role: 'assistant', text: assistantText }]
      };
      writeSessionCookie(nextSession);

      return NextResponse.json(
        withConversationMeta({
          userProfile: nextSession.userProfile,
          step: nextSession.step,
          assistantText,
          readyToScan: false,
          mode: 'profiling',
          aiSource: null,
          needsClarification: true
        })
      );
    }

    if (handoffRequested && !handoffCompleted) {
      let handoffStep = getNextHandoffStep(profile);
      const handoffQuestionAnswer = metaQa ?? qa ?? conversationalReply ?? genericQuestionReply(trimmed);
      const explicitAnswerForStep = handoffStep === 'ready' ? false : isExplicitAnswerForStep(handoffStep, trimmed);

      // While collecting mandatory data for human handoff, validate the expected field if possible.
      if (
        !asksHumanConsultant &&
        handoffStep !== 'ready' &&
        !smallTalk &&
        (!questionLike || explicitAnswerForStep) &&
        shouldAttemptStepAnswer(handoffStep, trimmed)
      ) {
        const applied = applyAnswer(profile, handoffStep, trimmed);
        const prevProfile = profile;
        profile = applied.profile;
        const changedByUser = getChangedFields(prevProfile, profile);
        if (changedByUser.length) {
          profileMemory = markProfileFields(profileMemory, changedByUser, 'user');
          profileProgressedThisTurn = true;
        }
        handoffStep = getNextHandoffStep(profile);
        if (applied.error) {
          const next: Session = {
            ...session,
            step: handoffStep,
            userProfile: profile,
            profileMemory,
            humanHandoffRequested: true,
            humanHandoffCompleted: false
          };
          writeSessionCookie(next);
          return NextResponse.json(
            withConversationMeta({
              userProfile: next.userProfile,
              step: next.step,
              assistantText: applied.error,
              readyToScan: false,
              mode: 'handoff',
              aiSource: null,
              hasErrorPrompt: true,
              needsClarification: true
            })
          );
        }
      }

      const askedCounts = session.askedCounts ?? {};
      const seed = `${trimmed}:${JSON.stringify(profile)}`;

      if (handoffStep === 'ready') {
        const phone = profile.contactPhone ?? 'il numero che hai indicato';
        const emailNote = profile.contactEmail ? ` Ti abbiamo inviato anche un riepilogo a ${profile.contactEmail}.` : '';
        const assistantText = `Perfetto, ho inviato i tuoi dati al consulente umano BNDO. Ti ricontattera telefonicamente al ${phone}.${emailNote}`;
        const nextSession: Session = {
          ...session,
          step: 'ready',
          userProfile: profile,
          profileMemory,
          askedCounts,
          lastAskedStep: 'ready',
          humanHandoffRequested: true,
          humanHandoffCompleted: true,
          recentTurns: [...(session.recentTurns ?? []).slice(-6), { role: 'user', text: trimmed }, { role: 'assistant', text: assistantText }]
        };
        writeSessionCookie(nextSession);
        return NextResponse.json(
          withConversationMeta({
            userProfile: nextSession.userProfile,
            step: nextSession.step,
            assistantText,
            readyToScan: false,
            mode: 'handoff',
            aiSource: null,
            needsClarification: false
          })
        );
      }

      const attempt = (askedCounts[handoffStep] ?? 0) + 1;
      const intro = asksHumanConsultant
        ? 'Certo, puoi parlare con un consulente umano BNDO. Prima devo raccogliere alcune informazioni obbligatorie che gli serviranno per aiutarti in modo preciso.'
        : 'Perfetto, per passarti al consulente umano mi manca ancora un dato obbligatorio.';
      const handoffQuestion = questionFor(handoffStep, seed, attempt);
      const assistantText = handoffQuestionAnswer
        ? applyTonePolicy(
            [
              cleanupAssistantText(handoffQuestionAnswer),
              'Per passarti al consulente umano mi serve ancora un dato obbligatorio.',
              handoffQuestion
            ]
              .filter(Boolean)
              .join('\n\n'),
            'quasi_amichevole'
          )
        : [intro, handoffQuestion].filter(Boolean).join('\n\n');
      const nextSession: Session = {
        ...session,
        step: handoffStep,
        userProfile: profile,
        profileMemory,
        askedCounts: { ...askedCounts, [handoffStep]: attempt },
        lastAskedStep: handoffStep,
        humanHandoffRequested: true,
        humanHandoffCompleted: false,
        recentTurns: [...(session.recentTurns ?? []).slice(-6), { role: 'user', text: trimmed }, { role: 'assistant', text: assistantText }]
      };
      writeSessionCookie(nextSession);
      return NextResponse.json(
        withConversationMeta({
          userProfile: nextSession.userProfile,
          step: nextSession.step,
          assistantText,
          readyToScan: false,
          mode: 'handoff',
          aiSource: null,
          needsClarification: true
        })
      );
    }

    // Apply the message as an answer to the expected step (when it makes sense).
    const shouldTreatAsStepAnswer = !hasQaAnswer && !smallTalk && !proceedToMatching; // if we are answering a question or user is just greeting, don't treat it as a strict step answer
    if (shouldTreatAsStepAnswer) {
      const locationConfirmationReply =
        session.step === 'location' &&
        Boolean(profile.locationNeedsConfirmation && profile.location.region) &&
        (isAffirmativeConfirmation(trimmed) || !/\b(altro|altrove|un altra regione|altra regione|diversa regione)\b/.test(normalizeForMatch(trimmed)));
      // Only validate/consume the step if the relevant field is still missing.
      const shouldConsumeStep =
        (session.step === 'activityType' && !profile.activityType) ||
        (session.step === 'sector' && !profile.sector) ||
        (session.step === 'ateco' && !profile.atecoAnswered) ||
        (session.step === 'location' &&
          (!profile.location.region || profile.locationNeedsConfirmation) &&
          (Boolean(detectedRegion) || locationConfirmationReply)) ||
        (session.step === 'employees' && profile.employees === null) ||
        (session.step === 'fundingGoal' && !profile.fundingGoal) ||
        (session.step === 'budget' && !profile.budgetAnswered) ||
        (session.step === 'contributionPreference' && !profile.contributionPreference) ||
        (session.step === 'contactEmail' && !profile.contactEmail) ||
        (session.step === 'contactPhone' && !profile.contactPhone);

      if (shouldConsumeStep) {
        const applied = applyAnswer(profile, session.step, trimmed);
        const prevProfile = profile;
        profile = applied.profile;
        const changedByUser = getChangedFields(prevProfile, profile);
        if (changedByUser.length) {
          profileMemory = markProfileFields(profileMemory, changedByUser, 'user');
          profileProgressedThisTurn = true;
        }
        if (applied.error) {
          const assistantText = applied.error;
          const next: Session = {
            ...session,
            userProfile: profile,
            profileMemory,
            step: session.step,
            lastScanHash: session.lastScanHash ?? null
          };
          writeSessionCookie(next);
          return NextResponse.json(
            withConversationMeta({
              userProfile: next.userProfile,
              step: next.step,
              assistantText,
              readyToScan: false,
              mode: 'profiling',
              aiSource: null,
              hasErrorPrompt: true,
              needsClarification: true
            })
          );
        }
      }
    }

    // Decide next step and whether we should scan now.
    const scanReadiness = isScanReadyAdaptive(profile);
    const nextStep = getNextStep(profile);
    const scanReady = scanReadiness.ready;
    const scanHash = scanReady ? computeScanHash(profile) : null;
    const lastScanHash = session.lastScanHash ?? null;
    const shouldScanNow = Boolean(scanReady && scanHash && scanHash !== lastScanHash && !smallTalk);
    const seed = `${trimmed}:${JSON.stringify(profile)}`;
    const askedCounts = session.askedCounts ?? {};
    const rawAttempt = (askedCounts[nextStep] ?? 0) + 1;
    const stalledOnSameField = session.lastAskedStep === nextStep && !profileProgressedThisTurn && rawAttempt > 2;
    const effectiveNextStep = stalledOnSameField ? fallbackStepAfterStall(nextStep, profile) : nextStep;
    const attempt = (askedCounts[effectiveNextStep] ?? 0) + 1;
    const completenessScore = profileCompletenessScore(
      normalizeProfileInput({
        activityType: profile.activityType,
        businessExists: profile.businessExists,
        sector: profile.sector,
        ateco: profile.ateco,
        location: profile.location,
        age: profile.age,
        ageBand: profile.ageBand,
        employmentStatus: profile.employmentStatus,
        fundingGoal: profile.fundingGoal,
        contributionPreference: profile.contributionPreference,
        revenueOrBudgetEUR: profile.revenueOrBudgetEUR,
        requestedContributionEUR: profile.requestedContributionEUR,
      }),
      scanReadiness.missingSignals,
    );
    const readinessCode = scanReadinessReasonForStep(effectiveNextStep, profile);
    const shouldEmitRecap = shouldScanNow || hasCriticalRecapDelta(session.userProfile, profile);
    const recap = shouldEmitRecap ? profileRecap(profile) : null;
    const questionHint = shouldScanNow ? null : questionForStepWithProfile(effectiveNextStep, profile, seed, attempt);
    const assistantCore = (() => {
      if (shouldScanNow) {
        return 'Perfetto, avvio ora lo scanner BNDO per trovare i bandi piu compatibili.';
      }
      if (smallTalk && scanReady) {
        return 'Per affinare il match, dimmi solo un dato tra ATECO, importo o contributo preferito.';
      }
      if (smallTalk && !scanReady) {
        return questionForStepWithProfile(effectiveNextStep, profile, seed, attempt);
      }
      if (effectiveNextStep === 'ready') {
        return 'Se vuoi, affino subito il match: dammi il dato più importante tra ATECO, importo o forma di contributo.';
      }
      const q = questionHint ?? questionForStepWithProfile(effectiveNextStep, profile, seed, attempt);
      if (attempt > 1) return q;
      const reason =
        effectiveNextStep === 'location'
          ? profile.locationNeedsConfirmation && profile.location?.region
            ? null
            : 'Mi serve la regione.'
          : effectiveNextStep === 'activityType'
            ? profile.businessExists === null
              ? "Mi serve capire se l'attività è già attiva o da aprire."
              : needsFounderEligibilityData(profile)
                ? 'Mi servono età e stato occupazionale.'
                : null
            : effectiveNextStep === 'budget'
              ? 'Mi serve un importo indicativo.'
              : null;
      return [reason, q].filter(Boolean).join(' ');
    })();

    const llmQaMode = qaModeActive || prefersChatBeforeProfiling;
    const repeatedStepNoProgress = session.lastAskedStep === nextStep && !profileProgressedThisTurn;
    const assistantText = (() => {
      if (llmQaMode && smallTalk) return 'Certo, dimmi pure la domanda che vuoi farmi.';
      const bridge = shouldScanNow || llmQaMode || repeatedStepNoProgress ? null : naturalBridgeQuestion(effectiveNextStep, attempt);
      if (measureUpdateReply)
        return composeAssistantReply({
          directAnswer: measureUpdateReply,
          recap: null,
          bridgeQuestion: llmQaMode ? null : bridge,
          mode: 'qa'
        });
      if (metaQa)
        return composeAssistantReply({
          directAnswer: metaQa,
          recap: null,
          bridgeQuestion: llmQaMode ? null : bridge,
          mode: 'qa'
        });
      if (qa && llmQaMode)
        return composeAssistantReply({
          directAnswer: qa,
          recap: null,
          bridgeQuestion: null,
          mode: 'qa'
        });
      if (qa)
        return composeAssistantReply({
          directAnswer: qa,
          recap: null,
          bridgeQuestion: bridge,
          mode: 'qa'
        });
      if (conversationalReply && questionsFirst)
        return composeAssistantReply({
          directAnswer: conversationalReply,
          recap: null,
          bridgeQuestion: null,
          mode: 'qa'
        });
      if (conversationalReply)
        return composeAssistantReply({
          directAnswer: conversationalReply,
          recap: null,
          bridgeQuestion: bridge,
          mode: 'qa'
        });
      if (greeting && !smallTalk) return `Ciao! ${assistantCore}`;
      return assistantCore;
    })();

    const faqLikeTurn = Boolean(qa || metaQa || (llmQaMode && questionLike));
    const shouldBypassOpenAI = Boolean(
      shouldScanNow || !AI_CHAT_V2_ENABLED || measureUpdateReply || (CHAT_DETERMINISTIC_V3 && !faqLikeTurn),
    );
    const openAiResult = shouldBypassOpenAI
      ? { text: null, source: 'disabled' as const }
      : await generateAssistantTextWithOpenAI({
          userMessage: trimmed,
          session,
          profile,
          nextStep,
          recap,
          attempt,
          questionHint,
          shouldScanNow,
          scanReady,
          isGreetingOnly: greeting && smallTalk,
          isFirstTouch: isNewSession,
          qaMode: llmQaMode,
          questionLike,
          smallTalk
        });

    if (!shouldBypassOpenAI && openAiResult.source !== 'openai') {
      await addAIFallbackUsage();
    }

    let rawAssistantText = openAiResult.text ?? assistantText;
    const recentAssistantReplies = (session.recentTurns ?? [])
      .filter((t) => t.role === 'assistant')
      .map((t) => t.text)
      .slice(-3);

    let repetition = findClosestSimilarReply({
      candidate: rawAssistantText,
      recentAssistantReplies,
      threshold: 0.82
    });

    if (repetition.tooSimilar && openAiResult.source === 'openai' && !shouldBypassOpenAI) {
      const regenerated = await generateAssistantTextWithOpenAI({
        userMessage: trimmed,
        session,
        profile,
        nextStep,
        recap,
        attempt,
        questionHint,
        shouldScanNow,
        scanReady,
        isGreetingOnly: greeting && smallTalk,
        isFirstTouch: isNewSession,
        qaMode: llmQaMode,
        questionLike,
        smallTalk,
        avoidReply: repetition.closest
      });
      if (regenerated.text) {
        rawAssistantText = regenerated.text;
        repetition = findClosestSimilarReply({
          candidate: rawAssistantText,
          recentAssistantReplies,
          threshold: 0.82
        });
      } else {
        await addAIFallbackUsage();
      }
    }

    const candidateAssistantText = cleanupAssistantText(rawAssistantText);
    const antiEchoAssistantText = stripUserEchoFromReply(candidateAssistantText, trimmed);
    const dedupedAssistantText = repetition.tooSimilar
      ? `${antiEchoAssistantText}\n\n${
          naturalBridgeQuestion(effectiveNextStep, attempt + 1) ?? questionForStepWithProfile(effectiveNextStep, profile, seed, attempt + 1)
        }`
      : antiEchoAssistantText;
    const qaDirectFallback = (measureUpdateReply ?? metaQa ?? qa)?.trim() ?? null;
    let qaShapedAssistantText =
      llmQaMode && !proceedToMatching && !shouldScanNow ? enforceQaModeReply(dedupedAssistantText) : dedupedAssistantText;
    if (llmQaMode && metaQa) {
      qaShapedAssistantText = metaQa.trim();
    }
    if (prefersChatBeforeProfiling && conversationalReply) {
      qaShapedAssistantText = conversationalReply.trim();
    }
    if (llmQaMode && qaDirectFallback && qaShapedAssistantText.length < 70) {
      qaShapedAssistantText = qaDirectFallback;
    }
    const introStrippedAssistantText = !isNewSession
      ? (stripRepeatedAssistantIntro(qaShapedAssistantText) || qaShapedAssistantText)
      : qaShapedAssistantText;
    const directAssistantText = enforceConsultantDirectness(introStrippedAssistantText, {
      shouldScanNow,
      questionHint,
    });
    const finalAssistantText = applyTonePolicy(directAssistantText, 'quasi_amichevole');

    const prevTurns = session.recentTurns ?? [];
    const nextTurns = [...prevTurns, { role: 'user' as const, text: trimmed }, { role: 'assistant' as const, text: finalAssistantText }]
      .slice(-8);

    const nextSession: Session = {
      // When we trigger a scan, keep the next refinement step in session so the user can answer immediately after results.
      step: shouldScanNow ? effectiveNextStep : smallTalk && scanReady ? 'ready' : effectiveNextStep,
      userProfile: profile,
      profileMemory,
      lastScanHash: shouldScanNow ? scanHash : lastScanHash,
      askedCounts: { ...askedCounts, [effectiveNextStep]: attempt },
      lastAskedStep: effectiveNextStep,
      recentTurns: nextTurns,
      humanHandoffRequested: false,
      humanHandoffCompleted: false,
      qaMode:
        prefersChatBeforeProfiling
          ? true
          : proceedToMatching
            ? false
            : (session.qaMode ?? false) && !profileProgressedThisTurn
    };
    writeSessionCookie(nextSession);

    const mode = inferMode({
      handoffRequested,
      shouldScanNow,
      qaModeActive: Boolean(llmQaMode || questionLike || conversationalIntent)
    });
    const needsClarification =
      effectiveNextStep !== 'ready' &&
      !shouldScanNow &&
      (Boolean(questionHint) || Boolean(naturalBridgeQuestion(effectiveNextStep, attempt)) || Boolean(repetition.tooSimilar));
    return NextResponse.json(
      withConversationMeta({
        userProfile: nextSession.userProfile,
        step: nextSession.step,
        assistantText: finalAssistantText,
        readyToScan: shouldScanNow,
        mode,
        aiSource: openAiResult.source,
        needsClarification,
        nextQuestionField: nextBestFieldFromStep(effectiveNextStep),
        profileCompletenessScore: completenessScore,
        scanReadinessReason: readinessCode,
      })
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore conversazione.' }, { status: 500 });
  }
}

export async function DELETE() {
  // Clear conversation state so a new profiling flow starts from scratch.
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
  return NextResponse.json({ ok: true });
}
