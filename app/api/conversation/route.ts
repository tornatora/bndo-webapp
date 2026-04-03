import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { runStreamingChat } from '@/lib/ai/conversationOrchestrator';
import { nextBestFieldFromStep } from '@/lib/conversation/questionPlanner';
import { profileCompletenessScore } from '@/lib/matching/refineQuestion';
import { normalizeProfile } from '@/lib/matching/profileNormalizer';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { publicError, rejectCrossSiteMutation } from '@/lib/security/http';
import { evaluateScanReadiness } from '@/lib/conversation/scanReadiness';
import { evaluateAdaptiveScanReadiness } from '@/lib/conversation/adaptiveScanReadiness';
import { nextStepFromProfile, scanReadinessReasonForStep } from '@/lib/conversation/stepPlanner';
import {
  buildRollingSummary,
  decodeLegacySessionCookie,
  deleteSession,
  ensureSession,
  getSession,
  isLikelySessionPayloadCookie,
  upsertSession
} from '@/lib/conversation/sessionStore';
import type { ConversationMode, Session, Step, UserProfile } from '@/lib/conversation/types';
import type { ChatAction } from '@/lib/ai/ChatDecisionModel';

export const runtime = 'edge';

const COOKIE_NAME = 'bndo_assistant_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const RATE_COOKIE = 'bndo_assistant_rl';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 40;

const payloadSchema = z.object({
  message: z.string().min(1).max(1200),
  interactionId: z.string().min(6).max(64).optional(),
  conversationId: z.string().min(8).max(80).optional(),
  focusGrantContext: z.boolean().optional(),
  focusedGrantId: z.string().trim().min(2).max(220).optional(),
  focusedGrantTitle: z.string().trim().min(2).max(260).optional(),
});

const commitSchema = z.object({
  interactionId: z.string().min(6).max(64),
  assistantText: z.string().min(1).max(3200),
  userProfile: z.unknown(),
  step: z.unknown(),
  lastScanHash: z.string().max(600).nullable().optional(),
  conversationId: z.string().min(8).max(80).optional(),
  summarySnapshot: z.string().max(5000).nullable().optional()
});

type ConversationMetaPayload = {
  userProfile: UserProfile;
  step: Step;
  assistantText: string;
  readyToScan: boolean;
  mode: ConversationMode;
  action?: ChatAction;
  aiSource: 'openai' | 'disabled' | 'budget' | 'error' | null;
  needsClarification: boolean;
  nextQuestionField?: ReturnType<typeof nextBestFieldFromStep>;
  profileCompletenessScore?: number;
  scanReadinessReason?: string;
  scanHash?: string | null;
  questionReasonCode?: string;
  strategicFeedback?: string;
  interactionId: string;
  conversationId: string;
  modelUsed?: string;
  routingReason?: string;
  confidence?: number;
  citations?: Array<{
    title: string;
    url: string;
    sourceTier: 'official' | 'authoritative' | 'web';
    publishedAt: string | null;
    evidenceSnippet: string;
  }>;
  estimatedWithWarning?: boolean;
  factSource?: 'scanner_dataset' | 'faq' | 'mixed' | 'none';
  groundingStatus?: 'grounded' | 'estimated_with_warning' | 'degraded' | 'none';
};

function safeSliceTurns(turns: Array<{ role: 'user' | 'assistant'; text: string }>, maxTurns: number) {
  if (turns.length <= maxTurns) return turns;
  return turns.slice(Math.max(0, turns.length - maxTurns));
}

function inferMode(args: {
  handoffRequested: boolean;
  shouldScanNow: boolean;
  qaModeActive: boolean;
}): ConversationMode {
  if (args.handoffRequested) return 'handoff';
  if (args.shouldScanNow) return 'scan_ready';
  if (args.qaModeActive) return 'qa';
  return 'profiling';
}

function withConversationMeta(args: ConversationMetaPayload) {
  const nextBestField = typeof args.nextQuestionField !== 'undefined' ? args.nextQuestionField : nextBestFieldFromStep(args.step);
  return {
    userProfile: args.userProfile,
    step: args.step,
    assistantText: args.assistantText,
    readyToScan: args.readyToScan,
    mode: args.mode,
    action: args.action,
    nextBestField,
    nextQuestionField: nextBestField,
    aiSource: args.aiSource,
    assistantConfidence: args.confidence ?? 0.75,
    needsClarification: args.needsClarification,
    profileCompletenessScore: args.profileCompletenessScore,
    scanReadinessReason: args.scanReadinessReason ?? (args.readyToScan ? 'ready' : undefined),
    scanHash: typeof args.scanHash === 'undefined' ? undefined : args.scanHash,
    questionReasonCode: args.questionReasonCode ?? args.scanReadinessReason ?? (args.readyToScan ? 'ready' : undefined),
    strategicFeedback: args.strategicFeedback,
    interactionId: args.interactionId,
    conversationId: args.conversationId,
    modelUsed: args.modelUsed,
    routingReason: args.routingReason,
    confidence: args.confidence,
    citations: args.citations ?? [],
    estimatedWithWarning: Boolean(args.estimatedWithWarning),
    factSource: args.factSource ?? 'none',
    groundingStatus: args.groundingStatus ?? (args.estimatedWithWarning ? 'estimated_with_warning' : 'none')
  };
}

function computeScanHash(profile: UserProfile) {
  const bits = [
    profile.businessExists,
    profile.location?.region,
    profile.fundingGoal,
    profile.sector,
    profile.ateco,
    profile.budgetAnswered ? profile.revenueOrBudgetEUR : null,
    profile.requestedContributionEUR,
    profile.ageBand,
    profile.employmentStatus
  ];
  return bits.map((bit) => String(bit ?? '')).join('|');
}

function parseRateCookie(raw: string | null) {
  if (!raw) return { windowStartMs: Date.now(), count: 0 };
  const [tsRaw, countRaw] = raw.split(':');
  const ts = Number.parseInt(String(tsRaw ?? ''), 10);
  const count = Number.parseInt(String(countRaw ?? ''), 10);
  if (!Number.isFinite(ts) || !Number.isFinite(count)) return { windowStartMs: Date.now(), count: 0 };
  return { windowStartMs: ts, count };
}

function checkCookieRateLimit() {
  const parsed = parseRateCookie(cookies().get(RATE_COOKIE)?.value ?? null);
  const now = Date.now();
  const elapsed = now - parsed.windowStartMs;
  const currentCount = elapsed > RATE_WINDOW_MS ? 0 : parsed.count;
  if (currentCount >= RATE_MAX_PER_WINDOW) {
    const retryAfterMs = Math.max(0, RATE_WINDOW_MS - elapsed);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  const nextWindowStart = elapsed > RATE_WINDOW_MS ? now : parsed.windowStartMs;
  const nextCount = currentCount + 1;
  cookies().set(RATE_COOKIE, `${nextWindowStart}:${nextCount}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.ceil((RATE_WINDOW_MS * 3) / 1000)
  });
  return { ok: true, retryAfterSec: 0 };
}

function readConversationCookie() {
  const raw = cookies().get(COOKIE_NAME)?.value ?? null;
  if (!raw) return null;
  if (raw.startsWith('conv_')) return raw;

  if (isLikelySessionPayloadCookie(raw)) {
    const migrated = decodeLegacySessionCookie(raw);
    if (migrated) {
      upsertSession(migrated);
      return migrated.conversationId;
    }
  }

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as { conversationId?: string };
    if (parsed.conversationId && parsed.conversationId.startsWith('conv_')) return parsed.conversationId;
  } catch {
    // Ignore malformed cookie payload
  }
  return null;
}

function writeConversationCookie(conversationId: string) {
  cookies().set(COOKIE_NAME, conversationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS
  });
}

function deleteConversationCookie() {
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
}

function deleteRateCookie() {
  cookies().set(RATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
}

function ensureConversationId(provided?: string | null) {
  const byPayload = provided?.trim();
  if (byPayload && byPayload.startsWith('conv_')) return byPayload;
  const byCookie = readConversationCookie();
  if (byCookie) return byCookie;
  return `conv_${crypto.randomUUID()}`;
}

export async function POST(request: Request) {
  const csrf = rejectCrossSiteMutation(request);
  if (csrf) return csrf;

  const memoryRate = checkRateLimit(request, { keyPrefix: 'conversation', windowMs: 60_000, max: 25 });
  if (!memoryRate.ok) {
    return NextResponse.json(
      { error: 'Stai inviando troppi messaggi. Attendi qualche istante.' },
      { status: 429, headers: { 'Retry-After': String(memoryRate.retryAfterSec) } }
    );
  }

  const cookieRate = checkCookieRateLimit();
  if (!cookieRate.ok) {
    return NextResponse.json(
      { error: 'Stai inviando troppi messaggi. Attendi qualche istante.' },
      { status: 429, headers: { 'Retry-After': String(cookieRate.retryAfterSec) } }
    );
  }

  try {
    const parsed = payloadSchema.parse(await request.json());
    const trimmedMessage = parsed.message.trim();
    const interactionId = parsed.interactionId ?? `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const conversationId = ensureConversationId(parsed.conversationId ?? null);
    writeConversationCookie(conversationId);

    const session = ensureSession(conversationId);
    const turns = Array.isArray(session.recentTurns) ? [...session.recentTurns] : [];
    const lastTurn = turns[turns.length - 1] ?? null;
    if (!(lastTurn?.role === 'user' && lastTurn.text === trimmedMessage)) {
      turns.push({ role: 'user', text: trimmedMessage });
    }

    const focusGrantId = parsed.focusedGrantId?.trim() || null;
    const focusGrantTitle = parsed.focusedGrantTitle?.trim() || null;
    const shouldForceGrantFocus = Boolean(parsed.focusGrantContext && (focusGrantId || focusGrantTitle));
    const seededUserProfile = shouldForceGrantFocus
      ? ({
          ...(session.userProfile ?? {}),
          activeMeasureId: focusGrantId ?? (session.userProfile?.activeMeasureId ?? null),
          activeMeasureTitle: focusGrantTitle ?? (session.userProfile?.activeMeasureTitle ?? null),
        } as UserProfile)
      : (session.userProfile as UserProfile);

    const seededSession = {
      ...session,
      userProfile: seededUserProfile,
      recentTurns: safeSliceTurns(turns, 24),
      updatedAt: new Date().toISOString(),
      conversationSummary: buildRollingSummary({
        profile: seededUserProfile,
        turns: safeSliceTurns(turns, 24)
      })
    } as Session;
    (seededSession as any).pendingInteractionId = interactionId;
    upsertSession(seededSession);

    const historyForOrchestrator = safeSliceTurns(turns, 24).map((turn) => ({ role: turn.role, text: turn.text }));
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let finalAssistantText = '';
          for await (const chunk of runStreamingChat(trimmedMessage, seededUserProfile, historyForOrchestrator, {
            strictFocusedGrant: shouldForceGrantFocus,
          })) {
            if (chunk.type === 'metadata') {
              const rawMeta = chunk.content ?? {};
              const mergedProfile = rawMeta.mergedProfile as UserProfile;
              const scanReadiness = evaluateScanReadiness(mergedProfile);
              const adaptiveReadiness = evaluateAdaptiveScanReadiness(mergedProfile);
              const scanHash = scanReadiness.hardScanReady || adaptiveReadiness.ready ? computeScanHash(mergedProfile) : null;
              const scanIntentRequested =
                rawMeta.finalAction === 'run_scan' ||
                rawMeta.finalAction === 'refine_after_scan' ||
                rawMeta.intent === 'scan_ready' ||
                rawMeta.intent === 'discovery';
              const technicalQaTurn = rawMeta.intent === 'measure_question' || rawMeta.intent === 'general_qa';

              const shouldScanNow = Boolean(
                scanIntentRequested &&
                  !technicalQaTurn &&
                  (scanReadiness.ready || adaptiveReadiness.ready || (session.lastAskedStep === 'preScanConfirm' && scanReadiness.hardScanReady)) &&
                  (scanHash !== session.lastScanHash || rawMeta.intent === 'scan_ready' || rawMeta.intent === 'discovery')
              );

              const nextStep = shouldScanNow ? 'ready' : nextStepFromProfile(mergedProfile);
              const mode = inferMode({
                handoffRequested: rawMeta.finalAction === 'handoff_human',
                shouldScanNow,
                qaModeActive: technicalQaTurn
              });

              const finalMeta = withConversationMeta({
                userProfile: mergedProfile,
                step: nextStep,
                assistantText: rawMeta.response_text || '',
                readyToScan: shouldScanNow,
                mode,
                action: shouldScanNow ? 'run_scan' : rawMeta.finalAction,
                aiSource: rawMeta.response_text ? 'openai' : 'error',
                needsClarification: !shouldScanNow && rawMeta.finalAction === 'ask_clarification',
                nextQuestionField: nextBestFieldFromStep(nextStep),
                profileCompletenessScore: profileCompletenessScore(normalizeProfile(mergedProfile), scanReadiness.missingSignals),
                scanReadinessReason: scanReadinessReasonForStep(nextStep, mergedProfile),
                scanHash: shouldScanNow ? scanHash : null,
                strategicFeedback: rawMeta.strategicFeedback,
                interactionId,
                conversationId,
                modelUsed: rawMeta.modelUsed,
                routingReason: rawMeta.routingReason,
                confidence: rawMeta.confidence,
                citations: rawMeta.citations ?? [],
                estimatedWithWarning: Boolean(rawMeta.estimatedWithWarning),
                factSource: rawMeta.factSource,
                groundingStatus: rawMeta.groundingStatus
              });

              finalAssistantText = String(finalMeta.assistantText || finalAssistantText);
              const updatedSession = getSession(conversationId) ?? session;
              const updatedTurns = Array.isArray(updatedSession.recentTurns) ? [...updatedSession.recentTurns] : [];
              if (finalAssistantText) {
                const last = updatedTurns[updatedTurns.length - 1];
                if (!(last?.role === 'assistant' && last.text === finalAssistantText)) {
                  updatedTurns.push({ role: 'assistant', text: finalAssistantText });
                }
              }
              const streamedSession = {
                ...updatedSession,
                userProfile: mergedProfile,
                step: nextStep,
                qaMode: technicalQaTurn,
                lastAskedStep: nextStep === 'ready' ? updatedSession.lastAskedStep ?? null : nextStep,
                recentTurns: safeSliceTurns(updatedTurns, 24),
                conversationSummary: buildRollingSummary({
                  profile: mergedProfile,
                  turns: safeSliceTurns(updatedTurns, 24),
                  intent: rawMeta.intent ?? null,
                  action: shouldScanNow ? 'run_scan' : rawMeta.finalAction
                }),
                updatedAt: new Date().toISOString()
              } as Session;
              (streamedSession as any).pendingInteractionId = interactionId;
              upsertSession(streamedSession);

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'metadata', content: finalMeta })}\n\n`));
            } else if (chunk.type === 'text') {
              finalAssistantText += String(chunk.content ?? '');
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk.content ?? '' })}\n\n`));
            } else if (chunk.type === 'thinking') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', content: Boolean(chunk.content) })}\n\n`));
            } else if (chunk.type === 'error') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'error', content: String(chunk.content ?? 'Errore conversazione.') })}\n\n`)
              );
            }
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', content: publicError(error, 'Errore nella generazione della risposta.') })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json({ error: publicError(error, 'Errore conversazione.') }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const csrf = rejectCrossSiteMutation(request);
  if (csrf) return csrf;

  try {
    const payload = commitSchema.parse(await request.json());
    const conversationId = ensureConversationId(payload.conversationId ?? null);
    const session = getSession(conversationId);
    if (!session) return NextResponse.json({ ok: false, error: 'Sessione non trovata.' }, { status: 404 });

    if ((session as any).lastCommittedInteractionId === payload.interactionId) {
      return NextResponse.json({ ok: true, conversationId });
    }

    const turns = Array.isArray(session.recentTurns) ? [...session.recentTurns] : [];
    const lastTurn = turns[turns.length - 1] ?? null;
    if (!(lastTurn?.role === 'assistant' && lastTurn.text === payload.assistantText)) {
      turns.push({ role: 'assistant', text: payload.assistantText });
    }

    const nextSession: Session = {
      ...session,
      conversationId,
      userProfile: payload.userProfile as UserProfile,
      step: payload.step as Step,
      lastScanHash: typeof payload.lastScanHash !== 'undefined' ? payload.lastScanHash ?? null : session.lastScanHash ?? null,
      recentTurns: safeSliceTurns(turns, 24),
      conversationSummary:
        payload.summarySnapshot && payload.summarySnapshot.trim()
          ? payload.summarySnapshot.trim()
          : buildRollingSummary({
              profile: payload.userProfile as UserProfile,
              turns: safeSliceTurns(turns, 24)
            }),
      updatedAt: new Date().toISOString()
    } as Session;
    (nextSession as any).lastCommittedInteractionId = payload.interactionId;
    (nextSession as any).pendingInteractionId = null;

    upsertSession(nextSession);
    writeConversationCookie(conversationId);
    return NextResponse.json({ ok: true, conversationId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: 'Payload non valido.' }, { status: 422 });
    }
    return NextResponse.json({ ok: false, error: publicError(error, 'Errore commit.') }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const csrf = rejectCrossSiteMutation(request);
  if (csrf) return csrf;

  const conversationId = readConversationCookie();
  if (conversationId) deleteSession(conversationId);
  deleteConversationCookie();
  deleteRateCookie();
  return NextResponse.json({ ok: true });
}
