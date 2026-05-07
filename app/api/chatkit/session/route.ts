import OpenAI from 'openai';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { publicError, rejectCrossSiteMutation } from '@/lib/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANON_COOKIE_NAME = 'bndo_chatkit_anon_id';
const ANON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const SessionRequestSchema = z.object({
  source_page: z.string().trim().max(120).optional(),
  bando_context: z.enum(['unknown', 'rsud', 'acn']).optional(),
  current_client_secret: z.string().trim().max(4096).optional()
});

type SessionRequestPayload = z.infer<typeof SessionRequestSchema>;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readOrCreateAnonymousId() {
  const store = cookies();
  const raw = store.get(ANON_COOKIE_NAME)?.value?.trim() ?? '';
  const isValid = /^[a-zA-Z0-9_-]{8,120}$/.test(raw);
  if (isValid) return { userId: `anon:${raw}`, cookieValue: null as string | null };

  const created = `anon_${crypto.randomUUID().replace(/-/g, '')}`;
  return { userId: `anon:${created}`, cookieValue: created };
}

async function resolveEndUserIdentifier() {
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    const typedUser = user as (typeof user & { is_anonymous?: boolean }) | null;
    const isAnonymous = Boolean(typedUser?.is_anonymous);
    const hasIdentity = Boolean(user?.email || user?.phone);
    const authenticated = Boolean(user?.id) && !isAnonymous && hasIdentity;

    if (authenticated && user?.id) {
      return { userId: `profile:${user.id}`, anonCookieValue: null as string | null };
    }
  } catch {
    // If auth lookup fails we still proceed with an anonymous identifier.
  }

  const anonymous = readOrCreateAnonymousId();
  return { userId: anonymous.userId, anonCookieValue: anonymous.cookieValue };
}

function buildWorkflowPayload(input: SessionRequestPayload, workflowId: string, workflowVersion: string | null) {
  const stateVariables: Record<string, string | number | boolean> = {};
  if (input.source_page) stateVariables.source_page = input.source_page;
  if (input.bando_context) stateVariables.bando_context = input.bando_context;

  return {
    id: workflowId,
    ...(workflowVersion ? { version: workflowVersion } : {}),
    ...(Object.keys(stateVariables).length > 0 ? { state_variables: stateVariables } : {})
  };
}

export async function POST(request: Request) {
  const csrf = rejectCrossSiteMutation(request);
  if (csrf) return csrf;

  const rate = checkRateLimit(request, { keyPrefix: 'chatkit-session', windowMs: 60_000, max: 40 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Troppe richieste. Riprova tra poco.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );
  }

  const rawPayload = await request.json().catch(() => ({}));
  const parsed = SessionRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload non valido.' }, { status: 422 });
  }

  const apiKey = getRequiredEnv('OPENAI_API_KEY');
  const workflowId = getRequiredEnv('OPENAI_CHATKIT_WORKFLOW_ID');
  const workflowVersion = getRequiredEnv('OPENAI_CHATKIT_WORKFLOW_VERSION');

  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY non configurata sul server.' }, { status: 500 });
  }
  if (!workflowId) {
    return NextResponse.json({ error: 'OPENAI_CHATKIT_WORKFLOW_ID non configurata sul server.' }, { status: 500 });
  }

  try {
    const { userId, anonCookieValue } = await resolveEndUserIdentifier();
    const workflow = buildWorkflowPayload(parsed.data, workflowId, workflowVersion);

    const openai = new OpenAI({ apiKey });
    const session = await openai.beta.chatkit.sessions.create({
      user: userId,
      workflow
    });

    const response = NextResponse.json(
      {
        client_secret: session.client_secret,
        expires_at: session.expires_at,
        session_id: session.id
      },
      { status: 200 }
    );

    if (anonCookieValue) {
      response.cookies.set(ANON_COOKIE_NAME, anonCookieValue, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: ANON_COOKIE_MAX_AGE_SECONDS
      });
    }

    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: publicError(error, 'Impossibile creare la sessione ChatKit.') },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
