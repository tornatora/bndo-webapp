import type { Session, Step, UserProfile } from '@/lib/conversation/types';

type SessionEnvelope = {
  session: Session;
  updatedAtMs: number;
};

const STORE_KEY = '__bndo_conversation_session_store__';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8h browser-session style
const MAX_SESSIONS = 5000;

function nowMs() {
  return Date.now();
}

function globalStore() {
  const globalObject = globalThis as unknown as Record<string, unknown>;
  if (!globalObject[STORE_KEY]) {
    globalObject[STORE_KEY] = new Map<string, SessionEnvelope>();
  }
  return globalObject[STORE_KEY] as Map<string, SessionEnvelope>;
}

function shouldExpire(envelope: SessionEnvelope, now = nowMs()) {
  return now - envelope.updatedAtMs > SESSION_TTL_MS;
}

function defaultProfile(): UserProfile {
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
    teamMajority: null,
    agricultureStatus: null,
    tech40: null,
    professionalRegister: null,
    isThirdSector: null,
    propertyStatus: null,
    foundationYear: null,
    annualTurnover: null,
    isInnovative: null,
    slotSource: {}
  };
}

export function buildDefaultSession(conversationId: string): Session {
  return {
    conversationId,
    step: 'fundingGoal',
    userProfile: defaultProfile(),
    askedCounts: {},
    lastAskedStep: null,
    recentTurns: [],
    qaMode: false,
    conversationSummary: null,
    updatedAt: new Date().toISOString()
  };
}

export function buildRollingSummary(args: {
  profile: UserProfile;
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
  intent?: string | null;
  action?: string | null;
}) {
  const { profile, turns, intent, action } = args;
  const summaryBits: string[] = [];
  if (profile.location?.region) summaryBits.push(`Regione: ${profile.location.region}`);
  if (profile.activityType) summaryBits.push(`Attività: ${profile.activityType}`);
  if (profile.sector) summaryBits.push(`Settore: ${profile.sector}`);
  if (profile.ateco) summaryBits.push(`ATECO: ${profile.ateco}`);
  if (profile.fundingGoal) summaryBits.push(`Obiettivo: ${profile.fundingGoal}`);
  if (profile.requestedContributionEUR !== null && profile.requestedContributionEUR !== undefined) {
    summaryBits.push(`Contributo richiesto: ${profile.requestedContributionEUR}€`);
  } else if (profile.revenueOrBudgetEUR !== null && profile.revenueOrBudgetEUR !== undefined) {
    summaryBits.push(`Budget: ${profile.revenueOrBudgetEUR}€`);
  }
  if (profile.businessExists === true) summaryBits.push('Impresa già attiva');
  if (profile.businessExists === false) summaryBits.push('Impresa da costituire');
  if (profile.age !== null && profile.age !== undefined) summaryBits.push(`Età: ${profile.age}`);
  if (profile.employmentStatus) summaryBits.push(`Occupazione: ${profile.employmentStatus}`);
  if (intent) summaryBits.push(`Intent: ${intent}`);
  if (action) summaryBits.push(`Azione: ${action}`);

  const recentTurns = turns.slice(-6).map((turn) => {
    const role = turn.role === 'user' ? 'U' : 'A';
    const text = turn.text.replace(/\s+/g, ' ').trim();
    return `${role}: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`;
  });

  const parts = [
    summaryBits.length ? `Profilo: ${summaryBits.join(' | ')}` : null,
    recentTurns.length ? `Contesto recente: ${recentTurns.join(' || ')}` : null
  ].filter(Boolean);

  return parts.join('\n');
}

export function cleanupSessionStore(force = false) {
  const store = globalStore();
  const now = nowMs();
  let deleted = 0;

  for (const [id, envelope] of store.entries()) {
    if (shouldExpire(envelope, now)) {
      store.delete(id);
      deleted += 1;
    }
  }

  if (force && store.size > MAX_SESSIONS) {
    const entries = [...store.entries()].sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs);
    const toDelete = store.size - MAX_SESSIONS;
    for (let i = 0; i < toDelete; i += 1) {
      const entry = entries[i];
      if (!entry) break;
      store.delete(entry[0]);
      deleted += 1;
    }
  }

  return { deleted, size: store.size };
}

export function getSession(conversationId: string) {
  const store = globalStore();
  const envelope = store.get(conversationId);
  if (!envelope) return null;
  if (shouldExpire(envelope)) {
    store.delete(conversationId);
    return null;
  }
  return envelope.session;
}

export function upsertSession(session: Session) {
  const store = globalStore();
  const next: Session = {
    ...session,
    updatedAt: new Date().toISOString()
  };
  store.set(session.conversationId, {
    session: next,
    updatedAtMs: nowMs()
  });
  cleanupSessionStore(store.size > MAX_SESSIONS);
  return next;
}

export function ensureSession(conversationId: string) {
  const existing = getSession(conversationId);
  if (existing) return existing;
  const created = buildDefaultSession(conversationId);
  return upsertSession(created);
}

export function deleteSession(conversationId: string) {
  const store = globalStore();
  store.delete(conversationId);
}

export function isLikelySessionPayloadCookie(raw: string) {
  try {
    const json = decodeBase64Url(raw);
    const parsed = JSON.parse(json) as Partial<Session>;
    return Boolean(parsed && parsed.userProfile && parsed.step);
  } catch {
    return false;
  }
}

export function decodeLegacySessionCookie(raw: string): Session | null {
  try {
    const json = decodeBase64Url(raw);
    const parsed = JSON.parse(json) as Partial<Session>;
    if (!parsed?.userProfile || !parsed?.step) return null;
    const conversationId = `conv_${crypto.randomUUID()}`;
    const next: Session = {
      ...buildDefaultSession(conversationId),
      ...parsed,
      conversationId,
      step: (parsed.step as Step) ?? 'fundingGoal',
      userProfile: parsed.userProfile as UserProfile
    };
    return next;
  } catch {
    return null;
  }
}

function decodeBase64Url(raw: string) {
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLen)}`;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
