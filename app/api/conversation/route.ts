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
    'ho capito che',
    'mi confermi che',
    'perfetto ho capito',
    'ho segnato che',
    'mi dici che'
  ];
  const sClean = sNorm
    .replace(/^(perfetto|ottimo|ok|bene|ho capito|ho segnato)\s+/, '')
    .trim();

  if (echoPrefixes.some((prefix) => sNorm.startsWith(prefix) || sClean.startsWith(prefix))) return true;

  if (uNorm.length >= 14 && sNorm.includes(uNorm)) return true;

  const userTokens = new Set(tokenizeForSimilarity(userMessage));
  const sentenceTokens = tokenizeForSimilarity(sentence);
  if (!userTokens.size || !sentenceTokens.length) return false;

  const overlapCount = sentenceTokens.filter((token) => userTokens.has(token)).length;
  const overlapRatio = overlapCount / sentenceTokens.length;
  if (overlapRatio >= 0.70 && sentenceTokens.length <= Math.max(8, userTokens.size + 2)) return true;
  if (overlapCount >= 3 && overlapRatio >= 0.25 && sentenceTokens.length <= 14) return true;

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
    return index === 0 || sentence.length < 100;
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
      n.includes('hai già un attivita') ||
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
    return 'Ho un quadro chiaro. Avvio subito una ricerca approfondita per individuare le opportunità più concrete per il tuo profilo.';
  }

  const fluffPattern =
    /(se vuoi|quando vuoi|appena vuoi|dimmi pure la prossima domanda|posso affinare|ti aiuto subito|posso aiutarti|fammi sapere|se ti va|quando preferisci|allora|ottimo|perfetto,|in ogni caso)/i;

  const compact = sentences.filter((sentence) => {
    if (!sentence) return false;
    if (fluffPattern.test(sentence) && !sentence.includes('?')) return false;
    return true;
  });

  const finalSentences: string[] = [];
  let hasQuestionInText = false;
  for (const sentence of compact) {
    const normalized = normalizeForMatch(sentence);
    if (!normalized) continue;
    const isQuestion = sentence.includes('?');
    if (isQuestion && hasQuestionInText) continue;
    if (isQuestion) hasQuestionInText = true;
    finalSentences.push(sentence);
    if (finalSentences.length >= 2) break;
  }

  const joinedBeforeHint = finalSentences.join(' ').trim();
  const hasDataRequestPattern = /(dimmi|indicami|mi dai|mi dici|confermi|serve|per filtrare|per capire|sapresti dirmi|puoi dirmi)/i.test(joinedBeforeHint);
  
  if (!hasQuestionInText && questionHint && finalSentences.length < 2 && !hasDataRequestPattern) {
    // Check if the generated text already contains the concept of the questionHint
    const qhNorm = normalizeForMatch(questionHint);
    const textNorm = normalizeForMatch(joinedBeforeHint);
    const keywords = qhNorm.split(' ').filter(w => w.length > 4);
    const alreadyAsked = keywords.length > 0 && keywords.every(kw => textNorm.includes(kw));

    if (!alreadyAsked) {
      finalSentences.push(questionHint);
    }
  }

  const joined = finalSentences.join(' ').trim();
  if (!joined && questionHint) return questionHint;
  if (!joined) return 'Dammi un dettaglio in più per restringere il campo e individuare i match migliori.';
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
    'Quando un dettaglio non conosci o cambia, dici che lo verificherai con i dati sui bandi.',
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
    'Se i dati sono sufficienti for il matching, dì chiaramente che procedi alla ricerca nei bandi e NON fare più domande.',
    'Se manca UN solo dato critico, chiedilo naturalmente dopo la risposta.',
    "Se l'utente e confuso, chiarisci senza pedanteria. Se e diretto, sii diretto.",
    'Non ripetere domande gia risposte. Non chiedere dati gia nel profilo.',
    'Se vuole fare domande prima del profiling, rispondi alle sue domande senza forzare i dati nello stesso turno.',
    "Se Q&A mode: non chiedere profiling finche non chiede esplicitamente il matching.",
    "Se il messaggio e meta/conversazionale, evita di ridirigere meccanicamente al form.",
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
  { region: 'Emilia-Romagna', tokens: ['emiliano', 'emiliana', 'romagnolo', 'romagnola'] },
  { region: 'Friuli-Venezia Giulia', tokens: ['friulano', 'friulana', 'giuliano', 'giuliana'] },
  { region: 'Lazio', tokens: ['laziale', 'laziali'] },
  { region: 'Liguria', tokens: ['ligure', 'liguri'] },
  { region: 'Lombardia', tokens: ['lombardo', 'lombarda', 'lombardi', 'lombarde'] },
  { region: 'Marche', tokens: ['marchigiano', 'marchigiana'] },
  { region: 'Molise', tokens: ['molisano', 'molisana'] },
  { region: 'Piemonte', tokens: ['piemontese', 'piemontesi'] },
  { region: 'Puglia', tokens: ['pugliese', 'pugliesi'] },
  { region: 'Sardegna', tokens: ['sardo', 'sarda', 'sardi', 'sarde'] },
  { region: 'Sicilia', tokens: ['siciliano', 'siciliana', 'siciliani', 'siciliane'] },
  { region: 'Toscana', tokens: ['toscano', 'toscana'] },
  { region: 'Trentino-Alto Adige', tokens: ['trentino', 'altoatesino', 'altoatesina'] },
  { region: 'Umbria', tokens: ['umbro', 'umbra'] },
  { region: "Valle d'Aosta", tokens: ['valdostano', 'valdostana'] },
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
  const words = n.split(' ').filter(w => w.length >= 3);
  
  // Se contiene parole ad alto valore semantico non è generico
  const specificTerms = [
    'ristruttur', 'macchinar', 'attrezz', 'software', 'digital', 'capannone', 
    'energia', 'fotovolta', 'assunz', 'formaz', 'export', 'internaz', 
    'brevett', 'ricerca', 'sviluppo', 'marketing', 'pubblicit', 'mezzi', 'veicoli',
    'sito', 'e-commerce', 'alberghier', 'turism', 'ristorazione', 'bar'
  ];
  
  if (words.some(w => specificTerms.some(t => w.includes(t)))) return false;
  
  if (words.length <= 1) return true;
  
  const generic = [
    'bando', 'bandi', 'finanziamento', 'finanziamenti', 'contributo', 'contributi',
    'agevolazione', 'agevolazioni', 'investimento', 'investimenti', 'spese',
    'progetto', 'attivita', 'impresa', 'azienda', 'fondo perduto', 'aiuto', 'aiuti',
    'aprire', 'avviare', 'nuova', 'nuove'
  ];
  
  return words.every(w => generic.includes(w));
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

function hasBusinessContext(profile: UserProfile) {
  return profile.businessExists !== null || Boolean(profile.activityType?.trim());
}

function isScanReadyAdaptive(profile: UserProfile): ScanAdaptiveReadiness {
  const missingSignals: ScanMissingSignal[] = [];
  const southYouthStartupPriority = isSouthYouthStartupPriorityProfile(profile);

  const goalText = profile.fundingGoal?.trim() ?? '';
  const goalIsGeneric = goalText ? isGenericFundingGoal(goalText) : true;
  const hasRegion = Boolean(profile.location?.region?.trim()) && !profile.locationNeedsConfirmation;
  const hasContext = hasBusinessContext(profile);

  if (!goalText) missingSignals.push('fundingGoal');
  if (!hasRegion) missingSignals.push('location');
  if (!hasContext) missingSignals.push('businessContext');
  if (profile.businessExists === false && needsFounderEligibilityData(profile)) missingSignals.push('founderEligibility');

  const hasTopic = hasTopicSignal(profile);
  const hasPrecision = hasPrecisionSignal(profile);

  // LOGICA PROATTIVA: 
  // Se non è generico e abbiamo i 3 pilastri (Cosa, Dove, Chi), siamo pronti.
  const corePilarsOk = Boolean(goalText && !goalIsGeneric && hasRegion && hasContext);
  
  // Se è generico, serve almeno un segnale di precisione (budget o settore o ateco)
  const genericWithPrecisionOk = Boolean(goalIsGeneric && hasRegion && hasContext && (hasTopic || hasPrecision || southYouthStartupPriority));

  if (!corePilarsOk && !genericWithPrecisionOk) {
      if (!missingSignals.includes('topicPrecision')) {
          missingSignals.push('topicPrecision');
      }
  }

  const isReady = corePilarsOk || missingSignals.length === 0;

  return {
    ready: isReady,
    missingSignals: corePilarsOk ? [] : missingSignals,
    southYouthStartupPriority,
  };
}


function questionForStepWithProfile(step: Step, profile: UserProfile, seed: string, attempt: number) {
  if (step === 'location' && profile.locationNeedsConfirmation && profile.location?.region) {
    return `In quale regione ha sede il progetto?`;
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
    /(non ho (una |un )?(impresa|azienda|attivita)|da costituire|da aprire|devo aprire|devo avviare|voglio avviare|vorrei avviare|voglio aprire|vorrei aprire|sto avviando|sto aprendo|nuova attivita|nuova impresa|startup|autoimpiego|non e ancora attiva|ancora non esiste|non l ho ancora aperta|devo aprirla)/.test(
      n
    )
  ) {
    return false;
  }

  if (
    /(gia attiva|già attiva|gia esistente|già esistente|impresa attiva|azienda attiva|attivita attiva|attivita avviata|ho gia un attivita|ho partita iva|ho un impresa|ho una impresa|ho un azienda|ho una azienda|abbiamo un impresa|abbiamo una azienda|sono titolare|impresa agricola|azienda agricola|operativa|gia operativa|già operativa|attiva|esiste gia|esiste già|ho gia l azienda|ho già l azienda|siamo gia operativi|siamo già operativi|societa attiva|società attiva)/.test(
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

  if (v.includes('startup')) return 'Startup';

  if (
    v.includes('costituir') ||
    v.includes('da costituire') ||
    v.includes('da aprire') ||
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
    v.includes('nuova attivita') ||
    v.includes('non e ancora attiva') ||
    v.includes('ancora non esiste') ||
    v.includes('non l ho ancora aperta') ||
    v.includes('devo aprirla')
  ) {
    return 'Da costituire';
  }
  if (
    /(ho un impresa|ho una impresa|ho un azienda|ho una azienda|abbiamo un impresa|abbiamo una azienda|azienda attiva|impresa attiva|attivita attiva|attivita avviata|gia attiva|già attiva|gia esistente|già esistente|impresa agricola|azienda agricola|operativa|gia operativa|già operativa|attiva|esiste gia|esiste già|ho gia l azienda|ho già l azienda|siamo gia operativi|siamo già operativi|societa attiva|società attiva)/.test(
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
  
  // Concrete signals that this is a real goal
  const hasConcreteSignal = /\b(macchinar|software|digitalizz|attrezzatur|impiant|ristruttur|assunzion|marketing|ecommerce|sito web|negozio|laboratorio|arredi|mezzi|furgon|veicol|autoimpiego|startup|agricol|agriturism|fotovolta)\b/.test(n);

  const humanConsultantOnly =
    /\b(consulen|persona|umano|ricontatt|richiam|farmi chiam|telefon|parlare con)\b/.test(n) &&
    !hasConcreteSignal;

  if (humanConsultantOnly) return null;

  const triggers = ['voglio', 'vorrei', 'mi serve', 'mi servono', 'devo', 'necessito', 'obiettivo', 'finanziare', 'acquistare', 'cercando', 'cerco'];
  const hit = triggers.find((t) => n.includes(t));
  
  if (hit) {
    const idx = n.indexOf(hit);
    if (idx >= 0) {
        const after = raw.slice(Math.max(0, raw.toLowerCase().indexOf(hit.split(' ')[0] ?? hit) + (hit.split(' ')[0] ?? hit).length));
        const cleaned = after.replace(/^[:\-–—\s]+/, '').trim();
        if (cleaned.length > 5) return cleaned.length > 180 ? `${cleaned.slice(0, 180).trim()}…` : cleaned;
    }
  }

  // Fallback: if it has a concrete signal, take the whole message
  if (hasConcreteSignal && raw.split(' ').length >= 3) {
      return raw.length > 180 ? `${raw.slice(0, 180).trim()}…` : raw;
  }

  return null;
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
    n.includes('finanziamento');

  if (hasFinanceKeywords) return 'Ti aiuto volentieri a trovare il bando giusto. Dimmi cosa vuoi finanziare e in quale regione.';

  return null;
}

function parseContributionPreference(message: string): ContributionPreference | null {
  const n = normalizeForMatch(message);
  if (!n) return null;
  if (n.includes('fondo perduto')) return 'fondo_perduto';
  if (n.includes('agevolato') || n.includes('finanziamento')) return 'finanziamento_agevolato';
  if (n.includes('credito imposta') || n.includes('credito d imposta')) return 'credito_imposta';
  if (n.includes('voucher')) return 'voucher';
  if (n.includes('entrambi') || n.includes('misto') || n.includes('tutti')) return 'misto';
  if (n.includes('non importa') || n.includes('qualsiasi')) return 'non_importa';
  return null;
}

function isSouthYouthStartupProfile(args: {
  businessExists: boolean | null;
  region: string | null;
  age: number | null;
  ageBand: UserProfile['ageBand'];
  employmentStatus: string | null;
}) {
  if (args.businessExists !== false) return false;
  if (!args.region || !SOUTH_PRIORITY_REGIONS.has(args.region)) return false;
  const under35 = (args.age !== null && args.age <= 35) || args.ageBand === 'under35';
  if (!under35) return false;
  const employmentNorm = normalizeForMatch(args.employmentStatus ?? '');
  return /(disoccupat|inoccupat|neet|working poor|senza lavoro|non occupat)/.test(employmentNorm);
}

function computeScanHash(p: UserProfile) {
  const bits = [
    p.businessExists,
    p.location?.region,
    p.fundingGoal,
    p.sector,
    p.budgetAnswered ? p.revenueOrBudgetEUR : null,
    p.ageBand,
    p.employmentStatus
  ];
  return bits.map(String).join('|');
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, { keyPrefix: 'conversation', windowMs: 60_000, max: 25 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Stai inviando troppi messaggi. Attendi qualche istante.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  try {
    const body = await request.json();
    const { message } = payloadSchema.parse(body);
    const trimmed = message.trim();

    const session = readSessionCookie() ?? {
      step: 'fundingGoal' as Step,
      userProfile: emptyProfile(),
      askedCounts: {},
      lastAskedStep: null,
      recentTurns: [],
      qaMode: false
    };

    let profile = session.userProfile;
    let profileMemory = session.profileMemory ?? emptyProfileMemory();
    let profileProgressedThisTurn = false;

    const conversationalIntent = isConversationalIntent(trimmed);
    const questionLike = isQuestionLike(trimmed);
    const greeting = isGreeting(trimmed);
    const smallTalk = isSmallTalkOnly(trimmed);
    const asksHumanConsultant = wantsHumanConsultant(trimmed);
    const handoffRequested = session.humanHandoffRequested || asksHumanConsultant;
    const handoffCompleted = session.humanHandoffCompleted || false;
    const qaModeActive = session.qaMode || false;
    const questionsFirst = wantsQuestionsFirst(trimmed);
    const proceedToMatching = wantsToProceedToMatching(trimmed);

    // Extraction pass
    const detectedRegionSignal = detectRegionSignal(trimmed);
    const detectedRegion = detectedRegionSignal?.region ?? null;
    const isStatingLocation = userIsStatingOwnLocation(trimmed);
    const explicitBudget = parseBudgetEUR(trimmed);
    const explicitContribution = parseRequestedContributionEUR(trimmed);
    const explicitEmployees = parseEmployees(trimmed);
    const explicitBusinessExists = parseBusinessExistsFromMessage(trimmed);
    const explicitAge = parseAge(trimmed);
    const explicitAgeBand = parseAgeBand(trimmed);
    const explicitEmploymentStatus = parseEmploymentStatus(trimmed);
    const explicitLegalForm = parseLegalForm(trimmed);
    const explicitEmail = parseEmail(trimmed);
    const explicitPhone = parsePhone(trimmed);
    const explicitActivityType = parseActivityType(trimmed);
    const explicitSector = extractSectorFromMessage(trimmed);
    const explicitFundingGoal = extractFundingGoalFromMessage(trimmed);
    const explicitContributionPref = parseContributionPreference(trimmed);
    const explicitAteco = extractAtecoFromMessage(trimmed);

    // Update profile
    const nextProfile = { ...profile };
    const extractionSources: Record<string, 'explicit' | 'demonym' | 'inferred'> = { ...profile.slotSource };

    if (detectedRegion) {
      nextProfile.location = { ...nextProfile.location, region: detectedRegion };
      nextProfile.locationNeedsConfirmation = !isStatingLocation && detectedRegionSignal?.source !== 'explicit';
      extractionSources.location = detectedRegionSignal?.source ?? 'explicit';
    }
    if (explicitBudget !== null) {
      nextProfile.revenueOrBudgetEUR = explicitBudget;
      nextProfile.budgetAnswered = true;
      extractionSources.budget = 'explicit';
    }
    if (explicitContribution !== null) {
      nextProfile.requestedContributionEUR = explicitContribution;
      extractionSources.requestedContributionEUR = 'explicit';
    }
    if (explicitEmployees !== null) {
      nextProfile.employees = explicitEmployees;
      extractionSources.employees = 'explicit';
    }
    if (explicitBusinessExists !== null) {
      nextProfile.businessExists = explicitBusinessExists;
      extractionSources.businessExists = 'explicit';
    }
    if (explicitAge !== null) {
      nextProfile.age = explicitAge;
      extractionSources.age = 'explicit';
    }
    if (explicitAgeBand !== null) {
      nextProfile.ageBand = explicitAgeBand;
      extractionSources.ageBand = 'explicit';
    }
    if (explicitEmploymentStatus !== null) {
      nextProfile.employmentStatus = explicitEmploymentStatus;
      extractionSources.employmentStatus = 'explicit';
    }
    if (explicitLegalForm !== null) {
      nextProfile.legalForm = explicitLegalForm;
      extractionSources.legalForm = 'explicit';
    }
    if (explicitEmail) {
      nextProfile.contactEmail = explicitEmail;
      extractionSources.contactEmail = 'explicit';
    }
    if (explicitPhone) {
      nextProfile.contactPhone = explicitPhone;
      extractionSources.contactPhone = 'explicit';
    }
    if (explicitActivityType) {
      nextProfile.activityType = explicitActivityType;
      extractionSources.activityType = 'explicit';
    }
    if (explicitSector) {
      nextProfile.sector = explicitSector;
      extractionSources.sector = 'explicit';
    }
    if (explicitFundingGoal) {
      nextProfile.fundingGoal = explicitFundingGoal;
      extractionSources.fundingGoal = 'explicit';
    }
    if (explicitContributionPref) {
      nextProfile.contributionPreference = explicitContributionPref;
      extractionSources.contributionPreference = 'explicit';
    }
    if (explicitAteco) {
      nextProfile.ateco = explicitAteco;
      nextProfile.atecoAnswered = true;
      extractionSources.ateco = 'explicit';
    }

    const changed = getChangedFields(profile, nextProfile);
    if (changed.length > 0) {
      profile = { ...nextProfile, slotSource: extractionSources };
      profileMemory = markProfileFields(profileMemory, changed, 'extractor');
      profileProgressedThisTurn = true;
    }

    const isNewSession = isProfileEmpty(profile);
    const prefersChatBeforeProfiling = questionsFirst || qaModeActive;

    // Knowledge/Status Check
    const measureUpdateQuestion = isMeasureUpdateQuestion(trimmed);
    const measureUpdateReply = measureUpdateQuestion ? await resolveMeasureUpdateReply(trimmed) : null;
    const qa = answerFinanceQuestion(trimmed);
    const metaQa = genericQuestionReply(trimmed);
    const hasQaAnswer = Boolean(qa || metaQa || measureUpdateReply);

    // AI pass for conversational parts
    const conversationalReply = (conversationalIntent || (prefersChatBeforeProfiling && smallTalk))
      ? 'Certamente. Posso rispondere ai tuoi dubbi sulla finanza agevolata o aiutarti a trovare il bando giusto per il tuo progetto. Cosa preferisci approfondire?'
      : null;

    // Special: first-touch greeting should feel human and set context.
    if (greeting && isNewSession && !qa && !measureUpdateReply) {
      const assistantText =
        "Ciao, sono il tuo consulente BNDO. Dimmi in una frase cosa vuoi finanziare e in quale regione operi.";

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
    const shouldTreatAsStepAnswer = !hasQaAnswer && !smallTalk && !proceedToMatching;
    if (shouldTreatAsStepAnswer) {
      const locationConfirmationReply =
        session.step === 'location' &&
        Boolean(profile.locationNeedsConfirmation && profile.location.region) &&
        (isAffirmativeConfirmation(trimmed) || !/\b(altro|altrove|un altra regione|altra regione|diversa regione)\b/.test(normalizeForMatch(trimmed)));
      
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
        return 'Ho un quadro chiaro. Avvio subito una ricerca approfondita per individuare le opportunità più concrete per il tuo profilo.';
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
      return questionForStepWithProfile(effectiveNextStep, profile, seed, attempt);
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
      ? antiEchoAssistantText || 'Capisco.'
      : antiEchoAssistantText;
    const qaCandidate: string | null = measureUpdateReply ?? metaQa ?? qa;
    const qaDirectFallback = qaCandidate?.trim() ?? null;
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
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
  return NextResponse.json({ ok: true });
}

function applyAnswer(profile: UserProfile, step: Step, message: string): { profile: UserProfile; error: string | null } {
  const next = { ...profile };
  const lowered = message.toLowerCase().trim();

  if (step === 'activityType') {
    const act = parseActivityType(message);
    if (!act) return { profile, error: "Non ho capito se l'attività è già attiva o da aprire. Puoi chiarire?" };
    next.activityType = act;
    next.businessExists = parseBusinessExistsFromMessage(message);
  } else if (step === 'sector') {
    const s = extractSectorFromMessage(message);
    if (!s) return { profile, error: "Qual è il settore principale di attività (es. agricoltura, turismo, software)?" };
    next.sector = s;
  } else if (step === 'ateco') {
    const a = extractAtecoFromMessage(message);
    if (/\b(non so|non saprei|boh|na|n\/a|non disponibile)\b/.test(lowered)) {
        next.atecoAnswered = true;
        return { profile: next, error: null };
    }
    if (!a) return { profile, error: "Puoi indicarmi il codice ATECO o descrivere meglio cosa fa l'azienda?" };
    next.ateco = a;
    next.atecoAnswered = true;
  } else if (step === 'location') {
    const loc = parseRegionAndMunicipality(message);
    const anywhere = detectRegionAnywhere(message);
    const finalRegion = loc.region ?? anywhere;
    if (!finalRegion) return { profile, error: "In quale regione ha sede l'attività o il progetto?" };
    next.location = { region: finalRegion, municipality: loc.municipality };
    next.locationNeedsConfirmation = false;
  } else if (step === 'employees') {
    const e = parseEmployees(message);
    if (e === null) return { profile, error: "Quanti dipendenti o addetti ha l'azienda? Indica un numero indicativo." };
    next.employees = e;
  } else if (step === 'fundingGoal') {
    const goal = extractFundingGoalFromMessage(message) ?? message;
    if (goal.length < 5) return { profile, error: "Cosa vuoi finanziare in concreto con il bando? (es. macchinari, software, sede)" };
    next.fundingGoal = goal;
  } else if (step === 'budget') {
    if (/\b(non so|non saprei|boh|na|n\/a|non disponibile)\b/.test(lowered)) {
        next.budgetAnswered = true;
        return { profile: next, error: null };
    }
    const b = parseBudgetEUR(message);
    if (b === null) return { profile, error: "Qual è l'importo indicativo dell'investimento? (es. 50.000 euro)" };
    next.revenueOrBudgetEUR = b;
    next.budgetAnswered = true;
  } else if (step === 'contributionPreference') {
    const cp = parseContributionPreference(message);
    if (!cp) return { profile, error: "Preferisci fondo perduto, finanziamento agevolato o ti interessano entrambi?" };
    next.contributionPreference = cp;
  } else if (step === 'contactEmail') {
    const email = parseEmail(message);
    if (!email) return { profile, error: "Indica una mail valida per ricevere il riepilogo." };
    next.contactEmail = email;
  } else if (step === 'contactPhone') {
    const phone = parsePhone(message);
    if (!phone) return { profile, error: "Indica un numero di telefono valido per essere ricontattato." };
    next.contactPhone = phone;
  }

  return { profile: next, error: null };
}
