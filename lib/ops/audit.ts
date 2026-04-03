import type { Json } from '@/lib/supabase/database.types';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { redactJson } from '@/lib/ops/redaction';

type AuditPayload = {
  actionType: string;
  actorProfileId?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  companyId?: string | null;
  applicationId?: string | null;
  details?: Json;
};

export async function logAdminAudit(payload: AuditPayload) {
  try {
    const admin = getSupabaseAdmin() as any;
    await admin.from('admin_audit_logs').insert({
      action_type: payload.actionType,
      actor_profile_id: payload.actorProfileId ?? null,
      actor_role: payload.actorRole ?? null,
      target_type: payload.targetType ?? null,
      target_id: payload.targetId ?? null,
      company_id: payload.companyId ?? null,
      application_id: payload.applicationId ?? null,
      details: redactJson(payload.details ?? {}),
    });
  } catch {
    // Best-effort auditing: never break product flows if telemetry fails.
  }
}
