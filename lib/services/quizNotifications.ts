import { ADMIN_URL, buildAbsoluteUrl } from '@/lib/site-urls';
import { sendQuizSubmissionAlertEmail } from '@/lib/services/email';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type QuizSubmissionNotificationInput = {
  submissionId: string;
  fullName: string;
  email: string;
  phone: string | null;
  region: string | null;
  bandoType: string | null;
  practiceTitle: string | null;
  eligibility: 'eligible' | 'not_eligible';
  createdAtIso: string;
};

function parseExtraRecipients() {
  const fromEnv = (process.env.QUIZ_NOTIFICATION_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(fromEnv));
}

function mapQuizLabel(bandoType: string | null) {
  if (bandoType === 'sud') return 'Quiz Autoimpiego (Resto al Sud 2.0)';
  if (bandoType === 'centro_nord') return 'Quiz Autoimpiego (Autoimpiego Centro-Nord)';
  return 'Quiz requisiti';
}

function mapPracticeTitle(bandoType: string | null, practiceTitle: string | null) {
  if (practiceTitle) return practiceTitle;
  if (bandoType === 'sud') return 'Resto al Sud 2.0';
  if (bandoType === 'centro_nord') return 'Autoimpiego Centro-Nord';
  return null;
}

export async function dispatchQuizSubmissionNotifications(input: QuizSubmissionNotificationInput) {
  const admin = getSupabaseAdmin();
  const submittedAt = new Date(input.createdAtIso);
  const submittedAtLabel = Number.isNaN(submittedAt.getTime())
    ? input.createdAtIso
    : submittedAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  const quizLabel = mapQuizLabel(input.bandoType);
  const resolvedPracticeTitle = mapPracticeTitle(input.bandoType, input.practiceTitle);
  const eligibilityLabel = input.eligibility === 'eligible' ? 'Idoneo' : 'Non idoneo';
  const adminLink = buildAbsoluteUrl(
    ADMIN_URL,
    '/admin/quiz-responses',
    `submission_id=${encodeURIComponent(input.submissionId)}`
  ).toString();

  const body = [
    `${input.fullName} ha completato ${quizLabel}.`,
    resolvedPracticeTitle ? `Pratica: ${resolvedPracticeTitle}.` : null,
    input.region ? `Regione: ${input.region}.` : null,
    `Esito: ${eligibilityLabel}.`,
    `Data/Ora: ${submittedAtLabel}.`,
    `Apri: ${adminLink}`
  ]
    .filter(Boolean)
    .join(' ');

  const [{ data: opsProfiles }, notifResult] = await Promise.all([
    admin
      .from('profiles')
      .select('email')
      .in('role', ['consultant', 'ops_admin']),
    admin.from('admin_notifications').insert({
      type: 'quiz_submission',
      title: 'Nuova risposta quiz',
      body,
      entity_id: input.submissionId
    })
  ]);

  if (notifResult.error) {
    throw notifResult.error;
  }

  const roleRecipients = (opsProfiles ?? [])
    .map((profile) => String(profile.email ?? '').trim().toLowerCase())
    .filter(Boolean);
  const recipients = Array.from(new Set([...roleRecipients, ...parseExtraRecipients()]));

  if (recipients.length === 0) {
    return { notificationCreated: true, emailSent: false, emailSkipped: true };
  }

  const emailResult = await sendQuizSubmissionAlertEmail({
    recipients,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    quizType: quizLabel,
    practiceTitle: resolvedPracticeTitle,
    eligibility: input.eligibility,
    submittedAtIso: input.createdAtIso,
    adminLink
  });

  return {
    notificationCreated: true,
    emailSent: emailResult.sent,
    emailSkipped: !!emailResult.skipped,
    emailError: emailResult.error
  };
}

type PracticeQuizNotificationInput = {
  submissionId: string;
  applicationId: string;
  fullName: string;
  email: string;
  practiceTitle: string;
  grantTitle: string;
  sourceChannel: PracticeSourceChannel;
  eligibility: 'eligible' | 'not_eligible' | 'needs_review';
  createdAtIso: string;
};

type PracticeSourceChannel = 'scanner' | 'chat' | 'direct' | 'admin';

export async function dispatchPracticeQuizNotifications(input: PracticeQuizNotificationInput) {
  const admin = getSupabaseAdmin();
  const submittedAt = new Date(input.createdAtIso);
  const submittedAtLabel = Number.isNaN(submittedAt.getTime())
    ? input.createdAtIso
    : submittedAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  const eligibilityLabel =
    input.eligibility === 'eligible'
      ? 'Idoneo'
      : input.eligibility === 'needs_review'
        ? 'Da verificare'
        : 'Non idoneo';
  const adminLink = buildAbsoluteUrl(
    ADMIN_URL,
    '/admin/quiz-responses',
    `practice_quiz_submission_id=${encodeURIComponent(input.submissionId)}`
  ).toString();
  const body = [
    `${input.fullName} ha completato il quiz requisiti pratica.`,
    `Pratica: ${input.practiceTitle}.`,
    `Bando: ${input.grantTitle}.`,
    `Sorgente: ${input.sourceChannel}.`,
    `Esito: ${eligibilityLabel}.`,
    `Data/Ora: ${submittedAtLabel}.`,
    `Apri: ${adminLink}`
  ].join(' ');

  const [{ data: opsProfiles }, notifResult] = await Promise.all([
    admin
      .from('profiles')
      .select('email')
      .in('role', ['consultant', 'ops_admin']),
    admin.from('admin_notifications').insert({
      type: 'quiz_submission',
      title: 'Nuovo quiz requisiti pratica',
      body,
      entity_id: input.submissionId
    })
  ]);

  if (notifResult.error) {
    throw notifResult.error;
  }

  const roleRecipients = (opsProfiles ?? [])
    .map((profile) => String(profile.email ?? '').trim().toLowerCase())
    .filter(Boolean);
  const recipients = Array.from(new Set([...roleRecipients, ...parseExtraRecipients()]));

  if (recipients.length === 0) {
    return { notificationCreated: true, emailSent: false, emailSkipped: true };
  }

  const emailResult = await sendQuizSubmissionAlertEmail({
    recipients,
    fullName: input.fullName,
    email: input.email,
    phone: null,
    quizType: 'Quiz requisiti pratica',
    practiceTitle: input.practiceTitle,
    eligibility:
      input.eligibility === 'not_eligible'
        ? 'not_eligible'
        : 'eligible',
    submittedAtIso: input.createdAtIso,
    adminLink
  });

  return {
    notificationCreated: true,
    emailSent: emailResult.sent,
    emailSkipped: !!emailResult.skipped,
    emailError: emailResult.error
  };
}
