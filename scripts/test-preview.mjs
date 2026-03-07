let lastCookie = null;

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
  const headers = { 'Content-Type': 'application/json' };
  if (lastCookie) {
      headers['Cookie'] = lastCookie;
  }
  const res = await fetch(`${url}/api/conversation`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const cookie = res.headers.get('set-cookie');
  if (cookie) {
      lastCookie = cookie.split(';')[0];
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function runTests(previewUrl) {
  console.log(`Testing against: ${previewUrl}`);

  // 1) SICILIA / AGRICOLO / SOFTWARE (Chat flow)
  console.log('\n--- TEST 1: SICILIA AGRICOLO SOFTWARE ---');
  await fetch(`${previewUrl}/api/conversation`, { method: 'DELETE' }); // Reset
  lastCookie = null;

  const c1 = await fetchChat(previewUrl, { message: 'bando per software nel settore agricolo in Sicilia' });
  console.log('Turn 1:', c1.assistantText);
  console.log('Ready to scan:', c1.readyToScan);
  console.log('Detected Profile:', JSON.stringify(c1.userProfile));

  if (!c1.readyToScan) {
      const c2 = await fetchChat(previewUrl, { message: 'azienda gia attiva' });
      console.log('Turn 2:', c2.assistantText);
      console.log('Ready to scan:', c2.readyToScan);
      console.log('Final Profile:', JSON.stringify(c2.userProfile));
  }

  // 2) CAMPANIA TURISMO (Scanner check)
  console.log('\n--- TEST 2: CAMPANIA TURISMO ---');
  const s2 = await fetchScan(previewUrl, {
      userProfile: {
          businessExists: true,
          region: 'Campania',
          sector: 'turismo',
          fundingGoal: 'ristrutturazione hotel',
      },
      strictness: 'high',
      mode: 'fast'
  });
  console.log(`Results: ${s2.results?.length}`);
  const badItems = s2.results?.filter(r => r.title.toLowerCase().includes('india') || r.title.toLowerCase().includes('export'));
  if (badItems?.length > 0) {
      console.error('FAIL: Found irrelevant results!');
      badItems.forEach(i => console.log(`- ${i.title}`));
  } else {
      console.log('PASS: No irrelevant results.');
  }

  // 3) LOMBARDIA (Scanner check)
  console.log('\n--- TEST 3: LOMBARDIA ---');
  const s3 = await fetchScan(previewUrl, {
      userProfile: {
          businessExists: true,
          region: 'Lombardia',
          sector: 'digitale',
          fundingGoal: 'macchinari e software 4.0',
      },
      strictness: 'high',
      mode: 'fast'
  });
  console.log(`Results: ${s3.results?.length}`);
  const outOfRegion = s3.results?.filter(r => r.whyFit?.some(w => w.toLowerCase().includes('piemonte') || w.toLowerCase().includes('campania')));
  if (outOfRegion?.length > 0) {
      console.error('FAIL: Found out-of-region results!');
  } else {
      console.log('PASS: No out-of-region results.');
  }

  // 4) PAYLOAD WITH 'answers' ROOT
  console.log('\n--- TEST 4: PAYLOAD ANSWERS ---');
  const s4 = await fetchScan(previewUrl, {
      answers: {
          businessExists: true,
          region: 'Lombardia',
          fundingGoal: 'software',
      },
      mode: 'fast'
  });
  console.log(`Results with 'answers' root: ${s4.results?.length}`);
  if (s4.results?.length > 0) console.log('PASS: Payload answers root supported.');
}

const url = process.argv[2];
if (!url) {
    console.error('Provide preview URL');
    process.exit(1);
}
runTests(url).catch(console.error);
