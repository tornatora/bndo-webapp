import { NextResponse } from 'next/server';
import type { Browser, Page } from 'playwright';
import { loadFlowTemplate } from '@/lib/compila-bando/flow-template';
import {
  buildStrictExecutionQueue,
  getFlowStepSelectorCandidates,
  resolveFlowStepValue,
  resolveWaitUntil,
} from '@/lib/compila-bando/flow-runtime';
import { createBrowserbaseClient } from '@/lib/copilot/browserbase';
import type {
  ClientData,
  FlowExecutionPhase,
  FlowExecutionResult,
  FlowStep,
  FlowStepExecutionResult,
} from '@/lib/compila-bando/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_STEP_TIMEOUT_MS = 5_500;
const DEFAULT_FLOW_BUDGET_MS = 58_000;
const INVITALIA_AREA_HOST = 'invitalia-areariservata-fe.npi.invitalia.it';
const DEFAULT_DELAY_SCALE = 0.35;
const DEFAULT_MAX_DELAY_MS = 850;

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getBoundedFloatEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeSelectorText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function applyStepDelay(page: Page, step: FlowStep) {
  const delay = step.timing?.preDelayMs ?? 0;
  if (delay <= 0) return;

  const scale = getBoundedFloatEnv('COMPILA_BANDO_DELAY_SCALE', DEFAULT_DELAY_SCALE, 0.05, 1);
  const maxDelayMs = getPositiveIntEnv('COMPILA_BANDO_MAX_DELAY_MS', DEFAULT_MAX_DELAY_MS);
  const effectiveDelay = Math.min(Math.round(delay * scale), maxDelayMs);
  if (effectiveDelay > 0) {
    await page.waitForTimeout(effectiveDelay);
  }
}

async function settleAfterAction(page: Page, stepTimeoutMs: number) {
  const settleMs = Math.min(2200, Math.max(800, Math.floor(stepTimeoutMs * 0.45)));
  await page.waitForLoadState('domcontentloaded', { timeout: settleMs }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: Math.min(1300, settleMs) }).catch(() => undefined);
  await page
    .locator('.cdk-overlay-backdrop-showing, .mat-mdc-progress-spinner, .mat-progress-spinner')
    .first()
    .waitFor({ state: 'hidden', timeout: 700 })
    .catch(() => undefined);
}

async function waitForUrlTransition(page: Page, beforeUrl: string, stepTimeoutMs: number) {
  const transitionTimeout = Math.min(2600, Math.max(1200, Math.floor(stepTimeoutMs * 0.5)));
  await page
    .waitForURL((next) => String(next) !== beforeUrl, { timeout: transitionTimeout })
    .catch(() => undefined);
}

function isSubmitLikeAction(step: FlowStep): boolean {
  const kind = (step.actionKind || '').toLowerCase();
  const targetText = (step.target?.text || '').toLowerCase();
  return (
    kind.includes('submit') ||
    targetText.includes('avanti') ||
    targetText.includes('continua') ||
    targetText.includes('presenta')
  );
}

async function findFirstWorkingSelector(
  page: Page,
  selectors: string[],
  timeoutMs: number
): Promise<string | null> {
  if (selectors.length === 0) return null;

  const candidateTimeout = Math.max(300, Math.floor(timeoutMs / selectors.length));
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: candidateTimeout });
      return selector;
    } catch {
      // Try next selector candidate
    }
  }

  return null;
}

async function getViewportSize(page: Page): Promise<{ width: number; height: number }> {
  const vs = page.viewportSize();
  if (vs?.width && vs?.height) return { width: vs.width, height: vs.height };
  const fromDom = await page
    .evaluate(() => ({ width: window.innerWidth || 0, height: window.innerHeight || 0 }))
    .catch(() => ({ width: 0, height: 0 }));
  return {
    width: Math.max(1, Number(fromDom.width) || 0),
    height: Math.max(1, Number(fromDom.height) || 0),
  };
}

async function clickByClickPoint(
  page: Page,
  step: FlowStep,
  stepIndex: number,
  stepTimeoutMs: number,
  startedAt: number
): Promise<FlowStepExecutionResult | null> {
  const cp = step.clickPoint;
  if (!cp || typeof cp.xRatio !== 'number' || typeof cp.yRatio !== 'number') return null;

  const { width, height } = await getViewportSize(page);
  const x = Math.round(Math.min(0.99, Math.max(0.01, cp.xRatio)) * width);
  const y = Math.round(Math.min(0.99, Math.max(0.01, cp.yRatio)) * height);

  try {
    const beforeUrl = page.url();
    await page.mouse.click(x, y);
    if (isSubmitLikeAction(step)) {
      await waitForUrlTransition(page, beforeUrl, stepTimeoutMs);
    }
    await settleAfterAction(page, stepTimeoutMs);
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `ClickPoint eseguito @(${x},${y})`, {
      selectorTried: 'clickPoint',
    });
  } catch (error) {
    return failedResult(step, stepIndex, startedAt, error, 'ClickPoint fallito', {
      selectorTried: 'clickPoint',
    });
  }
}

function successResult(
  step: FlowStep,
  stepIndex: number,
  startedAt: number,
  message: string,
  extras?: Partial<FlowStepExecutionResult>
): FlowStepExecutionResult {
  return {
    stepIndex,
    stepType: step.type,
    actionKind: step.actionKind,
    success: true,
    elapsedMs: Date.now() - startedAt,
    message,
    ...extras,
  };
}

function failedResult(
  step: FlowStep,
  stepIndex: number,
  startedAt: number,
  error: unknown,
  message?: string,
  extras?: Partial<FlowStepExecutionResult>
): FlowStepExecutionResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    stepIndex,
    stepType: step.type,
    actionKind: step.actionKind,
    success: false,
    elapsedMs: Date.now() - startedAt,
    message: message || `Step ${step.type} fallito`,
    error: errorMessage,
    ...extras,
  };
}

async function runClickStep(
  page: Page,
  step: FlowStep,
  stepIndex: number,
  stepTimeoutMs: number
): Promise<FlowStepExecutionResult> {
  const startedAt = Date.now();
  const hasStrongSelector =
    Boolean(step.target?.css) ||
    Boolean(step.target?.id) ||
    Boolean(step.target?.name) ||
    Boolean(step.target?.testId) ||
    Boolean(step.target?.xpath);

  // If the recorder provided a clickPoint but no strong selector, prefer point-clicking first.
  if (!hasStrongSelector && step.clickPoint) {
    const byPoint = await clickByClickPoint(page, step, stepIndex, stepTimeoutMs, startedAt);
    if (byPoint) return byPoint;
  }
  const selectors = getFlowStepSelectorCandidates(step);
  const selectionTimeout = Math.max(1200, Math.floor(stepTimeoutMs * 0.7));
  const selector = await findFirstWorkingSelector(page, selectors, selectionTimeout);

  if (!selector) {
    const byPoint = await clickByClickPoint(page, step, stepIndex, stepTimeoutMs, startedAt);
    if (byPoint) return byPoint;
    return failedResult(step, stepIndex, startedAt, new Error('Nessun selettore valido trovato'), 'Click fallito: target non trovato');
  }

  try {
    const beforeUrl = page.url();
    await page.click(selector, { timeout: stepTimeoutMs });
    if (isSubmitLikeAction(step)) {
      await waitForUrlTransition(page, beforeUrl, stepTimeoutMs);
    }
    await settleAfterAction(page, stepTimeoutMs);
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Click eseguito su ${selector}`, {
      selectorTried: selector,
    });
  } catch (error) {
    const byPoint = await clickByClickPoint(page, step, stepIndex, stepTimeoutMs, startedAt);
    if (byPoint) return byPoint;
    return failedResult(step, stepIndex, startedAt, error, 'Click fallito', { selectorTried: selector });
  }
}

async function runTypeStep(
  page: Page,
  step: FlowStep,
  stepIndex: number,
  stepTimeoutMs: number,
  flowTemplate: ReturnType<typeof loadFlowTemplate>['template'],
  client: ClientData
): Promise<FlowStepExecutionResult> {
  const startedAt = Date.now();
  const value = resolveFlowStepValue(step, flowTemplate, client);
  if (!value) {
    return failedResult(step, stepIndex, startedAt, new Error('Valore vuoto'), 'Type fallito: valore mancante');
  }

  const selectors = getFlowStepSelectorCandidates(step);
  const selector = await findFirstWorkingSelector(page, selectors, Math.max(1200, Math.floor(stepTimeoutMs * 0.7)));
  if (!selector) {
    return failedResult(
      step,
      stepIndex,
      startedAt,
      new Error('Nessun selettore valido trovato'),
      'Type fallito: campo non trovato',
      { valueUsed: value }
    );
  }

  try {
    await page.click(selector, { timeout: stepTimeoutMs });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.type(selector, value, { delay: 8 });
    await settleAfterAction(page, stepTimeoutMs);
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Type eseguito su ${selector}`, {
      selectorTried: selector,
      valueUsed: value,
    });
  } catch (error) {
    return failedResult(step, stepIndex, startedAt, error, 'Type fallito', {
      selectorTried: selector,
      valueUsed: value,
    });
  }
}

async function runSelectStep(
  page: Page,
  step: FlowStep,
  stepIndex: number,
  stepTimeoutMs: number,
  flowTemplate: ReturnType<typeof loadFlowTemplate>['template'],
  client: ClientData
): Promise<FlowStepExecutionResult> {
  const startedAt = Date.now();
  const value = resolveFlowStepValue(step, flowTemplate, client);
  if (!value) {
    return failedResult(step, stepIndex, startedAt, new Error('Valore vuoto'), 'Select fallito: valore mancante');
  }

  const selectors = getFlowStepSelectorCandidates(step);
  const selector = await findFirstWorkingSelector(page, selectors, Math.max(1200, Math.floor(stepTimeoutMs * 0.7)));
  if (!selector) {
    const byPoint = await clickByClickPoint(page, step, stepIndex, stepTimeoutMs, startedAt);
    if (byPoint) return { ...byPoint, valueUsed: value };
    return failedResult(step, stepIndex, startedAt, new Error('Nessun selettore valido trovato'), 'Select fallito: campo non trovato', { valueUsed: value });
  }

  const escapedValue = escapeSelectorText(value);
  const optionSelectors = [
    `option:has-text("${escapedValue}")`,
    `[role="option"]:has-text("${escapedValue}")`,
    `mat-option:has-text("${escapedValue}")`,
    `text="${escapedValue}"`,
  ];

  try {
    await page.waitForSelector(selector, { timeout: stepTimeoutMs });

    let selected = false;
    const targetRole = (step.target?.role || '').toLowerCase();
    const targetTag = (step.target?.tag || '').toLowerCase();
    const selectorLower = selector.toLowerCase();
    const looksLikeOptionTarget =
      targetRole === 'option' ||
      targetTag.includes('option') ||
      selectorLower.includes('mat-option') ||
      selectorLower.includes('typeahead');

    // If the selector already points to an option element, a single click is the selection.
    if (looksLikeOptionTarget) {
      await page.click(selector, { timeout: stepTimeoutMs });
      selected = true;
    }

    try {
      if (!selected) {
        const byLabel = await page.selectOption(selector, { label: value });
        selected = byLabel.length > 0;
      }
    } catch {
      // Try other mechanisms below.
    }

    if (!selected) {
      try {
        const byValue = await page.selectOption(selector, { value });
        selected = byValue.length > 0;
      } catch {
        // Try UI click fallback below.
      }
    }

    if (!selected) {
      await page.click(selector, { timeout: stepTimeoutMs });
      for (const optionSelector of optionSelectors) {
        try {
          await page.waitForSelector(optionSelector, { timeout: 1_200 });
          await page.click(optionSelector, { timeout: 1_200 });
          selected = true;
          break;
        } catch {
          // Try next option selector
        }
      }
    }

    if (!selected) {
      throw new Error(`Opzione non selezionabile: ${value}`);
    }

    await settleAfterAction(page, stepTimeoutMs);
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Select eseguito su ${selector}`, {
      selectorTried: selector,
      valueUsed: value,
    });
  } catch (error) {
    const byPoint = await clickByClickPoint(page, step, stepIndex, stepTimeoutMs, startedAt);
    if (byPoint) return { ...byPoint, valueUsed: value };
    return failedResult(step, stepIndex, startedAt, error, 'Select fallito', { selectorTried: selector, valueUsed: value });
  }
}

async function runGotoStep(
  page: Page,
  step: FlowStep,
  stepIndex: number,
  stepTimeoutMs: number
): Promise<FlowStepExecutionResult> {
  const startedAt = Date.now();
  if (!step.url) {
    return failedResult(step, stepIndex, startedAt, new Error('URL mancante'), 'Goto fallito: URL mancante');
  }

  try {
    await page.goto(step.url, {
      timeout: stepTimeoutMs,
      waitUntil: resolveWaitUntil(step.waitUntil),
    });
    await settleAfterAction(page, stepTimeoutMs);
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Goto completato: ${step.url}`, {
      urlUsed: step.url,
    });
  } catch (error) {
    return failedResult(step, stepIndex, startedAt, error, 'Goto fallito', { urlUsed: step.url });
  }
}

async function runScrollStep(page: Page, step: FlowStep, stepIndex: number): Promise<FlowStepExecutionResult> {
  const startedAt = Date.now();
  try {
    const viewportScrollY =
      step.viewport && typeof step.viewport.scrollY === 'number' ? Math.max(0, Math.floor(step.viewport.scrollY)) : null;
    const viewportScrollX =
      step.viewport && typeof step.viewport.scrollX === 'number' ? Math.max(0, Math.floor(step.viewport.scrollX)) : null;

    // If a scroll target is provided, prefer scrolling that container (useful for "presa visione" pages
    // where the button becomes enabled only after scrolling inside a panel).
    if (step.target) {
      const selectors = getFlowStepSelectorCandidates(step);
      const selector = await findFirstWorkingSelector(page, selectors, 1_200);
      if (selector) {
        try {
          const loc = page.locator(selector).first();
          if (viewportScrollY !== null && viewportScrollY > 0) {
            await loc
              .evaluate(
                (el: any, pos: { x: number | null; y: number }) => {
                  try {
                    if (typeof el.scrollTo === 'function') el.scrollTo(pos.x ?? 0, pos.y);
                    else {
                      if (typeof pos.x === 'number') el.scrollLeft = pos.x;
                      el.scrollTop = pos.y;
                    }
                  } catch {
                    // ignore
                  }
                },
                { x: viewportScrollX, y: viewportScrollY }
              )
              .catch(() => undefined);
            await settleAfterAction(page, 1800);
            await applyStepDelay(page, step);
            return successResult(step, stepIndex, startedAt, `ScrollTo (target) eseguito: y=${viewportScrollY}`, {
              selectorTried: selector,
              valueUsed: String(viewportScrollY),
            });
          }

          const baseAmount = Math.abs(step.amount ?? 320);
          const signedAmount = step.direction === 'up' ? -baseAmount : baseAmount;
          await loc
            .evaluate((el: any, delta: number) => {
              try {
                if (typeof el.scrollBy === 'function') el.scrollBy(0, delta);
                else el.scrollTop = (el.scrollTop || 0) + delta;
              } catch {
                // ignore
              }
            }, signedAmount)
            .catch(() => undefined);
          await settleAfterAction(page, 1800);
          await applyStepDelay(page, step);
          return successResult(step, stepIndex, startedAt, `Scroll (target) eseguito: ${signedAmount}px`, {
            selectorTried: selector,
            valueUsed: String(signedAmount),
          });
        } catch {
          // Fall through to window scroll below.
        }
      }
    }

    // Only use absolute scroll targets when they are meaningful (>0).
    // Some recorded steps include viewport.scrollY=0 even when the intent is "scroll down by amount".
    if (viewportScrollY !== null && viewportScrollY > 0) {
      await page
        .evaluate((y) => {
          window.scrollTo(0, y);
        }, viewportScrollY)
        .catch(() => undefined);
      await settleAfterAction(page, 1800);
      await applyStepDelay(page, step);
      return successResult(step, stepIndex, startedAt, `ScrollTo eseguito: y=${viewportScrollY}`, {
        valueUsed: String(viewportScrollY),
      });
    }

    const baseAmount = Math.abs(step.amount ?? 320);
    const signedAmount = step.direction === 'up' ? -baseAmount : baseAmount;
    await page
      .evaluate((delta) => {
        window.scrollBy(0, delta);
      }, signedAmount)
      .catch(() => undefined);
    await settleAfterAction(page, 1800);
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Scroll eseguito: ${signedAmount}px`, { valueUsed: String(signedAmount) });
  } catch (error) {
    return failedResult(step, stepIndex, startedAt, error, 'Scroll fallito');
  }
}

async function executeStep(
  page: Page,
  step: FlowStep,
  stepIndex: number,
  stepTimeoutMs: number,
  flowTemplate: ReturnType<typeof loadFlowTemplate>['template'],
  client: ClientData
): Promise<FlowStepExecutionResult> {
  switch (step.type) {
    case 'goto':
      return runGotoStep(page, step, stepIndex, stepTimeoutMs);
    case 'click':
      return runClickStep(page, step, stepIndex, stepTimeoutMs);
    case 'type':
      return runTypeStep(page, step, stepIndex, stepTimeoutMs, flowTemplate, client);
    case 'select':
      return runSelectStep(page, step, stepIndex, stepTimeoutMs, flowTemplate, client);
    case 'scroll':
      return runScrollStep(page, step, stepIndex);
    default:
      return {
        stepIndex,
        stepType: step.type,
        actionKind: step.actionKind,
        success: false,
        elapsedMs: 0,
        message: `Tipo step non supportato: ${step.type}`,
        error: `Unsupported step type "${step.type}"`,
      };
  }
}

function parseRequestBody(raw: unknown): {
  connectUrl: string;
  client: ClientData;
  phase: FlowExecutionPhase;
  applicationId: string | null;
  sessionId: string | null;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybe = raw as {
    connectUrl?: unknown;
    client?: unknown;
    phase?: unknown;
    applicationId?: unknown;
    sessionId?: unknown;
  };
  if (typeof maybe.connectUrl !== 'string' && typeof maybe.sessionId !== 'string') return null;
  if (!maybe.client || typeof maybe.client !== 'object') return null;
  const phase = typeof maybe.phase === 'string' && maybe.phase.trim() ? maybe.phase.trim() : 'form_fill';
  const applicationId = typeof maybe.applicationId === 'string' && maybe.applicationId.trim() ? maybe.applicationId.trim() : null;
  const sessionId = typeof maybe.sessionId === 'string' && maybe.sessionId.trim() ? maybe.sessionId.trim() : null;
  return {
    connectUrl: typeof maybe.connectUrl === 'string' ? maybe.connectUrl : '',
    client: maybe.client as ClientData,
    phase,
    applicationId,
    sessionId,
  };
}

async function resolveConnectUrl(payload: {
  connectUrl: string;
  sessionId: string | null;
}): Promise<string> {
  if (payload.connectUrl.trim()) return payload.connectUrl.trim();
  if (!payload.sessionId) {
    throw new Error('connectUrl o sessionId richiesto');
  }
  const bb = await createBrowserbaseClient();
  const session = await bb.sessions.retrieve(payload.sessionId);
  if (!session.connectUrl) throw new Error('Sessione Browserbase senza connectUrl');
  return session.connectUrl;
}

async function resolvePage(connectUrl: string): Promise<{ browser: Browser; page: Page }> {
  const { chromium } = await import('playwright');
  const browser = await chromium.connectOverCDP(connectUrl);
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error('Nessun contesto browser disponibile');
  }

  const pages = context.pages().filter((candidate) => !candidate.isClosed());
  const scored = await Promise.all(
    pages.map(async (candidate, index) => {
      const url = candidate.url().toLowerCase();
      let score = index;
      if (url && url !== 'about:blank') score += 100;
      if (url.includes(INVITALIA_AREA_HOST)) score += 1000;

      if (url.includes(INVITALIA_AREA_HOST)) {
        const bodyText = await candidate
          .locator('body')
          .innerText({ timeout: 750 })
          .catch(() => '');
        const lowerText = bodyText.toLowerCase();
        const loggedOut =
          lowerText.includes('accedi con la tua identita') ||
          lowerText.includes('accedi con la tua identità') ||
          lowerText.includes('entra con spid') ||
          lowerText.includes('identita digitale') ||
          lowerText.includes('identità digitale');
        if (!loggedOut) score += 300;
      }

      return { page: candidate, score };
    })
  );
  scored.sort((a, b) => b.score - a.score);

  const page = scored[0]?.page || (await context.newPage());
  if (!page || page.isClosed()) {
    await browser.close();
    throw new Error('Nessuna pagina disponibile');
  }
  await page.bringToFront().catch(() => undefined);

  return { browser, page };
}

async function selectBestPage(browser: Browser, current: Page): Promise<Page> {
  const context = browser.contexts()[0];
  if (!context) return current;

  const pages = context.pages().filter((candidate) => !candidate.isClosed());
  if (pages.length === 0) return current;
  if (pages.length === 1) return pages[0]!;

  const scored = pages.map((candidate, index) => {
    const url = candidate.url().toLowerCase();
    let score = index;
    if (url && url !== 'about:blank') score += 100;
    if (url.includes(INVITALIA_AREA_HOST)) score += 1000;
    if (candidate === current) score += 20;
    return { page: candidate, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.page ?? current;
}

async function executeStepWithRetry(
  page: Page,
  step: FlowStep,
  stepIndex: number,
  stepTimeoutMs: number,
  flowTemplate: ReturnType<typeof loadFlowTemplate>['template'],
  client: ClientData
): Promise<FlowStepExecutionResult> {
  const maxAttempts = 2;
  let last: FlowStepExecutionResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await executeStep(page, step, stepIndex, stepTimeoutMs, flowTemplate, client);
    if (result.success) return result;
    last = result;

    if (attempt < maxAttempts) {
      await page.waitForTimeout(450);
      await settleAfterAction(page, stepTimeoutMs);
    }
  }

  return {
    ...(last || {
      stepIndex,
      stepType: step.type,
      actionKind: step.actionKind,
      success: false,
      elapsedMs: 0,
      message: `Step ${step.type} fallito`,
      error: 'Errore sconosciuto',
    }),
    message: `${last?.message || `Step ${step.type} fallito`} (dopo retry)`,
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const stepTimeoutMs = getPositiveIntEnv('COMPILA_BANDO_STEP_TIMEOUT_MS', DEFAULT_STEP_TIMEOUT_MS);
  const flowBudgetMs = getPositiveIntEnv('COMPILA_BANDO_FLOW_BUDGET_MS', DEFAULT_FLOW_BUDGET_MS);

  try {
    const payload = parseRequestBody(await req.json());
    if (!payload) {
      return NextResponse.json({ error: 'connectUrl e client richiesti' }, { status: 400 });
    }
    const connectUrl = await resolveConnectUrl(payload);

    const { template: flowTemplate, checksumSha256 } = loadFlowTemplate();
    console.info('[compila-bando][execute-flow] flow_template_loaded', {
      name: flowTemplate.name,
      version: flowTemplate.version ?? null,
      steps: flowTemplate.steps.length,
      checksumSha256,
    });

    const { browser, page } = await resolvePage(connectUrl);
    const stepResults: FlowStepExecutionResult[] = [];
    const failedSteps: FlowStepExecutionResult[] = [];

    try {
      const queue = buildStrictExecutionQueue(flowTemplate);
      let activePage = page;
      for (let pointer = 0; pointer < queue.length; pointer += 1) {
        const { stepIndex: index, step } = queue[pointer];
        activePage = await selectBestPage(browser, activePage);

        const elapsed = Date.now() - startedAt;
        if (elapsed > flowBudgetMs) {
          const budgetExceeded: FlowStepExecutionResult = {
            stepIndex: index,
            stepType: step.type || 'unknown',
            actionKind: step.actionKind,
            success: false,
            elapsedMs: 0,
            message: 'Budget globale esaurito',
            error: `Superato limite di ${flowBudgetMs}ms`,
          };
          stepResults.push(budgetExceeded);
          failedSteps.push(budgetExceeded);
          break;
        }

        const result = await executeStepWithRetry(
          activePage,
          step,
          index,
          stepTimeoutMs,
          flowTemplate,
          payload.client
        );
        stepResults.push(result);
        if (!result.success) {
          failedSteps.push(result);
        }
      }
    } finally {
      await browser.close();
    }

    const response: FlowExecutionResult = {
      ok: failedSteps.length === 0,
      phase: payload.phase,
      applicationId: payload.applicationId,
      sessionId: payload.sessionId,
      requiresHumanAction: failedSteps.length > 0,
      elapsedMs: Date.now() - startedAt,
      stepsExecuted: stepResults.filter((r) => r.success).length,
      stepResults,
      failedSteps,
    };

    return NextResponse.json(response, {
      status: response.ok ? 200 : 207,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore execute-flow' },
      { status: 500 }
    );
  }
}
