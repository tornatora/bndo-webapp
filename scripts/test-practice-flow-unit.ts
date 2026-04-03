/**
 * Practice flow unit checks:
 * - "+" navigation entry exists and is last in dashboard shell config
 * - scanner/chat converge to dashboard new-practice route
 * - quiz evaluation logic produces expected outcomes
 * - dynamic document requirements checklist resolves uploaded state
 * Run with: npx tsx scripts/test-practice-flow-unit.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDashboardShellItems, resolveDashboardNavKey, routes } from '@/shared/config/routes';
import { computeDocumentChecklistFromRequirements } from '@/lib/admin/document-requirements';
import { evaluatePracticeQuiz, type PracticeFlowState } from '@/lib/practices/orchestrator';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

let passed = 0;

const shellItems = getDashboardShellItems();
assert(shellItems[shellItems.length - 1]?.key === 'new_practice', 'new practice nav item must be last');
passed++;
assert(resolveDashboardNavKey(routes.dashboard.newPractice) === 'new_practice', 'nav resolver should detect /dashboard/new-practice');
passed++;

const chatWindowPath = path.resolve(process.cwd(), 'components/chat/ChatWindow.tsx');
const scannerPath = path.resolve(process.cwd(), 'components/views/BandiFormView.tsx');
const scannerCardPath = path.resolve(process.cwd(), 'components/views/GrantCardPro.tsx');
const chatResultsPath = path.resolve(process.cwd(), 'components/chat/BandiResults.tsx');
const practiceQuizRoutePath = path.resolve(process.cwd(), 'app/api/practices/flow/[applicationId]/quiz/route.ts');
const chatWindowSource = fs.readFileSync(chatWindowPath, 'utf8');
const scannerSource = fs.readFileSync(scannerPath, 'utf8');
const scannerCardSource = fs.readFileSync(scannerCardPath, 'utf8');
const chatResultsSource = fs.readFileSync(chatResultsPath, 'utf8');
const practiceQuizRouteSource = fs.readFileSync(practiceQuizRoutePath, 'utf8');
assert(
  chatWindowSource.includes('PracticeGrantQuizPage') && chatWindowSource.includes('onVerifyRequirements'),
  'chat flow should route selected grants to dedicated practice quiz route'
);
passed++;
assert(scannerSource.includes('onGrantSelect'), 'scanner flow should expose onGrantSelect hook');
passed++;
assert(scannerCardSource.includes('Dettagli Bando'), 'scanner card should expose "Dettagli Bando" CTA label');
passed++;
assert(scannerCardSource.includes('Verifica requisiti'), 'scanner card should expose "Verifica requisiti" CTA label');
passed++;
assert(chatResultsSource.includes('Dettagli Bando'), 'chat result card should expose "Dettagli Bando" CTA label');
passed++;
assert(chatResultsSource.includes('Verifica requisiti'), 'chat result card should expose "Verifica requisiti" CTA label');
passed++;
assert(
  practiceQuizRouteSource.includes("result.eligibility === 'eligible' ? `/dashboard/practices/${params.applicationId}?docs=missing` : null"),
  'practice quiz route should gate onboarding path only for eligible outcomes',
);
passed++;

const mockFlow: PracticeFlowState = {
  applicationId: '11111111-1111-1111-1111-111111111111',
  tenderId: '22222222-2222-2222-2222-222222222222',
  grantExternalId: 'grant-1',
  grantSlug: 'grant-1',
  grantTitle: 'Grant 1',
  sourceChannel: 'scanner',
  templateId: '33333333-3333-3333-3333-333333333333',
  metadata: {},
  questions: [
    {
      questionKey: 'beneficiary_fit',
      label: 'Beneficiary',
      description: null,
      questionType: 'boolean',
      options: [{ value: 'yes', label: 'Si' }, { value: 'no', label: 'No' }],
      isRequired: true,
      validation: {},
      rule: { kind: 'critical_boolean', expected: 'yes' },
      metadata: {},
      reasoning: null
    },
    {
      questionKey: 'investment_amount',
      label: 'Investment',
      description: null,
      questionType: 'number',
      options: [],
      isRequired: true,
      validation: { min: 1000, max: 10000 },
      rule: { kind: 'investment_range' },
      metadata: {},
      reasoning: null
    }
  ],
  requirements: []
};

const evaluationFail = evaluatePracticeQuiz(mockFlow, { beneficiary_fit: 'no', investment_amount: 5000 });
assert(evaluationFail.eligibility === 'not_eligible', 'critical boolean mismatch should be not_eligible');
passed++;

const evaluationReview = evaluatePracticeQuiz(mockFlow, { beneficiary_fit: 'yes', investment_amount: 20000 });
assert(evaluationReview.eligibility === 'needs_review', 'amount outside range should be needs_review');
passed++;

const evaluationOk = evaluatePracticeQuiz(mockFlow, { beneficiary_fit: 'yes', investment_amount: 5000 });
assert(evaluationOk.eligibility === 'eligible', 'valid answers should be eligible');
passed++;

const checklist = computeDocumentChecklistFromRequirements(
  'app-1',
  [
    { application_id: 'app-1', requirement_key: 'doc_a', label: 'Documento A' },
    { application_id: 'app-1', requirement_key: 'doc_b', label: 'Documento B' }
  ],
  [
    { application_id: 'app-1', file_name: 'a.pdf', requirement_key: 'doc_a' },
    { application_id: 'app-1', file_name: 'b.pdf', requirement_key: null }
  ]
);

assert(checklist.length === 2, 'dynamic checklist should include all requirements');
passed++;
assert(checklist.find((item) => item.key === 'doc_a')?.uploaded === true, 'uploaded requirement should be marked as uploaded');
passed++;
assert(checklist.find((item) => item.key === 'doc_b')?.uploaded === false, 'missing requirement should be marked as missing');
passed++;

const adminQuizViewPath = path.resolve(process.cwd(), 'components/admin/AdminQuizResponsesClient.tsx');
const adminQuizViewSource = fs.readFileSync(adminQuizViewPath, 'utf8');
assert(adminQuizViewSource.includes("timeZone: 'Europe/Rome'"), 'admin quiz list should render timestamp with timezone');
passed++;

console.log(`PASS practice flow unit checks: ${passed} assertions`);
