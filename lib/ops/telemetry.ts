import { headers } from 'next/headers';
import type { Json } from '@/lib/supabase/database.types';
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
  } catch {
    // Best effort only.
  }
}
