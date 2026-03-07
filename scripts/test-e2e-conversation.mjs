import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = 3055;
const BASE_URL = `http://localhost:${PORT}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, { method: 'GET' }).catch(() => fetch(BASE_URL));
      if (res) return true;
    } catch (e) {}
    await sleep(1000);
  }
  return false;
}

async function runTestFlow(flowName, messages) {
  console.log(`\n--- INIZIO TEST FLUSSO: ${flowName} ---`);
  let cookie = null;

  for (const msg of messages) {
    console.log(`\nUtente: "${msg}"`);
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;

    const res = await fetch(`${BASE_URL}/api/conversation`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: msg })
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }

    if (!res.ok) {
      console.log(`ERRORE HTTP: ${res.status}`);
      console.log(await res.text());
      continue;
    }

    const data = await res.json();
    console.log(`Assistant: "${data.assistantText}"`);
    console.log(`Dati estratti: businessExists=${data.userProfile.businessExists}, activityType=${data.userProfile.activityType}`);
    console.log(`Pronto per lo scan: ${data.readyToScan}`);
  }
}

async function main() {
  console.log('Avvio server Next.js...');
  const server = spawn('npm', ['run', 'dev', '--', '-p', String(PORT)], { stdio: 'ignore', detached: true });
  
  const isUp = await waitForServer();
  if (!isUp) {
    console.error('Il server non si è avviato in tempo.');
    process.kill(-server.pid);
    process.exit(1);
  }

  try {
    await runTestFlow('CASO BLOCCANTE OPERATIVA', [
      "bando per software in sicilia",
      "operativa"
    ]);

    await runTestFlow('VARIANTE GIA ATTIVA', [
      "bando per agricoltura",
      "già attiva"
    ]);

    await runTestFlow('VARIANTE HO GIA LAZIENDA', [
      "finanziamenti turismo",
      "ho già l'azienda"
    ]);

    await runTestFlow('VARIANTE DA COSTITUIRE', [
      "aprire e-commerce",
      "da costituire"
    ]);

    await runTestFlow('VARIANTE ANCORA NON ESISTE', [
      "bando per bar",
      "ancora non esiste"
    ]);

  } finally {
    process.kill(-server.pid);
    console.log('\nTest completati, server terminato.');
  }
}

main();
