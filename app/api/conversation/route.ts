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
import { checkRateLimit } from '@/lib/security/rateLimit';
import type { ContributionPreference, ConversationMode, NextBestField, Session, Step, UserProfile } from '@/lib/conversation/types';

export const runtime = 'nodejs';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const AI_CHAT_V2_ENABLED = process.env.AI_CHAT_V2?.trim() !== 'false';

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
}) {
  const nextBestField: NextBestField | null = nextBestFieldFromStep(args.step);
  return {
    userProfile: args.userProfile,
    step: args.step,
    assistantText: args.assistantText,
    readyToScan: args.readyToScan,
    mode: args.mode,
    nextBestField,
    aiSource: args.aiSource,
    assistantConfidence: inferConfidence({
      aiSource: args.aiSource,
      hasErrorPrompt: args.hasErrorPrompt,
      needsClarification: args.needsClarification
    }),
    needsClarification: args.needsClarification
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
  if (!core || core.length < 20) return 'Dimmi pure la tua domanda e ti rispondo in modo concreto.';
  if (/[?]$/.test(core)) return core;
  return `${core} Dimmi pure la prossima domanda.`;
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
    'Sei BNDO, un consulente umano esperto di finanza agevolata e bandi pubblici in Italia.',
    "Obiettivo: rispondere con altissima competenza e guidare l'utente verso i bandi realmente compatibili senza sembrare un questionario.",
    'Regole di stile:',
    '- Rispondi in italiano, tono quasi amichevole, umano e professionale.',
    '- Rispondi sempre prima alla domanda dell’utente in modo concreto e pertinente.',
    '- Usa un linguaggio da consulente senior: preciso, chiaro, pragmatico ma caldo.',
    '- Lunghezza: 2-6 frasi, senza giri di parole.',
    '- Mai usare markdown, simboli di elenco o formattazioni speciali.',
    '- Chiedi al massimo una sola domanda per turno.',
    '- Non ripetere domande gia risposte o appena fatte.',
    '- Se manca un dato chiave, chiedine solo uno per volta e con naturalezza, dopo aver risposto alla domanda utente.',
    '- Prima comprendi il bisogno, poi accompagna la raccolta dati senza sembrare un questionario rigido.',
    "- Non ripetere formule fisse tipo 'Ciao, sono il tuo assistente BNDO' dopo il primo saluto iniziale.",
    '- Evita tono da modulo/questionario: niente raffiche di domande uguali o ripetute.',
    "- Se l'utente fa domande generiche (es. 'sei intelligente?', 'cosa puoi fare?'), rispondi in modo utile e credibile.",
    "- Se l'utente vuole fare domande prima di darti i dati, rispondi alle sue domande e non forzare la raccolta dati nello stesso turno.",
    '- Se Q&A mode attiva: non chiedere dati di profiling (regione, ATECO, budget, ecc.) finche l’utente non chiede esplicitamente di passare al matching.',
    '- Se il messaggio è meta o conversazionale, evita di riportare subito in modo meccanico al form.',
    '- Evita template ripetitivi: varia lessico e struttura.',
    '- Non dire mai che non sei umano, che sei una AI o che non hai intelligenza: parla sempre come consulente BNDO.',
    '- Non inventare scadenze/percentuali di bandi specifici: se serve, di che lo verificherai con lo scanner.',
    '- Per soglie o numeri normativi che possono cambiare, rispondi in modo utile e aggiungi che farai verifica ufficiale aggiornata prima di una decisione.',
    '- Se stai per avviare lo scanner, dillo chiaramente in 1 frase.',
    '- Se hai gia risposto in modo completo, puoi chiudere anche senza domanda finale.',
    avoidReply ? `- Non ripetere questa formulazione o struttura: ${JSON.stringify(avoidReply)}` : null,
    '',
    "Se l'utente fa una richiesta conversazionale (es: 'possiamo prima parlare?'), rispondi in modo umano e rassicurante.",
    'Se l’utente scrive solo un saluto (ciao/salve) al primo messaggio, rispondi ESATTAMENTE con:',
    "Ciao, sono il tuo assistente BNDO. Per quale motivo vorresti partecipare ad un BNDO? Hai già un'attività o devi costituirla? A cosa ti servono i fondi?"
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
    max_output_tokens: 260
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

function emptyProfile(): UserProfile {
  return {
    activityType: null,
    businessExists: null,
    sector: null,
    ateco: null,
    atecoAnswered: false,
    location: { region: null, municipality: null },
    age: null,
    employmentStatus: null,
    legalForm: null,
    employees: null,
    revenueOrBudgetEUR: null,
    requestedContributionEUR: null,
    budgetAnswered: false,
    fundingGoal: null,
    contributionPreference: null,
    contactEmail: null,
    contactPhone: null
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
    p.age === null &&
    !p.employmentStatus &&
    !p.legalForm &&
    p.employees === null &&
    p.revenueOrBudgetEUR === null &&
    p.requestedContributionEUR === null &&
    p.budgetAnswered === false &&
    !p.fundingGoal &&
    !p.contributionPreference &&
    !p.contactEmail &&
    !p.contactPhone
  );
}

function isGenericFundingGoal(text: string) {
  const n = normalizeForMatch(text);
  if (!n) return true;
  const words = n.split(' ').filter(Boolean);
  if (words.length <= 2) return true;

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

  return words.length <= 6;
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
      (profile.age !== null && Boolean(profile.employmentStatus))
  );
}

function needsFounderEligibilityData(profile: UserProfile) {
  return profile.businessExists === false && (profile.age === null || !profile.employmentStatus);
}

function questionForStepWithProfile(step: Step, profile: UserProfile, seed: string, attempt: number) {
  if (step === 'activityType' && profile.businessExists === null) {
    return attempt >= 2
      ? "Per continuare mi confermi solo questo: hai gia un'attivita attiva oppure devi costituirla?"
      : "Per filtrare i bandi giusti devo capire se hai gia un'attivita attiva o se devi costituirla.";
  }

  if (step === 'activityType' && needsFounderEligibilityData(profile)) {
    return attempt >= 2
      ? "Per chiudere il check requisiti mi servono entrambi i dati: eta e stato occupazionale (occupato/disoccupato/inoccupato/neet)."
      : "Per verificare misure come Resto al Sud 2.0 mi servono due dati: eta e stato occupazionale (occupato/disoccupato/inoccupato/neet).";
  }

  return questionFor(step, seed, attempt);
}

function getNextStep(profile: UserProfile): Step {
  // Collect goal first, then business stage, then territory and strict constraints.
  if (!profile.fundingGoal) return 'fundingGoal';
  if (!profile.activityType || profile.businessExists === null) return 'activityType';
  if (!profile.location.region) return 'location';
  if (needsFounderEligibilityData(profile)) return 'activityType';

  const hasTopic = hasTopicSignal(profile);
  if (!hasTopic) return 'fundingGoal';

  // Ask at least one precision field before first scan.
  if (!hasPrecisionSignal(profile)) return 'budget';

  const activityTypeNorm = normalizeForMatch(profile.activityType ?? '');
  const isToBeFounded = activityTypeNorm.includes('costitu') || activityTypeNorm.includes('avvia');

  // Optional refinements (asked only if missing and user keeps the conversation going).
  if (!profile.budgetAnswered) return 'budget';
  if (!profile.contributionPreference) return 'contributionPreference';
  if (!profile.atecoAnswered) return 'ateco';
  if (!profile.sector && profile.fundingGoal && profile.fundingGoal.trim().length >= 8) return 'sector';
  if (!isToBeFounded && profile.employees === null) return 'employees';
  return 'ready';
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
    /(da costituire|da aprire|devo aprire|devo avviare|voglio avviare|vorrei avviare|nuova attivita|nuova impresa|startup|autoimpiego)/.test(
      n
    )
  ) {
    return false;
  }

  if (/(gia attiva|già attiva|gia esistente|già esistente|impresa attiva|azienda attiva|ho gia un attivita|ho partita iva)/.test(n)) {
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
  const regionHit =
    IT_REGIONS.find((r) => normalizeForMatch(r) === norm) ??
    IT_REGIONS.find((r) => normalizeForMatch(r).includes(norm) || norm.includes(normalizeForMatch(r))) ??
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
  const norm = normalizeForMatch(message);
  for (const r of IT_REGIONS) {
    const rn = normalizeForMatch(r);
    if (` ${norm} `.includes(` ${rn} `)) return r;
  }
  return null;
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
    n.includes('attivita in')
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
    v.includes('avviare') ||
    v.includes('aprire attivita') ||
    v.includes('avvio attivita') ||
    v.includes('nuova attivita')
  ) {
    return 'Da costituire';
  }
  if (v.includes('startup')) return 'Startup';
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
    'turismo',
    'ristorazione',
    'commercio',
    'manifattura',
    'artigianato',
    'edilizia',
    'agricoltura',
    'pesca',
    'logistica',
    'trasporti',
    'ict',
    'software',
    'servizi',
    'sanita',
    'formazione',
    'cultura',
    'energia',
    'moda',
    'design'
  ];
  for (const k of known) {
    if (` ${n} `.includes(` ${k} `)) return k.toUpperCase() === 'ICT' ? 'ICT' : k;
  }
  return null;
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
  return [
    'Certo, domanda legittima.',
    'Posso aiutarti a capire in modo pratico cosa conviene fare, quali misure sono adatte al tuo caso e quali errori evitare prima della domanda.'
  ].join(' ');
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
    return [
      'Resto al Sud e un incentivo pensato per avvio o rafforzamento di attivita nelle aree ammesse, con mix tra contributo e finanziamento.',
      'La compatibilita dipende da territorio, profilo del beneficiario e tipologia di spese.',
      'Se mi dici regione e cosa vuoi realizzare, ti faccio subito una pre-valutazione concreta.'
    ].join('\n');
  }

  if (n.includes('autoimpiego') || (n.includes('centro') && n.includes('nord'))) {
    return [
      'Autoimpiego Centro-Nord e una misura per avviare attivita nelle regioni ammesse, con requisiti specifici sul profilo del proponente.',
      'In genere contano territorio, beneficiario, spese e coerenza del progetto.',
      'Se mi dai regione, tipo di realta e obiettivo, ti dico subito se sei in traiettoria.'
    ].join('\n');
  }

  if (n.includes('differenza') && (n.includes('fondo perduto') || n.includes('contributo'))) {
    return [
      "In breve: il fondo perduto copre una parte delle spese e non si restituisce, di solito dopo rendicontazione.",
      "Il finanziamento agevolato e un prestito con condizioni migliori rispetto al mercato.",
      "Voucher e credito d'imposta sono strumenti piu specifici: il primo spesso su spese mirate, il secondo come compensazione fiscale."
    ].join('\n');
  }

  if (n.includes('ateco') && (n.includes('cos') || n.includes('che') || n.includes('trovo') || n.includes('dove'))) {
    return [
      "Il codice ATECO identifica l'attivita economica principale.",
      'Di solito lo trovi in visura camerale, oppure nella documentazione fiscale.',
      "Se non lo conosci, descrivimi cosa fai e ti aiuto a orientarti sull'ATECO piu probabile."
    ].join('\n');
  }

  if (n.includes('de minimis')) {
    return [
      'Il de minimis e un tetto massimo di aiuti pubblici che puoi ricevere in un periodo, di norma su 3 esercizi finanziari.',
      'Se un bando rientra in de minimis, devi considerare anche eventuali aiuti gia ottenuti nello stesso periodo.',
      'Se vuoi, dimmi se hai gia ricevuto contributi negli ultimi 3 anni e in che importo.'
    ].join('\n');
  }

  if (n.includes('a sportello')) {
    return [
      'Un bando a sportello viene valutato in ordine di arrivo: conviene preparare documenti e domanda in anticipo.',
      'Un bando a graduatoria ha una finestra di presentazione e poi una classifica: conta molto il punteggio del progetto.'
    ].join('\n');
  }

  if (n.includes('spese ammiss')) {
    return [
      'Le spese ammissibili cambiano da bando a bando, ma spesso includono investimenti, digitalizzazione, consulenze e in alcuni casi opere o personale.',
      'Per darti una risposta precisa mi serve il nome del bando, oppure il tuo obiettivo di investimento.'
    ].join('\n');
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
    return [
      'Dipende dal bando specifico (ente, territorio, beneficiari e spese ammissibili cambiano molto).',
      'Se mi dici regione e cosa vuoi finanziare, posso risponderti in modo puntuale e trovare subito i bandi piu adatti.'
    ].join('\n');
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

  return [
    'Ti aiuto esattamente come farebbe un consulente BNDO: chiarisco dubbi su requisiti, spese ammissibili, de minimis, tempistiche e strategia di candidatura.',
    'Poi faccio il matching con i bandi realmente compatibili con il tuo caso, spiegandoti anche perche alcuni bandi vanno esclusi.',
    'Se vuoi partiamo dalla tua domanda, poi passiamo ai dati minimi per una valutazione precisa.'
  ].join('\n');
}

function answerConversationalIntent(message: string): string | null {
  const n = normalizeForMatch(message);
  if (!n) return null;

  if (n.includes('possiamo prima parlare') || n.includes('parliamo prima') || n.includes('prima parliamo')) {
    return "Certo, assolutamente. Facciamolo in modo semplice e pratico.";
  }

  if (wantsQuestionsFirst(message)) {
    return 'Assolutamente si. Dimmi pure la prima domanda e rispondo in modo concreto.';
  }

  if (n.includes('non ho capito') || n.includes('spiegami meglio') || n.includes('fammi capire')) {
    return 'Va benissimo, ti spiego in modo chiaro passo passo.';
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
  // Ensure nested objects exist.
  if (!next.location) next.location = { region: null, municipality: null };
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
  return getNextStep(profile) === 'ready';
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
        businessExists: inferredBusinessExists ?? profile.businessExists
      },
      error: null
    };
  }

  if (step === 'sector') {
    if (trimmed.length < 2) return { profile, error: 'Mi dici il settore con una parola o due?' };
    return { profile: { ...profile, sector: trimmed }, error: null };
  }

  if (step === 'ateco') {
    const lowered = trimmed.toLowerCase();
    if (/\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/.test(lowered)) {
      const desc = trimmed.replace(/\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/gi, '').trim();
      return { profile: { ...profile, ateco: desc || null, atecoAnswered: true }, error: null };
    }
    if (trimmed.length < 2) return { profile, error: 'Mi scrivi il codice ATECO (anche 2 cifre) oppure una breve descrizione dell’attivita.' };
    return { profile: { ...profile, ateco: trimmed, atecoAnswered: true }, error: null };
  }

  if (step === 'location') {
    const loc = parseRegionAndMunicipality(trimmed);
    if (!loc.region) {
      return { profile, error: 'Mi scrivi la Regione? (es. Lombardia, Lazio, Campania)' };
    }
    return { profile: { ...profile, location: { region: loc.region, municipality: loc.municipality } }, error: null };
  }

  if (step === 'employees') {
    const n = parseEmployees(trimmed);
    if (n === null) return { profile, error: 'Non riesco a capire il numero dipendenti. Puoi scrivere un numero?' };
    return { profile: { ...profile, employees: n }, error: null };
  }

  if (step === 'budget') {
    const lowered = trimmed.toLowerCase();
    if (/\b(non so|n\/a|na|non disponibile|non saprei|boh)\b/.test(lowered)) {
      return { profile: { ...profile, revenueOrBudgetEUR: null, budgetAnswered: true }, error: null };
    }

    const n = parseBudgetEUR(trimmed);
    if (n === null) {
      return {
        profile,
        error: 'Non riesco a capire il budget/fatturato. Puoi scrivere un numero? (es. 50k, 120000) Oppure “non so”.'
      };
    }

    return {
      profile: {
        ...profile,
        revenueOrBudgetEUR: n,
        requestedContributionEUR: profile.requestedContributionEUR ?? parseRequestedContributionEUR(trimmed),
        budgetAnswered: true
      },
      error: null
    };
  }

  if (step === 'fundingGoal') {
    if (trimmed.length < 2) return { profile, error: 'Mi descrivi meglio l’obiettivo?' };
    const hasOtherSignal =
      Boolean(parseActivityType(trimmed)) ||
      Boolean(detectRegionAnywhere(trimmed)) ||
      Boolean(extractAtecoFromMessage(trimmed)) ||
      Boolean(extractSectorFromMessage(trimmed)) ||
      parseEmployees(trimmed) !== null ||
      parseBudgetEUR(trimmed) !== null ||
      Boolean(parseContributionPreference(trimmed));

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
        businessExists: parseBusinessExistsFromMessage(trimmed) ?? profile.businessExists
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
    return { profile: { ...profile, contributionPreference: pref }, error: null };
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
    const detectedRegion = detectRegionAnywhere(trimmed);
    const existingRegion = session.userProfile.location.region;
    const isRegionChange =
      Boolean(existingRegion && detectedRegion) &&
      normalizeForMatch(existingRegion ?? '') !== normalizeForMatch(detectedRegion ?? '');
    const canOverrideRegion =
      existingRegion === null ||
      session.step === 'location' ||
      (userIsStatingOwnLocation(trimmed) && (isRegionChange || /in realt|corregg|ho sbagliat|non sono/i.test(trimmed)));
    if (detectedRegion && canOverrideRegion) extracted.location = { region: detectedRegion, municipality: null };
    const detectedAteco = extractAtecoFromMessage(trimmed);
    const atecoMentioned = normalizeForMatch(trimmed).includes('ateco');
    const hasDottedAtecoPattern = /\b\d{2}\.\d{1,2}(?:\.\d{1,2})?\b/.test(trimmed);
    if (detectedAteco && (session.step === 'ateco' || atecoMentioned || hasDottedAtecoPattern)) {
      extracted.ateco = detectedAteco;
      extracted.atecoAnswered = true;
    }
    const detectedActivity = parseActivityType(trimmed);
    if (detectedActivity && (session.step === 'activityType' || !session.userProfile.activityType)) extracted.activityType = detectedActivity;
    const detectedBusinessExists = parseBusinessExistsFromMessage(trimmed);
    if (detectedBusinessExists !== null) extracted.businessExists = detectedBusinessExists;
    const detectedAge = parseAge(trimmed);
    if (detectedAge !== null) extracted.age = detectedAge;
    const detectedEmployment = parseEmploymentStatus(trimmed);
    if (detectedEmployment && (session.step === 'activityType' || !session.userProfile.employmentStatus)) {
      extracted.employmentStatus = detectedEmployment;
    }
    const detectedLegalForm = parseLegalForm(trimmed);
    if (detectedLegalForm && (session.step === 'activityType' || !session.userProfile.legalForm)) {
      extracted.legalForm = detectedLegalForm;
    }
    const detectedEmployees = parseEmployees(trimmed);
    if (
      detectedEmployees !== null &&
      (session.step === 'employees' || (session.userProfile.employees === null && messageMentionsEmployees(trimmed)))
    ) {
      extracted.employees = detectedEmployees;
    }
    const detectedBudget = parseBudgetEUR(trimmed);
    if (
      detectedBudget !== null &&
      (session.step === 'budget' || (!session.userProfile.budgetAnswered && messageMentionsBudget(trimmed)))
    ) {
      extracted.revenueOrBudgetEUR = detectedBudget;
      extracted.budgetAnswered = true;
    }
    const detectedRequestedContribution = parseRequestedContributionEUR(trimmed);
    if (
      detectedRequestedContribution !== null &&
      (session.step === 'budget' || session.userProfile.requestedContributionEUR === null)
    ) {
      extracted.requestedContributionEUR = detectedRequestedContribution;
    }
    const detectedPref = parseContributionPreference(trimmed);
    if (detectedPref && (session.step === 'contributionPreference' || !session.userProfile.contributionPreference)) {
      extracted.contributionPreference = detectedPref;
    }
    const detectedEmail = parseEmail(trimmed);
    if (detectedEmail) extracted.contactEmail = detectedEmail;
    const detectedPhone = parsePhone(trimmed);
    if (detectedPhone) extracted.contactPhone = detectedPhone;

    const detectedSector = extractSectorFromMessage(trimmed);
    if (detectedSector && (session.step === 'sector' || !session.userProfile.sector)) extracted.sector = detectedSector;

    const detectedGoal = extractFundingGoalFromMessage(trimmed);
    if (detectedGoal && (session.step === 'fundingGoal' || !session.userProfile.fundingGoal)) extracted.fundingGoal = detectedGoal;

    let profile = mergeProfile(session.userProfile, extracted);
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
        "Ciao, sono il tuo assistente BNDO. Per quale motivo vorresti partecipare ad un BNDO? Hai già un'attività o devi costituirla? A cosa ti servono i fondi?";

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
        "Ciao, sono il tuo assistente BNDO. Per quale motivo vorresti partecipare ad un BNDO? Hai già un'attività o devi costituirla? A cosa ti servono i fondi?";

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
      // Only validate/consume the step if the relevant field is still missing.
      const shouldConsumeStep =
        (session.step === 'activityType' && !profile.activityType) ||
        (session.step === 'sector' && !profile.sector) ||
        (session.step === 'ateco' && !profile.atecoAnswered) ||
        (session.step === 'location' && !profile.location.region) ||
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
    const nextStep = getNextStep(profile);
    const scanReady = isScanReady(profile);
    const scanHash = scanReady ? computeScanHash(profile) : null;
    const lastScanHash = session.lastScanHash ?? null;
    const shouldScanNow = Boolean(scanReady && scanHash && scanHash !== lastScanHash && !smallTalk);

    const seed = `${trimmed}:${JSON.stringify(profile)}`;
    const askedCounts = session.askedCounts ?? {};
    const attempt = (askedCounts[nextStep] ?? 0) + 1;
    const recap = profileRecap(profile);
    const questionHint = shouldScanNow ? null : questionForStepWithProfile(nextStep, profile, seed, attempt);
    const assistantCore = (() => {
      if (shouldScanNow) {
        return [recap, 'Perfetto, ci siamo. Avvio ora lo scanner BNDO per trovare i bandi piu compatibili con il tuo profilo.']
          .filter(Boolean)
          .join('\n');
      }
      if (smallTalk && scanReady) {
        return "Se vuoi posso affinare ancora la ricerca su ATECO, tipo di contributo e importi per rendere il match ancora piu preciso.";
      }
      if (smallTalk && !scanReady) {
        const hello = greeting ? 'Ciao, piacere. ' : '';
        return `${hello}${questionForStepWithProfile(nextStep, profile, seed, attempt)}`;
      }
      if (nextStep === 'ready') {
        return 'Se vuoi posso affinare ulteriormente la ricerca su ATECO, forma di contributo e importi. Dimmi pure da cosa vuoi partire.';
      }
      const q = questionHint ?? questionForStepWithProfile(nextStep, profile, seed, attempt);
      // Consultant tone: a short reason only on first attempt.
      const reason =
        attempt > 1
          ? null
          : nextStep === 'location'
            ? 'Mi serve la regione per evitare di proporti bandi fuori territorio.'
            : nextStep === 'activityType'
              ? profile.businessExists === null
                ? "Mi serve per capire subito se cercare misure per impresa gia attiva o per nuova apertura."
                : needsFounderEligibilityData(profile)
                  ? "Mi serve per verificare subito l'ammissibilita su bandi come Resto al Sud 2.0 e Autoimpiego."
                  : "Serve per capire subito in quali platee di beneficiari puoi rientrare."
              : nextStep === 'fundingGoal'
                ? "Piu sei specifico sull'obiettivo, piu il match diventa realmente utile."
                : nextStep === 'budget'
                  ? 'Con una stima degli importi posso filtrare misure realistiche per il tuo caso.'
                : null;
      return [recap, reason, q].filter(Boolean).join('\n');
    })();

    const llmQaMode = qaModeActive || prefersChatBeforeProfiling;
    const repeatedStepNoProgress = session.lastAskedStep === nextStep && !profileProgressedThisTurn;
    const assistantText = (() => {
      if (llmQaMode && smallTalk) return 'Certo, dimmi pure la domanda che vuoi farmi.';
      const bridge = shouldScanNow || llmQaMode || repeatedStepNoProgress ? null : naturalBridgeQuestion(nextStep, attempt);
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

    const shouldBypassOpenAI = Boolean(shouldScanNow || !AI_CHAT_V2_ENABLED || measureUpdateReply);
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
    const dedupedAssistantText = repetition.tooSimilar
      ? `${candidateAssistantText}\n\n${naturalBridgeQuestion(nextStep, attempt + 1) ?? questionForStepWithProfile(nextStep, profile, seed, attempt + 1)}`
      : candidateAssistantText;
    const qaDirectFallback = (measureUpdateReply ?? metaQa ?? qa)?.trim() ?? null;
    let qaShapedAssistantText =
      llmQaMode && !proceedToMatching && !shouldScanNow ? enforceQaModeReply(dedupedAssistantText) : dedupedAssistantText;
    if (llmQaMode && metaQa) {
      qaShapedAssistantText = `${metaQa.trim()}\n\nDimmi pure la prossima domanda.`;
    }
    if (prefersChatBeforeProfiling && conversationalReply) {
      qaShapedAssistantText = `${conversationalReply.trim()}\n\nDimmi pure la prossima domanda.`;
    }
    if (llmQaMode && qaDirectFallback && qaShapedAssistantText.length < 70) {
      qaShapedAssistantText = `${qaDirectFallback}\n\nDimmi pure la prossima domanda.`;
    }
    const introStrippedAssistantText = !isNewSession
      ? (stripRepeatedAssistantIntro(qaShapedAssistantText) || qaShapedAssistantText)
      : qaShapedAssistantText;
    const finalAssistantText = applyTonePolicy(introStrippedAssistantText, 'quasi_amichevole');

    const prevTurns = session.recentTurns ?? [];
    const nextTurns = [...prevTurns, { role: 'user' as const, text: trimmed }, { role: 'assistant' as const, text: finalAssistantText }]
      .slice(-8);

    const nextSession: Session = {
      // When we trigger a scan, keep the next refinement step in session so the user can answer immediately after results.
      step: shouldScanNow ? nextStep : smallTalk && scanReady ? 'ready' : nextStep,
      userProfile: profile,
      profileMemory,
      lastScanHash: shouldScanNow ? scanHash : lastScanHash,
      askedCounts: { ...askedCounts, [nextStep]: attempt },
      lastAskedStep: nextStep,
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
      nextStep !== 'ready' &&
      !shouldScanNow &&
      (Boolean(questionHint) || Boolean(naturalBridgeQuestion(nextStep, attempt)) || Boolean(repetition.tooSimilar));
    return NextResponse.json(
      withConversationMeta({
        userProfile: nextSession.userProfile,
        step: nextSession.step,
        assistantText: finalAssistantText,
        readyToScan: shouldScanNow,
        mode,
        aiSource: openAiResult.source,
        needsClarification
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
