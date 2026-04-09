import { headers } from 'next/headers';
import type { Json } from '@/lib/supabase/database.types';
import { emitNotificationEvent } from '@/lib/notifications/engine';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { redactJson } from '@/lib/ops/redaction';

type EventPayload = {
  eventType: string;
  actorProfileId?: string | null;
  actorRole?: string | null;
  companyId?: string | null;
  applicationId?: string | null;
  sessionId?: string | null;
  pagePath?: string | null;
  channel?: string | null;
  metadata?: Json;
};

function getSessionIdFallback() {
  try {
    const h = headers();
    const forwarded = h.get('x-forwarded-for') ?? '';
    const ua = h.get('user-agent') ?? '';
    const basis = `${forwarded.slice(0, 64)}|${ua.slice(0, 64)}`;
    return basis || null;
  } catch {
    return null;
  }
}

export async function logPlatformEvent(payload: EventPayload) {
  try {
    const admin = getSupabaseAdmin() as any;
    await admin.from('platform_events').insert({
      event_type: payload.eventType,
      actor_profile_id: payload.actorProfileId ?? null,
      actor_role: payload.actorRole ?? null,
      company_id: payload.companyId ?? null,
      application_id: payload.applicationId ?? null,
      session_id: payload.sessionId ?? getSessionIdFallback(),
      page_path: payload.pagePath ?? null,
      channel: payload.channel ?? null,
      metadata: redactJson(payload.metadata ?? {}),
    });

    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    if (payload.eventType === 'quiz_completed') {
      void emitNotificationEvent({
        eventType: 'quiz_completed',
        actorProfileId: payload.actorProfileId ?? null,
        actorRole: (payload.actorRole as any) ?? null,
        companyId: payload.companyId ?? null,
        applicationId: payload.applicationId ?? null,
        metadata: payload.metadata ?? {}
      });
    } else if (payload.eventType === 'practice_created') {
      void emitNotificationEvent({
        eventType: 'practice_created',
        actorProfileId: payload.actorProfileId ?? null,
        actorRole: (payload.actorRole as any) ?? null,
        companyId: payload.companyId ?? null,
        applicationId: payload.applicationId ?? null,
        metadata: payload.metadata ?? {}
      });
    } else if (payload.eventType === 'assignment_updated') {
      void emitNotificationEvent({
        eventType: 'assignment_updated',
        actorProfileId: payload.actorProfileId ?? null,
        actorRole: (payload.actorRole as any) ?? null,
        companyId: payload.companyId ?? null,
        applicationId: payload.applicationId ?? null,
        consultantProfileId: typeof metadata.consultantProfileId === 'string' ? metadata.consultantProfileId : null,
        metadata: payload.metadata ?? {}
      });
    } else if (payload.eventType === 'consultant_practice_message_sent') {
      void emitNotificationEvent({
        eventType: 'chat_message_new',
        actorProfileId: payload.actorProfileId ?? null,
        actorRole: (payload.actorRole as any) ?? null,
        companyId: payload.companyId ?? null,
        applicationId: payload.applicationId ?? null,
        threadId: typeof metadata.threadId === 'string' ? metadata.threadId : null,
        messagePreview: typeof metadata.preview === 'string' ? metadata.preview : null,
        metadata: payload.metadata ?? {}
      });
    }
  } catch {
    // Best effort only.
  }
}
