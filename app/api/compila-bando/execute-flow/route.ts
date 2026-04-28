import { NextResponse } from 'next/server';
import type { Browser, Page } from 'playwright';
import { loadFlowTemplate } from '@/lib/compila-bando/flow-template';
import {
  buildStrictExecutionQueue,
  getFlowStepSelectorCandidates,
  resolveFlowStepValue,
  resolveWaitUntil,
} from '@/lib/compila-bando/flow-runtime';
import type {
  ClientData,
  FlowExecutionResult,
  FlowStep,
  FlowStepExecutionResult,
} from '@/lib/compila-bando/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_STEP_TIMEOUT_MS = 8_000;
const DEFAULT_FLOW_BUDGET_MS = 45_000;

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function escapeSelectorText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function applyStepDelay(page: Page, step: FlowStep) {
  const delay = step.timing?.preDelayMs ?? 0;
  if (delay > 0) {
    await page.waitForTimeout(delay);
  }
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
  const selectors = getFlowStepSelectorCandidates(step);
  const selector = await findFirstWorkingSelector(page, selectors, stepTimeoutMs);

  if (!selector) {
    return failedResult(
      step,
      stepIndex,
      startedAt,
      new Error('Nessun selettore valido trovato'),
      'Click fallito: target non trovato'
    );
  }

  try {
    await page.click(selector, { timeout: stepTimeoutMs });
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Click eseguito su ${selector}`, {
      selectorTried: selector,
    });
  } catch (error) {
    return failedResult(step, stepIndex, startedAt, error, 'Click fallito', {
      selectorTried: selector,
    });
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
  const selector = await findFirstWorkingSelector(page, selectors, stepTimeoutMs);
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
    await page.type(selector, value, { delay: 28 });
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
  const selector = await findFirstWorkingSelector(page, selectors, stepTimeoutMs);
  if (!selector) {
    return failedResult(
      step,
      stepIndex,
      startedAt,
      new Error('Nessun selettore valido trovato'),
      'Select fallito: campo non trovato',
      { valueUsed: value }
    );
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
    try {
      const byLabel = await page.selectOption(selector, { label: value });
      selected = byLabel.length > 0;
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

    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Select eseguito su ${selector}`, {
      selectorTried: selector,
      valueUsed: value,
    });
  } catch (error) {
    return failedResult(step, stepIndex, startedAt, error, 'Select fallito', {
      selectorTried: selector,
      valueUsed: value,
    });
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
    const baseAmount = Math.abs(step.amount ?? 320);
    const signedAmount = step.direction === 'up' ? -baseAmount : baseAmount;
    await page.mouse.wheel(0, signedAmount);
    await applyStepDelay(page, step);
    return successResult(step, stepIndex, startedAt, `Scroll eseguito: ${signedAmount}px`, {
      valueUsed: String(signedAmount),
    });
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

function parseRequestBody(raw: unknown): { connectUrl: string; client: ClientData } | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybe = raw as { connectUrl?: unknown; client?: unknown };
  if (typeof maybe.connectUrl !== 'string' || !maybe.connectUrl.trim()) return null;
  if (!maybe.client || typeof maybe.client !== 'object') return null;
  return {
    connectUrl: maybe.connectUrl,
    client: maybe.client as ClientData,
  };
}

async function resolvePage(connectUrl: string): Promise<{ browser: Browser; page: Page }> {
  const { chromium } = await import('playwright');
  const browser = await chromium.connectOverCDP(connectUrl);
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error('Nessun contesto browser disponibile');
  }

  const existingPage = context.pages()[0];
  const page = existingPage || (await context.newPage());
  if (!page || page.isClosed()) {
    await browser.close();
    throw new Error('Nessuna pagina disponibile');
  }

  return { browser, page };
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

    const { template: flowTemplate, checksumSha256 } = loadFlowTemplate();
    console.info('[compila-bando][execute-flow] flow_template_loaded', {
      name: flowTemplate.name,
      version: flowTemplate.version ?? null,
      steps: flowTemplate.steps.length,
      checksumSha256,
    });

    const { browser, page } = await resolvePage(payload.connectUrl);
    const stepResults: FlowStepExecutionResult[] = [];
    const failedSteps: FlowStepExecutionResult[] = [];

    try {
      const queue = buildStrictExecutionQueue(flowTemplate);
      for (let pointer = 0; pointer < queue.length; pointer += 1) {
        const { stepIndex: index, step } = queue[pointer];
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

        const result = await executeStep(page, step, index, stepTimeoutMs, flowTemplate, payload.client);
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
