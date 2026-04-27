import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

async function main() {
  const fixture = await startFixtureServer();
  const tmpDir = path.join('/tmp', `bndo-playwright-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const templatePath = path.join(tmpDir, 'template.json');
  const dataPath = path.join(tmpDir, 'data.json');

  const template = {
    name: 'Test Playwright',
    bandoKey: 'test',
    proceduraKey: 'default',
    domain: 'localhost',
    requiresFinalConfirmation: false,
    steps: [
      { type: 'goto', url: `${fixture.baseUrl}/page1` },
      { type: 'click', target: { id: 'next' } },
      { type: 'type', target: { id: 'fullName' }, valueFrom: 'client.fullName' },
      { type: 'select', target: { id: 'industry' }, valueFrom: 'practice.industry' },
      { type: 'click', target: { text: 'Presa visione' } },
      { type: 'type', target: { id: 'notes' }, valueFrom: 'practice.notes' },
      { type: 'scroll', direction: 'down' as const, amount: 520 },
      { type: 'click', target: { id: 'continue' } },
      { type: 'click', target: { id: 'submit' } },
    ],
    fieldMapping: {},
  };

  const data = {
    client: { fullName: 'Mario Rossi' },
    practice: { industry: 'retail', notes: 'Note di test Playwright' },
  };

  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  console.log('[INFO] Avvio run-copilot-playwright.ts');

  const child = spawn('npx', [
    'tsx',
    'scripts/run-copilot-playwright.ts',
    `--template=${templatePath}`,
    `--data=${dataPath}`,
    '--headless',
  ], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; process.stdout.write(d); });
  child.stderr.on('data', (d) => { stderr += d; process.stderr.write(d); });

  const exitCode = await new Promise<number>((resolve) => child.on('close', resolve));

  await fixture.close();

  const success = stdout.includes('Completati:') && !stdout.includes('ERRORE');
  if (success) {
    console.log('\n[PASS] Playwright E2E -> OK');
  } else {
    console.error('\n[FAIL] Playwright E2E -> Errore nel replay');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
