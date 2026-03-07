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

  // TEST A: LOMBARDIA DIGITALE
  console.log('\n--- TEST A: LOMBARDIA DIGITALE ---');
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
    strictness: 'high',
    mode: 'fast'
  });
  console.log(`Results: ${resLombardia.results?.length}`);
  resLombardia.results?.slice(0, 5).forEach(r => {
    console.log(`- [${r.score}] ${r.title} (${r.authorityName})`);
    console.log(`  Match reasons: ${r.whyFit?.join(', ')}`);
  });
  
  const badLombardia = resLombardia.results?.filter(r => {
    const title = r.title.toLowerCase();
    return title.includes('india') || title.includes('estero') || title.includes('mancati pagamenti');
  });
  if (badLombardia?.length > 0) console.error('FAIL: weak semantic items found in top results!');

  // TEST B: CAMPANIA TURISMO
  console.log('\n--- TEST B: CAMPANIA TURISMO ---');
  const resCampania = await fetchScan(previewUrl, {
    userProfile: {
      businessExists: true,
      region: 'Campania',
      sector: 'turismo',
      fundingGoal: 'ristrutturazione locali',
      revenueOrBudgetEUR: 100000,
      employees: 5
    },
    strictness: 'high',
    mode: 'fast'
  });
  console.log(`Results: ${resCampania.results?.length}`);
  resCampania.results?.slice(0, 5).forEach(r => {
    console.log(`- [${r.score}] ${r.title} (${r.authorityName})`);
    console.log(`  Match reasons: ${r.whyFit?.join(', ')}`);
  });
  
  const badCampania = resCampania.results?.filter(r => {
    const title = r.title.toLowerCase();
    const isIndia = title.includes('india');
    const isMancati = title.includes('mancati pagamenti');
    return isIndia || isMancati;
  });
  if (badCampania?.length > 0) {
    console.error('FAIL: irrelevant results (India/Mancati) found in primary results for Campania Tourism!');
  }

  // TEST CHAT UX (Double phrase)
  console.log('\n--- TEST C: CHAT UX ---');
  await fetch(`${previewUrl}/api/conversation`, { method: 'DELETE' });
  const chat1 = await fetchChat(previewUrl, { message: 'ciao sono un impresa di milano' });
  console.log('Chat 1:', chat1.assistantText);
  if (chat1.assistantText.includes('.') && chat1.assistantText.split('.').filter(s => s.trim().length > 5).length > 1) {
     // Non è necessariamente un errore se sono frasi diverse, ma verifichiamo la naturalezza
  }
  
  const chat2 = await fetchChat(previewUrl, { message: 'settore turismo' });
  console.log('Chat 2:', chat2.assistantText);
  if (chat2.assistantText.includes('Mi serve')) {
      console.error('FAIL: "Mi serve..." redundant phrase found!');
  }
}

const url = process.argv[2];
if (!url) {
  console.error('Provide preview URL');
  process.exit(1);
}

runTests(url).catch(console.error);