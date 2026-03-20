import type Stripe from 'stripe';
import type { Json } from '@/lib/supabase/database.types';
import {
  getPracticeConfig,
  grantSlugFromPracticeType,
  practiceTypeFromGrantSlug,
  practiceTypeFromQuizBandoType,
  type PracticeType,
} from '@/lib/bandi';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type PracticePaymentStatus = 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
export type PracticeOnboardingStatus = 'not_started' | 'in_progress' | 'completed';

export type PracticePaymentRecord = {
  id: string;
  quiz_submission_id: string | null;
  company_id: string | null;
  user_id: string | null;
  application_id: string | null;
  practice_type: string;
  grant_slug: string;
  grant_title: string;
  amount_cents: number;
  currency: string;
  status: PracticePaymentStatus;
  priority_queue: boolean;
  onboarding_status: PracticeOnboardingStatus;
  onboarding_completed_at: string | null;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  customer_email: string;
  paid_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export function resolvePracticeTypeFromAny(raw: string | null | undefined): PracticeType | null {
  const fromSlug = practiceTypeFromGrantSlug(raw);
  if (fromSlug) return fromSlug;
  return practiceTypeFromQuizBandoType(raw);
}

function normalizeStatusFromSession(session: Stripe.Checkout.Session): PracticePaymentStatus {
  if (session.payment_status === 'paid') return 'paid';
  if (session.status === 'expired') return 'canceled';
  return 'pending';
}

function normalizeStatusFromIntent(intent: Stripe.PaymentIntent): PracticePaymentStatus {
  if (intent.status === 'succeeded') return 'paid';
  if (intent.status === 'canceled') return 'canceled';
  return 'pending';
}

function safeLowerEmail(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function pickNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function extractPracticeTypeFromSession(
  session: Stripe.Checkout.Session,
  fallbackPracticeType: PracticeType | null = null,
): PracticeType | null {
  const metaPractice = resolvePracticeTypeFromAny(session.metadata?.practice_type ?? null);
  if (metaPractice) return metaPractice;
  const metaSlug = practiceTypeFromGrantSlug(session.metadata?.grant_slug ?? null);
  if (metaSlug) return metaSlug;
  return fallbackPracticeType;
}

function extractPracticeTypeFromIntent(
  intent: Stripe.PaymentIntent,
  fallbackPracticeType: PracticeType | null = null,
): PracticeType | null {
  const metaPractice = resolvePracticeTypeFromAny(intent.metadata?.practice_type ?? null);
  if (metaPractice) return metaPractice;
  const metaSlug = practiceTypeFromGrantSlug(intent.metadata?.grant_slug ?? null);
  if (metaSlug) return metaSlug;
  return fallbackPracticeType;
}

function extractGrantTitle(practiceType: PracticeType, session: Stripe.Checkout.Session) {
  const fromMeta = String(session.metadata?.grant_title ?? '').trim();
  if (fromMeta) return fromMeta;
  return getPracticeConfig(practiceType).title;
}

function amountFromSession(session: Stripe.Checkout.Session, fallbackAmountCents: number) {
  const metadataAmount = Number.parseInt(String(session.metadata?.amount_cents ?? ''), 10);
  if (Number.isFinite(metadataAmount) && metadataAmount > 0) return metadataAmount;
  if (typeof session.amount_total === 'number' && Number.isFinite(session.amount_total) && session.amount_total > 0) {
    return session.amount_total;
  }
  return fallbackAmountCents;
}

export function buildOnboardingUrl(args: { practiceType: PracticeType; sessionId: string; quizSubmissionId?: string | null }) {
  const params = new URLSearchParams();
  params.set('session_id', args.sessionId);
  params.set('practice', args.practiceType);
  if (args.quizSubmissionId) params.set('quiz', args.quizSubmissionId);
  return `/onboarding?${params.toString()}`;
}

export function buildDashboardPracticeUrl(applicationId: string) {
  return `/dashboard/practices/${applicationId}`;
}

export function resolveNextUrlFromPayment(record: PracticePaymentRecord) {
  const practiceType = resolvePracticeTypeFromAny(record.practice_type);
  if (!practiceType) return '/onboarding';
  if (record.onboarding_status === 'completed' && record.application_id) {
    return buildDashboardPracticeUrl(record.application_id);
  }
  return buildOnboardingUrl({
    practiceType,
    sessionId: record.stripe_checkout_session_id,
    quizSubmissionId: record.quiz_submission_id,
  });
}

export async function getPracticePaymentBySession(sessionId: string): Promise<PracticePaymentRecord | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('practice_payments')
    .select('*')
    .or(`stripe_checkout_session_id.eq.${sessionId},stripe_payment_intent_id.eq.${sessionId}`)
    .maybeSingle();
  return (data as PracticePaymentRecord | null) ?? null;
}

export async function getPracticePaymentByIntent(intentId: string): Promise<PracticePaymentRecord | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('practice_payments')
    .select('*')
    .eq('stripe_payment_intent_id', intentId)
    .maybeSingle();
  return (data as PracticePaymentRecord | null) ?? null;
}

export async function getLatestPaidPaymentByQuiz(args: { quizSubmissionId: string; practiceType: PracticeType }) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('practice_payments')
    .select('*')
    .eq('quiz_submission_id', args.quizSubmissionId)
    .eq('practice_type', args.practiceType)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PracticePaymentRecord | null) ?? null;
}

export async function upsertPracticePaymentFromSession(args: {
  session: Stripe.Checkout.Session;
  fallbackPracticeType?: PracticeType | null;
  fallbackQuizSubmissionId?: string | null;
  forceStatus?: PracticePaymentStatus;
}) {
  const { session, fallbackPracticeType = null, fallbackQuizSubmissionId = null, forceStatus } = args;
  const admin = getSupabaseAdmin();

  const practiceType = extractPracticeTypeFromSession(session, fallbackPracticeType);
  if (!practiceType) return null;

  const existing = await getPracticePaymentBySession(session.id);
  const practiceConfig = getPracticeConfig(practiceType);
  const status = forceStatus ?? normalizeStatusFromSession(session);
  const amountCents = amountFromSession(session, practiceConfig.startFeeCents);
  const currency = String(session.metadata?.currency ?? session.currency ?? practiceConfig.currency).toLowerCase();
  const customerEmail = safeLowerEmail(
    session.customer_details?.email ?? session.customer_email ?? existing?.customer_email ?? '',
  );
  const quizSubmissionId = String(session.metadata?.quiz_submission_id ?? fallbackQuizSubmissionId ?? existing?.quiz_submission_id ?? '').trim();
  const nowIso = new Date().toISOString();
  const paidAt = status === 'paid' ? existing?.paid_at ?? nowIso : existing?.paid_at ?? null;
  const metadata: Json = {
    ...(existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {}),
    stripe_session_status: session.status ?? null,
    stripe_payment_status: session.payment_status ?? null,
    updated_from: 'session_sync',
  };

  const payload = {
    quiz_submission_id: quizSubmissionId || null,
    company_id: existing?.company_id ?? null,
    user_id: existing?.user_id ?? null,
    application_id: existing?.application_id ?? null,
    practice_type: practiceType,
    grant_slug: grantSlugFromPracticeType(practiceType),
    grant_title: extractGrantTitle(practiceType, session),
    amount_cents: amountCents,
    currency,
    status,
    priority_queue: existing?.priority_queue ?? true,
    onboarding_status: existing?.onboarding_status ?? ('not_started' as PracticeOnboardingStatus),
    onboarding_completed_at: existing?.onboarding_completed_at ?? null,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : existing?.stripe_payment_intent_id ?? null,
    stripe_customer_id:
      typeof session.customer === 'string' ? session.customer : existing?.stripe_customer_id ?? null,
    customer_email: customerEmail,
    paid_at: paidAt,
    metadata,
    updated_at: nowIso,
  };

  const { data, error } = await admin
    .from('practice_payments')
    .upsert(payload, { onConflict: 'stripe_checkout_session_id' })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PracticePaymentRecord;
}

export async function upsertPracticePaymentFromIntent(args: {
  intent: Stripe.PaymentIntent;
  fallbackPracticeType?: PracticeType | null;
  fallbackQuizSubmissionId?: string | null;
  forceStatus?: PracticePaymentStatus;
}) {
  const { intent, fallbackPracticeType = null, fallbackQuizSubmissionId = null, forceStatus } = args;
  const admin = getSupabaseAdmin();

  const practiceType = extractPracticeTypeFromIntent(intent, fallbackPracticeType);
  if (!practiceType) return null;

  const existingByIntent = await getPracticePaymentByIntent(intent.id);
  const existingBySession = await getPracticePaymentBySession(intent.id);
  const existing = existingByIntent ?? existingBySession;
  const existingMetadata =
    existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const practiceConfig = getPracticeConfig(practiceType);
  const status = forceStatus ?? normalizeStatusFromIntent(intent);
  const amountCents =
    typeof intent.amount === 'number' && Number.isFinite(intent.amount) && intent.amount > 0
      ? intent.amount
      : practiceConfig.startFeeCents;
  const currency = String(intent.currency ?? practiceConfig.currency).toLowerCase();
  const fallbackEmail = `pending+${intent.id.toLowerCase()}@bndo.local`;
  const customerEmail = safeLowerEmail(
    pickNonEmptyString(
      intent.receipt_email,
      intent.metadata?.customer_email,
      existing?.customer_email,
      fallbackEmail,
    ),
  );
  const customerName = pickNonEmptyString(
    intent.metadata?.customer_name,
    typeof existingMetadata.customer_name === 'string' ? existingMetadata.customer_name : '',
  );
  const quizSubmissionId = String(
    intent.metadata?.quiz_submission_id ?? fallbackQuizSubmissionId ?? existing?.quiz_submission_id ?? '',
  ).trim();
  const nowIso = new Date().toISOString();
  const paidAt = status === 'paid' ? existing?.paid_at ?? nowIso : existing?.paid_at ?? null;
  const metadata: Json = {
    ...existingMetadata,
    customer_name: customerName || null,
    stripe_intent_status: intent.status ?? null,
    stripe_intent_last_payment_error_code: intent.last_payment_error?.code ?? null,
    stripe_intent_last_payment_error_message: intent.last_payment_error?.message ?? null,
    updated_from: 'intent_sync',
  };

  const payload = {
    quiz_submission_id: quizSubmissionId || null,
    company_id: existing?.company_id ?? null,
    user_id: existing?.user_id ?? null,
    application_id: existing?.application_id ?? null,
    practice_type: practiceType,
    grant_slug: grantSlugFromPracticeType(practiceType),
    grant_title: String(intent.metadata?.grant_title ?? '').trim() || existing?.grant_title || practiceConfig.title,
    amount_cents: amountCents,
    currency,
    status,
    priority_queue: existing?.priority_queue ?? true,
    onboarding_status: existing?.onboarding_status ?? ('not_started' as PracticeOnboardingStatus),
    onboarding_completed_at: existing?.onboarding_completed_at ?? null,
    stripe_checkout_session_id: existing?.stripe_checkout_session_id ?? intent.id,
    stripe_payment_intent_id: intent.id,
    stripe_customer_id:
      typeof intent.customer === 'string' ? intent.customer : existing?.stripe_customer_id ?? null,
    customer_email: customerEmail,
    paid_at: paidAt,
    metadata,
    updated_at: nowIso,
  };

  const { data, error } = await admin
    .from('practice_payments')
    .upsert(payload, { onConflict: 'stripe_checkout_session_id' })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PracticePaymentRecord;
}

export async function markPaymentOnboardingCompleted(args: {
  sessionId: string;
  companyId: string;
  userId: string;
  applicationId: string;
}) {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('practice_payments')
    .update({
      company_id: args.companyId,
      user_id: args.userId,
      application_id: args.applicationId,
      onboarding_status: 'completed',
      onboarding_completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('stripe_checkout_session_id', args.sessionId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return (data as PracticePaymentRecord | null) ?? null;
}
