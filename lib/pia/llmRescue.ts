/**
 * LLM Rescue Layer per automazione PIA Invitalia.
 *
 * Quando i selettori Playwright falliscono su Invitalia (campi cambiati, label
 * diverse, struttura DOM inattesa), questo modulo chiama OpenAI (o DeepSeek come
 * alternativa) per analizzare la pagina e determinare l'azione corretta.
 *
 * Dipende da:
 *   - openai in dependencies
 *   - OPENAI_API_KEY oppure DEEPSEEK_API_KEY2 in environment
 *
 * Pattern d'uso:
 *   1. Tentativo Playwright normale
 *   2. Se fallisce  chiamata LLM con contesto pagina
 *   3. LLM restituisce azione strutturata (JSON)
 *   4. Esecuzione azione via Playwright
 *   5. (Futuro) Salvataggio rescue in cache per evitare LLM in futuro
 */

import type { Page } from 'playwright';
import OpenAI from 'openai';
import type { PiaAutomationLogger } from './automation';

// Client (OpenAI primario, DeepSeek fallback)

function getLlmClient(): OpenAI | null {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return new OpenAI({ apiKey: openAiKey });
  }
  const deepseekKey = process.env.DEEPSEEK_API_KEY2?.trim();
  if (deepseekKey) {
    return new OpenAI({
      apiKey: deepseekKey,
      baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
    });
  }
  return null;
}

function isLlmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim()) || Boolean(process.env.DEEPSEEK_API_KEY2?.trim());
}

// Tipi

export type LlmRescueAction =
  | { type: 'click'; selector: string; text?: string; reason: string }
  | { type: 'fill'; label?: string; value: string; selector?: string; reason: string }
  | { type: 'select'; label?: string; option: string; selector?: string; reason: string }
  | { type: 'checkbox'; label?: string; checked: boolean; selector?: string; reason: string }
  | { type: 'scroll_widget'; widgetText: string; reason: string }
  | { type: 'wait_and_retry'; reason: string }
  | { type: 'unrecoverable'; reason: string };

export type LlmRescueResult =
  | { ok: true; action: LlmRescueAction }
  | { ok: false; error: string };

// Funzioni core

/**
 * Chiama DeepSeek per analizzare la pagina e determinare l'azione necessaria.
 *
 * @param page        - Playwright Page object (per estrarre contesto)
 * @param goal        - Descrizione di cosa vogliamo fare (es. "trovare e cliccare il pulsante Presa visione")
 * @param fallbackText - Testo della pagina gi estratto (opzionale, se non fornito lo estrae)
 */
export async function llmAnalyzePage(
  page: Page,
  goal: string,
  fallbackText?: string,
  logger?: PiaAutomationLogger,
): Promise<LlmRescueResult> {
  if (!isLlmConfigured()) {
    return { ok: false, error: 'LLM non configurato (manca OPENAI_API_KEY o DEEPSEEK_API_KEY2)' };
  }

  const client = getLlmClient();
  if (!client) {
    return { ok: false, error: 'Impossibile inizializzare client DeepSeek' };
  }

  try {
    // Estrai contesto pagina
    const url = page.url();
    const pageText =
      fallbackText ||
      (await page.evaluate(() => document.body?.innerText?.slice(0, 20_000) || '').catch(() => ''));

    const pageHtml = await page
      .evaluate(() => {
        // Estrai solo elementi interattivi per risparmiare token
        const interactive = document.querySelectorAll(
          'button, a, input, textarea, select, mat-checkbox, mat-radio-button, mat-select, mat-form-field, .dropdown-item, [role="button"], [role="checkbox"], [role="combobox"], [role="option"], [tabindex]:not([tabindex="-1"])'
        );
        const results: string[] = [];
        interactive.forEach((el) => {
          const tag = el.tagName.toLowerCase();
          const text = (el as HTMLElement).innerText?.slice(0, 80) || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const placeholder = el.getAttribute('placeholder') || '';
          const type = el.getAttribute('type') || '';
          const label = el.getAttribute('label') || '';
          const role = el.getAttribute('role') || '';
          const id = el.id || '';
          const classes = (el as HTMLElement).className?.slice(0, 60) || '';
          results.push(
            `<${tag} id="${id}" class="${classes}" aria-label="${ariaLabel}" role="${role}" type="${type}" placeholder="${placeholder}" label="${label}">${text}</${tag}>`
          );
        });
        return results.join('\n');
      })
      .catch(() => '');

    const systemPrompt = `Sei un assistente specializzato in automazione di pagine web Invitalia (PIA - Resto al Sud 2.0).
La piattaforma usa Angular con componenti misti: Angular Material (mat-select, mat-checkbox, mat-form-field)
e Bootstrap nativo (select#id, input#id, .dropdown-item per ngbTypeahead, input[type="date"]).

Il tuo compito è analizzare la pagina e determinare l'azione corretta da eseguire per raggiungere l'obiettivo indicato.

Rispondi ESCLUSIVAMENTE con un JSON valido in questo formato:
{
  "type": "click | fill | select | checkbox | scroll_widget | wait_and_retry | unrecoverable",
  "selector": "testo esatto o selettore per trovare l'elemento",
  "text": "per click: qualsiasi testo univoco nell'elemento",
  "label": "per fill/select/checkbox: label del campo",
  "value": "per fill: valore da inserire",
  "option": "per select: opzione da selezionare",
  "checked": true/false,
  "widgetText": "per scroll_widget: testo del widget da scrollare",
  "reason": "breve spiegazione della scelta"
}

Regole:
- Per campi select Angular Material: trova il trigger con classe mat-select-trigger o role="combobox".
- Per select nativi (Bootstrap): usa il selettore CSS #id e page.locator('#id').selectOption('testo').
- Per autocomplete ngbTypeahead (Bootstrap): clicca input, scrivi testo, attendi .dropdown-item contente il testo.
- Per checkbox Angular Material: trova mat-checkbox con il testo indicato.
- Per checkbox nativi (Bootstrap): usa document.getElementById('id').checked = true e dispatchEvent change.
- Per input text: trova l'input con la label pi vicina.
- Per input[type="date"]: il valore dev'essere in formato yyyy-MM-dd (ISO), non dd/MM/yyyy.
- Se non c'è un'azione chiara, usa type "unrecoverable".
- Se la pagina sembra non ancora caricata, usa "wait_and_retry".
- Dai la preferenza a selettori basati su testo visibile (aria-label, innerText).`;

    const userPrompt = `## URL
${url}

## Obiettivo
${goal}

## Elementi interattivi della pagina
${pageHtml || '(nessun elemento interattivo trovato)'}

## Testo visibile della pagina
${pageText.slice(0, 10_000)}

Analizza la pagina e determina l'azione corretta per raggiungere l'obiettivo. Rispondi SOLO con il JSON.`;

    logger?.('info', `LLM Rescue: analizzo pagina per obiettivo: ${goal.slice(0, 80)}…`);

    const model = process.env.OPENAI_API_KEY?.trim()
      ? (process.env.LLM_RESCUE_MODEL?.trim() || 'gpt-4o-mini')
      : (process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat');

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: 'Risposta LLM vuota' };
    }

    const parsed = JSON.parse(content) as LlmRescueAction;

    if (!parsed.type || parsed.type === 'unrecoverable') {
      return { ok: false, error: parsed.reason || 'LLM: azione non recuperabile' };
    }

    logger?.('info', `LLM Rescue: azione raccomandata: ${parsed.type}  ${parsed.reason}`);
    return { ok: true, action: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.('error', `LLM Rescue: errore chiamata DeepSeek: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Esegue l'azione LLM raccomandata sulla pagina.
 */
export async function llmExecuteAction(page: Page, action: LlmRescueAction, logger?: PiaAutomationLogger): Promise<boolean> {
  try {
    switch (action.type) {
      case 'click': {
        const el = action.text
          ? page.getByText(action.text, { exact: false }).first()
          : page.locator(action.selector || '').first();
        await el.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined);
        await el.click({ timeout: 10_000 });
        logger?.('info', `LLM click: "${(action.text || action.selector || '').slice(0, 60)}"`);
        return true;
      }

      case 'fill': {
        const fl = (action.label || action.selector || '').trim();
        const input = fl
          ? page.getByLabel(fl, { exact: false }).first()
          : page.locator('input').first();
        await input.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined);
        await input.click({ timeout: 5_000 });
        // Converte dd/MM/yyyy  yyyy-MM-dd per input type="date"
        let fillVal = action.value;
        const isDateType = await input.evaluate((el: any) => el.type === 'date').catch(() => false);
        if (isDateType && fillVal) {
          const m = fillVal.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (m) fillVal = `${m[3]}-${m[2]}-${m[1]}`;
        }
        await input.fill(fillVal);
        logger?.('info', `LLM fill: "${(action.label || action.selector || '').slice(0, 60)}" = "${action.value.slice(0, 40)}"`);
        return true;
      }

      case 'select': {
        const selLabel = (action.label || action.selector || '').trim();
        const optText = action.option || '';

        // 1) Native <select> via selector (e.g. #lineaIntervento)
        if (action.selector) {
          const nativeSelect = page.locator(action.selector).first();
          if ((await nativeSelect.count().catch(() => 0)) > 0) {
            const tag = await nativeSelect.evaluate(el => el.tagName).catch(() => '');
            if (tag === 'SELECT') {
              await nativeSelect.selectOption(optText).catch(() => undefined);
              await page.waitForTimeout(400);
              logger?.('info', 'LLM select: select nativo');
              return true;
            }
          }
        }

        // 2) mat-form-field (Angular Material)
        let field;
        if (selLabel) {
          field = page.locator('mat-form-field').filter({ hasText: selLabel }).first();
        } else {
          field = page.locator('mat-form-field').first();
        }
        if ((await field.count().catch(() => 0)) > 0) {
          const trigger = field
            .locator('.mat-mdc-select-trigger, .mat-select-trigger, mat-select, [role="combobox"]')
            .first();
          await trigger.click({ timeout: 10_000 });
          await page.waitForTimeout(400);
        } else {
          // 3) ngbTypeahead o combobox generico: input+typeahead
          const combobox = selLabel
            ? page.getByRole('combobox', { name: selLabel, exact: false }).first()
            : null;
          if (combobox && (await combobox.count().catch(() => 0)) > 0) {
            await combobox.click({ timeout: 10_000 });
            await combobox.fill('');
            await combobox.type(optText, { delay: 15 });
            await page.waitForTimeout(800);
          } else if (action.selector) {
            // Prova input diretto
            const input = page.locator(action.selector).first();
            if ((await input.count().catch(() => 0)) > 0) {
              await input.click({ timeout: 10_000 });
              await input.fill('');
              await input.type(optText, { delay: 15 });
              await page.waitForTimeout(800);
            }
          }
        }

        // Click opzione: prova vari formati
        // a) getByRole('option')
        const roleOpt = page.getByRole('option', { name: optText, exact: false }).first();
        if ((await roleOpt.count().catch(() => 0)) > 0) {
          await roleOpt.click({ timeout: 10_000 });
        } else {
          // b) mat-option (Angular Material)
          const matOpt = page.locator('mat-option').filter({ hasText: optText }).first();
          if ((await matOpt.count().catch(() => 0)) > 0) {
            await matOpt.click({ timeout: 10_000 });
          } else {
            // c) .dropdown-item (ngbTypeahead Bootstrap)
            const ddItem = page.locator('.dropdown-item').filter({ hasText: optText }).first();
            if ((await ddItem.count().catch(() => 0)) > 0) {
              await ddItem.click({ timeout: 10_000 });
            } else {
              // d) getByRole('button') (ngbTypeahead <button>)
              const btn = page.getByRole('button', { name: optText, exact: false }).first();
              if ((await btn.count().catch(() => 0)) > 0) {
                await btn.click({ timeout: 10_000 });
              } else {
                throw new Error();
              }
            }
          }
        }
        logger?.('info', `LLM select: "${(action.label || action.selector || '').slice(0, 60)}" -> "${action.option}"`);
        return true;
      }

      case 'checkbox': {
        const cbLabel = (action.label || action.selector || '').trim();

        // Helper per leggere stato checkbox
        const isCheckboxChecked = async (el: any) => {
          // Prova come input diretto
          if (el.evaluate) {
            const result = await el.evaluate((node: any) => {
              // Se è un input checkbox
              if (node.tagName === 'INPUT' && node.type === 'checkbox') return node.checked;
              // Cerca input dentro
              const inner = node.querySelector('input[type="checkbox"]');
              if (inner) return inner.checked;
              // Bootstrap: label for="id"  cerca l'input by ID
              const forId = node.getAttribute?.('for') || '';
              if (forId) {
                const linked = document.getElementById(forId) as HTMLInputElement | null;
                if (linked) return linked.checked;
              }
              return null;
            }).catch(() => null);
            if (result !== null) return result;
          }
          return false;
        };

        let cb;
        if (cbLabel) {
          cb = page.getByLabel(cbLabel, { exact: false }).first();
          if ((await cb.count().catch(() => 0)) === 0) {
            // Fallback: cerca checkbox per ID dal selettore
            if (action.selector) cb = page.locator(action.selector).first();
          }
        } else if (action.selector) {
          cb = page.locator(action.selector).first();
        } else {
          cb = page.locator('mat-checkbox').first();
        }

        if ((await cb.count().catch(() => 0)) === 0) {
          throw new Error('LLM checkbox: elemento non trovato');
        }

        await cb.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined);
        const checked = await isCheckboxChecked(cb);

        if (checked !== Boolean(action.checked)) {
          await cb.click({ timeout: 10_000 }).catch(async () => {
            // Fallback JS diretto
            await page.evaluate((label: string) => {
              const labelEl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === label);
              if (labelEl) {
                const forId = labelEl.getAttribute('for');
                if (forId) {
                  const input = document.getElementById(forId) as HTMLInputElement | null;
                  if (input) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
                }
              }
            }, cbLabel).catch(() => undefined);
          });
        }
        logger?.('info', `LLM checkbox: "${cbLabel}" = ${action.checked}`);
        return true;
      }

      case 'scroll_widget': {
        // Trova un elemento contenente il testo indicato e scrollalo fino in fondo
        // Prova container Bootstrap noto .card-body.info-privacy-content
        const privacyContainer = await page.evaluate(() => {
          const c = document.querySelector('.card-body.info-privacy-content');
          if (c && c.scrollHeight > c.clientHeight + 10) {
            c.scrollTop = c.scrollHeight;
            setTimeout(() => { c.scrollTop = c.scrollHeight; }, 200);
            return true;
          }
          return false;
        }).catch(() => false);
        if (privacyContainer) {
          await page.waitForTimeout(500);
          logger?.('info', 'LLM scroll_widget: .card-body.info-privacy-content');
          return true;
        }

        const widget = page.getByText(action.widgetText, { exact: false }).first();
        if ((await widget.count().catch(() => 0)) > 0) {
          const parent = widget.locator('..').first();
          await parent.evaluate((el: any) => {
            el.scrollTop = el.scrollHeight;
          }).catch(() => undefined);
          await page.waitForTimeout(400);
          await parent.evaluate((el: any) => {
            el.scrollTop = el.scrollHeight;
          }).catch(() => undefined);
          logger?.('info', `LLM scroll_widget: "${action.widgetText.slice(0, 60)}"`);
          return true;
        }
        // Fallback: scroll pagina
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(400);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        logger?.('info', `LLM scroll_widget: fallback scroll pagina`);
        return true;
      }

      case 'wait_and_retry':
        await page.waitForTimeout(3_000);
        logger?.('info', 'LLM: wait and retry (3s)');
        return true;

      default:
        logger?.('warn', `LLM: azione sconosciuta: ${(action as any).type}`);
        return false;
    }
  } catch (err) {
    logger?.('error', `LLM execute: errore ${action.type}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Prova un'azione Playwright e, se fallisce, chiama LLM come fallback.
 * Ritorna true se l'azione è stata eseguita con successo.
 */
export async function withLlmRescue(
  page: Page,
  goal: string,
  playwrightAction: () => Promise<void>,
  logger?: PiaAutomationLogger,
): Promise<boolean> {
  try {
    await playwrightAction();
    return true;
  } catch (err) {
    const playErr = err instanceof Error ? err.message : String(err);
    logger?.('warn', `Playwright fallito (${goal.slice(0, 60)}): ${playErr}. Provo LLM rescue…`);

    if (!isLlmConfigured()) {
      logger?.('warn', 'LLM rescue non disponibile (manca OPENAI_API_KEY / DEEPSEEK_API_KEY2)');
      return false;
    }

    const result = await llmAnalyzePage(page, goal, undefined, logger);
    if (!result.ok) {
      logger?.('error', `LLM rescue fallito: ${(result as any).error || 'sconosciuto'}`);
      return false;
    }

    // Esegui l'azione raccomandata
    const executed = await llmExecuteAction(page, result.action, logger);
    if (!executed) {
      logger?.('error', 'LLM rescue: azione non eseguita');
      return false;
    }

    // Attendi che la pagina si stabilizzi
    await page.waitForTimeout(800);
    return true;
  }
}
