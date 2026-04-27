import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execSync } from 'node:child_process';

type SelectorTarget = {
  testId?: string;
  label?: string;
  placeholder?: string;
  css?: string;
  xpath?: string;
  text?: string;
  role?: string;
  name?: string;
  id?: string;
  inputType?: string;
  tag?: string;
  title?: string;
  ariaLabelledByText?: string;
};

type Step =
  | { type: 'goto'; url: string; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  | { type: 'click'; target: SelectorTarget; clickPoint?: { xRatio?: number; yRatio?: number } }
  | { type: 'type'; target: SelectorTarget; valueFrom: string; clickPoint?: { xRatio?: number; yRatio?: number } }
  | { type: 'select'; target: SelectorTarget; valueFrom: string; clickPoint?: { xRatio?: number; yRatio?: number } }
  | { type: 'upload'; target: SelectorTarget; documentKey: string; clickPoint?: { xRatio?: number; yRatio?: number } }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number; target?: SelectorTarget }
  | { type: 'waitFor'; target?: SelectorTarget; timeoutMs?: number };

type TemplatePayload = {
  name: string;
  bandoKey: string;
  proceduraKey: string;
  domain: string;
  steps: Step[];
  fieldMapping: Record<string, string>;
  requiresFinalConfirmation?: boolean;
};

type AuthGate = 'none' | 'manual' | 'auto';

type RunOptions = {
  templatePath: string;
  dataPath?: string;
  uploadsDir?: string;
  headless?: boolean;
  slowMo?: number;
  screenshotDir?: string;
  cdpUrl?: string;
  debugPort?: number;
  chromeProfile?: string;
  ensureDebugChrome?: boolean;
  authGate?: AuthGate;
  initialUrl?: string;
  keepOpen?: boolean;
};

type EnsureChromeDebugOptions = {
  cdpUrl?: string;
  debugPort?: number;
  chromeProfile?: string;
  ensureDebugChrome?: boolean;
};

type LocatorCandidate = {
  mode: string;
  locator: import('playwright-core').Locator;
};

const DEFAULT_DEBUG_PORT = 9222;
const DEFAULT_SCREENSHOT_DIR = 'bndo-screenshots';
const DEBUG_PORT_SCAN = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeUrl(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

function urlsEquivalent(a: string, b: string) {
  return normalizeUrl(a) === normalizeUrl(b);
}

function shouldRequireManualAuthGate(currentUrl: string) {
  const host = (() => {
    try {
      return new URL(currentUrl).host.toLowerCase();
    } catch {
      return '';
    }
  })();

  if (!host) return true;
  return (
    host.includes('b2clogin.com') ||
    host.includes('login.microsoftonline.com') ||
    host.includes('minervaorgb2c') ||
    host.includes('spid')
  );
}

function cssEscape(value: string) {
  return String(value).replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function isLikelyNavigationClick(step: Extract<Step, { type: 'click' }>) {
  const actionKind = String((step as any).actionKind || '').toLowerCase();
  if (actionKind === 'submit') return true;

  const target = step.target || {};
  const haystack = [
    target.text,
    target.label,
    target.id,
    target.name,
    target.placeholder,
    (step as any).targetHint,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return /(continua|avanti|prosegui|inizia|presenta|submit|next|vai)/i.test(haystack);
}

async function waitForBlockingUiToClear(page: import('playwright-core').Page, timeoutMs = 8000) {
  const selectors = [
    '#loader-custom',
    '.box-loader',
    '.loading-overlay',
    '.ngx-spinner-overlay',
    '.spinner-overlay',
    '.cdk-overlay-backdrop-showing',
    '.mat-mdc-progress-spinner',
    '.mat-progress-spinner',
  ];

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const blocked = await page
      .evaluate((candidateSelectors) => {
        const isVisible = (node: Element | null) => {
          if (!node || !(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (Number(style.opacity || 1) < 0.05) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        for (const selector of candidateSelectors) {
          const node = document.querySelector(selector);
          if (isVisible(node)) return true;
        }

        return false;
      }, selectors)
      .catch(() => false);

    if (!blocked) return;
    await page.waitForTimeout(140);
  }
}

async function ensureInvitaliaPrivacyUnlocked(page: import('playwright-core').Page) {
  const isLocked = await page
    .evaluate(() => {
      const select = document.querySelector('#lineaIntervento') as HTMLSelectElement | null;
      return Boolean(select && select.disabled);
    })
    .catch(() => false);
  if (!isLocked) return;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page
      .evaluate(() => {
        const checkbox = document.querySelector('#acknowledgement') as HTMLInputElement | null;
        const candidates: HTMLElement[] = [];
        if (checkbox) {
          let parent: HTMLElement | null = checkbox.parentElement;
          while (parent) {
            candidates.push(parent);
            parent = parent.parentElement;
          }
        }
        candidates.push(document.scrollingElement as HTMLElement);

        for (const element of candidates) {
          if (!element) continue;
          if (element.scrollHeight > element.clientHeight + 8) {
            element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
          }
        }

        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      })
      .catch(() => {});

    await page.locator('label[for="acknowledgement"]').first().click({ timeout: 2200, force: true }).catch(() => {});
    await page.waitForTimeout(220);

    const unlocked = await page
      .evaluate(() => {
        const select = document.querySelector('#lineaIntervento') as HTMLSelectElement | null;
        return Boolean(select && !select.disabled);
      })
      .catch(() => false);
    if (unlocked) return;
  }
}

async function scrollInvitaliaInformativaSection(
  page: import('playwright-core').Page,
  direction: 'bottom' | 'top',
) {
  const hasSection = await page
    .evaluate(() => Boolean(document.querySelector('.info-privacy-content')))
    .catch(() => false);
  if (!hasSection) return false;

  await page
    .evaluate(async (dir) => {
      const section = document.querySelector('.info-privacy-content') as HTMLElement | null;
      if (!section) return;

      if (dir === 'top') {
        let guard = 0;
        while (section.scrollTop > 2 && guard < 120) {
          section.scrollTop = Math.max(0, section.scrollTop - 180);
          section.dispatchEvent(new Event('scroll', { bubbles: true }));
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 20));
          guard += 1;
        }
        return;
      }

      const maxScroll = Math.max(0, section.scrollHeight - section.clientHeight);
      let guard = 0;
      while (section.scrollTop < maxScroll - 2 && guard < 120) {
        section.scrollTop = Math.min(maxScroll, section.scrollTop + 180);
        section.dispatchEvent(new Event('scroll', { bubbles: true }));
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 20));
        guard += 1;
      }
    }, direction)
    .catch(() => {});

  return true;
}

function getChromePath() {
  const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(macPath)) return macPath;
  throw new Error('Google Chrome non trovato in /Applications. Installa Chrome oppure passa --cdp-url.');
}

export function defaultChromeDebugProfilePath() {
  const home = process.env.HOME || process.cwd();
  return path.join(home, 'Library/Application Support/Google/Chrome BNDO Copilot Debug');
}

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(700) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getDebugEndpointFromPort(port: number): Promise<string | null> {
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`);
    return `http://127.0.0.1:${port}`;
  } catch {
    return null;
  }
}

async function findOpenDebugPort(preferredPort?: number): Promise<number | null> {
  const ports = preferredPort ? [preferredPort, ...DEBUG_PORT_SCAN.filter((p) => p !== preferredPort)] : DEBUG_PORT_SCAN;
  for (const port of ports) {
    const endpoint = await getDebugEndpointFromPort(port);
    if (endpoint) return port;
  }
  return null;
}

function launchChromeDebug(port: number, profilePath: string) {
  const chromePath = getChromePath();
  const cmd = [
    `nohup "${chromePath}"`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir="${profilePath}"`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
    '> /tmp/bndo-copilot-debug.log 2>&1 &',
  ].join(' ');
  execSync(cmd, { stdio: 'ignore' });
}

export async function ensureChromeDebugSession(options: EnsureChromeDebugOptions = {}) {
  if (options.cdpUrl) {
    return {
      cdpUrl: options.cdpUrl,
      debugPort: Number.NaN,
      profilePath: options.chromeProfile || defaultChromeDebugProfilePath(),
      launchedNow: false,
    };
  }

  const debugPort = Number.isFinite(options.debugPort) ? Number(options.debugPort) : DEFAULT_DEBUG_PORT;
  const profilePath = options.chromeProfile || defaultChromeDebugProfilePath();
  const shouldEnsure = options.ensureDebugChrome !== false;

  const existing = await findOpenDebugPort(debugPort);
  if (existing !== null) {
    const endpoint = await getDebugEndpointFromPort(existing);
    if (!endpoint) throw new Error(`Chrome debug trovato sulla porta ${existing} ma endpoint non raggiungibile.`);
    return { cdpUrl: endpoint, debugPort: existing, profilePath, launchedNow: false };
  }

  if (!shouldEnsure) {
    throw new Error(`Nessun Chrome debug in ascolto su porta ${debugPort}.`);
  }

  fs.mkdirSync(profilePath, { recursive: true });
  launchChromeDebug(debugPort, profilePath);

  for (let attempt = 0; attempt < 30; attempt++) {
    await wait(400);
    const endpoint = await getDebugEndpointFromPort(debugPort);
    if (endpoint) {
      return { cdpUrl: endpoint, debugPort, profilePath, launchedNow: true };
    }
  }

  throw new Error(`Chrome debug non disponibile su porta ${debugPort} dopo avvio.`);
}

function resolveValue(valueFrom: string, data: Record<string, unknown>, fieldMapping: Record<string, string>) {
  if (!valueFrom) return '';
  if (fieldMapping && Object.prototype.hasOwnProperty.call(fieldMapping, valueFrom)) {
    const mapped = fieldMapping[valueFrom];
    return mapped === null || mapped === undefined ? '' : String(mapped);
  }

  const parts = valueFrom.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || current === undefined) return '';
  return String(current);
}

function normalizeSelectValueForTemplate(
  template: TemplatePayload,
  step: Extract<Step, { type: 'select' }>,
  rawValue: string,
) {
  const value = String(rawValue || '').trim();
  const targetHint = [
    step.target?.id,
    step.target?.name,
    step.target?.label,
    step.target?.placeholder,
    step.target?.text,
    (step as any).targetHint,
  ]
    .map((entry) => String(entry || '').toLowerCase())
    .join(' ');
  const bandoKey = String(template.bandoKey || '').toLowerCase();
  const brokenValue = !value || /^(\d+\s*:\s*)?object$/i.test(value) || /^n\/d$/i.test(value);

  if (/lineaintervento|linea.?di.?intervento/.test(targetHint)) {
    if (/resto[-\s]?al[-\s]?sud/.test(bandoKey)) {
      return 'Capo IV - Resto al Sud 2.0';
    }
    if (/autoimpiego|oltre[-\s]?nuove[-\s]?imprese/.test(bandoKey)) {
      return 'Capo III - Autoimpiego Centro-Nord';
    }
  }

  if (brokenValue && /tipologiaproponente|tipologia.?di.?proponente/.test(targetHint)) {
    return 'Contributo B-C Lav. autonomo-libero professionista';
  }

  return value;
}

function humanizeValueForTarget(rawValue: string, target: SelectorTarget) {
  let value = String(rawValue || '');
  const targetHint = [target.label, target.placeholder, target.name, target.id, target.text]
    .map((entry) => String(entry || '').toLowerCase())
    .join(' ');

  if (!value.trim()) {
    if (/cognome|surname|last.?name/.test(targetHint)) value = 'Rossi';
    else if (/\bnome\b|first.?name/.test(targetHint) && !/cognome|surname|last.?name/.test(targetHint)) value = 'Mario';
    else if (/data.?di.?nascita|birth.?date/.test(targetHint)) value = '1990-01-01';
    else if (/luogo.?di.?nascita|birth.?place|comune/.test(targetHint)) value = 'Roma';
  }

  if (/cognome|surname|last.?name/.test(targetHint) && value.includes(' ')) {
    const parts = value.trim().split(/\s+/);
    return parts.slice(1).join(' ') || parts[0];
  }

  if (/\bnome\b|first.?name/.test(targetHint) && !/cognome|surname|last.?name/.test(targetHint) && value.includes(' ')) {
    const parts = value.trim().split(/\s+/);
    return parts[0];
  }

  return value;
}

function normalizeDateValue(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const isoLike = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoLike) {
    const year = isoLike[1];
    const month = String(Number(isoLike[2])).padStart(2, '0');
    const day = String(Number(isoLike[3])).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const itLike = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (itLike) {
    const day = String(Number(itLike[1])).padStart(2, '0');
    const month = String(Number(itLike[2])).padStart(2, '0');
    const year = itLike[3];
    return `${year}-${month}-${day}`;
  }
  return value;
}

function resolveUploadFile(documentKey: string, uploadsDir?: string) {
  if (!uploadsDir || !fs.existsSync(uploadsDir)) return null;
  const files = fs.readdirSync(uploadsDir);
  const normalizedKey = String(documentKey || '').toLowerCase().replace(/[_\-\s]/g, '');
  const match = files.find((entry) => entry.toLowerCase().replace(/[_\-\s]/g, '').includes(normalizedKey));
  return match ? path.join(uploadsDir, match) : null;
}

function buildLocatorCandidates(page: import('playwright-core').Page, target: SelectorTarget): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];
  const pushCandidate = (mode: string, builder: () => import('playwright-core').Locator | null) => {
    try {
      const locator = builder();
      if (locator) candidates.push({ mode, locator });
    } catch {
      // ignore invalid selector variants
    }
  };

  if (target.testId) pushCandidate('testId', () => page.getByTestId(target.testId!));
  if (target.label) pushCandidate('label', () => page.getByLabel(target.label!, { exact: false }));
  if (target.placeholder) pushCandidate('placeholder', () => page.getByPlaceholder(target.placeholder!, { exact: false }));
  if (target.title) pushCandidate('title', () => page.getByTitle(target.title!, { exact: false }));
  if (target.id) pushCandidate('id', () => page.locator(`#${cssEscape(target.id!)}`));

  if (target.name) {
    const tagPrefix = target.tag ? `${target.tag.toLowerCase()}` : '';
    pushCandidate('name', () => page.locator(`${tagPrefix}[name="${cssEscape(target.name!)}"]`));
  }

  if (target.role && (target.text || target.label || target.placeholder)) {
    const roleName = target.text || target.label || target.placeholder || undefined;
    pushCandidate('role+name', () => page.getByRole(target.role as any, roleName ? { name: roleName, exact: false } : undefined));
  }

  if (target.ariaLabelledByText) {
    pushCandidate('ariaLabelledByText', () => page.getByText(target.ariaLabelledByText!, { exact: false }));
  }

  if (target.text) pushCandidate('text', () => page.getByText(target.text!, { exact: false }));
  if (target.css) pushCandidate('css', () => page.locator(target.css!));
  if (target.xpath) pushCandidate('xpath', () => page.locator(`xpath=${target.xpath}`));

  return candidates;
}

async function resolveLocatorWithFallback(
  page: import('playwright-core').Page,
  target: SelectorTarget,
  totalTimeoutMs = 16000,
) {
  const candidates = buildLocatorCandidates(page, target);
  if (candidates.length === 0) {
    throw new Error('Target senza selector utilizzabili.');
  }

  const startedAt = Date.now();
  const errors: string[] = [];

  for (const candidate of candidates) {
    await waitForBlockingUiToClear(page, 2200).catch(() => {});
    const remaining = totalTimeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    const timeout = clamp(remaining, 1200, 4800);
    const locator = candidate.locator.first();

    try {
      await locator.waitFor({ state: 'attached', timeout });
      return { locator, mode: candidate.mode };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate.mode}: ${message.split('\n')[0]}`);
    }
  }

  throw new Error(`Resolver fallito. Tentativi: ${errors.join(' | ')}`);
}

async function performClick(
  page: import('playwright-core').Page,
  target: SelectorTarget,
  clickPoint?: { xRatio?: number; yRatio?: number },
) {
  const primary = await resolveLocatorWithFallback(page, target);
  await waitForBlockingUiToClear(page).catch(() => {});

  const inputType = String(target.inputType || '').toLowerCase();
  if (inputType === 'checkbox' || inputType === 'radio') {
    try {
      const checkboxLocator = (() => {
        if (target.id) return page.locator(`#${cssEscape(target.id)}`).first();
        if (target.name) return page.locator(`input[name="${cssEscape(target.name)}"]`).first();
        if (target.css) return page.locator(target.css).first();
        return primary.locator;
      })();

      const isChecked = async () => checkboxLocator.isChecked().catch(() => false);
      const attempts: Array<{ mode: string; run: () => Promise<void> }> = [];

      if (target.id) {
        const labelFor = page.locator(`label[for="${cssEscape(target.id)}"]`).first();
        attempts.push({
          mode: 'label-for',
          run: async () => {
            if ((await labelFor.count().catch(() => 0)) > 0) {
              await labelFor.click({ timeout: 2500, force: true });
            }
          },
        });
      }

      if (target.label) {
        attempts.push({
          mode: 'label-text',
          run: async () => {
            await page.getByText(target.label!, { exact: false }).first().click({ timeout: 2500, force: true });
          },
        });
      }

      attempts.push({
        mode: 'input-check',
        run: async () => {
          await checkboxLocator.check({ timeout: 3000, force: true });
        },
      });
      attempts.push({
        mode: 'input-click',
        run: async () => {
          await checkboxLocator.click({ timeout: 2500, force: true });
        },
      });
      attempts.push({
        mode: 'input-eval',
        run: async () => {
          await checkboxLocator.evaluate((node) => {
            const element = node as HTMLInputElement;
            if (!(element instanceof HTMLInputElement)) return;
            element.checked = true;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          });
        },
      });

      for (const attempt of attempts) {
        await attempt.run().catch(() => {});
        await page.waitForTimeout(100);
        if (await isChecked()) {
          return { resolverMode: `${primary.mode}+${attempt.mode}`, fallbackUsed: true };
        }
      }
    } catch {
      // fallback to standard click
    }
  }

  try {
    await primary.locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
    if (clickPoint && Number.isFinite(clickPoint.xRatio) && Number.isFinite(clickPoint.yRatio)) {
      const box = await primary.locator.boundingBox();
      if (box) {
        const x = box.x + box.width * clamp(Number(clickPoint.xRatio), 0, 1);
        const y = box.y + box.height * clamp(Number(clickPoint.yRatio), 0, 1);
        await page.mouse.click(x, y, { delay: 40 });
        return { resolverMode: primary.mode, fallbackUsed: false };
      }
    }

    await primary.locator.click({ timeout: 3500 });
    return { resolverMode: primary.mode, fallbackUsed: false };
  } catch (firstError) {
    await waitForBlockingUiToClear(page, 5000).catch(() => {});
    await primary.locator.click({ timeout: 3500, force: true });
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    return { resolverMode: primary.mode, fallbackUsed: true, firstError: message };
  }
}

async function performType(
  page: import('playwright-core').Page,
  target: SelectorTarget,
  value: string,
) {
  const { locator, mode } = await resolveLocatorWithFallback(page, target);
  await waitForBlockingUiToClear(page).catch(() => {});
  await locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
  await locator.click({ timeout: 3500 }).catch(() => {});

  const safeValue = humanizeValueForTarget(value ?? '', target);
  const isEditable = await locator
    .evaluate((node) => {
      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();
      return {
        editable: element.isContentEditable || tag === 'input' || tag === 'textarea',
        tag,
        inputType: tag === 'input' ? ((element as HTMLInputElement).type || '').toLowerCase() : '',
      };
    })
    .catch(() => ({ editable: true, tag: 'input', inputType: '' }));

  if (!isEditable.editable) {
    await locator.fill(safeValue).catch(() => {});
    return { resolverMode: mode, fallbackUsed: false };
  }

  if (isEditable.inputType === 'date') {
    const normalizedDate = normalizeDateValue(safeValue);
    await locator.fill(normalizedDate, { timeout: 3500 }).catch(async () => {
      await locator.evaluate((node, val) => {
        if (node instanceof HTMLInputElement) {
          node.value = String(val || '');
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, normalizedDate);
    });
    return { resolverMode: `${mode}+date`, fallbackUsed: false };
  }

  const isComboboxInput = /combobox|typeahead|scegliere un valore/i.test(
    [target.role, target.label, target.placeholder, target.id, target.name].map((entry) => String(entry || '')).join(' '),
  );
  if (isComboboxInput) {
    await locator.fill(safeValue, { timeout: 3500 }).catch(async () => {
      await locator.evaluate((node, val) => {
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
          node.value = String(val || '');
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, safeValue);
    });
    await page.waitForTimeout(220);
    await page.getByRole('option', { name: safeValue, exact: false }).first().click({ timeout: 1800 }).catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    return { resolverMode: `${mode}+combobox`, fallbackUsed: true };
  }

  await page.keyboard.press('Meta+A').catch(() => {});
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});

  try {
    if (safeValue.length > 0) {
      await locator.type(safeValue, { delay: 70 });
    }
    const needsTypeaheadSelection = /combobox|luogo.?di.?nascita|typeahead|scegliere un valore/i.test(
      [target.role, target.label, target.placeholder, target.id, target.name].map((entry) => String(entry || '')).join(' '),
    );
    if (needsTypeaheadSelection) {
      await page.waitForTimeout(220);
      await page.getByRole('option', { name: safeValue, exact: false }).first().click({ timeout: 1800 }).catch(() => {});
      await page.keyboard.press('ArrowDown').catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
    }
    return { resolverMode: mode, fallbackUsed: false };
  } catch {
    await locator.fill(safeValue);
    const needsTypeaheadSelection = /combobox|luogo.?di.?nascita|typeahead|scegliere un valore/i.test(
      [target.role, target.label, target.placeholder, target.id, target.name].map((entry) => String(entry || '')).join(' '),
    );
    if (needsTypeaheadSelection) {
      await page.waitForTimeout(220);
      await page.getByRole('option', { name: safeValue, exact: false }).first().click({ timeout: 1800 }).catch(() => {});
      await page.keyboard.press('ArrowDown').catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
    }
    return { resolverMode: mode, fallbackUsed: true };
  }
}

async function performSelect(
  page: import('playwright-core').Page,
  target: SelectorTarget,
  value: string,
) {
  const isInvitaliaPrivacySelect = /(linea.?intervento|tipologia.?proponente)/i.test(
    String(target.id || target.name || target.label || ''),
  );
  if (isInvitaliaPrivacySelect) {
    await ensureInvitaliaPrivacyUnlocked(page).catch(() => {});
  }

  const normalizedCandidate = String(value || '').trim();
  const normalizedTargetText = String(target.text || '').trim();
  let candidate = normalizedCandidate;
  if (!candidate || /^(\d+\s*:\s*)?object$/i.test(candidate) || /^n\/d$/i.test(candidate)) {
    if (/capo iii/i.test(normalizedTargetText)) {
      candidate = 'Capo III - Autoimpiego Centro-Nord';
    } else if (/resto al sud/i.test(normalizedTargetText)) {
      candidate = 'Capo IV - Resto al Sud 2.0';
    }
  }

  const dynamicTypeaheadMatch = String(target.id || '').match(/^ngb-typeahead-(\d+)-\d+$/i);
  if (dynamicTypeaheadMatch) {
    const idx = Number(dynamicTypeaheadMatch[1]);
    if (idx === 0) {
      await page.waitForSelector('#TipologiaImpresa', { state: 'attached', timeout: 9000 }).catch(() => {});
      const tipologia = page.locator('#TipologiaImpresa').first();
      if ((await tipologia.count().catch(() => 0)) > 0) {
        await tipologia.click({ timeout: 2500 }).catch(() => {});
        await tipologia.fill(candidate, { timeout: 3200 });
        await page.getByRole('option', { name: candidate, exact: false }).first().click({ timeout: 1600 }).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        const valueAfter = await tipologia.inputValue().catch(() => '');
        if (String(valueAfter || '').trim()) {
          return { resolverMode: 'typeahead#TipologiaImpresa', fallbackUsed: true };
        }
      }
    }
    if (idx === 2) {
      const luogo = page.locator('#LuogoDiNascita').first();
      if ((await luogo.count().catch(() => 0)) > 0) {
        await luogo.click({ timeout: 2500 }).catch(() => {});
        await luogo.fill(candidate, { timeout: 3200 });
        await page.getByRole('option', { name: candidate, exact: false }).first().click({ timeout: 1600 }).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        return { resolverMode: 'typeahead#LuogoDiNascita', fallbackUsed: true };
      }
    }
  }

  const tryTypeaheadFallback = async (modePrefix: string) => {
    if (!candidate || !/ngb-typeahead|typeahead/i.test(String(target.id || target.css || ''))) return null;
    const labelHint = String(target.label || '').trim();
    try {
      if (labelHint) {
        const inputByLabel = page.getByLabel(labelHint, { exact: false }).first();
        await inputByLabel.click({ timeout: 2200 });
        await inputByLabel.fill(candidate, { timeout: 3200 });
      } else {
        const idMatch = String(target.id || '').match(/ngb-typeahead-(\d+)-\d+/i);
        const typeaheadIndex = idMatch ? Math.max(0, Number(idMatch[1])) : 0;
        const windowPrefix = idMatch ? `ngb-typeahead-${idMatch[1]}` : '';
        const knownInputByIndex: Record<number, string> = {
          0: '#TipologiaImpresa',
          2: '#LuogoDiNascita',
          3: '#Sesso',
        };

        if (idMatch) {
          const known = knownInputByIndex[typeaheadIndex];
          if (known) {
            const directKnown = page.locator(known).first();
            if ((await directKnown.count().catch(() => 0)) > 0) {
              await directKnown.click({ timeout: 2200 });
              await directKnown.fill(candidate, { timeout: 3200 });
            }
          }
        }

        if (windowPrefix) {
          const byWindow = page
            .locator(`input[aria-controls^="${windowPrefix}"], input[aria-owns^="${windowPrefix}"]`)
            .first();
          if ((await byWindow.count().catch(() => 0)) > 0) {
            await byWindow.click({ timeout: 2200 });
            await byWindow.fill(candidate, { timeout: 3200 });
          }
        }
        const typeaheadInputs = page.locator(
          'input[role="combobox"], input[aria-autocomplete], input[ngbtypeahead], input[placeholder*="Scegliere un valore"]',
        );
        const count = await typeaheadInputs.count().catch(() => 0);
        if (count > 0) {
          const pick = typeaheadInputs.nth(Math.min(typeaheadIndex, count - 1));
          await pick.click({ timeout: 2200 });
          await pick.fill(candidate, { timeout: 3200 });
        } else {
          const directBirthPlace = page.locator('#LuogoDiNascita').first();
          if ((await directBirthPlace.count().catch(() => 0)) > 0) {
            await directBirthPlace.click({ timeout: 2200 });
            await directBirthPlace.fill(candidate, { timeout: 3200 });
          } else {
            return null;
          }
        }
      }

      await page.getByRole('option', { name: candidate, exact: false }).first().click({ timeout: 2800 }).catch(() => {});
      await page.keyboard.press('ArrowDown').catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      return { resolverMode: `${modePrefix}+typeahead-fallback`, fallbackUsed: true };
    } catch {
      return null;
    }
  };

  let locatorBundle: { locator: import('playwright-core').Locator; mode: string };
  try {
    locatorBundle = await resolveLocatorWithFallback(page, target);
  } catch (error) {
    const typeaheadFallback = await tryTypeaheadFallback('direct');
    if (typeaheadFallback) return typeaheadFallback;
    throw error;
  }

  const { locator, mode } = locatorBundle;
  await waitForBlockingUiToClear(page).catch(() => {});
  await locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});

  const tagName = await locator
    .evaluate((node) => (node instanceof HTMLElement ? node.tagName.toLowerCase() : ''))
    .catch(() => '');

  if (tagName === 'select') {
    const enabled = await (async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 30000) {
        const ready = await locator
          .evaluate((node) => {
            if (!(node instanceof HTMLSelectElement)) return false;
            return !node.disabled && node.options.length > 0;
          })
          .catch(() => false);
        if (ready) return true;
        await page.waitForTimeout(180);
      }
      return false;
    })();

    if (!enabled) {
      await locator
        .evaluate((node) => {
          if (node instanceof HTMLSelectElement && node.disabled) {
            node.disabled = false;
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })
        .catch(() => {});
    }

    const options = await locator
      .evaluate((node) => {
        if (!(node instanceof HTMLSelectElement)) return [];
        return Array.from(node.options).map((option) => ({
          value: String(option.value || ''),
          label: String(option.textContent || '').trim(),
          disabled: Boolean(option.disabled),
        }));
      })
      .catch(() => [] as Array<{ value: string; label: string; disabled: boolean }>);

    const pick = (() => {
      const usable = options.filter((entry) => !entry.disabled && entry.value !== '');
      if (!usable.length) return null;
      if (candidate) {
        const exactValue = usable.find((entry) => entry.value.toLowerCase() === candidate.toLowerCase());
        if (exactValue) return exactValue;
        const exactLabel = usable.find((entry) => entry.label.toLowerCase() === candidate.toLowerCase());
        if (exactLabel) return exactLabel;
        const partialLabel = usable.find((entry) => entry.label.toLowerCase().includes(candidate.toLowerCase()));
        if (partialLabel) return partialLabel;
      }
      if (/linea.?intervento/i.test(String(target.label || target.id || ''))) {
        const autoimpiego = usable.find((entry) => /autoimpiego/i.test(entry.label));
        if (autoimpiego) return autoimpiego;
      }
      return usable[0];
    })();

    if (pick) {
      await locator.selectOption({ value: pick.value }, { timeout: 3500 });
      return { resolverMode: mode, fallbackUsed: !candidate || candidate.toLowerCase() !== pick.label.toLowerCase() };
    }
  }

  const attempts: Array<() => Promise<void>> = [];
  if (candidate) {
    attempts.push(async () => {
      await locator.selectOption({ value: candidate }, { timeout: 3000 });
    });
    attempts.push(async () => {
      await locator.selectOption({ label: candidate }, { timeout: 3000 });
    });
  }

  attempts.push(async () => {
    await locator.click({ timeout: 2500 }).catch(() => {});
    await page.getByRole('option', candidate ? { name: candidate, exact: false } : {}).first().click({ timeout: 3500 });
  });
  if (candidate) {
    attempts.push(async () => {
      await locator.click({ timeout: 2500 }).catch(() => {});
      await page.getByText(candidate, { exact: false }).first().click({ timeout: 3500 });
    });
  }

  for (const attempt of attempts) {
    try {
      await waitForBlockingUiToClear(page).catch(() => {});
      await attempt();
      return { resolverMode: mode, fallbackUsed: true };
    } catch {
      // keep trying
    }
  }

  // Fallback finale: se abbiamo il valore ma il target option e dinamico, prova a digitare sul campo associato.
  const finalTypeaheadFallback = await tryTypeaheadFallback(mode);
  if (finalTypeaheadFallback) return finalTypeaheadFallback;

  throw new Error(`Selezione fallita per valore "${candidate || '<vuoto>'}"`);
}

async function performUpload(
  page: import('playwright-core').Page,
  target: SelectorTarget,
  filePath: string,
) {
  const { locator, mode } = await resolveLocatorWithFallback(page, target);
  await locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
  await locator.setInputFiles(filePath);
  return { resolverMode: mode, fallbackUsed: false };
}

async function promptEnter(message: string) {
  if (!process.stdin.isTTY) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question(message, () => resolve());
  });
  rl.close();
}

async function pickCurrentPage(
  browser: import('playwright-core').Browser,
  currentPage: import('playwright-core').Page | null,
  latestPopupPage: import('playwright-core').Page | null,
) {
  if (latestPopupPage && !latestPopupPage.isClosed()) return latestPopupPage;
  if (currentPage && !currentPage.isClosed()) return currentPage;

  const pages = browser
    .contexts()
    .flatMap((ctx) => ctx.pages())
    .filter((entry) => !entry.isClosed());

  if (pages.length === 0) throw new Error('Nessuna pagina disponibile nel browser CDP.');

  const preferred = pages.filter((entry) => normalizeUrl(entry.url()) !== 'about:blank');
  return (preferred[preferred.length - 1] || pages[pages.length - 1]) as import('playwright-core').Page;
}

function preflightTemplate(template: TemplatePayload) {
  const steps = Array.isArray(template.steps) ? template.steps : [];
  const counts = steps.reduce(
    (acc, step) => {
      acc[step.type] = (acc[step.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const mappable = (counts.type || 0) + (counts.select || 0) + (counts.upload || 0);
  const onlyClickGoto = mappable === 0;
  const selectOpenWithoutSelect = steps.some(
    (step) =>
      step.type === 'click' &&
      ((step.target?.tag && step.target.tag.toLowerCase() === 'select') ||
        (step.target?.id && /lineaIntervento|tipologia|select/i.test(step.target.id)) ||
        (step.target?.label && /linea di intervento|scegli un'opzione/i.test(step.target.label))),
  ) && (counts.select || 0) === 0;

  console.log('[PREFLIGHT] steps:', steps.length, '| breakdown:', JSON.stringify(counts));

  if (onlyClickGoto) {
    console.warn('[PREFLIGHT] warning: template senza step type/select/upload.');
    console.warn('[PREFLIGHT] warning: il replay puo\' navigare e cliccare, ma non compilera\' campi dati cliente.');
    console.warn('[PREFLIGHT] hint: registra di nuovo includendo digitazione/select/upload.');
  }

  if (selectOpenWithoutSelect) {
    console.warn('[PREFLIGHT] warning: vedo click su menu/select ma nessuno step di tipo \"select\".');
    console.warn('[PREFLIGHT] warning: il replay puo aprire la tendina ma non scegliere l’opzione finale.');
  }
}

export function guessInitialUrl(template: TemplatePayload) {
  const firstGoto = template.steps.find((step) => step.type === 'goto') as Extract<Step, { type: 'goto' }> | undefined;
  if (firstGoto?.url) return firstGoto.url;

  const domain = String(template.domain || '').trim();
  if (!domain) return 'https://www.invitalia.it';
  if (domain.startsWith('http://') || domain.startsWith('https://')) return domain;
  return `https://${domain}`;
}

function parseTemplate(templatePath: string): TemplatePayload {
  return JSON.parse(fs.readFileSync(templatePath, 'utf8')) as TemplatePayload;
}

export async function runTemplate(options: RunOptions) {
  const template = parseTemplate(options.templatePath);
  const data: Record<string, unknown> = options.dataPath && fs.existsSync(options.dataPath)
    ? JSON.parse(fs.readFileSync(options.dataPath, 'utf8'))
    : {};
  const fieldMapping = template.fieldMapping || {};

  preflightTemplate(template);

  const screenshotDir = options.screenshotDir || DEFAULT_SCREENSHOT_DIR;
  fs.mkdirSync(screenshotDir, { recursive: true });
  const keepOpen = options.keepOpen ?? Boolean(template.requiresFinalConfirmation);

  const ensureResult = await ensureChromeDebugSession({
    cdpUrl: options.cdpUrl,
    debugPort: options.debugPort,
    chromeProfile: options.chromeProfile,
    ensureDebugChrome: options.ensureDebugChrome !== false,
  });

  if (!Number.isNaN(ensureResult.debugPort)) {
    const state = ensureResult.launchedNow ? 'avviato ora' : 'già attivo';
    console.log(`[DEBUG] Chrome ${state} su porta ${ensureResult.debugPort}`);
  }

  const browser = await chromium.connectOverCDP(ensureResult.cdpUrl);
  let latestPopupPage: import('playwright-core').Page | null = null;

  for (const context of browser.contexts()) {
    context.on('page', (newPage) => {
      latestPopupPage = newPage;
    });
  }

  let page = await pickCurrentPage(browser, null, latestPopupPage);

  const initialUrl = options.initialUrl || guessInitialUrl(template);
  if (initialUrl) {
    const pageUrl = normalizeUrl(page.url());
    const targetUrl = normalizeUrl(initialUrl);
    if (!pageUrl || pageUrl === 'about:blank' || options.authGate === 'manual') {
      console.log(`[DEBUG] apro URL iniziale: ${initialUrl}`);
      await page.goto(initialUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    } else if (!urlsEquivalent(pageUrl, targetUrl)) {
      console.log(`[DEBUG] pagina attiva diversa da URL iniziale: ${page.url()}`);
    }
  }

  console.log('[DEBUG] URL attuale:', page.url());

  const gateMode = options.authGate || 'none';
  const needsManualGate = gateMode === 'manual' || (gateMode === 'auto' && shouldRequireManualAuthGate(page.url()));

  if (needsManualGate) {
    console.log('');
    console.log('Completa ora il login SPID nella finestra Chrome debug.');
    await promptEnter('Quando hai finito, premi Invio per avviare il replay... ');
    page = await pickCurrentPage(browser, page, latestPopupPage);
    console.log(`[DEBUG] ripartenza da: ${page.url()}`);
  } else if (gateMode === 'auto') {
    console.log('[DEBUG] auth-gate auto: login gia pronto, avvio replay senza pausa manuale.');
  }

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let retried = 0;
  const startTime = Date.now();

  for (let index = 0; index < template.steps.length; index++) {
    const step = template.steps[index];
    const stepNum = index + 1;

    page = await pickCurrentPage(browser, page, latestPopupPage);

    if (options.slowMo && options.slowMo > 0) {
      await page.waitForTimeout(options.slowMo);
    }

    try {
      if (step.type === 'goto') {
        const currentUrl = normalizeUrl(page.url());
        const targetUrl = normalizeUrl(step.url);

        if (currentUrl && targetUrl && urlsEquivalent(currentUrl, targetUrl)) {
          console.log(`[${stepNum}/${template.steps.length}] [ok] goto skipped (same url) -> ${targetUrl}`);
          completed++;
          continue;
        }

        console.log(`[${stepNum}/${template.steps.length}] [run] goto ${step.url}`);
        await page.goto(step.url, { waitUntil: step.waitUntil || 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        completed++;
        continue;
      }

      if (step.type === 'scroll') {
        const amount = Number.isFinite(step.amount) ? Number(step.amount) : 520;
        const delta = step.direction === 'up' ? -Math.abs(amount) : Math.abs(amount);
        const semanticReason = String((step as any).scrollMeta?.semanticReason || '').toLowerCase();
        console.log(`[${stepNum}/${template.steps.length}] [run] scroll ${delta > 0 ? 'down' : 'up'} ${Math.abs(delta)}px`);

        if (/info-privacy/i.test(page.url()) && (semanticReason === 'reached_bottom' || semanticReason === 'reached_top')) {
          const sectionScrolled = await scrollInvitaliaInformativaSection(
            page,
            semanticReason === 'reached_top' ? 'top' : 'bottom',
          );
          if (sectionScrolled) {
            await page.waitForTimeout(350);
            await waitForBlockingUiToClear(page, 4000).catch(() => {});
            completed++;
            continue;
          }
        }

        if (step.target) {
          try {
            const targetScroll = await resolveLocatorWithFallback(page, step.target, 7000);
            await targetScroll.locator.evaluate(
              async (node, payload) => {
                const element = node as HTMLElement;
                if (!element) return;
                const resolveScrollable = (start: HTMLElement | null) => {
                  let current: HTMLElement | null = start;
                  while (current) {
                    if (current.scrollHeight > current.clientHeight + 8) return current;
                    current = current.parentElement;
                  }
                  const root = document.scrollingElement as HTMLElement | null;
                  return root || document.documentElement;
                };
                const scrollable = resolveScrollable(element);
                if (payload.toBottom) {
                  const maxScroll = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight);
                  let guard = 0;
                  while (scrollable.scrollTop < maxScroll - 2 && guard < 80) {
                    const nextTop = Math.min(maxScroll, scrollable.scrollTop + 220);
                    scrollable.scrollTo({ top: nextTop, behavior: 'auto' });
                    scrollable.dispatchEvent(new Event('scroll', { bubbles: true }));
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((resolve) => setTimeout(resolve, 28));
                    guard += 1;
                  }
                  return;
                }
                if (payload.toTop) {
                  let guard = 0;
                  while (scrollable.scrollTop > 2 && guard < 80) {
                    const nextTop = Math.max(0, scrollable.scrollTop - 220);
                    scrollable.scrollTo({ top: nextTop, behavior: 'auto' });
                    scrollable.dispatchEvent(new Event('scroll', { bubbles: true }));
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((resolve) => setTimeout(resolve, 28));
                    guard += 1;
                  }
                  return;
                }
                scrollable.scrollBy({
                  top: Number(payload.delta || 0),
                  behavior: 'smooth',
                });
              },
              {
                delta,
                toBottom: semanticReason === 'reached_bottom',
                toTop: semanticReason === 'reached_top',
              },
            );
          } catch {
            await page.mouse.wheel(0, delta);
            await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), delta).catch(() => {});
          }
        } else {
          if (semanticReason === 'reached_bottom') {
            await page
              .evaluate(async () => {
                const maxScroll = Math.max(0, document.body.scrollHeight - window.innerHeight);
                let guard = 0;
                while (window.scrollY < maxScroll - 2 && guard < 80) {
                  window.scrollTo(0, Math.min(maxScroll, window.scrollY + 260));
                  window.dispatchEvent(new Event('scroll'));
                  // eslint-disable-next-line no-await-in-loop
                  await new Promise((resolve) => setTimeout(resolve, 28));
                  guard += 1;
                }
              })
              .catch(() => {});
          } else if (semanticReason === 'reached_top') {
            await page
              .evaluate(async () => {
                let guard = 0;
                while (window.scrollY > 2 && guard < 80) {
                  window.scrollTo(0, Math.max(0, window.scrollY - 260));
                  window.dispatchEvent(new Event('scroll'));
                  // eslint-disable-next-line no-await-in-loop
                  await new Promise((resolve) => setTimeout(resolve, 28));
                  guard += 1;
                }
              })
              .catch(() => {});
          } else {
            await page.mouse.wheel(0, delta);
            await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), delta).catch(() => {});
          }
        }
        await page.waitForTimeout(400);
        await waitForBlockingUiToClear(page, 4000).catch(() => {});
        completed++;
        continue;
      }

      if (step.type === 'waitFor') {
        if (step.target) {
          await resolveLocatorWithFallback(page, step.target, step.timeoutMs || 6000);
          console.log(`[${stepNum}/${template.steps.length}] [ok] waitFor target resolved`);
        } else {
          const timeout = Number.isFinite(step.timeoutMs) ? Number(step.timeoutMs) : 1000;
          await page.waitForTimeout(timeout);
          console.log(`[${stepNum}/${template.steps.length}] [ok] waitFor ${timeout}ms`);
        }
        completed++;
        continue;
      }

      if (step.type === 'click') {
        const previousUrl = normalizeUrl(page.url());
        const clickResult = await performClick(page, step.target || {}, step.clickPoint);
        if (clickResult.fallbackUsed) {
          retried++;
          console.log(`[${stepNum}/${template.steps.length}] [retry] click via ${clickResult.resolverMode}`);
        } else {
          console.log(`[${stepNum}/${template.steps.length}] [ok] click via ${clickResult.resolverMode}`);
        }

        if (isLikelyNavigationClick(step)) {
          await Promise.race([
            page.waitForURL((url) => !urlsEquivalent(String(url), previousUrl), { timeout: 12000 }),
            page.waitForLoadState('domcontentloaded', { timeout: 12000 }),
          ]).catch(() => {});
          await waitForBlockingUiToClear(page, 8000).catch(() => {});
        }
        completed++;
      } else if (step.type === 'type') {
        const value = resolveValue(step.valueFrom || '', data, fieldMapping);
        const typeResult = await performType(page, step.target || {}, value);
        if (typeResult.fallbackUsed) {
          retried++;
          console.log(`[${stepNum}/${template.steps.length}] [retry] type via ${typeResult.resolverMode}`);
        } else {
          console.log(`[${stepNum}/${template.steps.length}] [ok] type via ${typeResult.resolverMode}`);
        }
        completed++;
      } else if (step.type === 'select') {
        const rawValue = resolveValue(step.valueFrom || '', data, fieldMapping);
        const value = normalizeSelectValueForTemplate(template, step, rawValue);
        const selectResult = await performSelect(page, step.target || {}, value);
        if (selectResult.fallbackUsed) {
          retried++;
          console.log(`[${stepNum}/${template.steps.length}] [retry] select via ${selectResult.resolverMode}`);
        } else {
          console.log(`[${stepNum}/${template.steps.length}] [ok] select via ${selectResult.resolverMode}`);
        }
        completed++;
      } else if (step.type === 'upload') {
        const filePath = resolveUploadFile(step.documentKey, options.uploadsDir);
        if (!filePath) {
          skipped++;
          console.warn(`[${stepNum}/${template.steps.length}] [skip] upload file non trovato per key=${step.documentKey}`);
          continue;
        }
        const uploadResult = await performUpload(page, step.target || {}, filePath);
        if (uploadResult.fallbackUsed) {
          retried++;
          console.log(`[${stepNum}/${template.steps.length}] [retry] upload via ${uploadResult.resolverMode}`);
        } else {
          console.log(`[${stepNum}/${template.steps.length}] [ok] upload via ${uploadResult.resolverMode}`);
        }
        completed++;
      } else {
        skipped++;
        console.warn(`[${stepNum}/${template.steps.length}] [skip] step non supportato`);
      }

      await page.waitForTimeout(150);
      const popupPage = latestPopupPage;
      if (popupPage && popupPage !== page && !popupPage.isClosed()) {
        page = popupPage;
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        console.log(`[${stepNum}/${template.steps.length}] [ok] riallineata tab attiva -> ${page.url()}`);
      }
    } catch (error) {
      failed++;
      skipped++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${stepNum}/${template.steps.length}] [failed] ${msg}`);
      const screenshotPath = path.join(screenshotDir, `error-step-${stepNum}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      console.error(`[${stepNum}/${template.steps.length}] [failed] screenshot: ${screenshotPath}`);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n=== RISULTATO ===');
  console.log(`Completati: ${completed}/${template.steps.length}`);
  console.log(`Skippati:   ${skipped}/${template.steps.length}`);
  console.log(`Fallback:   ${retried}`);
  console.log(`Falliti:    ${failed}`);
  console.log(`Tempo:      ${elapsed}s`);

  const finalScreenshot = path.join(screenshotDir, 'final.png');
  await page.screenshot({ path: finalScreenshot, fullPage: true }).catch(() => {});
  console.log(`Screenshot finale: ${finalScreenshot}`);

  if (template.requiresFinalConfirmation && skipped === 0) {
    console.log('\n>>> CONFERMA FINALE RICHIESTA <<<');
    console.log('Verifica la pagina e conferma invio manualmente.');
  }

  if (keepOpen) {
    console.log('[DEBUG] Browser lasciato aperto (--keep-open).');
    return;
  }

  await Promise.race([
    browser.close().catch(() => {}),
    wait(1500),
  ]);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Partial<RunOptions> = {
    debugPort: DEFAULT_DEBUG_PORT,
    ensureDebugChrome: true,
    authGate: 'none',
    slowMo: 120,
  };

  for (const arg of args) {
    if (arg.startsWith('--template=')) {
      options.templatePath = arg.slice('--template='.length);
    } else if (arg.startsWith('--data=')) {
      options.dataPath = arg.slice('--data='.length);
    } else if (arg.startsWith('--uploads-dir=')) {
      options.uploadsDir = arg.slice('--uploads-dir='.length);
    } else if (arg.startsWith('--screenshot-dir=')) {
      options.screenshotDir = arg.slice('--screenshot-dir='.length);
    } else if (arg.startsWith('--debug-port=')) {
      options.debugPort = Number(arg.slice('--debug-port='.length));
    } else if (arg.startsWith('--cdp-url=')) {
      options.cdpUrl = arg.slice('--cdp-url='.length);
    } else if (arg.startsWith('--chrome-profile=')) {
      options.chromeProfile = arg.slice('--chrome-profile='.length);
    } else if (arg.startsWith('--auth-gate=')) {
      const gate = arg.slice('--auth-gate='.length);
      options.authGate = gate === 'manual' || gate === 'auto' ? gate : 'none';
    } else if (arg.startsWith('--initial-url=')) {
      options.initialUrl = arg.slice('--initial-url='.length);
    } else if (arg === '--keep-open') {
      options.keepOpen = true;
    } else if (arg === '--no-keep-open') {
      options.keepOpen = false;
    } else if (arg === '--no-ensure-debug-chrome') {
      options.ensureDebugChrome = false;
    } else if (arg === '--ensure-debug-chrome') {
      options.ensureDebugChrome = true;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg.startsWith('--slow-mo=')) {
      options.slowMo = Number(arg.slice('--slow-mo='.length));
    } else if (!options.templatePath && !arg.startsWith('--')) {
      options.templatePath = arg;
    }
  }

  return options as RunOptions;
}

if (require.main === module) {
  (async () => {
    const options = parseArgs();
    if (!options.templatePath || !fs.existsSync(options.templatePath)) {
      console.error('Errore: specifica un template JSON valido.');
      console.error('');
      console.error('Uso:');
      console.error('  npx tsx scripts/run-copilot-playwright.ts --template=template.json [--data=data.json]');
      console.error('  Opzioni: --cdp-url=http://127.0.0.1:9222 --debug-port=9222 --chrome-profile=/path/profile');
      console.error('           --ensure-debug-chrome --auth-gate=auto|manual|none --initial-url=https://... --uploads-dir=./docs');
      console.error('           --keep-open');
      process.exit(1);
    }

    await runTemplate(options);
    process.exit(0);
  })().catch((err) => {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    console.error('Fatal error:', message);
    process.exit(1);
  });
}
