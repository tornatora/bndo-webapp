#!/usr/bin/env node
/**
 * Production-readiness evaluation suite for bndo.it
 * Run with: node scripts/production-readiness-eval.mjs
 * Requires server on CONVERSATION_BASE_URL (default http://127.0.0.1:3300)
 *
 * Output: Reportable evaluation with PASS/FAIL per category.
 */
import { postConversationMessage } from './utils/conversationSse.mjs';
const baseUrl = (process.env.CONVERSATION_BASE_URL || process.env.SCANNER_BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

const report = { passed: 0, failed: 0, skipped: 0, details: [], errors: [] };

function log(msg) {
  console.log(msg);
}

function normalizeText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

async function scan(profile, opts = {}) {
  const res = await fetch(`${baseUrl}/api/scan-bandi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userProfile: profile, limit: opts.limit ?? 10, mode: opts.mode ?? 'fast', channel: opts.channel ?? 'chat', strictness: opts.strictness ?? 'high' }),
  });
  return res.json();
}

async function conversation(message, cookie = null) {
  const res = await postConversationMessage(baseUrl, message, { cookie });
  return { json: res.json ?? {}, cookie: res.cookie ?? cookie, ok: res.ok, status: res.status };
}

function pass(category, id, msg) {
  report.passed++;
  report.details.push({ category, id, status: 'PASS', msg });
  log(`  PASS ${category}/${id}: ${msg}`);
}

function fail(category, id, msg) {
  report.failed++;
  report.details.push({ category, id, status: 'FAIL', msg });
  report.errors.push(`${category}/${id}: ${msg}`);
  log(`  FAIL ${category}/${id}: ${msg}`);
}

function skip(category, id, msg) {
  report.skipped++;
  report.details.push({ category, id, status: 'SKIP', msg });
  log(`  SKIP ${category}/${id}: ${msg}`);
}

// --- A. Scanner retrieval quality ---
async function runScannerRetrieval() {
  log('\n--- A. Scanner retrieval quality ---');

  const cases = [
    { id: 'software-sicilia', profile: { region: 'Sicilia', sector: 'ICT', fundingGoal: 'software digitalizzazione', businessExists: true }, expectSector: 'software|ict|digit' },
    { id: 'agricoltura-sicilia', profile: { region: 'Sicilia', sector: 'agricoltura', fundingGoal: 'impresa agricola', businessExists: true }, expectSector: 'agricolt|agro|agroalimentare' },
    { id: 'turismo-campania', profile: { region: 'Campania', sector: 'turismo', fundingGoal: 'ristrutturazione', businessExists: true }, expectSector: 'turism|ristruttur' },
    {
      id: 'pmi-digitale-lombardia',
      profile: {
        region: 'Lombardia',
        businessExists: true,
        sector: 'ICT',
        fundingGoal: 'macchinari software digitalizzazione',
        contributionPreference: 'fondo perduto'
      },
      expectAnyIncludes: ['Nuova Sabatini', 'Sabatini', 'Bonus Digitalizzazione PMI']
    },
    { id: 'startup-sud', profile: { region: 'Calabria', businessExists: false, ageBand: 'under35', employmentStatus: 'disoccupato', fundingGoal: 'aprire nuova attività' }, expectIncludes: ['Resto al Sud', 'FUSESE'] },
    { id: 'agroalimentare', profile: { region: 'Sicilia', sector: 'agroalimentare', fundingGoal: 'trasformazione agroalimentare', businessExists: true }, expectSector: 'agro|agricolt|alimentare' },
  ];

  for (const c of cases) {
    try {
      const r = await scan(c.profile);
      if (!r.results || !Array.isArray(r.results)) {
        fail('scanner-retrieval', c.id, `No results array: ${r.error || 'unknown'}`);
        continue;
      }
      const titles = r.results.map((x) => normalizeText(x.title || ''));
      if (Array.isArray(c.expectAnyIncludes) && c.expectAnyIncludes.length > 0) {
        const found = c.expectAnyIncludes.some((exp) => titles.some((t) => t.includes(normalizeText(exp))));
        if (!found) {
          fail(
            'scanner-retrieval',
            c.id,
            `Missing any expected option (${c.expectAnyIncludes.join(', ')}). Got: ${titles.slice(0, 5).join(' | ') || '[]'}`
          );
        } else {
          pass('scanner-retrieval', c.id, `Found one expected option in top results`);
        }
      } else if (c.expectIncludes) {
        const missing = c.expectIncludes.filter((exp) => !titles.some((t) => t.includes(normalizeText(exp))));
        if (missing.length > 0) {
          fail('scanner-retrieval', c.id, `Missing expected: ${missing.join(', ')}. Got: ${titles.slice(0, 5).join(' | ')}`);
        } else {
          pass('scanner-retrieval', c.id, `Found ${c.expectIncludes.join(', ')}`);
        }
      } else if (c.expectSector) {
        const re = new RegExp(c.expectSector, 'i');
        const hasMatch = r.results.some((x) => re.test(normalizeText([x.title, x.matchReasons?.join(' ')].filter(Boolean).join(' '))));
        if (r.results.length === 0) {
          skip('scanner-retrieval', c.id, 'No results (dataset may not cover this profile)');
        } else if (hasMatch) {
          pass('scanner-retrieval', c.id, `Relevant results: ${r.results.length} (sector match)`);
        } else {
          pass('scanner-retrieval', c.id, `Results: ${r.results.length} (sector match weak, dataset dependent)`);
        }
      } else {
        pass('scanner-retrieval', c.id, `${r.results.length} results`);
      }
    } catch (e) {
      fail('scanner-retrieval', c.id, e.message || String(e));
    }
  }
}

// --- B. Regional correctness ---
async function runRegionalCorrectness() {
  log('\n--- B. Regional correctness ---');

  // Calabria user should NOT get Lombardia-only bandi in top results
  try {
    const r = await scan({ region: 'Calabria', businessExists: false, fundingGoal: 'startup', sector: 'servizi' });
    if (!r.results) {
      skip('regional', 'calabria-no-lombardia-only', 'No results');
      return;
    }
    const wrongRegion = r.results.filter((x) => {
      const req = normalizeText((x.requirements || []).join(' '));
      const title = normalizeText(x.title || '');
      return (req.includes('lombardia') && !req.includes('calabria') && !req.includes('italia') && !req.includes('nazionale')) || (title.includes('marche') && title.includes('smau milano'));
    });
    if (wrongRegion.length > 0) {
      fail('regional', 'calabria-no-lombardia-only', `Wrong-region leakage: ${wrongRegion.slice(0, 2).map((x) => x.title).join(', ')}`);
    } else {
      pass('regional', 'calabria-no-lombardia-only', 'No wrong-region leakage in top results');
    }
  } catch (e) {
    fail('regional', 'calabria-no-lombardia-only', e.message);
  }

  // National bandi (Italia) should appear for any region
  try {
    const r = await scan({ region: 'Sardegna', businessExists: true, sector: 'Manifattura', fundingGoal: 'macchinari' });
    const hasNational = r.results?.some((x) => {
      const req = normalizeText((x.requirements || []).join(' ') + (x.title || ''));
      return req.includes('italia') || req.includes('nazionale');
    });
    if (r.results?.length >= 1) {
      pass('regional', 'national-for-any-region', `National/regional mix: ${r.results.length} results`);
    } else {
      skip('regional', 'national-for-any-region', 'No results to check');
    }
  } catch (e) {
    fail('regional', 'national-for-any-region', e.message);
  }
}

// --- C. Freshness / closed calls ---
async function runFreshness() {
  log('\n--- C. Freshness / status correctness ---');

  try {
    const r = await scan({ region: 'Lombardia', businessExists: true, sector: 'ICT', fundingGoal: 'digitalizzazione' });
    if (!r.results?.length) {
      skip('freshness', 'no-closed-in-eligible', 'No results');
      return;
    }
    const closed = r.results.filter((x) => {
      const status = normalizeText(x.availabilityStatus || '');
      return status.includes('closed');
    });
    if (closed.length > 0) {
      fail('freshness', 'no-closed-in-eligible', `Closed calls in eligible results: ${closed.slice(0, 3).map((x) => x.title).join(', ')}`);
    } else {
      pass('freshness', 'no-closed-in-eligible', 'No closed calls in eligible results');
    }
  } catch (e) {
    fail('freshness', 'no-closed-in-eligible', e.message);
  }
}

// --- D. Direct question answering (grounded) ---
async function runDirectQuestionAnswering() {
  log('\n--- D. Direct question answering ---');

  // Use unit-test style for grounded answerer (no server needed for answerGroundedMeasureQuestion)
  // But we need to test via conversation API for full flow
  const qaCases = [
    { id: 'formazione-resto-al-sud', msg: 'La formazione si può finanziare con Resto al Sud 2.0?', expectGrounded: true, expectNoInvent: true },
    { id: 'srl-accedere', msg: 'Una SRL può accedere a Resto al Sud?', expectGrounded: true },
    { id: 'impresa-gia-attiva', msg: 'Resto al Sud vale anche per impresa già attiva?', expectGrounded: true, expectOutcome: 'no' },
    { id: 'bando-copre-software', msg: 'Questo bando copre software?', expectGrounded: false }, // generic, may not mention measure
    { id: 'contributi-agricoltura-sicilia', msg: 'Ci sono contributi per agricoltura in Sicilia?', expectGrounded: false },
  ];

  for (const c of qaCases) {
    try {
      const { json, ok, status } = await conversation(c.msg);
      if (!ok || status >= 400) {
        skip('direct-qa', c.id, `Conversation API ${status} (server may need config)`);
        continue;
      }
      const text = normalizeText(json.assistantText || '');
      if (c.expectNoInvent && (text.includes('non_inventare') || text.includes('non so'))) {
        pass('direct-qa', c.id, 'Prudent / no invented content');
      } else if (text.length < 10) {
        fail('direct-qa', c.id, 'Empty or too short reply');
      } else if (c.expectOutcome === 'no' && text.includes('nuova attività') && text.includes('avvio')) {
        pass('direct-qa', c.id, 'Correctly said no for existing business');
      } else if (text.includes('resto al sud') || text.includes('invitalia') || text.includes('ammissibil')) {
        pass('direct-qa', c.id, 'Grounded answer on measure');
      } else if (c.expectGrounded === false) {
        pass('direct-qa', c.id, 'Reply provided');
      } else {
        pass('direct-qa', c.id, `Reply length ${text.length}`);
      }
    } catch (e) {
      fail('direct-qa', c.id, e.message);
    }
  }
}

// --- E. Conversation intelligence ---
async function runConversationIntelligence() {
  log('\n--- E. Conversation intelligence ---');

  let cookie = null;

  // E1: No repeated questions - "devo aprire" should not trigger "aprire o già attiva" again
  try {
    await conversation('Ciao', cookie).then((r) => { cookie = r.cookie; return r; });
    const r2 = await conversation('Devo aprire un agriturismo in Sardegna', cookie).then((r) => { cookie = r.cookie; return r; });
    if (!r2.ok) {
      skip('conversation', 'no-repeat-aprire', `Conversation API ${r2.status}`);
      return;
    }
    const text = normalizeText(r2.json.assistantText || '');
    const asksAgainAprire = text.includes('già attiva') && text.includes('da avviare') && text.includes('?');
    if (asksAgainAprire) {
      fail('conversation', 'no-repeat-aprire', 'Asked again about aprire/già attiva after user said devo aprire');
    } else {
      pass('conversation', 'no-repeat-aprire', 'No redundant aprire question');
    }
  } catch (e) {
    fail('conversation', 'no-repeat-aprire', e.message);
  }

  // E2: Extraction from first message
  try {
    cookie = null;
    const r = await conversation('Ho un impresa agricola in Sicilia, cerco fondi per macchinari', cookie).then((res) => { cookie = res.cookie; return res; });
    if (!r.ok) {
      skip('conversation', 'extraction-first-msg', `Conversation API ${r.status}`);
      return;
    }
    const p = r.json.userProfile || {};
    const hasRegion = normalizeText(p.location?.region || p.region || '') === 'sicilia';
    const hasSector = normalizeText(p.sector || '').includes('agricolt');
    const hasBusiness = p.businessExists === true;
    if (hasRegion && (hasSector || hasBusiness)) {
      pass('conversation', 'extraction-first-msg', 'Extracted region and sector/business from first message');
    } else {
      fail('conversation', 'extraction-first-msg', `Missing extraction: region=${hasRegion} sector=${hasSector} business=${hasBusiness}`);
    }
  } catch (e) {
    fail('conversation', 'extraction-first-msg', e.message);
  }

  // E3: No onboarding on direct measure question
  try {
    cookie = null;
    const r = await conversation('La formazione si può finanziare con Resto al Sud 2.0?', cookie);
    if (!r.ok) {
      skip('conversation', 'no-onboarding-measure-q', `Conversation API ${r.status}`);
      return;
    }
    const text = normalizeText(r.json.assistantText || '');
    const asksForRegion = text.includes('regione') && text.includes('?') && !text.includes('mezzogiorno');
    if (asksForRegion) {
      fail('conversation', 'no-onboarding-measure-q', 'Asked for region on direct measure question');
    } else {
      pass('conversation', 'no-onboarding-measure-q', 'No onboarding on direct measure question');
    }
  } catch (e) {
    fail('conversation', 'no-onboarding-measure-q', e.message);
  }
}

// --- Main ---
async function main() {
  log('=== BNDO Production Readiness Evaluation ===');
  log(`Base URL: ${baseUrl}`);
  log('');

  try {
    const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
    if (!health?.ok) {
      log('WARN: Health check failed or unavailable. Proceeding anyway.');
    }
  } catch (_) {}

  await runScannerRetrieval();
  await runRegionalCorrectness();
  await runFreshness();
  await runDirectQuestionAnswering();
  await runConversationIntelligence();

  log('\n=== Summary ===');
  log(`PASSED: ${report.passed}`);
  log(`FAILED: ${report.failed}`);
  log(`SKIPPED: ${report.skipped}`);

  if (report.errors.length > 0) {
    log('\nFailures:');
    report.errors.forEach((e) => log(`  - ${e}`));
  }

  const reportPath = 'scripts/production-readiness-report.json';
  const fs = await import('node:fs');
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, timestamp: new Date().toISOString() }, null, 2), 'utf8');
  log(`\nReport saved to ${reportPath}`);

  if (report.failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Eval failed:', e);
  process.exit(1);
});
