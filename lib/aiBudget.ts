import { promises as fs } from 'fs';

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

async function readUsage(): Promise<UsageSample> {
  const monthKey = monthKeyFromDate();
  const path = getTrackPath();
  try {
    const raw = await fs.readFile(path, 'utf8');
    const json = JSON.parse(raw) as Partial<UsageSample>;
    if (!json || json.monthKey !== monthKey) {
      return {
        monthKey,
        inputTokens: 0,
        outputTokens: 0,
        usdSpent: 0,
        eurSpent: 0,
        requestsCount: 0,
        fallbackCount: 0,
        updatedAt: new Date().toISOString()
      };
    }
    return {
      monthKey,
      inputTokens: Number.isFinite(json.inputTokens) ? Math.max(0, Math.floor(json.inputTokens ?? 0)) : 0,
      outputTokens: Number.isFinite(json.outputTokens) ? Math.max(0, Math.floor(json.outputTokens ?? 0)) : 0,
      usdSpent: Number.isFinite(json.usdSpent) ? Math.max(0, Number(json.usdSpent ?? 0)) : 0,
      eurSpent: Number.isFinite(json.eurSpent) ? Math.max(0, Number(json.eurSpent ?? 0)) : 0,
      requestsCount: Number.isFinite(json.requestsCount) ? Math.max(0, Math.floor(json.requestsCount ?? 0)) : 0,
      fallbackCount: Number.isFinite(json.fallbackCount) ? Math.max(0, Math.floor(json.fallbackCount ?? 0)) : 0,
      updatedAt: json.updatedAt ?? new Date().toISOString()
    };
  } catch {
    return {
      monthKey,
      inputTokens: 0,
      outputTokens: 0,
      usdSpent: 0,
      eurSpent: 0,
      requestsCount: 0,
      fallbackCount: 0,
      updatedAt: new Date().toISOString()
    };
  }
}

async function writeUsage(usage: UsageSample) {
  const path = getTrackPath();
  await fs.writeFile(path, JSON.stringify(usage), 'utf8');
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
