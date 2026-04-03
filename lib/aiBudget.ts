
type UsageSample = {
  monthKey: string;
  inputTokens: number;
  outputTokens: number;
  usdSpent: number;
  eurSpent: number;
  requestsCount: number;
  fallbackCount: number;
  updatedAt: string;
};

const DEFAULT_TRACK_PATH = '/tmp/bndo-ai-usage.json';
const DEFAULT_MAX_EUR = 10;
const DEFAULT_USD_TO_EUR = 0.92;

function monthKeyFromDate(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function toNum(v: string | undefined, fallback: number) {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function getTrackPath() {
  return process.env.AI_USAGE_TRACK_PATH?.trim() || DEFAULT_TRACK_PATH;
}

function getMaxBudgetEur() {
  return toNum(process.env.AI_MAX_BUDGET_EUR, DEFAULT_MAX_EUR);
}

function getUsdToEur() {
  return toNum(process.env.USD_TO_EUR, DEFAULT_USD_TO_EUR);
}

// In-memory budget tracker for Edge or local fallback.
// Note: In Edge Runtime, global variables are preserved between requests on the same node.
let edgeUsageCache: UsageSample | null = null;

async function readUsage(): Promise<UsageSample> {
  const monthKey = monthKeyFromDate();
  
  // Use memory cache if available and same month
  if (edgeUsageCache && edgeUsageCache.monthKey === monthKey) {
    return edgeUsageCache;
  }

  // Fallback to fresh state (persistence not guaranteed in Edge across nodes)
  const fresh: UsageSample = {
    monthKey,
    inputTokens: 0,
    outputTokens: 0,
    usdSpent: 0,
    eurSpent: 0,
    requestsCount: 0,
    fallbackCount: 0,
    updatedAt: new Date().toISOString()
  };
  
  edgeUsageCache = fresh;
  return fresh;
}

async function writeUsage(usage: UsageSample) {
  edgeUsageCache = usage;
}

export async function canUsePaidAI() {
  const u = await readUsage();
  return u.eurSpent < getMaxBudgetEur();
}

export function computeGpt4oMiniUsd(inputTokens: number, outputTokens: number) {
  // gpt-4o-mini pricing (USD per 1M): input 0.15, output 0.60
  return (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.6;
}

export async function addPaidAIUsage(inputTokens: number, outputTokens: number) {
  const current = await readUsage();
  const usd = computeGpt4oMiniUsd(inputTokens, outputTokens);
  const eur = usd * getUsdToEur();
  const next: UsageSample = {
    monthKey: current.monthKey,
    inputTokens: current.inputTokens + Math.max(0, Math.floor(inputTokens)),
    outputTokens: current.outputTokens + Math.max(0, Math.floor(outputTokens)),
    usdSpent: current.usdSpent + usd,
    eurSpent: current.eurSpent + eur,
    requestsCount: current.requestsCount + 1,
    fallbackCount: current.fallbackCount,
    updatedAt: new Date().toISOString()
  };
  await writeUsage(next);
  return next;
}

export async function addAIFallbackUsage() {
  const current = await readUsage();
  const next: UsageSample = {
    ...current,
    fallbackCount: current.fallbackCount + 1,
    updatedAt: new Date().toISOString()
  };
  await writeUsage(next);
  return next;
}

export async function getBudgetSnapshot() {
  const u = await readUsage();
  return {
    ...u,
    avgInputTokens: u.requestsCount > 0 ? u.inputTokens / u.requestsCount : 0,
    avgOutputTokens: u.requestsCount > 0 ? u.outputTokens / u.requestsCount : 0,
    maxBudgetEur: getMaxBudgetEur()
  };
}
