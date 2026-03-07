import { STRATEGIC_SCANNER_DOCS } from '../lib/strategicScannerDocs';
import { filterClosedCalls, filterWrongRegion } from '../lib/matching/scannerFilters';
import { preferReliableSources } from '../lib/matching/scannerRanking';
import type { IncentiviDoc, CandidateLike, ScanResultLike } from '../lib/matching/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`  ok: ${msg}`);
    passed++;
  }
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9àèéìòù]/g, ' ').replace(/\s+/g, ' ').trim();
}

// --- Test: FUSESE is in STRATEGIC_SCANNER_DOCS ---
{
  const titles = STRATEGIC_SCANNER_DOCS.map((d: Record<string, unknown>) => normalize(String(d.title ?? '')));
  assert(titles.some((t: string) => t.includes('fusese')), 'FUSESE is in STRATEGIC_SCANNER_DOCS');
  assert(titles.some((t: string) => t.includes('resto al sud')), 'Resto al Sud is in STRATEGIC_SCANNER_DOCS');
  assert(titles.some((t: string) => t.includes('oltre nuove imprese')), 'ON is in STRATEGIC_SCANNER_DOCS');
}

// --- Test: filterClosedCalls removes past-deadline docs ---
{
  const now = new Date('2026-03-07T12:00:00Z');
  const docs: IncentiviDoc[] = [
    { id: '1', title: 'Open', closeDate: '2026-12-31T00:00:00' },
    { id: '2', title: 'Closed', closeDate: '2025-01-01T00:00:00' },
    { id: '3', title: 'No deadline' },
  ];
  const result = filterClosedCalls(docs, now);
  assert(result.length === 2, 'filterClosedCalls keeps open + no-deadline');
  assert(result.every((d) => d.title !== 'Closed'), 'filterClosedCalls removes closed doc');
}

// --- Test: filterWrongRegion keeps national + matching region ---
{
  const docs: IncentiviDoc[] = [
    { id: '1', title: 'National', regions: ['Italia'] },
    { id: '2', title: 'Calabria bando', regions: ['Calabria', 'Campania'] },
    { id: '3', title: 'Lombardia only', regions: ['Lombardia'] },
    { id: '4', title: 'No regions' },
  ];
  const result = filterWrongRegion(docs, 'Calabria');
  assert(result.length === 3, 'filterWrongRegion keeps national + calabria + no-regions');
  assert(!result.some((d) => d.title === 'Lombardia only'), 'filterWrongRegion removes Lombardia for Calabria user');
}

// --- Test: preferReliableSources sorts by authority tier ---
{
  const candidates: CandidateLike<ScanResultLike>[] = [
    { result: { id: '1', title: 'A', authorityName: 'Fondazione XYZ', score: 0.8, matchScore: 0.8, matchReasons: [], mismatchFlags: [], requirements: [], deadlineAt: null, sourceUrl: '' }, contributionMatched: false },
    { result: { id: '2', title: 'B', authorityName: 'Invitalia', score: 0.7, matchScore: 0.7, matchReasons: [], mismatchFlags: [], requirements: [], deadlineAt: null, sourceUrl: '' }, contributionMatched: false },
    { result: { id: '3', title: 'C', authorityName: 'Regione Calabria', score: 0.6, matchScore: 0.6, matchReasons: [], mismatchFlags: [], requirements: [], deadlineAt: null, sourceUrl: '' }, contributionMatched: false },
  ];
  const sorted = preferReliableSources(candidates);
  assert(sorted[0].result.authorityName === 'Invitalia' || sorted[0].result.authorityName === 'Regione Calabria', 'preferReliableSources: tier-1 first');
  assert(sorted[sorted.length - 1].result.authorityName === 'Fondazione XYZ', 'preferReliableSources: unknown tier last');
}

// --- Test: South youth strategic docs have correct structure ---
{
  const fuseseDoc = STRATEGIC_SCANNER_DOCS.find((d: Record<string, unknown>) => normalize(String(d.title ?? '')).includes('fusese'));
  assert(!!fuseseDoc, 'FUSESE doc found');
  if (fuseseDoc) {
    const doc = fuseseDoc as Record<string, unknown>;
    assert(Array.isArray(doc.regions), 'FUSESE has regions array');
    assert((doc.regions as string[]).some((r: string) => r === 'Calabria'), 'FUSESE regions include Calabria');
    assert(Array.isArray(doc.beneficiaries), 'FUSESE has beneficiaries');
    assert(doc.openDate === null, 'FUSESE has no closeDate (always open)');
  }
}

console.log(`\nPhase C unit tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
