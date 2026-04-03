import { generatePracticeQuizTemplateWithAI } from '../lib/practices/llmQuizGenerator';
import { GrantDetailRecord, GrantExplainabilityRecord } from '../lib/grants/details';

async function testQuizAI() {
  console.log('🚀 --- TESTING HIGH-PRECISION QUIZ GENERATION --- 🚀\n');

  const mockDetail: GrantDetailRecord = {
    id: 'test-bando-fatturato',
    title: 'Bando Digitalizzazione Imprese Toscana',
    authority: 'Regione Toscana',
    openingDate: '2024-03-01',
    deadlineDate: '2024-12-31',
    availabilityStatus: 'open',
    budgetTotal: 5000000,
    aidForm: 'Contributo a fondo perduto',
    aidIntensity: '50%',
    beneficiaries: ['PMI'],
    sectors: ['Digitale', 'Manifatturiero'],
    officialUrl: 'https://example.com/bando',
    officialAttachments: [],
    description: `Il bando finanzia l'acquisto di beni strumentali nuovi. 
    REQUISITI VINCOLANTI:
    1. Le imprese devono avere un fatturato annuo 2023 superiore a 2.000.000 di Euro.
    2. Almeno il 51% della compagine sociale deve essere composta da giovani under 35.
    3. L'impresa deve avere almeno 5 dipendenti a tempo indeterminato.
    4. Sede operativa obbligatoria in Toscana.`,
    requisitiHard: { region_check: 'Toscana' },
    requisitiSoft: {},
    requisitiStrutturati: {}
  };

  const mockExplainability: GrantExplainabilityRecord = {
    hardStatus: 'unknown',
    eligibilityScore: 0,
    completenessScore: 0,
    fitScore: 0,
    probabilityScore: 0,
    whyFit: [],
    satisfiedRequirements: [],
    missingRequirements: ['Fatturato', 'Dipendenti'],
    applySteps: []
  };

  console.log('🔹 Extracting questions from mock bando with specific thresholds...');
  const questions = await generatePracticeQuizTemplateWithAI(mockDetail, mockExplainability);

  console.log('\n✅ GENERATED QUESTIONS:');
  questions.forEach((q, i) => {
    console.log(`${i + 1}. [${q.questionType.toUpperCase()}] ${q.label}`);
    if (q.rule.kind === 'critical_boolean') {
      console.log(`   🚨 CRITICAL (Expected: ${q.rule.expected})`);
    }
  });
}

testQuizAI().catch(console.error);
