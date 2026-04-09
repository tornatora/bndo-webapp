import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { ensurePracticeThreadForApplication, ensurePracticeThreadParticipants } from '@/lib/ops/assignments';
import { logPlatformEvent } from '@/lib/ops/telemetry';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const ParamsSchema = z.object({
  applicationId: z.string().uuid(),
});

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

const BodySchema = z.object({
  body: z.string().trim().min(1).max(1200),
});

async function resolveThread(args: { applicationId: string; profileId: string; profileRole: string }) {
  const admin = getSupabaseAdmin() as any;

  const { data: application, error: applicationError } = await admin
    .from('tender_applications')
    .select('id, company_id')
    .eq('id', args.applicationId)
    .maybeSingle();
  if (applicationError) throw new Error(applicationError.message);
  if (!application) return { error: 'Pratica non trovata.' as const };

  const { data: assignment, error: assignmentError } = await admin
    .from('consultant_practice_assignments')
    .select('consultant_profile_id, status')
    .eq('application_id', args.applicationId)
    .eq('status', 'active')
    .maybeSingle();
  if (assignmentError && !isMissingTable(assignmentError, 'consultant_practice_assignments')) {
    throw new Error(assignmentError.message);
  }

  const companyId = String(application.company_id);
  const threadId = await ensurePracticeThreadForApplication({ applicationId: args.applicationId, companyId });
  let effectiveConsultantProfileId: string | null = assignment?.consultant_profile_id ?? null;

  if (!effectiveConsultantProfileId && assignmentError && isMissingTable(assignmentError, 'consultant_practice_assignments')) {
    const { data: participants } = await admin
      .from('consultant_thread_participants')
      .select('profile_id, created_at')
      .eq('thread_id', threadId)
      .eq('participant_role', 'consultant')
      .order('created_at', { ascending: false })
      .limit(1);
    const selected = (participants ?? [])[0] as { profile_id?: string } | undefined;
    if (selected?.profile_id) {
      effectiveConsultantProfileId = selected.profile_id;
    }
  }

  if (args.profileRole === 'consultant' && effectiveConsultantProfileId !== args.profileId) {
    return { error: 'Pratica non assegnata al consulente corrente.' as const };
  }

  const { data: clientProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'client_admin')
    .limit(1)
    .maybeSingle();

  await ensurePracticeThreadParticipants({
    threadId,
    clientProfileId: clientProfile?.id ?? null,
    consultantProfileId: effectiveConsultantProfileId ?? (args.profileRole === 'consultant' ? args.profileId : null),
    opsProfileId: args.profileRole === 'ops_admin' ? args.profileId : null,
  });

  return { threadId, companyId };
}

async function listMessagesCompat(args: { admin: any; threadId: string; limit: number }) {
  const { admin, threadId, limit } = args;
  const practiceMessages = await admin
    .from('consultant_practice_messages')
    .select('id, thread_id, sender_profile_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!practiceMessages.error) {
    return { rows: practiceMessages.data ?? [] };
  }
  if (!isMissingTable(practiceMessages.error, 'consultant_practice_messages')) {
    throw new Error(practiceMessages.error.message);
  }

  const legacyMessages = await admin
    .from('consultant_messages')
    .select('id, thread_id, sender_profile_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (legacyMessages.error) throw new Error(legacyMessages.error.message);
  return { rows: legacyMessages.data ?? [] };
}

async function insertMessageCompat(args: { admin: any; threadId: string; profileId: string; body: string }) {
  const { admin, threadId, profileId, body } = args;
  const practiceInsert = await admin
    .from('consultant_practice_messages')
    .insert({
      thread_id: threadId,
      sender_profile_id: profileId,
      body
    })
    .select('id, thread_id, sender_profile_id, body, created_at')
    .single();

  if (!practiceInsert.error) return practiceInsert.data;
  if (!isMissingTable(practiceInsert.error, 'consultant_practice_messages')) {
    throw new Error(practiceInsert.error.message);
  }

  const legacyInsert = await admin
    .from('consultant_messages')
    .insert({
      thread_id: threadId,
      sender_profile_id: profileId,
      body
    })
    .select('id, thread_id, sender_profile_id, body, created_at')
    .single();
  if (legacyInsert.error) throw new Error(legacyInsert.error.message);
  return legacyInsert.data;
}

export async function GET(
  request: Request,
  { params }: { params: { applicationId: string } }
) {
  const parsedParams = ParamsSchema.safeParse(params);
  if (!parsedParams.success) return NextResponse.json({ error: 'ApplicationId non valido.' }, { status: 422 });

  const parsedQuery = QuerySchema.safeParse({
    limit: new URL(request.url).searchParams.get('limit') ?? undefined,
  });
  if (!parsedQuery.success) return NextResponse.json({ error: 'Parametri non validi.' }, { status: 422 });

  const { profile } = await requireOpsOrConsultantProfile();

  try {
    const resolved = await resolveThread({
      applicationId: parsedParams.data.applicationId,
      profileId: profile.id,
      profileRole: profile.role,
    });
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: 403 });

    const admin = getSupabaseAdmin() as any;
    const data = await listMessagesCompat({
      admin,
      threadId: resolved.threadId,
      limit: parsedQuery.data.limit ?? 150
    });
    return NextResponse.json({ rows: data.rows ?? [] });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Errore caricamento messaggi pratica.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { applicationId: string } }
) {
  const parsedParams = ParamsSchema.safeParse(params);
  if (!parsedParams.success) return NextResponse.json({ error: 'ApplicationId non valido.' }, { status: 422 });

  const parsedBody = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: 'Messaggio non valido.' }, { status: 422 });

  const { profile } = await requireOpsOrConsultantProfile();

  try {
    const resolved = await resolveThread({
      applicationId: parsedParams.data.applicationId,
      profileId: profile.id,
      profileRole: profile.role,
    });
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: 403 });

    const admin = getSupabaseAdmin() as any;
    const data = await insertMessageCompat({
      admin,
      threadId: resolved.threadId,
      profileId: profile.id,
      body: parsedBody.data.body
    });

    await logPlatformEvent({
      eventType: 'consultant_practice_message_sent',
      actorProfileId: profile.id,
      actorRole: profile.role,
      companyId: resolved.companyId,
      applicationId: parsedParams.data.applicationId,
      channel: 'consultant',
      metadata: {
        messageLength: parsedBody.data.body.length,
        preview: parsedBody.data.body.slice(0, 180),
        threadId: resolved.threadId
      },
    });

    return NextResponse.json({ ok: true, row: data }, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Errore invio messaggio pratica.' },
      { status: 500 }
    );
  }
}
