import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsOrConsultantProfile } from '@/lib/auth';
import { ensurePracticeThreadForApplication, ensurePracticeThreadParticipants } from '@/lib/ops/assignments';
import { logPlatformEvent } from '@/lib/ops/telemetry';
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
  if (assignmentError) throw new Error(assignmentError.message);

  if (args.profileRole === 'consultant' && assignment?.consultant_profile_id !== args.profileId) {
    return { error: 'Pratica non assegnata al consulente corrente.' as const };
  }

  const companyId = String(application.company_id);
  const threadId = await ensurePracticeThreadForApplication({ applicationId: args.applicationId, companyId });
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
    consultantProfileId: assignment?.consultant_profile_id ?? (args.profileRole === 'consultant' ? args.profileId : null),
    opsProfileId: args.profileRole === 'ops_admin' ? args.profileId : null,
  });

  return { threadId, companyId };
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
    const { data, error } = await admin
      .from('consultant_practice_messages')
      .select('id, thread_id, sender_profile_id, body, created_at')
      .eq('thread_id', resolved.threadId)
      .order('created_at', { ascending: true })
      .limit(parsedQuery.data.limit ?? 150);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
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
    const { data, error } = await admin
      .from('consultant_practice_messages')
      .insert({
        thread_id: resolved.threadId,
        sender_profile_id: profile.id,
        body: parsedBody.data.body,
      })
      .select('id, thread_id, sender_profile_id, body, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logPlatformEvent({
      eventType: 'consultant_practice_message_sent',
      actorProfileId: profile.id,
      actorRole: profile.role,
      companyId: resolved.companyId,
      applicationId: parsedParams.data.applicationId,
      channel: 'consultant',
      metadata: {
        messageLength: parsedBody.data.body.length,
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
