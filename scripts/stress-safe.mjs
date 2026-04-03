import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeConversationResponse } from './utils/conversationSse.mjs';

const baseUrl = process.env.STRESS_BASE_URL || 'http://127.0.0.1:3300';
const scanRuns = Number(process.env.STRESS_SCAN_RUNS || 120);
const conversationRuns = Number(process.env.STRESS_CONV_RUNS || 40);
const concurrency = Math.max(1, Number(process.env.STRESS_CONCURRENCY || 6));
const timeoutMs = Math.max(1000, Number(process.env.STRESS_TIMEOUT_MS || 9000));
const interRequestDelayMs = Math.max(0, Number(process.env.STRESS_DELAY_MS || 120));
const interTurnDelayMs = Math.max(0, Number(process.env.STRESS_TURN_DELAY_MS || 120));
const retry429Max = Math.max(0, Number(process.env.STRESS_RETRY_429_MAX || 2));
const outputDir = process.env.STRESS_OUTPUT_DIR || path.resolve(process.cwd(), 'runtime-stress');

const scanScenarios = [
  {
    id: 'south-startup-target',
    expectIncludes: ['Resto al Sud 2.0', 'FUSESE', 'Oltre Nuove imprese'],
    payload: {
      userProfile: {
        region: 'Calabria',
        businessExists: false,
        ageBand: 'under35',
        employmentStatus: 'Disoccupato',
        fundingGoal: 'Aprire una nuova attività imprenditoriale',
        contributionPreference: 'fondo_perduto',
      },
      mode: 'fast',
      channel: 'chat',
      strictness: 'high',
      limit: 8,
    },
  },
  {
    id: 'energy-existing-calabria',
    expectIncludes: ['sostenibilità e risparmio energetico'],
    payload: {
      userProfile: {
        region: 'Calabria',
        businessExists: true,
        activityType: 'PMI',
        sector: 'Commercio',
        fundingGoal: 'Efficientamento energetico con fotovoltaico e riduzione consumi',
        requestedContributionEUR: 15000,
        contributionPreference: 'fondo_perduto',
      },
      mode: 'fast',
      channel: 'chat',
      strictness: 'high',
      limit: 8,
    },
  },
  {
    id: 'digital-assessment-existing',
    expectIncludes: ['PIDNEXT'],
    payload: {
      userProfile: {
        region: 'Lazio',
        businessExists: true,
        activityType: 'PMI',
        sector: 'Digitale',
        fundingGoal: 'Assessment e roadmap di trasformazione digitale',
        requestedContributionEUR: 5000,
        contributionPreference: 'fondo_perduto',
      },
      mode: 'fast',
      channel: 'chat',
      strictness: 'high',
      limit: 8,
    },
  },
  {
    id: 'startup-centro-nord',
    expectIncludes: ['Autoimpiego Centro-Nord'],
    payload: {
      userProfile: {
        region: 'Lazio',
        businessExists: false,
        ageBand: 'under35',
        employmentStatus: 'Disoccupato',
        fundingGoal: 'Avviare attività di servizi',
        contributionPreference: 'fondo_perduto',
      },
      mode: 'fast',
      channel: 'chat',
      strictness: 'high',
      limit: 8,
    },
  },
];

const conversationScenarios = [
  {
    id: 'agri-existing-sicilia',
    turns: ['Ho un impresa agricola in Sicilia'],
    expectEnd: {
      businessExists: true,
      region: 'Sicilia',
      sectorIncludes: 'agricolt',
      nextFieldOneOf: ['fundingGoal', 'budget', 'contributionPreference'],
      forbidAssistantRegex: [/in che settore operi/i],
      readinessReasonOneOf: ['missing:fundingGoal', 'missing:topicPrecision', 'ready'],
    },
  },
  {
    id: 'south-youth-short',
    turns: ['Sono under35 calabrese e disoccupato', 'Voglio aprire una nuova attività imprenditoriale'],
    expectEnd: {
      readinessReasonOneOf: ['ready', 'missing:topicPrecision', 'missing:fundingGoal'],
      forbidAssistantRegex: [/in che settore operi/i],
    },
  },
  {
    id: 'existing-business-energy',
    turns: ['Ho una PMI in Calabria', 'Cerco un contributo per fotovoltaico ed efficientamento energetico'],
    expectEnd: {
      readinessReasonOneOf: ['ready', 'missing:fundingGoal', 'missing:topicPrecision'],
      forbidAssistantRegex: [/in che settore operi/i],
    },
  },
  {
    id: 'generic-progressive',
    turns: ['ciao', 'voglio un bando', 'ok', 'aprire attività in Calabria'],
    expectEnd: {
      readinessReasonOneOf: ['missing:topicPrecision', 'missing:fundingGoal', 'missing:businessContext'],
    },
  },
];

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length));
  return sortedValues[idx];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function questionCount(text) {
  return (String(text || '').match(/\?/g) || []).length;
}

function normalizeText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function fieldAlreadyKnown(profile, field) {
  const p = profile && typeof profile === 'object' ? profile : {};
  if (field === 'activityType') return Boolean(p.activityType || p.businessExists !== null);
  if (field === 'sector') return Boolean(typeof p.sector === 'string' && p.sector.trim());
  if (field === 'location') return Boolean(p.location?.region && p.locationNeedsConfirmation !== true);
  if (field === 'fundingGoal') return Boolean(typeof p.fundingGoal === 'string' && p.fundingGoal.trim());
  if (field === 'budget') return Boolean(p.budgetAnswered || p.requestedContributionEUR !== null || p.revenueOrBudgetEUR !== null);
  if (field === 'contributionPreference') return Boolean(p.contributionPreference);
  if (field === 'ateco') return Boolean(p.atecoAnswered || (typeof p.ateco === 'string' && p.ateco.trim()));
  return false;
}

function parseCookieHeader(setCookieRaw) {
  if (!setCookieRaw) return null;
  const parts = String(setCookieRaw).split(/,(?=[^;]+=[^;]+)/g);
  for (const part of parts) {
    const token = part.split(';', 1)[0]?.trim();
    if (token?.startsWith('bndo_assistant_session=')) return token;
  }
  return null;
}

async function fetchJsonWithTimeout(url, init = {}, ms = timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') || String(text || '').trimStart().startsWith('data:')) {
      json = normalizeConversationResponse({ response, text }).json;
    } else {
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
      latencyMs: Date.now() - startedAt,
      headers: response.headers,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: String(error instanceof Error ? error.message : error),
      latencyMs: Date.now() - startedAt,
      headers: null,
      aborted: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonRateAware(url, init = {}) {
  let attempt = 0;
  while (true) {
    const res = await fetchJsonWithTimeout(url, init, timeoutMs);
    if (res.status !== 429 || attempt >= retry429Max) return res;

    const retryAfterHeader = Number(res.headers?.get?.('retry-after') || 0);
    const waitMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : 1200 * (attempt + 1);
    await sleep(waitMs);
    attempt += 1;
  }
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function applyJitter(payload, iteration) {
  const next = clone(payload);
  const profile = next?.userProfile ?? {};
  if (typeof profile.requestedContributionEUR === 'number') {
    const delta = ((iteration % 5) - 2) * 1500;
    profile.requestedContributionEUR = Math.max(1000, profile.requestedContributionEUR + delta);
  }
  if (typeof profile.revenueOrBudgetEUR === 'number') {
    const delta = ((iteration % 7) - 3) * 2000;
    profile.revenueOrBudgetEUR = Math.max(2000, profile.revenueOrBudgetEUR + delta);
  }
  next.userProfile = profile;
  return next;
}

function validateScanResult(scenario, data) {
  const failures = [];
  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length === 0) {
    failures.push('empty_results');
    return failures;
  }

  const titles = results.map((entry) => String(entry?.title || ''));
  const titlesNorm = titles.map((entry) => normalizeText(entry));
  for (const expected of scenario.expectIncludes || []) {
    const expNorm = normalizeText(expected);
    if (!titlesNorm.some((title) => title.includes(expNorm))) {
      failures.push(`missing_expected:${expected}`);
    }
  }

  const top = results[0];
  const offer = top?.economicOffer && typeof top.economicOffer === 'object' ? top.economicOffer : null;
  if (offer) {
    const min = Number(offer.costMin);
    const max = Number(offer.costMax);
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0 && min > max) {
      failures.push('economic_inverted_range');
    }
  }

  const weirdMiniAmount = titlesNorm.some((title, idx) => {
    if (!title.includes('cciaa')) return false;
    const item = results[idx];
    const projectLabel = String(item?.economicOffer?.displayProjectAmountLabel || '').toLowerCase();
    return /€\s*200/.test(projectLabel) || /€\s*400/.test(projectLabel) || /€\s*750/.test(projectLabel);
  });
  if (weirdMiniAmount) failures.push('economic_suspicious_micro_amount');

  return failures;
}

async function runScanIteration(index) {
  const scenario = scanScenarios[index % scanScenarios.length];
  const payload = applyJitter(scenario.payload, index);
  const res = await fetchJsonRateAware(`${baseUrl}/api/scan-bandi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const failures = [];
  if (!res.ok) {
    failures.push(`http_${res.status || 'timeout'}`);
  } else {
    failures.push(...validateScanResult(scenario, res.json));
  }
  return {
    scenarioId: scenario.id,
    latencyMs: res.latencyMs,
    status: res.status,
    failures,
    topTitle: String(res.json?.results?.[0]?.title || ''),
  };
}

async function runConversationIteration(index) {
  const scenario = conversationScenarios[index % conversationScenarios.length];
  const state = { cookie: null };
  const failures = [];
  const latencies = [];
  let stupidQuestionCount = 0;
  let questionCountTotal = 0;
  let previousField = null;
  let sameFieldChain = 1;
  let lastReply = null;

  for (const message of scenario.turns) {
    const headers = { 'content-type': 'application/json' };
    if (state.cookie) headers.cookie = state.cookie;
    const res = await fetchJsonRateAware(`${baseUrl}/api/conversation`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
    });
    latencies.push(res.latencyMs);
    if (!res.ok || !res.json) {
      failures.push(`http_${res.status || 'timeout'}`);
      continue;
    }

    const setCookie = parseCookieHeader(res.headers?.get?.('set-cookie'));
    if (setCookie) state.cookie = setCookie;

    const text = String(res.json.assistantText || '');
    if (text.length > 280) failures.push('too_verbose');
    if (questionCount(text) > 1) failures.push('too_many_questions');
    for (const rx of scenario.expectEnd?.forbidAssistantRegex ?? []) {
      if (rx.test(text)) failures.push(`forbidden_prompt:${rx}`);
    }

    const nextField = typeof res.json.nextQuestionField === 'string' ? res.json.nextQuestionField : null;
    if (nextField) {
      questionCountTotal += 1;
      if (fieldAlreadyKnown(res.json.userProfile, nextField)) {
        stupidQuestionCount += 1;
        failures.push(`stupid_question:${nextField}`);
      }
    }
    if (nextField && previousField && nextField === previousField) {
      sameFieldChain += 1;
      if (sameFieldChain > 2) failures.push('repeated_same_field');
    } else {
      sameFieldChain = 1;
    }
    previousField = nextField;
    lastReply = res.json;
    if (interTurnDelayMs > 0) await sleep(interTurnDelayMs);
  }

  const finalProfile = lastReply?.userProfile ?? {};
  if (scenario.expectEnd?.businessExists !== undefined && finalProfile.businessExists !== scenario.expectEnd.businessExists) {
    failures.push('business_exists_mismatch');
  }
  if (scenario.expectEnd?.region && normalizeText(finalProfile.location?.region || '') !== normalizeText(scenario.expectEnd.region)) {
    failures.push('region_mismatch');
  }
  if (scenario.expectEnd?.sectorIncludes) {
    const sectorNorm = normalizeText(finalProfile.sector || '');
    if (!sectorNorm.includes(normalizeText(scenario.expectEnd.sectorIncludes))) {
      failures.push('sector_mismatch');
    }
  }
  if (Array.isArray(scenario.expectEnd?.nextFieldOneOf)) {
    const finalField = String(lastReply?.nextQuestionField || '');
    const ok = scenario.expectEnd.nextFieldOneOf.some((entry) => finalField === entry);
    if (!ok) failures.push(`next_field_unexpected:${finalField || 'none'}`);
  }
  if (Array.isArray(scenario.expectEnd?.readinessReasonOneOf)) {
    const reason = String(lastReply?.scanReadinessReason || '');
    const ok = scenario.expectEnd.readinessReasonOneOf.includes(reason);
    if (!ok) failures.push(`readiness_reason_unexpected:${reason || 'none'}`);
  }

  return {
    scenarioId: scenario.id,
    latencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    failures,
    lastQuestionField: lastReply?.nextQuestionField ?? null,
    stupidQuestionCount,
    questionCountTotal,
  };
}

async function runInPool(total, worker, label) {
  const results = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, total) }).map(async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= total) break;
      const result = await worker(current);
      results.push(result);
      if ((current + 1) % Math.max(1, Math.floor(total / 5)) === 0) {
        process.stdout.write(`[${label}] ${current + 1}/${total}\n`);
      }
      if (interRequestDelayMs > 0) await sleep(interRequestDelayMs);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizeResults(items) {
  const latencies = items.map((entry) => entry.latencyMs).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const failuresByType = {};
  let failed = 0;
  let stupidQuestionCount = 0;
  let questionCountTotal = 0;
  for (const item of items) {
    if (item.failures.length > 0) failed += 1;
    stupidQuestionCount += Number(item.stupidQuestionCount || 0);
    questionCountTotal += Number(item.questionCountTotal || 0);
    for (const failure of item.failures) {
      failuresByType[failure] = (failuresByType[failure] || 0) + 1;
    }
  }
  return {
    total: items.length,
    failed,
    failureRate: items.length ? Number((failed / items.length).toFixed(4)) : 0,
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies[latencies.length - 1] || 0,
      avg: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    },
    stupidQuestionCount,
    questionCountTotal,
    stupidQuestionRate: questionCountTotal > 0 ? Number((stupidQuestionCount / questionCountTotal).toFixed(4)) : 0,
    failuresByType,
  };
}

function buildMarkdownReport(summary, scanSummary, conversationSummary) {
  const scanFailures = Object.entries(scanSummary.failuresByType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '- none';
  const convFailures = Object.entries(conversationSummary.failuresByType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '- none';

  return `# Stress Safe Report

Base URL: ${summary.baseUrl}
Generated at: ${summary.generatedAt}
Timeout: ${summary.timeoutMs}ms
Concurrency: ${summary.concurrency}

## Scan
- total: ${scanSummary.total}
- failed: ${scanSummary.failed}
- failure rate: ${scanSummary.failureRate}
- latency avg/p50/p95/max: ${scanSummary.latency.avg}/${scanSummary.latency.p50}/${scanSummary.latency.p95}/${scanSummary.latency.max} ms

Top failures:
${scanFailures}

## Conversation
- total: ${conversationSummary.total}
- failed: ${conversationSummary.failed}
- failure rate: ${conversationSummary.failureRate}
- latency avg/p50/p95/max: ${conversationSummary.latency.avg}/${conversationSummary.latency.p50}/${conversationSummary.latency.p95}/${conversationSummary.latency.max} ms
- stupid questions: ${conversationSummary.stupidQuestionCount}/${conversationSummary.questionCountTotal} (${conversationSummary.stupidQuestionRate})

Top failures:
${convFailures}
`;
}

async function main() {
  const scanItems = await runInPool(scanRuns, runScanIteration, 'scan');
  const conversationItems = await runInPool(conversationRuns, runConversationIteration, 'conversation');

  const scanSummary = summarizeResults(scanItems);
  const conversationSummary = summarizeResults(conversationItems);

  const summary = {
    baseUrl,
    generatedAt: new Date().toISOString(),
    timeoutMs,
    concurrency,
    interRequestDelayMs,
    interTurnDelayMs,
    retry429Max,
    scan: scanSummary,
    conversation: conversationSummary,
  };

  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'STRESS_SAFE_REPORT.json');
  const mdPath = path.join(outputDir, 'STRESS_SAFE_REPORT.md');
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(mdPath, buildMarkdownReport(summary, scanSummary, conversationSummary), 'utf8');

  process.stdout.write(`\nReport JSON: ${jsonPath}\n`);
  process.stdout.write(`Report MD: ${mdPath}\n`);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch((error) => {
  console.error(`stress-safe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
