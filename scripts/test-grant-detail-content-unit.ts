import assert from 'node:assert/strict';
import { getOrBuildGrantDetailContent } from '@/lib/grants/detailPageContent';
import type { GrantDetailRecord, GrantExplainabilityRecord } from '@/lib/grants/details';

async function run() {
  const baseDetail: GrantDetailRecord = {
    id: 'unit-grant-1',
    title: 'Bando digitale PMI 2026',
    authority: 'Regione Lombardia',
    openingDate: '2026-05-01',
    deadlineDate: '2026-07-31',
    availabilityStatus: 'open',
    budgetTotal: 120000,
    aidForm: 'Contributo a fondo perduto',
    aidIntensity: 'fino al 60%',
    beneficiaries: ['Micro imprese', 'Piccole imprese'],
    sectors: ['ICT', 'Servizi'],
    officialUrl: 'https://example.com/bando',
    officialAttachments: ['https://example.com/allegato-1.pdf'],
    description:
      'Il bando finanzia spese per software, consulenze specialistiche e attrezzature digitali. Sono escluse spese non coerenti con il progetto.',
    requiredDocuments: ['Visura camerale'],
    requisitiHard: { settori_esclusi: ['Agricoltura'] },
    requisitiSoft: {},
    requisitiStrutturati: {
      territory: { regions: ['Lombardia'] },
      economic: {
        grantMax: 60000,
        costMax: 120000,
        estimatedCoverageMaxPercent: 60,
      },
      expenses: {
        admitted: ['Software', 'Consulenze specialistiche'],
        excluded: ['IVA'],
      },
      requirements: {
        hard: ['Impresa attiva da almeno 12 mesi'],
      },
      documents: {
        required: ['DURC'],
      },
    },
  };

  const baseExplain: GrantExplainabilityRecord = {
    hardStatus: 'unknown',
    eligibilityScore: 70,
    completenessScore: 65,
    fitScore: 68,
    probabilityScore: 69,
    whyFit: ['Profilo in linea con i beneficiari principali'],
    satisfiedRequirements: ['Impresa attiva da almeno 12 mesi'],
    missingRequirements: ['Verificare sede operativa in Lombardia'],
    applySteps: ['Accesso al portale', 'Caricamento domanda'],
  };

  const content = await getOrBuildGrantDetailContent(baseDetail, baseExplain);

  assert.equal(content.schemaVersion, 'grant_detail_content_v1');
  assert.equal(content.sections.length, 12);
  assert.ok(content.sections.some((section) => section.id === 'fonti_ufficiali'));
  assert.ok(content.sections.some((section) => section.id === 'documenti'));

  const second = await getOrBuildGrantDetailContent(baseDetail, baseExplain);
  assert.equal(second.generatedAt, content.generatedAt);
  assert.equal(second.sourceFingerprint, content.sourceFingerprint);

  const lowDataDetail: GrantDetailRecord = {
    ...baseDetail,
    id: 'unit-grant-2',
    aidForm: null,
    aidIntensity: null,
    description: null,
    requiredDocuments: [],
    requisitiHard: {},
    requisitiStrutturati: {},
  };

  const lowDataContent = await getOrBuildGrantDetailContent(lowDataDetail, baseExplain);
  assert.equal(lowDataContent.sections.length, 12);
  assert.ok(lowDataContent.warnings.length >= 1);

  console.log('test-grant-detail-content-unit: PASS');
}

run().catch((error) => {
  console.error('test-grant-detail-content-unit: FAIL');
  console.error(error);
  process.exitCode = 1;
});
