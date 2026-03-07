import fetch from 'node-fetch';

const URL = 'http://localhost:3000/api/conversation';

async function test(message, session = null) {
  console.log(`\n> User: ${message}`);
  const headers = { 'Content-Type': 'application/json' };
  if (session) {
    headers['Cookie'] = `bndo_assistant_session=${session}`;
  }
  const res = await fetch(URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message })
  });
  const data = await res.json();
  const setCookie = res.headers.get('set-cookie');
  let nextSession = null;
  if (setCookie) {
    const match = setCookie.match(/bndo_assistant_session=([^;]+)/);
    if (match) nextSession = match[1];
  }
  console.log(`< Assistant: ${data.assistantText}`);
  console.log(`  Mode: ${data.mode} | NextStep: ${data.nextBestField} | Ready: ${data.readyToScan}`);
  return { data, session: nextSession };
}

async function runTests() {
  console.log("--- TEST 1: bando per software in sicilia ---");
  let { session } = await test("bando per software in sicilia");
  
  console.log("\n--- TEST 2: operativa ---");
  await test("operativa", session);

  console.log("\n--- TEST 7: la formazione si può finanziare con Resto al Sud 2.0? ---");
  await test("la formazione si può finanziare con Resto al Sud 2.0?");
}

runTests().catch(console.error);
