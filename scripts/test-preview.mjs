import fs from 'fs';

async function fetchScan(url, payload) {
  const res = await fetch(`${url}/api/scan-bandi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchChat(url, payload) {
  const res = await fetch(`${url}/api/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function runTests(previewUrl) {
  console.log(`Testing against: ${previewUrl}`);

  // TEST LOMBARDIA
  console.log('\n--- TEST A: LOMBARDIA ---');
  const resLombardia = await fetchScan(previewUrl, {
    userProfile: {
      businessExists: true,
      region: 'Lombardia',
      sector: 'digitale',
      fundingGoal: 'macchinari e software',
      revenueOrBudgetEUR: 50000,
      employees: 3,
      ateco: '62.01.00'
    },
    strictness: 'high'
  });
  console.log(`Results: ${resLombardia.results?.length}`);
  resLombardia.results?.slice(0, 3).forEach(r => console.log(`- [${r.score}] ${r.title} (${r.authorityName})`));
  const badLombardia = resLombardia.results?.filter(r => r.whyFit?.some(w => w.toLowerCase().includes('campania') || w.toLowerCase().includes('piemonte')));
  if (badLombardia?.length > 0) console.error('FAIL: out of region items found!');

  // TEST CAMPANIA
  console.log('\n--- TEST B: CAMPANIA ---');
  const resCampania = await fetchScan(previewUrl, {
    userProfile: {
      businessExists: true,
      region: 'Campania',
      sector: 'turismo',
      fundingGoal: 'ristrutturazione locali',
      revenueOrBudgetEUR: 100000,
      employees: 5
    },
    strictness: 'high'
  });
  console.log(`Results: ${resCampania.results?.length}`);
  resCampania.results?.slice(0, 3).forEach(r => console.log(`- [${r.score}] ${r.title} (${r.authorityName})`));

  // TEST PAYLOAD (answers)
  console.log('\n--- TEST C: PAYLOAD WITH ANSWERS ---');
  const resAnswers = await fetchScan(previewUrl, {
    answers: {
      businessExists: true,
      region: 'Campania',
      sector: 'turismo',
    },
    strictness: 'high'
  });
  console.log(`Results with 'answers' root: ${resAnswers.results?.length}`);

  // TEST CHAT
  console.log('\n--- TEST D: CHAT ---');
  // First clear session
  await fetch(`${previewUrl}/api/conversation`, { method: 'DELETE' });
  const chat1 = await fetchChat(previewUrl, { message: 'ciao voglio aprire un bar a milano' });
  console.log('Turn 1:', chat1.assistantText);
  if (chat1.assistantText.includes('avvio lo scanner')) console.error('FAIL: robotic phrase found');

  const chat2 = await fetchChat(previewUrl, { message: 'ho 30 anni, disoccupato' });
  console.log('Turn 2:', chat2.assistantText);
  
  const chat3 = await fetchChat(previewUrl, { message: 'mi serve un fondo perduto di 50000 euro per macchinari' });
  console.log('Turn 3:', chat3.assistantText);
  if (chat3.assistantText.includes('avvio lo scanner')) console.error('FAIL: robotic phrase found');
}

const url = process.argv[2];
if (!url) {
  console.error('Provide preview URL');
  process.exit(1);
}

runTests(url).catch(console.error);