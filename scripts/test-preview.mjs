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

  // A. SICILIA / AGRICOLO / SOFTWARE
  console.log('\n--- TEST A: SICILIA AGRICOLO SOFTWARE ---');
  await fetch(`${previewUrl}/api/conversation`, { method: 'DELETE' }); 
  lastCookie = null;

  const c1 = await fetchChat(previewUrl, { message: 'bando per software nel settore agricolo in Sicilia' });
  console.log('Turn 1 (Goal+Region+Sector):', c1.assistantText);
  console.log('Ready to scan:', c1.readyToScan);
  
  const c2 = await fetchChat(previewUrl, { message: 'azienda gia attiva' });
  console.log('Turn 2 (Context):', c2.assistantText);
  console.log('Ready to scan:', c2.readyToScan);
  
  if (c2.readyToScan) {
      const s1 = await fetchScan(previewUrl, { userProfile: c2.userProfile, mode: 'fast' });
      console.log(`Found ${s1.results?.length} results.`);
      s1.results?.slice(0, 3).forEach(r => console.log(`- [${r.score}] ${r.title} (${r.authorityName})`));
  }

  // B. CAMPANIA TURISMO / RISTRUTTURAZIONE
  console.log('\n--- TEST B: CAMPANIA TURISMO ---');
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
  const badItems = s2.results?.filter(r => {
      const t = r.title.toLowerCase();
      return t.includes('india') || t.includes('export') || t.includes('mancati pagamenti');
  });
  if (badItems?.length > 0) {
      console.error('FAIL: Found irrelevant results!');
      badItems.forEach(i => console.log(`- ${i.title}`));
  } else {
      console.log('PASS: No irrelevant results.');
  }

  // C. LOMBARDIA DIGITALE MACCHINARI
  console.log('\n--- TEST C: LOMBARDIA DIGITALE ---');
  const s3 = await fetchScan(previewUrl, {
      userProfile: {
          businessExists: true,
          region: 'Lombardia',
          sector: 'digitale',
          fundingGoal: 'acquisto macchinari e software 4.0',
      },
      strictness: 'high',
      mode: 'fast'
  });
  console.log(`Results: ${s3.results?.length}`);
  const outOfRegion = s3.results?.filter(r => {
      const note = (r.whyFit || []).join(' ').toLowerCase();
      return note.includes('piemonte') || note.includes('campania') || note.includes('sicilia');
  });
  if (outOfRegion?.length > 0) {
      console.error('FAIL: Found out-of-region results!');
  } else {
      console.log('PASS: No out-of-region results in primary.');
  }
}

const url = process.argv[2];
if (!url) {
    console.error('Provide preview URL');
    process.exit(1);
}
runTests(url).catch(console.error);
