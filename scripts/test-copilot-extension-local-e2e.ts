import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

type TestResult = {
  name: string;
  ok: boolean;
  details: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/page1') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Page 1</title></head>
  <body style="font-family: Arial; padding: 24px; height: 2200px;">
    <h1>Pagina 1</h1>
    <p>Step iniziale di navigazione.</p>
    <button id="next" onclick="window.location.href='/page2'">Vai alla pagina 2</button>
  </body>
</html>`);
      return;
    }

    if (url === '/page2') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Page 2</title></head>
  <body style="font-family: Arial; padding: 24px; height: 2600px;">
    <h1>Pagina 2</h1>
    <form id="mainForm" onsubmit="event.preventDefault(); sessionStorage.setItem('formSnapshot', JSON.stringify({ fullName: document.getElementById('fullName').value, industry: document.getElementById('industry').value, notes: document.getElementById('notes').textContent, accepted: document.getElementById('customCheck').checked })); window.location.href='/page3';">
      <label for="fullName">Nome completo</label>
      <input id="fullName" name="fullName" placeholder="Nome completo" />
      <br/><br/>
      <label for="industry">Settore</label>
      <select id="industry" name="industry">
        <option value="">Seleziona</option>
        <option value="retail">Retail</option>
        <option value="food">Food</option>
      </select>
      <br/><br/>
      <label for="upload">Documento</label>
      <input id="upload" type="file" />
      <br/><br/>
      <div style="position:relative; display:inline-block;">
        <input id="customCheck" type="checkbox" style="position:absolute; opacity:0; width:0; height:0;" />
        <label for="customCheck" role="checkbox" aria-checked="false" style="cursor:pointer; padding:8px; border:1px solid #ccc; border-radius:4px; display:inline-flex; align-items:center; gap:8px;">
          <span style="width:16px; height:16px; border:2px solid #333; display:inline-block;"></span>
          Presa visione
        </label>
      </div>
      <br/><br/>
      <label for="notes">Note aggiuntive</label>
      <div id="notes" contenteditable="true" style="border:1px solid #ccc; padding:8px; min-height:60px;"></div>
      <br/><br/>
      <button id="continue" type="submit">Continua</button>
    </form>
  </body>
</html>`);
      return;
    }

    if (url === '/page3') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Page 3</title></head>
  <body style="font-family: Arial; padding: 24px; height: 1800px;">
    <h1>Pagina 3</h1>
    <div id="snapshot"></div>
    <button id="submit" onclick="document.getElementById('result').textContent='inviata';">Invia pratica</button>
    <div id="result"></div>
    <script>
      try {
        const raw = sessionStorage.getItem('formSnapshot') || '';
        document.getElementById('snapshot').textContent = raw;
      } catch (e) {
        document.getElementById('snapshot').textContent = '';
      }
    </script>
  </body>
</html>`);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server address non disponibile.');

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function getChromeExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('Chrome/Chromium non trovato.');
}

function runtimeMockInitScript() {
  return `(() => {
    const STATE_KEY = '__bndo_mock_state__';
    const listeners = [];

    function normalize(state) {
      const safe = state && typeof state === 'object' ? state : {};
      return {
        recorderEvents: Array.isArray(safe.recorderEvents) ? safe.recorderEvents : [],
        navSignals: Array.isArray(safe.navSignals) ? safe.navSignals : [],
        progress: Array.isArray(safe.progress) ? safe.progress : [],
        messages: Array.isArray(safe.messages) ? safe.messages : [],
        saves: Array.isArray(safe.saves) ? safe.saves : [],
        runPayload: safe.runPayload && typeof safe.runPayload === 'object' ? safe.runPayload : null,
        shouldRun: Boolean(safe.shouldRun),
      };
    }

    function readState() {
      try {
        const raw = sessionStorage.getItem(STATE_KEY);
        if (!raw) return normalize({});
        return normalize(JSON.parse(raw));
      } catch {
        return normalize({});
      }
    }

    function writeState(next) {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(normalize(next)));
    }

    function patchState(patch) {
      const current = readState();
      const next = normalize({ ...current, ...patch });
      writeState(next);
      return next;
    }

    async function dispatchToListeners(message) {
      let lastResponse;
      for (const listener of listeners) {
        lastResponse = await new Promise((resolve) => {
          let settled = false;
          const sendResponse = (payload) => {
            settled = true;
            resolve(payload);
          };

          try {
            const returned = listener(message, { tab: { id: 1, url: location.href } }, sendResponse);
            if (returned !== true && !settled) {
              settled = true;
              resolve(undefined);
            }
          } catch (error) {
            settled = true;
            resolve({ ok: false, error: String(error && error.message ? error.message : error) });
          }

          setTimeout(() => {
            if (!settled) resolve(undefined);
          }, 15000);
        });
      }

      return lastResponse;
    }

    window.__bndoMock = {
      clear() {
        sessionStorage.removeItem(STATE_KEY);
      },
      getState() {
        return readState();
      },
      setRunPayload(payload) {
        patchState({ runPayload: payload, shouldRun: true });
      },
      async dispatch(message) {
        return dispatchToListeners(message);
      },
    };

    window.chrome = window.chrome || {};
    window.chrome.runtime = {
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
      async sendMessage(message) {
        const current = readState();
        const messages = [...current.messages, message];

        if (message && message.type === 'RECORDER_EVENT') {
          patchState({ messages, recorderEvents: [...current.recorderEvents, message.payload] });
          return { ok: true };
        }

        if (message && message.type === 'BNDO_LOCAL_RUN_NAVIGATING') {
          const payload = message.payload || {};
          const runPayload = current.runPayload && typeof current.runPayload === 'object' ? { ...current.runPayload } : null;
          if (runPayload) {
            runPayload.startIndex = Number(payload.nextIndex || 0) || 0;
            runPayload.runId = String(payload.runId || runPayload.runId || 'run-local');
          }

          patchState({
            messages,
            runPayload,
            shouldRun: true,
            navSignals: [...current.navSignals, payload],
          });

          return { ok: true };
        }

        if (message && message.type === 'BNDO_LOCAL_RUN_PROGRESS') {
          const payload = message.payload || {};
          const runPayload = current.runPayload && typeof current.runPayload === 'object' ? { ...current.runPayload } : null;
          if (runPayload) {
            runPayload.startIndex = Number(payload.nextIndex || runPayload.startIndex || 0) || 0;
            runPayload.runId = String(payload.runId || runPayload.runId || 'run-local');
          }

          patchState({
            messages,
            progress: [...current.progress, payload],
            runPayload,
            shouldRun: !Boolean(payload.done),
          });
          return { ok: true };
        }

        if (message && message.type === 'BNDO_LOCAL_RUN_READY') {
          if (current.shouldRun && current.runPayload) {
            patchState({ messages, shouldRun: false });
            return {
              ok: true,
              shouldRun: true,
              payload: current.runPayload,
            };
          }
          patchState({ messages });
          return { ok: true, shouldRun: false };
        }

        patchState({ messages });
        return { ok: true };
      },
    };
  })();`;
}

function popupMockInitScript() {
  return `(() => {
    const savedValues = [];
    window.__popupMock = { savedValues };

    window.chrome = window.chrome || {};
    window.chrome.runtime = {
      async sendMessage(message) {
        const type = String(message && message.type || '');

        if (type === 'SYNC_QUEUE') {
          return { ok: true, synced: 0, remaining: 0 };
        }

        if (type === 'GET_BOOTSTRAP') {
          return {
            ok: true,
            recording: false,
            paused: false,
            startedAt: null,
            activeTabId: 1,
            context: {
              templateName: 'Template Invitalia',
              bandoKey: 'resto-al-sud-2-0',
              proceduraKey: 'default',
              saveMode: 'new_version',
              selectedClientId: 'client-1',
            },
            eventsCount: 12,
            settings: {
              mode: 'standalone',
              apiBaseUrl: '',
              apiKey: '',
              syncOnPopupOpen: true,
              allowedDomains: ['invitalia.it'],
            },
            clients: [
              {
                id: 'client-1',
                fullName: 'Mario Rossi',
                email: 'mario@example.com',
                phone: '+39000111222',
                taxCode: 'RSSMRA80A01H501U',
                updatedAt: new Date().toISOString(),
              },
            ],
            templates: [
              {
                id: 'tpl-1',
                name: 'Invitalia Autoimpiego v1',
                bandoKey: 'resto-al-sud-2-0',
                proceduraKey: 'default',
                status: 'active',
                updatedAt: new Date().toISOString(),
                cloudTemplateId: 'cloud-1',
              },
            ],
            queueSize: 0,
            localRun: null,
          };
        }

        if (type === 'GET_CLIENT_TEMPLATE_VALUES') {
          return {
            ok: true,
            client: { id: 'client-1', fullName: 'Mario Rossi', email: 'mario@example.com' },
            template: { id: 'tpl-1', name: 'Invitalia Autoimpiego v1', bandoKey: 'resto-al-sud-2-0', proceduraKey: 'default', status: 'active' },
            fields: ['client.fullName', 'practice.requestedAmount', 'credentials.password'],
            runtimeOnlyKeys: ['credentials.password'],
            values: {
              'client.fullName': 'Mario Rossi',
              'practice.requestedAmount': '',
            },
            updatedAt: null,
          };
        }

        if (type === 'SAVE_CLIENT_TEMPLATE_VALUES') {
          savedValues.push(message);
          return {
            ok: true,
            synced: false,
            queued: false,
            updatedAt: new Date().toISOString(),
            values: message.values || {},
          };
        }

        return { ok: true };
      },
    };
  })();`;
}

async function runRecorderTest(baseUrl: string, contentRecorderBundlePath: string): Promise<TestResult> {
  const browser = await chromium.launch({
    executablePath: getChromeExecutable(),
    headless: true,
  });

  const context = await browser.newContext();
  await context.addInitScript({ content: runtimeMockInitScript() });
  await context.addInitScript({ path: contentRecorderBundlePath });
  const page = await context.newPage();

  const tmpFile = path.join(os.tmpdir(), `bndo-copilot-upload-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, 'demo-file');

  try {
    await page.goto(`${baseUrl}/page1`, { waitUntil: 'domcontentloaded' });
    await page.click('#next');
    await page.waitForURL(`${baseUrl}/page2`, { timeout: 10000 });

    await page.fill('#fullName', 'Mario Rossi');
    await page.waitForFunction(() => Boolean(document.getElementById('bndo-recorder-field-hint')), undefined, {
      timeout: 3000,
    });
    await page.selectOption('#industry', 'retail');
    await page.setInputFiles('#upload', tmpFile);

    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(520);
    await page.mouse.wheel(0, -320);
    await page.waitForTimeout(520);

    await page.click('#continue');
    await page.waitForURL(`${baseUrl}/page3`, { timeout: 10000 });
    await page.click('#submit');

    const state = await page.evaluate(() => (window as any).__bndoMock.getState());
    const kinds = new Set((state.recorderEvents || []).map((event: any) => String(event.kind || '')));

    assert(kinds.has('navigation'), 'Recorder: evento navigation mancante.');
    assert(kinds.has('click'), 'Recorder: evento click mancante.');
    assert(kinds.has('change'), 'Recorder: evento change (type) mancante.');
    assert(kinds.has('select'), 'Recorder: evento select mancante.');
    assert(kinds.has('upload'), 'Recorder: evento upload mancante.');
    assert(kinds.has('scroll'), 'Recorder: evento scroll mancante.');

    const hasMappingSuggestion = (state.recorderEvents || []).some(
      (event: any) => typeof event?.meta?.mappingSuggestion === 'string' && event.meta.mappingSuggestion.length > 0,
    );
    assert(hasMappingSuggestion, 'Recorder: nessuna mappingSuggestion nei meta eventi.');

    const hasDocumentSuggestion = (state.recorderEvents || []).some(
      (event: any) => typeof event?.meta?.documentSuggestion === 'string' && event.meta.documentSuggestion.length > 0,
    );
    assert(hasDocumentSuggestion, 'Recorder: nessuna documentSuggestion nei meta eventi upload.');

    const firstPageClick = (state.recorderEvents || []).find(
      (event: any) => String(event.kind || '') === 'click' && String(event.url || '').includes('/page1'),
    );
    assert(Boolean(firstPageClick), 'Recorder: primo click pagina 1 non registrato.');

    const hasActionKind = (state.recorderEvents || []).some(
      (event: any) => typeof event?.meta?.actionKind === 'string' && event.meta.actionKind.length > 0,
    );
    assert(hasActionKind, 'Recorder: actionKind assente nei meta eventi.');

    const hasScrollAmount = (state.recorderEvents || []).some(
      (event: any) => String(event.kind || '') === 'scroll' && Number(event?.meta?.amount || 0) > 0,
    );
    assert(hasScrollAmount, 'Recorder: scroll amount non catturato.');

    const hasInternalNoise = (state.recorderEvents || []).some((event: any) => {
      const css = String(event?.selectors?.css || '');
      const id = String(event?.selectors?.id || '');
      const testId = String(event?.selectors?.testId || '');
      return /bndo-/i.test(css) || /bndo-/i.test(id) || /bndo-/i.test(testId);
    });
    assert(!hasInternalNoise, 'Recorder: eventi rumore UI interna BNDO presenti nel template.');

    return {
      name: 'Recorder E2E (click/change/select/upload/scroll/navigation)',
      ok: true,
      details: `Eventi registrati: ${(state.recorderEvents || []).length}`,
    };
  } finally {
    await context.close();
    await browser.close();
    fs.rmSync(tmpFile, { force: true });
  }
}

async function runReplayTest(baseUrl: string, contentRecorderBundlePath: string): Promise<TestResult> {
  const browser = await chromium.launch({
    executablePath: getChromeExecutable(),
    headless: true,
  });

  const context = await browser.newContext();
  await context.addInitScript({ content: runtimeMockInitScript() });
  await context.addInitScript({ path: contentRecorderBundlePath });

  const page = await context.newPage();

  const steps = [
    { type: 'goto', url: `${baseUrl}/page1`, waitUntil: 'load' },
    { type: 'click', target: { css: '#next' } },
    { type: 'type', target: { css: '#fullName' }, valueFrom: 'client.fullName' },
    { type: 'select', target: { css: '#industry' }, valueFrom: 'practice.industry' },
    { type: 'click', target: { css: 'label[for="customCheck"]' } },
    { type: 'type', target: { css: '#notes' }, valueFrom: 'practice.notes' },
    { type: 'scroll', direction: 'down', amount: 520 },
    { type: 'click', target: { css: '#continue' } },
    { type: 'click', target: { css: '#submit' } },
  ];

  try {
    await page.goto(`${baseUrl}/page1`, { waitUntil: 'domcontentloaded' });

    await page.evaluate((payload) => {
      (window as any).__bndoMock.setRunPayload(payload);
    }, {
      runId: 'run-local-e2e',
      steps,
      data: {
        client: { fullName: 'Mario Rossi' },
        practice: { industry: 'retail', notes: 'Note di test' },
        credentials: {},
      },
      fieldMapping: {},
      startIndex: 0,
    });

    await page.evaluate(() => {
      const payload = (window as any).__bndoMock.getState().runPayload;
      void (window as any).__bndoMock.dispatch({ type: 'BNDO_RUN_LOCAL_TEMPLATE', payload });
    });

    try {
      await page.waitForFunction(() => {
        const progress = (window as any).__bndoMock.getState().progress || [];
        return progress.some((entry: any) => Boolean(entry.done));
      }, undefined, { timeout: 45000 });
    } catch (error) {
      const debugState = await page.evaluate(() => (window as any).__bndoMock.getState()).catch(() => null);
      throw new Error(
        `Replay timeout. URL=${page.url()} state=${JSON.stringify(debugState).slice(0, 5200)} cause=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const finalState = await page.evaluate(() => (window as any).__bndoMock.getState());
    const finalProgress = [...(finalState.progress || [])].reverse().find((entry: any) => entry && entry.done);

    assert(finalProgress, 'Replay: progresso finale non trovato.');
    assert(finalProgress.ok !== false, `Replay: completamento non ok (${String(finalProgress.error || 'unknown')}).`);
    assert(!finalProgress.waitingHuman, 'Replay: flusso terminato in waiting_human.');

    const currentUrl = page.url();
    assert(currentUrl.includes('/page3'), `Replay: URL finale inatteso (${currentUrl}).`);

    const snapshot = await page.textContent('#snapshot');
    assert(String(snapshot || '').includes('Mario Rossi'), 'Replay: valore fullName non compilato in pagina 2.');
    assert(String(snapshot || '').includes('retail'), 'Replay: valore select non compilato in pagina 2.');
    assert(String(snapshot || '').includes('Note di test'), 'Replay: valore notes non compilato in pagina 2.');
    assert(String(snapshot || '').includes('"accepted":true'), 'Replay: checkbox custom non cliccata in pagina 2.');

    const submitResult = await page.textContent('#result');
    assert(String(submitResult || '').includes('inviata'), 'Replay: click finale submit non eseguito.');

    const cursorInfo = await page.evaluate(() => {
      const cursor = document.getElementById('bndo-local-run-cursor') as HTMLElement | null;
      return {
        present: Boolean(cursor),
        left: cursor?.style.left || '',
        top: cursor?.style.top || '',
      };
    });

    assert(cursorInfo.present, 'Replay: cursore overlay non presente in pagina finale.');
    assert(cursorInfo.left !== '16px' || cursorInfo.top !== '16px', 'Replay: cursore non si e mosso dalla posizione iniziale.');

    return {
      name: 'Replay E2E multi-page (no stop + cursor + click finali)',
      ok: true,
      details: `Progress entries: ${(finalState.progress || []).length}`,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runPopupMappingTest(popupHtmlPath: string, popupJsPath: string): Promise<TestResult> {
  const browser = await chromium.launch({
    executablePath: getChromeExecutable(),
    headless: true,
  });

  const context = await browser.newContext();
  await context.addInitScript({ content: popupMockInitScript() });
  const page = await context.newPage();

  try {
    const popupHtml = fs
      .readFileSync(popupHtmlPath, 'utf8')
      .replace('<script type="module" src="popup.js"></script>', '');
    const popupJs = fs.readFileSync(popupJsPath, 'utf8');

    await page.setContent(popupHtml, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ type: 'module', content: popupJs });

    await page.click('#toggleAdvanced').catch(() => undefined);
    await page.evaluate(() => {
      document.getElementById('advancedPanel')?.classList.add('is-open');
      document.getElementById('tabClients')?.classList.add('active');
    });

    await page.waitForFunction(() => {
      const select = document.getElementById('mappingTemplateSelect') as HTMLSelectElement | null;
      return Boolean(select && select.options.length > 1);
    }, undefined, { timeout: 20000 });
    await page.selectOption('#mappingTemplateSelect', 'tpl-1');

    await page.waitForSelector('#mappedFieldsPanel input[data-field-key="practice.requestedAmount"]');

    const metaBefore = await page.textContent('#mappedFieldsMeta');
    assert(String(metaBefore || '').includes('Copertura mapping: 1/2 (50%)'), `Popup mapping: copertura iniziale inattesa (${metaBefore}).`);

    await page.fill('#mappedFieldsPanel input[data-field-key="practice.requestedAmount"]', '75000');
    await page.dispatchEvent('#mappedFieldsPanel input[data-field-key="practice.requestedAmount"]', 'blur');
    await page.waitForTimeout(650);

    const metaAfter = await page.textContent('#mappedFieldsMeta');
    assert(String(metaAfter || '').includes('Copertura mapping: 2/2 (100%)') || String(metaAfter || '').includes('Valori salvati'), `Popup mapping: copertura finale inattesa (${metaAfter}).`);

    const saves = await page.evaluate(() => (window as any).__popupMock.savedValues || []);
    assert(Array.isArray(saves) && saves.length > 0, 'Popup mapping: nessun save inviato al background mock.');

    const latestSave = saves[saves.length - 1];
    assert(latestSave?.values?.['practice.requestedAmount'] === '75000', 'Popup mapping: valore richiesto non salvato.');
    assert(!Object.prototype.hasOwnProperty.call(latestSave?.values ?? {}, 'credentials.password'), 'Popup mapping: campo runtime-only non deve essere persistito.');

    return {
      name: 'Popup mapping visuale (copertura + save cliente/template)',
      ok: true,
      details: `Save calls: ${saves.length}`,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const root = '/Users/nataleletteriotornatora/Documents/bndo-webapp';
  const contentRecorderBundlePath = path.join(root, 'extensions', 'bndo-copilot', 'dist', 'content-recorder.js');
  const popupHtmlPath = path.join(root, 'extensions', 'bndo-copilot', 'dist', 'popup.html');
  const popupJsPath = path.join(root, 'extensions', 'bndo-copilot', 'dist', 'popup.js');

  if (!fs.existsSync(contentRecorderBundlePath)) {
    throw new Error(`Bundle estensione mancante: ${contentRecorderBundlePath}. Esegui prima npm run build in extensions/bndo-copilot.`);
  }
  if (!fs.existsSync(popupHtmlPath)) {
    throw new Error(`Popup build mancante: ${popupHtmlPath}. Esegui prima npm run build in extensions/bndo-copilot.`);
  }
  if (!fs.existsSync(popupJsPath)) {
    throw new Error(`Popup js build mancante: ${popupJsPath}. Esegui prima npm run build in extensions/bndo-copilot.`);
  }

  const fixture = await startFixtureServer();
  const results: TestResult[] = [];

  try {
    console.log('[INFO] running recorder test');
    results.push(await runRecorderTest(fixture.baseUrl, contentRecorderBundlePath));
    console.log('[INFO] running replay test');
    results.push(await runReplayTest(fixture.baseUrl, contentRecorderBundlePath));
    console.log('[INFO] running popup mapping test');
    results.push(await runPopupMappingTest(popupHtmlPath, popupJsPath));
  } finally {
    await fixture.close();
  }

  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.name} -> ${result.details}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[FAIL] test-copilot-extension-local-e2e', error instanceof Error ? error.message : error);
  process.exit(1);
});
