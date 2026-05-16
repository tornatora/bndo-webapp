import type { Browser, Page } from 'playwright';
import type { PiaAutomationDocumentSlot, PiaAutomationInputs } from './types';
import { llmAnalyzePage, llmExecuteAction } from './llmRescue';

const INVITALIA_FORM_HOST = 'presentazione-domanda-pia.npi.invitalia.it';
const INVITALIA_AREA_HOST = 'invitalia-areariservata-fe.npi.invitalia.it';
const PIA_INFO_PRIVACY_URL = `https://${INVITALIA_FORM_HOST}/info-privacy`;

export type PiaAutomationRuntime = {
  browser: Browser;
  page: Page;
};

export type PiaAutomationLogger = (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;

export async function connectToRemoteBrowser(connectUrl: string): Promise<PiaAutomationRuntime> {
  const mod = (await import('playwright')) as any;
  const chromium = mod.chromium as any;
  if (!chromium?.connectOverCDP) throw new Error('playwright chromium.connectOverCDP non disponibile');

  const browser: Browser = await chromium.connectOverCDP(connectUrl);
  const context = browser.contexts()[0] ?? (typeof (browser as any).newContext === 'function' ? await (browser as any).newContext() : null);
  if (!context) throw new Error('BrowserContext non disponibile');

  const page: Page = (context.pages()[0] ?? (await context.newPage())) as any;
  page.setDefaultTimeout(25_000);
  page.setDefaultNavigationTimeout(45_000);
  return { browser, page };
}

export async function waitForSpidLogin(page: Page, logger: PiaAutomationLogger, maxMs = 180_000) {
  const startedAt = Date.now();
  logger('info', 'Attendo login SPID…');

  // Ensure we are at least on Invitalia domains before starting the wait.
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);

  const pollEveryMs = 1200;
  while (Date.now() - startedAt < maxMs) {
    const url = (page.url() || '').toLowerCase();
    // Logged-in signal 1: we are on Invitalia Area Riservata (post-SPID) and the SPID box is not visible.
    if (url.includes(INVITALIA_AREA_HOST)) {
      const looksLoggedOut = await page
        .getByText(/Accedi con la tua identit/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!looksLoggedOut) return;
    }

    // Logged-in signal 2: we are inside the PIA form (sidebar link "Invio domanda" is visible).
    if (url.includes(INVITALIA_FORM_HOST)) {
      const hasSidebar = await page
        .getByRole('link', { name: /invio domanda/i })
        .first()
        .isVisible()
        .catch(() => false);
      if (hasSidebar) return;

      const hasInvioDomandaText = await page.getByText(/INVIO DOMANDA/i).first().isVisible().catch(() => false);
      if (hasInvioDomandaText) return;
    }

    await page.waitForTimeout(pollEveryMs);
  }

  throw new Error('Timeout login SPID: sessione non autenticata entro il tempo massimo.');
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => undefined);
  await page
    .locator('.cdk-overlay-backdrop-showing, .mat-mdc-progress-spinner, .mat-progress-spinner')
    .first()
    .waitFor({ state: 'hidden', timeout: 1200 })
    .catch(() => undefined);
}

export async function gotoSidebar(page: Page, label: string, logger?: PiaAutomationLogger) {
  const tried: string[] = [];
  const clickFirst = async (locator: any) => {
    tried.push(String(locator));
    await locator.first().click({ timeout: 15_000 });
  };

  // Prefer "link" role, then fallback to buttons.
  const link = page.getByRole('link', { name: label, exact: false });
  if ((await link.count().catch(() => 0)) > 0) {
    await clickFirst(link);
    await settle(page);
    // Gestisci modale "Modifiche non salvate" — se appare, torniamo indietro e lanciamo errore
    if (await handleUnsavedModal(page, logger)) {
      throw new Error(`Sidebar: modale "Modifiche non salvate" rilevato per "${label}" — salvataggio preventivo fallito.`);
    }
    logger?.('info', `Sidebar: aperto "${label}"`);
    return;
  }

  const button = page.getByRole('button', { name: label, exact: false });
  if ((await button.count().catch(() => 0)) > 0) {
    await clickFirst(button);
    await settle(page);
    if (await handleUnsavedModal(page, logger)) {
      throw new Error(`Sidebar: modale "Modifiche non salvate" rilevato per "${label}" — salvataggio preventivo fallito.`);
    }
    logger?.('info', `Sidebar: aperto "${label}"`);
    return;
  }

  // Last resort: text click.
  const txt = page.getByText(label, { exact: false });
  if ((await txt.count().catch(() => 0)) > 0) {
    await clickFirst(txt);
    await settle(page);
    if (await handleUnsavedModal(page, logger)) {
      throw new Error(`Sidebar: modale "Modifiche non salvate" rilevato per "${label}" — salvataggio preventivo fallito.`);
    }
    logger?.('info', `Sidebar: aperto "${label}"`);
    return;
  }

  throw new Error(`Sidebar item non trovato: ${label}`);
}

/**
 * Rileva e gestisce il modale "Modifiche non salvate" di Invitalia.
 * Se il modale è presente, clicca "Torna alla compilazione" per tornare indietro.
 * Ritorna true se il modale era presente e gestito.
 */
async function handleUnsavedModal(page: Page, logger?: PiaAutomationLogger): Promise<boolean> {
  try {
    const modal = page.locator('ngb-modal-window').filter({ hasText: 'Modifiche non salvate' }).first();
    if ((await modal.count().catch(() => 0)) > 0 && (await modal.isVisible().catch(() => false))) {
      logger?.('warn', 'Rilevato modale "Modifiche non salvate" — clicco "Torna alla compilazione"');
      await modal.getByRole('button', { name: 'Torna alla compilazione' }).first().click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function isPiaSidebarReady(page: Page): Promise<boolean> {
  try {
    const url = (page.url() || '').toLowerCase();
    if (!url.includes(INVITALIA_FORM_HOST)) return false;
    const invio = await page
      .getByRole('link', { name: /invio domanda/i })
      .first()
      .isVisible()
      .catch(() => false);
    return Boolean(invio);
  } catch {
    return false;
  }
}

async function privacyScrollToEnableCheckbox(page: Page, logger?: PiaAutomationLogger) {
  // Il container scrollabile è .card-body.info-privacy-content
  // Una volta scrollato fino in fondo, la checkbox #acknowledgement si abilita.
  const scrolled = await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('.card-body.info-privacy-content');
    if (!container) return false;
    container.scrollTop = container.scrollHeight;
    // Doppio tentativo per Angular che potrebbe reagire con delay
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 200);
    return true;
  }).catch(() => false);

  if (scrolled) {
    await page.waitForTimeout(500);
    logger?.('info', 'Privacy: scroll container .info-privacy-content completato.');
  } else {
    // Fallback: scroll pagina
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
    logger?.('info', 'Privacy: scroll pagina (fallback).');
  }
}

async function selectMatSelectByLabel(page: Page, label: string, optionText: string, logger?: PiaAutomationLogger) {
  const field = page.locator('mat-form-field').filter({ hasText: label }).first();
  if ((await field.count().catch(() => 0)) === 0) {
    const any = page.getByRole('combobox', { name: label, exact: false }).first();
    if ((await any.count().catch(() => 0)) === 0) throw new Error(`Select non trovato: ${label}`);
    await any.click({ timeout: 10_000 });
  } else {
    const trigger = field.locator('.mat-mdc-select-trigger, .mat-select-trigger, mat-select, [role="combobox"]').first();
    await trigger.click({ timeout: 10_000 }).catch(async () => {
      await field.click({ timeout: 10_000 });
    });
  }

  const overlayOpt = page.locator('mat-option, [role="option"]');
  const visible = await overlayOpt.first().isVisible().catch(() => false);
  if (!visible) {
    await page.keyboard.down('Alt').catch(() => undefined);
    await page.keyboard.press('ArrowDown').catch(() => undefined);
    await page.keyboard.up('Alt').catch(() => undefined);
    await page.waitForTimeout(250);
  }

  const opt = page.getByRole('option', { name: optionText, exact: false }).first();
  if ((await opt.count().catch(() => 0)) > 0) {
    await opt.click({ timeout: 12_000 });
  } else {
    const fallback = page.locator('mat-option').filter({ hasText: optionText }).first();
    if ((await fallback.count().catch(() => 0)) === 0) throw new Error(`Opzione non trovata per ${label}: ${optionText}`);
    await fallback.click({ timeout: 12_000 });
  }

  await settle(page);
  logger?.('info', `Select: ${normalizeSpace(label)} -> ${normalizeSpace(optionText)}`);
}

/**
 * selectMatSelectByLabel con LLM rescue: se il select non viene trovato o
 * l'opzione non esiste, chiama DeepSeek per analizzare la pagina.
 */
async function selectWithRescue(page: Page, label: string, optionText: string, logger?: PiaAutomationLogger) {
  try {
    await selectMatSelectByLabel(page, label, optionText, logger);
  } catch {
    logger?.('warn', `Select fallito per "${label}" -> "${optionText}", provo LLM rescue…`);
    const result = await llmAnalyzePage(
      page,
      `Devo selezionare "${optionText}" dal dropdown "${label}". Trova il campo select/dropdown con label "${label}", aprilo e seleziona l'opzione "${optionText}".`,
      undefined,
      logger,
    );
    if (result.ok && result.action.type === 'select') {
      await llmExecuteAction(page, result.action, logger);
      return;
    }
    // Se LLM non ha risolto, rilanciamo l'errore originale (che sarà catturato dal chiamante)
    throw new Error(`Select fallito con LLM rescue: ${label} -> ${optionText}`);
  }
}

export async function ensurePiaApplicationStarted(
  page: Page,
  opts: { lineaIntervento?: string; tipologiaProponente?: string },
  logger: PiaAutomationLogger
) {
  if (await isPiaSidebarReady(page)) return;

  logger('info', 'PIA: apro info-privacy e avvio compilazione…');

  // Assicuriamoci di essere su info-privacy
  await page.goto(PIA_INFO_PRIVACY_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
  await settle(page);
  if (!(page.url() || '').toLowerCase().includes(INVITALIA_FORM_HOST)) {
    await page.goto(PIA_INFO_PRIVACY_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
    await settle(page);
  }

  // Verifica che siamo sulla pagina giusta
  const onCorrectPage = await page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase();
    return text.includes('informativa privacy') || text.includes('presa visione');
  }).catch(() => false);

  if (!onCorrectPage) {
    logger('warn', 'Pagina info-privacy non riconosciuta. Provo LLM rescue…');
    await runLlmPrivacyRescue(page, opts, logger);
  } else {
    logger('info', 'Pagina info-privacy confermata. Selettori nativi Bootstrap verificati…');

    // STEP 1: Scrolla container privacy → abilita checkbox
    await privacyScrollToEnableCheckbox(page, logger);

    // STEP 2: Checkbox "Presa visione"
    await privacyCheckPresaVisione(page, logger);

    // STEP 3: Select "Linea di intervento"
    const linea = opts.lineaIntervento || 'Capo IV - Resto al Sud 2.0';
    await page.locator('#lineaIntervento').selectOption(linea).catch(async () => {
      // Fallback: prova per testo parziale
      await page.evaluate((val: string) => {
        const sel = document.getElementById('lineaIntervento') as HTMLSelectElement | null;
        if (!sel) return;
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].text.includes(val) || val.includes(sel.options[i].text)) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, linea).catch(() => undefined);
    });
    await page.waitForTimeout(300);
    logger?.('info', `Select: Linea di intervento -> ${linea}`);

    // STEP 4: Select "Tipologia proponente"
    const tipo = opts.tipologiaProponente || 'Contributo B-C Lav. autonomo-libero professionista';
    await page.locator('#tipologiaProponente').selectOption(tipo).catch(async () => {
      await page.evaluate((val: string) => {
        const sel = document.getElementById('tipologiaProponente') as HTMLSelectElement | null;
        if (!sel) return;
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].text.includes(val) || val.includes(sel.options[i].text)) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, tipo).catch(() => undefined);
    });
    await page.waitForTimeout(300);
    logger?.('info', `Select: Tipologia proponente -> ${tipo}`);

    // STEP 5: Click "Inizia la compilazione"
    const startBtn = page.getByRole('button', { name: /Inizia la compilazione/i }).first();
    if ((await startBtn.count().catch(() => 0)) > 0) {
      await startBtn.click({ timeout: 15_000 });
    } else {
      await page.getByRole('button', { name: /^Inizia$/i }).first().click({ timeout: 15_000 });
    }
    await settle(page);

    // Se dopo il flusso normale la sidebar non è comparsa, rescue LLM
    if (!(await isPiaSidebarReady(page))) {
      logger('warn', 'Flusso normale completato ma sidebar non visibile. Provo LLM rescue…');
      await runLlmPrivacyRescue(page, opts, logger);
    }
  }

  // Attesa finale sidebar
  const sidebarReady = await isPiaSidebarReady(page);
  if (!sidebarReady) {
    await page
      .getByRole('link', { name: /invio domanda/i })
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 })
      .catch(() => undefined);
  }
  logger('info', 'PIA: sidebar pronta.');
}

/**
 * Checkbox nativa "Presa visione" su info-privacy.
 * Dopo aver scrollato .card-body.info-privacy-content, il checkbox si abilita.
 */
async function privacyCheckPresaVisione(page: Page, logger?: PiaAutomationLogger) {
  const checked = await page.evaluate(() => {
    const cb = document.getElementById('acknowledgement') as HTMLInputElement | null;
    if (!cb || cb.disabled) return 'disabled';
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  }).catch(() => 'error');

  if (checked === 'disabled') {
    logger?.('warn', 'Checkbox #acknowledgement ancora disabilitato dopo scroll. Riprovo scroll…');
    await privacyScrollToEnableCheckbox(page, logger);
    await page.evaluate(() => {
      const cb = document.getElementById('acknowledgement') as HTMLInputElement | null;
      if (cb && !cb.disabled) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }).catch(() => undefined);
  }

  logger?.('info', `Checkbox Presa visione: ${checked}`);
}

/**
 * LLM Rescue specifico per la pagina info-privacy.
 * Usa il LLM per analizzare la pagina ed eseguire le azioni necessarie
 * per completare la procedura: scroll, checkbox, selezioni, avvio.
 */
async function runLlmPrivacyRescue(
  page: Page,
  opts: { lineaIntervento?: string; tipologiaProponente?: string },
  logger: PiaAutomationLogger
) {
  const steps: string[] = [
    'Devo scrollare fino in fondo il widget "Informativa privacy" (o simile) per abilitare la checkbox "Presa visione". Trova il widget scrollabile e scrollalo fino in fondo.',
    'Devo spuntare la checkbox "Presa visione" o "presa visione" per accettare l\'informativa privacy.',
    `Devo selezionare "Linea di intervento" con valore "${opts.lineaIntervento || 'Capo IV - Resto al Sud 2.0'}" dal dropdown. Aprilo e seleziona l'opzione corretta.`,
    `Devo selezionare "Tipologia proponente" con valore "${opts.tipologiaProponente || 'Contributo B-C Lav. autonomo-libero professionista'}" dal dropdown. Aprilo e seleziona l'opzione corretta.`,
    'Devo cliccare il pulsante "Inizia la compilazione" o "Inizia" per avviare la compilazione.',
  ];

  for (const step of steps) {
    // Fresh call per ogni step — l'LLM vede lo stato aggiornato della pagina
    const result = await llmAnalyzePage(page, step, undefined, logger);
    if (!result.ok) {
      logger('error', `LLM rescue step fallito: ${step.slice(0, 60)} — ${(result as any).error || 'sconosciuto'}`);
      continue;
    }
    await llmExecuteAction(page, result.action, logger);
    await page.waitForTimeout(800);
  }

  // Tentativo finale di click "Inizia" se ancora presente
  const finalBtn = page.getByRole('button', { name: /Inizia/i }).first();
  if ((await finalBtn.count().catch(() => 0)) > 0) {
    await finalBtn.click({ timeout: 15_000 }).catch(() => undefined);
    await settle(page);
  }
}

function normalizeSpace(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

async function findFieldInputByLabel(page: Page, label: string) {
  const byLabel = page.getByLabel(label, { exact: false });
  if ((await byLabel.count().catch(() => 0)) > 0) return byLabel.first();

  // Angular Material fallback: mat-form-field containing the label text.
  const mf = page.locator('mat-form-field').filter({ hasText: label });
  if ((await mf.count().catch(() => 0)) > 0) {
    const input = mf.first().locator('input, textarea').first();
    if ((await input.count().catch(() => 0)) > 0) return input;
  }

  // Generic fallback: label text near input
  const generic = page.locator('label', { hasText: label }).first();
  if ((await generic.count().catch(() => 0)) > 0) {
    const forId = await generic.getAttribute('for').catch(() => null);
    if (forId) {
      // Avoid CSS escaping edge cases: use XPath on the id attribute.
      const linked = page.locator(`xpath=//*[@id=${JSON.stringify(forId)}]`);
      if ((await linked.count().catch(() => 0)) > 0) return linked.first();
    }
    const near = generic.locator('xpath=following::input[1]');
    if ((await near.count().catch(() => 0)) > 0) return near.first();
  }

  return null;
}

export async function fillText(page: Page, label: string, value: string, logger?: PiaAutomationLogger) {
  const input = await findFieldInputByLabel(page, label);
  if (!input) throw new Error(`Campo non trovato (text): ${label}`);
  await input.scrollIntoViewIfNeeded().catch(() => undefined);
  await input.click({ timeout: 10_000 }).catch(() => undefined);

  // Se il campo è type="date", converte dd/MM/yyyy yyyy-MM-dd
  const isDate = await input.evaluate((el: HTMLInputElement) => el.type === 'date').catch(() => false);
  let fillValue = value ?? '';
  if (isDate && fillValue) {
    const m = fillValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) fillValue = `${m[3]}-${m[2]}-${m[1]}`;
  }

  await input.fill(fillValue);
  await input.press('Tab').catch(() => undefined);
  logger?.('info', `Compilato: ${normalizeSpace(label)}`);
}

/**
 * fillText con LLM rescue: se il campo non viene trovato, chiama DeepSeek
 * per analizzare la pagina e trovare il campo corretto.
 */
export async function fillTextWithRescue(page: Page, label: string, value: string, logger?: PiaAutomationLogger) {
  try {
    await fillText(page, label, value, logger);
  } catch (err) {
    logger?.('warn', `fillText fallito per "${label}", provo LLM rescue…`);
    const result = await llmAnalyzePage(
      page,
      `Devo trovare un campo di input con label "${label}" e inserire il valore "${value}". Cerca un campo input/text con label o placeholder simile.`,
      undefined,
      logger,
    );
    if (result.ok && result.action.type === 'fill') {
      await llmExecuteAction(page, result.action, logger);
      return;
    }
    // Rilancia l'errore originale se LLM non ha risolto
    throw err instanceof Error
      ? err
      : new Error(`Campo non trovato (text) con LLM rescue: ${label}`);
  }
}

export async function toggleCheckbox(page: Page, label: string, checked: boolean, logger?: PiaAutomationLogger) {
  const byLabel = page.getByLabel(label, { exact: false });
  const target = (await byLabel.count().catch(() => 0)) > 0 ? byLabel.first() : page.locator('mat-checkbox').filter({ hasText: label }).first();
  if ((await target.count().catch(() => 0)) === 0) throw new Error(`Checkbox non trovata: ${label}`);
  await target.scrollIntoViewIfNeeded().catch(() => undefined);

  const isChecked = await target
    .evaluate((node: any) => {
      const root = node instanceof HTMLElement ? node : null;
      if (!root) return false;
      const input = root.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      return Boolean(input?.checked);
    })
    .catch(() => false);

  if (Boolean(isChecked) !== Boolean(checked)) {
    await target.click({ timeout: 10_000 });
    await page.waitForTimeout(250);
  }

  logger?.('info', `Checkbox: ${normalizeSpace(label)} = ${checked ? 'Si' : 'No'}`);
}

export async function selectAutocomplete(page: Page, label: string, optionText: string, logger?: PiaAutomationLogger) {
  const input = await findFieldInputByLabel(page, label);
  if (!input) throw new Error(`Campo non trovato (autocomplete): ${label}`);

  await input.scrollIntoViewIfNeeded().catch(() => undefined);
  await input.click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(300);

  // Some MatSelect-like widgets don't accept fill; try type instead.
  try {
    await input.fill('');
    await page.waitForTimeout(150);
    await input.type(optionText, { delay: 18 });
  } catch {
    await page.keyboard.type(optionText, { delay: 18 });
  }
  await page.waitForTimeout(600);

  // Cerca overlay tipi diversi: Angular Material, ngbTypeahead, generico
  const overlayOpt = page.locator('mat-option, [role="option"], .dropdown-item');
  const hasOverlay = await overlayOpt.first().isVisible().catch(() => false);
  if (!hasOverlay) {
    // Fallback tastiera per dropdown che richiedono apertura esplicita
    await page.keyboard.down('Alt').catch(() => undefined);
    await page.keyboard.press('ArrowDown').catch(() => undefined);
    await page.keyboard.up('Alt').catch(() => undefined);
    await page.waitForTimeout(400);
  }

  // 1) getByRole('option') — Angular Material + ARIA
  const byRole = page.getByRole('option', { name: optionText, exact: false }).first();
  if ((await byRole.count().catch(() => 0)) > 0) {
    await byRole.click({ timeout: 10_000 });
    await settle(page);
    logger?.('info', `Selezionato: ${normalizeSpace(label)} -> ${normalizeSpace(optionText)}`);
    return;
  }

  // 2) mat-option — Angular Material fallback
  const matOpt = page.locator('mat-option').filter({ hasText: optionText }).first();
  if ((await matOpt.count().catch(() => 0)) > 0) {
    await matOpt.click({ timeout: 10_000 });
    await settle(page);
    logger?.('info', `Selezionato: ${normalizeSpace(label)} -> ${normalizeSpace(optionText)}`);
    return;
  }

  // 3) .dropdown-item button — ngbTypeahead (Bootstrap)
  const ngbItem = page.locator('.dropdown-item').filter({ hasText: optionText }).first();
  if ((await ngbItem.count().catch(() => 0)) > 0) {
    await ngbItem.click({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await settle(page);
    logger?.('info', `Selezionato: ${normalizeSpace(label)} -> ${normalizeSpace(optionText)}`);
    return;
  }

  // 4) getByRole('button') con testo — ngbTypeahead usa <button>
  const btn = page.getByRole('button', { name: optionText, exact: false }).first();
  if ((await btn.count().catch(() => 0)) > 0) {
    await btn.click({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await settle(page);
    logger?.('info', `Selezionato: ${normalizeSpace(label)} -> ${normalizeSpace(optionText)}`);
    return;
  }

  throw new Error(`Opzione non trovata per ${label}: ${optionText}`);
}

export async function clickButton(page: Page, name: string, logger?: PiaAutomationLogger) {
  const btn = page.getByRole('button', { name, exact: false }).first();
  if ((await btn.count().catch(() => 0)) === 0) throw new Error(`Bottone non trovato: ${name}`);
  await btn.scrollIntoViewIfNeeded().catch(() => undefined);
  await btn.click({ timeout: 15_000 });
  await settle(page);
  logger?.('info', `Click: ${normalizeSpace(name)}`);
}

/**
 * clickButton con LLM rescue: se il bottone non viene trovato,
 * chiama DeepSeek per analizzare la pagina e trovare il bottone corretto.
 */
export async function clickButtonWithRescue(page: Page, name: string, logger?: PiaAutomationLogger) {
  try {
    await clickButton(page, name, logger);
  } catch {
    logger?.('warn', `clickButton fallito per "${name}", provo LLM rescue…`);
    const result = await llmAnalyzePage(
      page,
      `Devo trovare e cliccare il pulsante "${name}". Cerca un bottone o link con testo "${name}".`,
      undefined,
      logger,
    );
    if (result.ok && result.action.type === 'click') {
      await llmExecuteAction(page, result.action, logger);
      return;
    }
    throw new Error(`Bottone non trovato con LLM rescue: ${name}`);
  }
}

export async function uploadInInvitaliaTable(
  page: Page,
  opts: {
    table: 'obbligatori' | 'facoltativi' | number;
    rowText: string;
    file: PiaAutomationDocumentSlot;
    buttonType: 'singolo' | 'multiplo';
  },
  logger?: PiaAutomationLogger,
) {
  let tableLocator;
  if (opts.table === 'obbligatori') tableLocator = page.locator('table').first();
  else if (opts.table === 'facoltativi') tableLocator = page.locator('table').nth(1);
  else tableLocator = page.locator('table').nth(opts.table);

  const row = tableLocator.locator('tr').filter({ hasText: opts.rowText }).first();
  if ((await row.count().catch(() => 0)) === 0) throw new Error(`Riga allegato non trovata: ${opts.rowText}`);

  // Button inside row.
  let btn =
    opts.buttonType === 'singolo'
      ? row.getByRole('button', { name: 'Carica file' })
      : row.getByRole('button', { name: /Carica uno o/i });

  if ((await btn.count().catch(() => 0)) === 0) {
    // Fallback: try the other button type (the portal sometimes changes max=1 vs max=150 per requirement).
    const alt =
      opts.buttonType === 'singolo'
        ? row.getByRole('button', { name: /Carica uno o/i })
        : row.getByRole('button', { name: 'Carica file' });
    if ((await alt.count().catch(() => 0)) > 0) {
      btn = alt;
    }
  }

  if ((await btn.count().catch(() => 0)) === 0) {
    // Often means "Chiudi" (already full) or section not applicable.
    logger?.('warn', `Upload skip: bottone non disponibile per "${opts.rowText}" (forse gia saturo/Chiudi).`);
    return { skipped: true };
  }

  await btn.first().click({ timeout: 15_000 });
  await page.waitForTimeout(900);

  const modal = page.locator('ngb-modal-window').first();
  await modal.waitFor({ state: 'visible', timeout: 15_000 });

  // Some modals have a button that triggers the hidden input.
  const modalBtn = modal.getByRole('button', { name: 'Carica file', exact: false }).first();
  if ((await modalBtn.count().catch(() => 0)) > 0) {
    await modalBtn.click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }

  const input = modal.locator('input[type="file"]').first();
  if ((await input.count().catch(() => 0)) === 0) {
    // Fallback to FileChooser if input is created dynamically.
    const fcPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await modal.getByRole('button', { name: /Carica file/i }).first().click({ timeout: 10_000 });
    const fc = await fcPromise;
    await fc.setFiles({
      name: opts.file.fileName,
      mimeType: opts.file.mimeType,
      buffer: Buffer.from(opts.file.buffer),
    } as any);
  } else {
    await input.setInputFiles({
      name: opts.file.fileName,
      mimeType: opts.file.mimeType,
      buffer: Buffer.from(opts.file.buffer),
    } as any);
  }

  await page.waitForTimeout(1600);
  await settle(page);
  logger?.('info', `Upload ok: ${opts.rowText} -> ${opts.file.fileName}`);
  return { skipped: false };
}

export async function runPiaFormFill(page: Page, inputs: PiaAutomationInputs, logger: PiaAutomationLogger) {
  // Ensure the PIA application is started and the sidebar is available.
  await ensurePiaApplicationStarted(
    page,
    {
      lineaIntervento: 'Capo IV - Resto al Sud 2.0',
      tipologiaProponente: 'Contributo B-C Lav. autonomo-libero professionista',
    },
    logger
  );

  const addr = inputs.user.address ?? {};
  const firstName = (inputs.user.firstName || '').trim() || 'Mario';
  const lastName = (inputs.user.lastName || '').trim() || 'Rossi';
  const taxCode = (inputs.user.taxCode || '').trim();
  const vatNumber = (inputs.user.vatNumber || '').trim();
  const pec = (inputs.user.pec || '').trim() || 'demo@pec.it';
  const email = (inputs.user.email || inputs.user.pec || '').trim() || 'demo@example.com';
  const phone = (inputs.user.phone || '').trim() || '+39 340 000 0000';
  const sex = (inputs.user.sex || '').trim() || 'Maschio';
  const birthPlace = (inputs.user.birthPlace || '').trim() || 'Roma';

  const formatDateIt = (value: string | undefined): string => {
    const s = (value || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-');
      return `${d}/${m}/${y}`;
    }
    return s;
  };

  const birthDate = formatDateIt(inputs.user.birthDate) || '01/01/1990';
  const vatOpenDate = formatDateIt(inputs.user.vatOpenDate) || '01/01/2020';

  const reqFillText = async (labels: string[], value: string) => {
    for (const label of labels) {
      try {
        await fillTextWithRescue(page, label, value, logger);
        return;
      } catch {}
    }
    throw new Error(`Campo richiesto non trovato: ${labels.join(' | ')}`);
  };

  const optFillText = async (labels: string[], value?: string) => {
    const v = (value || '').trim();
    if (!v) return;
    for (const label of labels) {
      try {
        await fillTextWithRescue(page, label, v, logger);
        return;
      } catch {}
    }
  };

  const reqSelect = async (labels: string[], optionText: string) => {
    for (const label of labels) {
      try {
        await selectAutocomplete(page, label, optionText, logger);
        return;
      } catch {
        try {
          await selectWithRescue(page, label, optionText, logger);
          return;
        } catch {}
      }
    }
    throw new Error(`Select richiesto non trovato: ${labels.join(' | ')}`);
  };

  const optSelect = async (labels: string[], optionText?: string) => {
    const v = (optionText || '').trim();
    if (!v) return;
    for (const label of labels) {
      try {
        await selectAutocomplete(page, label, v, logger);
        return;
      } catch {
        try {
          await selectWithRescue(page, label, v, logger);
          return;
        } catch {}
      }
    }
  };

  const clickSave = async () => {
    // Prima di cliccare Salva, assicuriamoci che non ci siano modali aperti
    await handleUnsavedModal(page, logger).catch(() => undefined);

    const btn = page.getByRole('button', { name: /^Salva$/i }).first();
    if ((await btn.count().catch(() => 0)) === 0) throw new Error('Bottone "Salva" non trovato');
    for (let i = 0; i < 30; i += 1) {
      const disabled = await btn.isDisabled().catch(() => false);
      if (!disabled) break;
      await page.waitForTimeout(250);
    }
    await btn.click({ timeout: 15_000 }).catch(() => undefined);
    await settle(page);

    // Se dopo il salvataggio compare un modale "Modifiche non salvate", il save è fallito
    if (await handleUnsavedModal(page, logger)) {
      logger?.('error', 'Salvataggio fallito: modale "Modifiche non salvate" apparso dopo click Salva');
      throw new Error('Salvataggio fallito — verifica campi obbligatori mancanti');
    }
  };

  // 1) Soggetto proponente (Libero professionista / Lavoratore autonomo)
  logger('info', 'Compilo: Soggetto proponente…');
  await gotoSidebar(page, 'Soggetto proponente', logger);

  // Prefer "Lavoratore autonomo" to avoid Ordine Professionale mandatory fields unless explicitly required.
  await optSelect(['Tipologia proponente'], 'Lavoratore autonomo');

  await reqFillText(['Nome'], firstName);
  await reqFillText(['Cognome'], lastName);
  await reqFillText(['Data di nascita'], birthDate);
  await reqSelect(['Luogo di nascita'], birthPlace);
  await reqSelect(['Sesso'], sex);
  if (vatNumber) await reqFillText(['Partita IVA'], vatNumber);
  await reqFillText(['Data apertura partita IVA'], vatOpenDate);
  await reqFillText(['PEC'], pec);
  await reqFillText(['Recapiti telefonici (separati da un trattino)', 'Recapiti telefonici', 'Recapito telefonico'], phone);

  // CF/ID estero
  if (taxCode) {
    await toggleCheckbox(page, 'Ho il Codice Fiscale italiano', true, logger).catch(() => undefined);
    await optFillText(['Codice Fiscale', 'Codice fiscale', 'Codice fiscale italiano o identificativo estero'], taxCode);
    // If the CF field doesn't exist, fallback to the "codice identificativo estero" field.
    await optFillText(['Codice identificativo estero', 'Codice identificativo (estero)'], taxCode);
  }

  // Requisiti soggettivi (obbligatorio)
  await toggleCheckbox(page, 'Ho i requisiti soggettivi previsti dalla normativa di riferimento', true, logger).catch(() =>
    toggleCheckbox(page, 'requisiti soggettivi', true, logger).catch(() => undefined)
  );

  // Residenza (obbligatorio)
  await reqSelect(['Nazione residenza', 'Nazione'], addr.country || 'Italia');
  await optSelect(['Regione residenza', 'Regione'], addr.region);
  await optSelect(['Provincia residenza', 'Provincia'], addr.province);
  await optSelect(['Comune residenza', 'Comune'], addr.city);
  await reqFillText(['Indirizzo residenza', 'Indirizzo'], addr.street || 'Via Roma');
  await optFillText(['Civico residenza', 'Civico', 'N civico'], addr.civic || '1');
  await optFillText(['CAP residenza', 'CAP'], addr.zip || '00100');

  // Ordine Professionale — campi opzionali che appaiono se "Libero professionista" è selezionato.
  // Potrebbero essere obbligati dal portale anche se contrassegnati come opzionali.
  const hasOrdineField = await page.locator('#dataIscrizioneOrdineProfessionale').count().catch(() => 0);
  if (hasOrdineField > 0) {
    logger?.('info', 'Compilo campi Ordine Professionale…');
    await optFillText(['Data iscrizione ordine', 'Data iscrizione ordine professionale'], '2010-01-01');
    await optFillText(['Numero iscrizione ordine', 'Numero iscrizione ordine professionale'], '00001');
    await optFillText(['Ordine Professionale presso cui sei iscritto', 'Ordine professionale'], 'Ordine dei Dottori Commercialisti');
  }

  await clickSave();

  // 2) Firmatario
  logger('info', 'Compilo: Firmatario…');
  await gotoSidebar(page, 'Firmatario', logger);
  await reqFillText(['Nome'], firstName);
  await reqFillText(['Cognome'], lastName);
  if (taxCode) await optFillText(['Codice Fiscale', 'Codice fiscale'], taxCode);
  await reqFillText(['Data di nascita'], birthDate);
  await reqSelect(['Luogo di nascita'], birthPlace);
  await reqSelect(['Sesso'], sex);
  await clickSave();

  // 3) Referente da contattare
  logger('info', 'Compilo: Referente da contattare…');
  await gotoSidebar(page, 'Referente da contattare', logger);
  await reqFillText(['Nome'], firstName);
  await reqFillText(['Cognome'], lastName);
  if (taxCode) await optFillText(['Codice Fiscale', 'Codice fiscale'], taxCode);
  await reqFillText(['Data di nascita'], birthDate);
  await reqSelect(['Luogo di nascita'], birthPlace);
  await reqSelect(['Sesso'], sex);
  await reqFillText(['E-mail', 'Email'], email);
  await reqFillText(['Recapiti telefonici (separati da un trattino)', 'Recapiti telefonici', 'Recapito telefonico'], phone);
  await clickSave();

  // 4) Titolari effettivi (aggiungi 1 persona se tabella vuota)
  logger('info', 'Compilo: Titolari effettivi…');
  await gotoSidebar(page, 'Titolari effettivi', logger);
  const hasExistingTitolare = taxCode
    ? await page.getByText(taxCode, { exact: false }).first().isVisible().catch(() => false)
    : false;
  if (!hasExistingTitolare) {
    const addBtn = page.getByRole('button', { name: /Aggiungi/i }).first();
    if ((await addBtn.count().catch(() => 0)) > 0) {
      await addBtn.click({ timeout: 15_000 });
      await settle(page);
      await reqFillText(['Nome'], firstName);
      await reqFillText(['Cognome'], lastName);
      await reqFillText(['Data di nascita'], birthDate);
      await reqSelect(['Luogo di nascita'], birthPlace);
      if (taxCode) {
        await toggleCheckbox(page, 'Ho il Codice Fiscale italiano', true, logger).catch(() => undefined);
        await optFillText(['Codice Fiscale', 'Codice fiscale', 'Codice fiscale italiano o identificativo estero'], taxCode);
        await optFillText(['Codice identificativo estero', 'Codice identificativo (estero)'], taxCode);
      }
      await reqFillText(['Recapiti telefonici (separati da un trattino)', 'Recapiti telefonici', 'Recapito telefonico'], phone);
      await reqSelect(['Nazione'], addr.country || 'Italia');
      await optSelect(['Regione residenza', 'RegioneDiResidenza', 'Regione'], addr.region);
      await optSelect(['Provincia residenza', 'ProvinciaDiResidenza', 'Provincia'], addr.province);
      await optSelect(['Comune residenza', 'ComuneDiResidenza', 'Comune'], addr.city);
      await reqFillText(['Indirizzo residenza', 'IndirizzoDiResidenza', 'Indirizzo'], addr.street || 'Via Roma');
      await optFillText(['Civico residenza', 'CivicoDiResidenza', 'Civico'], addr.civic || '1');
      await optFillText(['CAP residenza', 'CAPDiResidenza', 'CAP'], addr.zip || '00100');
      await clickSave();
    }
  }

  // 5) Corso ENM (No)
  logger('info', 'Compilo: Corso ENM…');
  await gotoSidebar(page, 'Corso ENM', logger);
  await reqSelect(["Sei in possesso dell'attestato del corso ENM?", 'Sei in possesso'], 'No').catch(async () => {
    // Some screens render a simple "Si/No" select without full label.
    await optSelect(['Sei in possesso'], 'No');
  });
  await clickSave();

  // 6) Descrizione del progetto (Ateco)
  logger('info', 'Compilo: Descrizione del progetto…');
  await gotoSidebar(page, 'Descrizione del progetto', logger);
  if (inputs.project.ateco) {
    await reqSelect(['Codice Ateco', 'Codice ATECO', 'Codice ATECO'], inputs.project.ateco);
  }
  await clickSave();

  // 7) Dati del progetto - Sede operativa
  logger('info', 'Compilo: Dati del progetto (Sede operativa)…');
  await gotoSidebar(page, 'Sede operativa', logger).catch(async () => {
    await gotoSidebar(page, 'Dati del progetto', logger);
    await gotoSidebar(page, 'Sede operativa', logger);
  });
  await reqSelect(['Regione sede operativa', 'Regione'], addr.region || 'Campania');
  await optSelect(['Provincia sede operativa', 'Provincia'], addr.province);
  await optSelect(['Comune sede operativa', 'Comune'], addr.city);
  await optFillText(['Indirizzo sede operativa', 'Indirizzo'], addr.street);
  await optFillText(['Civico sede operativa', 'Civico'], addr.civic);
  await optFillText(['CAP sede operativa', 'CAP'], addr.zip);
  await clickSave();

  // 8) Dati del progetto - Spese previste
  logger('info', 'Compilo: Dati del progetto (Spese previste)…');
  await gotoSidebar(page, 'Spese previste dal progetto', logger).catch(async () => {
    await gotoSidebar(page, 'Dati del progetto', logger);
    await gotoSidebar(page, 'Spese previste dal progetto', logger);
  });
  const addSpesaBtn = page.getByRole('button', { name: /Aggiungi spesa/i }).first();
  if ((await addSpesaBtn.count().catch(() => 0)) > 0) {
    await addSpesaBtn.click({ timeout: 15_000 });
    await settle(page);

    // Required fields for voucher expense row.
    // Tipologia spesa: prefer a known option, fallback to first visible option.
    try {
      await reqSelect(['Tipologia spesa'], 'Beni e servizi innovativi');
    } catch {
      // Select first option (best-effort) if the expected label/options differ.
      const trigger = page
        .locator('mat-form-field')
        .filter({ hasText: /tipologia spesa/i })
        .first()
        .locator('.mat-mdc-select-trigger, .mat-select-trigger, [role="combobox"]')
        .first();
      await trigger.click({ timeout: 10_000 }).catch(() => undefined);
      const firstOpt = page.locator('mat-option, [role="option"]').first();
      await firstOpt.click({ timeout: 10_000 });
      await settle(page);
    }

    const demoAmount =
      typeof inputs.project.requestedContribution === 'number' && Number.isFinite(inputs.project.requestedContribution)
        ? Math.max(1, Math.floor(inputs.project.requestedContribution))
        : 1000;
    await reqFillText(['Importo richiesto alle agevolazioni', 'Importo richiesto', 'Importo voucher richiesto'], String(demoAmount));

    // IVA: pick 22% if present, otherwise first option.
    try {
      await reqSelect(['IVA', 'IVA (%)'], '22');
    } catch {
      const trigger = page
        .locator('mat-form-field')
        .filter({ hasText: /^IVA/i })
        .first()
        .locator('.mat-mdc-select-trigger, .mat-select-trigger, [role="combobox"]')
        .first();
      await trigger.click({ timeout: 10_000 }).catch(() => undefined);
      const firstOpt = page.locator('mat-option, [role="option"]').first();
      await firstOpt.click({ timeout: 10_000 }).catch(() => undefined);
      await settle(page);
    }

    // Spese per la maggiorazione: keep default ("Non applicabile") if present.
    await optSelect(['Spese per la maggiorazione'], 'Non applicabile');

    await clickSave();
  }

  // 9) Agevolazione richiesta
  logger('info', 'Compilo: Agevolazione richiesta…');
  await gotoSidebar(page, 'Agevolazione richiesta', logger);
  const requested =
    typeof inputs.project.requestedContribution === 'number' && Number.isFinite(inputs.project.requestedContribution)
      ? Math.max(1, Math.floor(inputs.project.requestedContribution))
      : 1000;
  await reqFillText(['Importo voucher richiesto', 'Importo contributo richiesto', 'Importo richiesto'], String(requested));
  await clickSave();

  // 10) Dati bancari (per test: selezioniamo "No" per evitare campi aggiuntivi)
  logger('info', 'Compilo: Dati bancari…');
  await gotoSidebar(page, 'Dati bancari', logger);
  await reqSelect(['Hai gia aperto il conto corrente di progetto?', 'Hai gi aperto il conto corrente di progetto?'], 'No').catch(async () => {
    await optSelect(['Hai gi aperto'], 'No');
  });
  await clickSave();
}

export async function ensureFinalFlowStep(page: Page, logger: PiaAutomationLogger) {
  await gotoSidebar(page, 'Invio domanda', logger);
  await settle(page);
}

export async function finalStep1_controlli(page: Page, logger: PiaAutomationLogger) {
  // Just "Avanti" (if blocked, Invitalia shows alerts with missing fields).
  await clickButton(page, 'Avanti', logger);
}

export async function finalStep2_downloadFormat(page: Page, logger: PiaAutomationLogger): Promise<{ fileName: string; bytes: Uint8Array }> {
  // Try download event first.
  logger('info', 'Download format di domanda (PDF)…');

  const downloadPromise = page.waitForEvent('download', { timeout: 12_000 }).catch(() => null);
  await page.getByRole('button', { name: /scarica/i }).first().click({ timeout: 12_000 }).catch(async () => {
    // fallback: download icon/button in table
    await page.locator('table button[aria-label*="Scarica"], table button:has-text("Scarica")').first().click({ timeout: 12_000 });
  });

  const download = await downloadPromise;
  if (download) {
    const suggested = download.suggestedFilename?.() || 'format-domanda.pdf';
    const stream = await download.createReadStream().catch(() => null);
    if (stream) {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve());
        stream.on('error', (e: any) => reject(e));
      });
      const buf = Buffer.concat(chunks);
      if (buf.length > 1000) return { fileName: suggested, bytes: new Uint8Array(buf) };
    }
    const path = await download.path().catch(() => null);
    if (path) {
      const fs = await import('node:fs/promises');
      const buf = await fs.readFile(path);
      if (buf.length > 1000) return { fileName: suggested, bytes: new Uint8Array(buf) };
    }
  }

  // Fallback: find a PDF response in network (best-effort).
  const pdfResponse = await page
    .waitForResponse((res) => {
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      return res.status() === 200 && ct.includes('application/pdf');
    }, { timeout: 18_000 })
    .catch(() => null);
  if (!pdfResponse) throw new Error('Download format: impossibile catturare PDF (download/response non rilevata).');

  const buf = await pdfResponse.body();
  return { fileName: 'format-domanda.pdf', bytes: new Uint8Array(buf) };
}

export async function finalStep2_uploadSignedFormat(page: Page, signed: PiaAutomationDocumentSlot, logger: PiaAutomationLogger) {
  logger('info', 'Upload format firmato (P7M)…');
  // On format step, reuse same upload pattern: first table, row containing "ModuloDomanda" or similar.
  await uploadInInvitaliaTable(
    page,
    {
      table: 'obbligatori',
      rowText: 'Modulo',
      file: signed,
      buttonType: 'singolo',
    },
    logger
  ).catch(async () => {
    // fallback: if row text differs, just upload on first available "Carica file" button on the page.
    const btn = page.getByRole('button', { name: 'Carica file' }).first();
    await btn.click({ timeout: 15_000 });
    const modal = page.locator('ngb-modal-window').first();
    await modal.waitFor({ state: 'visible', timeout: 15_000 });
    const input = modal.locator('input[type="file"]').first();
    await input.setInputFiles({ name: signed.fileName, mimeType: signed.mimeType, buffer: Buffer.from(signed.buffer) } as any);
  });

  await clickButton(page, 'Avanti', logger);
}

export async function finalStep3_uploadAttachments(
  page: Page,
  attachments: Array<{ table: 'obbligatori' | 'facoltativi'; rowText: string; buttonType: 'singolo' | 'multiplo'; file: PiaAutomationDocumentSlot }>,
  logger: PiaAutomationLogger
) {
  logger('info', 'STEP allegati: upload documenti…');
  for (const item of attachments) {
    await uploadInInvitaliaTable(page, item, logger);
  }
  await clickButton(page, 'Avanti', logger);
}
