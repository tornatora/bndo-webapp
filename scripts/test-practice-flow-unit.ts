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
import { computeMonotonicQuizProgress } from '@/lib/practices/quizProgress';

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
const practiceFlowRoutePath = path.resolve(process.cwd(), 'app/api/practices/flow/[applicationId]/route.ts');
const practiceFlowStartRoutePath = path.resolve(process.cwd(), 'app/api/practices/flow/start/route.ts');
const adminAssignmentsRoutePath = path.resolve(process.cwd(), 'app/api/admin/assignments/route.ts');
const consultantPracticesApiPath = path.resolve(process.cwd(), 'app/api/consultant/practices/route.ts');
const consultantMessagesApiPath = path.resolve(
  process.cwd(),
  'app/api/consultant/practices/[applicationId]/messages/route.ts'
);
const consultantPracticePagePath = path.resolve(process.cwd(), 'app/consultant/practices/[applicationId]/page.tsx');
const consultantPracticesApiRoutePath = path.resolve(process.cwd(), 'app/api/consultant/practices/route.ts');
const consultantDocumentsApiPath = path.resolve(
  process.cwd(),
  'app/api/consultant/practices/[applicationId]/documents/route.ts'
);
const consultantRequestDocApiPath = path.resolve(
  process.cwd(),
  'app/api/consultant/practices/[applicationId]/request-document/route.ts'
);
const consultantProgressApiPath = path.resolve(
  process.cwd(),
  'app/api/consultant/practices/[applicationId]/progress/route.ts'
);
const consultantBillingProfileApiPath = path.resolve(process.cwd(), 'app/api/consultant/billing-profile/route.ts');
const consultantFinancePayoutsApiPath = path.resolve(process.cwd(), 'app/api/consultant/finance/payouts/route.ts');
const adminConsultantBillingProfilesApiPath = path.resolve(
  process.cwd(),
  'app/api/admin/consultant-billing-profiles/route.ts'
);
const consultantPracticesClientPath = path.resolve(process.cwd(), 'components/consultant/ConsultantPracticesClient.tsx');
const consultantClientPracticesPanelPath = path.resolve(
  process.cwd(),
  'components/consultant/ConsultantClientPracticesPanel.tsx'
);
const consultantPracticeProgressPanelPath = path.resolve(
  process.cwd(),
  'components/consultant/ConsultantPracticeProgressPanel.tsx'
);
const consultantClientPagePath = path.resolve(process.cwd(), 'app/consultant/clients/[companyId]/page.tsx');
const adminBillingInvoiceUploadPath = path.resolve(process.cwd(), 'app/api/admin/billing/invoice-upload/route.ts');
const adminBillingInvoiceSendPath = path.resolve(process.cwd(), 'app/api/admin/billing/invoice-send/route.ts');
const chatWindowSource = fs.readFileSync(chatWindowPath, 'utf8');
const scannerSource = fs.readFileSync(scannerPath, 'utf8');
const scannerCardSource = fs.readFileSync(scannerCardPath, 'utf8');
const chatResultsSource = fs.readFileSync(chatResultsPath, 'utf8');
const practiceQuizRouteSource = fs.readFileSync(practiceQuizRoutePath, 'utf8');
const practiceFlowRouteSource = fs.readFileSync(practiceFlowRoutePath, 'utf8');
const practiceFlowStartRouteSource = fs.readFileSync(practiceFlowStartRoutePath, 'utf8');
const adminAssignmentsRouteSource = fs.readFileSync(adminAssignmentsRoutePath, 'utf8');
const consultantPracticesApiSource = fs.readFileSync(consultantPracticesApiPath, 'utf8');
const consultantMessagesApiSource = fs.readFileSync(consultantMessagesApiPath, 'utf8');
const consultantPracticePageSource = fs.readFileSync(consultantPracticePagePath, 'utf8');
const consultantPracticesApiRouteSource = fs.readFileSync(consultantPracticesApiRoutePath, 'utf8');
const consultantDocumentsApiSource = fs.readFileSync(consultantDocumentsApiPath, 'utf8');
const consultantRequestDocApiSource = fs.readFileSync(consultantRequestDocApiPath, 'utf8');
const consultantProgressApiSource = fs.readFileSync(consultantProgressApiPath, 'utf8');
const consultantBillingProfileApiSource = fs.readFileSync(consultantBillingProfileApiPath, 'utf8');
const consultantFinancePayoutsApiSource = fs.readFileSync(consultantFinancePayoutsApiPath, 'utf8');
const adminConsultantBillingProfilesApiSource = fs.readFileSync(adminConsultantBillingProfilesApiPath, 'utf8');
const consultantPracticesClientSource = fs.readFileSync(consultantPracticesClientPath, 'utf8');
const consultantClientPracticesPanelSource = fs.readFileSync(consultantClientPracticesPanelPath, 'utf8');
const consultantPracticeProgressPanelSource = fs.readFileSync(consultantPracticeProgressPanelPath, 'utf8');
const consultantClientPageSource = fs.readFileSync(consultantClientPagePath, 'utf8');
const consultantBillingPaymentsClientPath = path.resolve(
  process.cwd(),
  'components/consultant/ConsultantBillingPaymentsClient.tsx'
);
const consultantBillingPaymentsClientSource = fs.readFileSync(consultantBillingPaymentsClientPath, 'utf8');
const consultantBillingPagePath = path.resolve(process.cwd(), 'app/consultant/billing/page.tsx');
const consultantBillingPageSource = fs.readFileSync(consultantBillingPagePath, 'utf8');
const consultantShellClientPath = path.resolve(process.cwd(), 'components/consultant/ConsultantShellClient.tsx');
const consultantShellClientSource = fs.readFileSync(consultantShellClientPath, 'utf8');
const adminFinanceControlPath = path.resolve(process.cwd(), 'components/admin/AdminFinanceControl.tsx');
const adminFinanceControlSource = fs.readFileSync(adminFinanceControlPath, 'utf8');
const adminBillingInvoiceUploadSource = fs.readFileSync(adminBillingInvoiceUploadPath, 'utf8');
const adminBillingInvoiceSendSource = fs.readFileSync(adminBillingInvoiceSendPath, 'utf8');
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
  practiceQuizRouteSource.includes("result.eligibility !== 'not_eligible'"),
  'practice quiz route should gate onboarding path for all non-blocked outcomes',
);
passed++;
assert(
  practiceFlowStartRouteSource.includes('generateCompiledSingleBandoSpec') &&
    practiceFlowStartRouteSource.includes('executeCompiledEligibilitySpecInUI'),
  'flow start route should use compiled single-bando engine for all verify-requirements entries'
);
passed++;
assert(
  practiceFlowRouteSource.includes('latestSubmissionResult.error ? null : latestSubmissionResult.data ?? null'),
  'practice flow payload should keep latestSubmission clean when table is unavailable'
);
passed++;
assert(
  adminAssignmentsRouteSource.includes('compatibilityMode') &&
    adminAssignmentsRouteSource.includes('consultant_thread_participants'),
  'admin assignments route should provide compatibility fallback via thread participants'
);
passed++;
assert(
  consultantPracticesApiSource.includes('Pratiche consulente caricate in modalità compatibile') &&
    consultantPracticesApiSource.includes('consultant_thread_participants'),
  'consultant practices API should stay operational in compatibility mode'
);
passed++;
assert(
  consultantMessagesApiSource.includes("from('consultant_messages')"),
  'consultant messages API should fallback to legacy consultant_messages when practice table is missing'
);
passed++;
assert(
  consultantPracticePageSource.includes('listMessagesCompat') &&
    consultantPracticePageSource.includes("from('consultant_messages')"),
  'consultant practice page should load messages in compatibility mode'
);
passed++;
assert(
  consultantPracticePageSource.includes('Checklist dinamica non disponibile su questo ambiente') &&
    consultantPracticePageSource.includes('ConsultantPracticeDocumentsActions') &&
    consultantPracticePageSource.includes('ConsultantPracticeProgressPanel'),
  'consultant practice page should fallback checklist cleanly and expose consultant document actions'
);
passed++;
assert(
  consultantPracticesApiRouteSource.includes('consultantEarningsCents') &&
    consultantPracticesApiRouteSource.includes('platformFeeCents'),
  'consultant practices API should expose earnings split metrics'
);
passed++;
assert(
  consultantPracticesClientSource.includes('Hai guadagnato'),
  'consultant dashboard should render earnings KPI card'
);
passed++;
assert(
  consultantPracticesClientSource.includes('Hai guadagnato') &&
    consultantPracticesClientSource.includes('/consultant/clients/'),
  'consultant dashboard should show clean earnings headline and client detail links'
);
passed++;
assert(
  consultantClientPracticesPanelSource.includes('/api/consultant/practices?companyId=') &&
    consultantClientPracticesPanelSource.includes('/consultant/practices/'),
  'consultant client view should load company practices and link to each practice'
);
passed++;
assert(
  consultantClientPageSource.includes('ConsultantClientPracticesPanel'),
  'consultant client detail route should render dedicated client practices view'
);
passed++;
assert(
  consultantDocumentsApiSource.includes("from('application_documents')") &&
    consultantDocumentsApiSource.includes("from('consultant_messages')"),
  'consultant upload route should persist documents and notify client via chat'
);
passed++;
assert(
  consultantRequestDocApiSource.includes("from('practice_document_requirements')") &&
    consultantRequestDocApiSource.includes("Richiesta documentazione aggiuntiva"),
  'consultant request-doc route should create requirement and notify client'
);
passed++;
assert(
  consultantProgressApiSource.includes("from('tender_applications')") &&
    consultantProgressApiSource.includes("from('consultant_messages')") &&
    consultantProgressApiSource.includes('sendPracticeProgressEmail'),
  'consultant progress route should update application state and notify client'
);
passed++;
assert(
  consultantPracticeProgressPanelSource.includes('/api/consultant/practices/') &&
    consultantPracticeProgressPanelSource.includes('/progress'),
  'consultant progress panel should call consultant progress endpoint'
);
passed++;
assert(
  consultantBillingProfileApiSource.includes("event_type: 'consultant_billing_profile_updated'"),
  'consultant billing profile API should persist payment preferences in platform events'
);
passed++;
assert(
  consultantFinancePayoutsApiSource.includes("from('consultant_payouts')") &&
    consultantFinancePayoutsApiSource.includes("from('practice_payment_ledger')"),
  'consultant finance payouts API should expose consultant payout status'
);
passed++;
assert(
  adminConsultantBillingProfilesApiSource.includes("event_type', 'consultant_billing_profile_updated'"),
  'admin API should read consultant payment preferences for payout operations'
);
passed++;
assert(
  consultantBillingPaymentsClientSource.includes('/api/consultant/billing-profile') &&
    consultantBillingPaymentsClientSource.includes('/api/consultant/finance/payouts'),
  'consultant billing client should load payout totals and save payout preferences'
);
passed++;
assert(
  consultantBillingPageSource.includes('ConsultantBillingPaymentsClient'),
  'consultant billing page should render dedicated billing and payments client'
);
passed++;
assert(
  consultantShellClientSource.includes('/consultant/billing') &&
    consultantShellClientSource.includes('Fatturazione e pagamenti'),
  'consultant sidebar should include billing and payments menu voice'
);
passed++;
assert(
  adminFinanceControlSource.includes('/api/admin/consultant-billing-profiles') &&
    adminFinanceControlSource.includes('Metodo pagamento'),
  'admin finance should display consultant payment preferences for payout execution'
);
passed++;
assert(
  adminBillingInvoiceUploadSource.includes("isMissingTable(readErr, 'company_crm')"),
  'billing invoice upload should return compatibility-safe response when CRM table is missing'
);
passed++;
assert(
  adminBillingInvoiceSendSource.includes("isMissingTable(error, 'company_crm')"),
  'billing invoice send should return compatibility-safe response when CRM table is missing'
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
assert(
  evaluationReview.eligibility === 'likely_eligible',
  'amount outside soft range should produce likely_eligible'
);
passed++;

const evaluationNeedsReview = evaluatePracticeQuiz(mockFlow, { beneficiary_fit: 'yes', investment_amount: null });
assert(
  evaluationNeedsReview.eligibility === 'needs_review',
  'missing or non-parseable required values should remain needs_review'
);
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

const progress1 = computeMonotonicQuizProgress({
  currentStep: 1,
  visibleQuestionsCount: 3,
  previousMaxProgress: 0
});
assert(progress1 === 67, 'progress helper should compute step-based progress');
passed++;

const progress2 = computeMonotonicQuizProgress({
  currentStep: 1,
  visibleQuestionsCount: 5,
  previousMaxProgress: progress1
});
assert(progress2 === 67, 'progress helper should never move backwards when visible questions increase');
passed++;

const progress3 = computeMonotonicQuizProgress({
  currentStep: 4,
  visibleQuestionsCount: 5,
  previousMaxProgress: progress2
});
assert(progress3 === 100, 'progress helper should reach 100 at final step');
passed++;

console.log(`PASS practice flow unit checks: ${passed} assertions`);
