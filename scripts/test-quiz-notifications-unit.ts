/**
 * Quiz notifications unit checks.
 * Run with: npx tsx scripts/test-quiz-notifications-unit.ts
 */
import { __quizNotificationTestUtils } from '@/lib/services/quizNotifications';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const originalEnv = {
  QUIZ_NOTIFICATION_EMAILS: process.env.QUIZ_NOTIFICATION_EMAILS,
  QUIZ_NOTIFICATION_EMAIL: process.env.QUIZ_NOTIFICATION_EMAIL,
  ADMIN_NOTIFICATION_EMAIL: process.env.ADMIN_NOTIFICATION_EMAIL,
  OPS_NOTIFICATION_EMAIL: process.env.OPS_NOTIFICATION_EMAIL
};

function restoreEnv() {
  process.env.QUIZ_NOTIFICATION_EMAILS = originalEnv.QUIZ_NOTIFICATION_EMAILS;
  process.env.QUIZ_NOTIFICATION_EMAIL = originalEnv.QUIZ_NOTIFICATION_EMAIL;
  process.env.ADMIN_NOTIFICATION_EMAIL = originalEnv.ADMIN_NOTIFICATION_EMAIL;
  process.env.OPS_NOTIFICATION_EMAIL = originalEnv.OPS_NOTIFICATION_EMAIL;
}

try {
  process.env.QUIZ_NOTIFICATION_EMAILS = 'extra.quiz@bndo.it,ops.team@bndo.it';
  process.env.QUIZ_NOTIFICATION_EMAIL = 'single.extra@bndo.it';
  process.env.ADMIN_NOTIFICATION_EMAIL = 'admin.extra@bndo.it';
  process.env.OPS_NOTIFICATION_EMAIL = 'ops.team@bndo.it';

  const publicRecipients = __quizNotificationTestUtils.resolvePublicQuizRecipients(
    ['consultant.one@bndo.it', 'shared@bndo.it'],
    ['ops.team@bndo.it', 'ops.other@bndo.it']
  );
  assert(
    publicRecipients.includes('consultant.one@bndo.it'),
    'public quiz should keep consultant recipients'
  );
  assert(
    publicRecipients.includes('extra.quiz@bndo.it') &&
      publicRecipients.includes('single.extra@bndo.it') &&
      publicRecipients.includes('admin.extra@bndo.it'),
    'public quiz should keep extra recipients'
  );
  assert(
    !publicRecipients.includes('ops.team@bndo.it') && !publicRecipients.includes('ops.other@bndo.it'),
    'public quiz should exclude ops recipients already covered by notification engine'
  );

  const practiceRecipients = __quizNotificationTestUtils.resolvePracticeQuizRecipients([
    'client.admin@bndo.it',
    'consultant.one@bndo.it',
    'ops.team@bndo.it'
  ]);
  assert(
    practiceRecipients.includes('extra.quiz@bndo.it') &&
      practiceRecipients.includes('single.extra@bndo.it') &&
      practiceRecipients.includes('admin.extra@bndo.it'),
    'practice quiz should keep only external recipients'
  );
  assert(
    !practiceRecipients.includes('client.admin@bndo.it') &&
      !practiceRecipients.includes('consultant.one@bndo.it') &&
      !practiceRecipients.includes('ops.team@bndo.it'),
    'practice quiz should exclude all profile recipients already handled by notification engine'
  );

  console.log('✅ Quiz notification recipient filters passed: 2');
} finally {
  restoreEnv();
}
