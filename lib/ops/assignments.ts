import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type AssignmentRecord = {
  id: string;
  application_id: string;
  company_id: string;
  consultant_profile_id: string;
  assigned_by_profile_id: string | null;
  status: 'active' | 'reassigned' | 'unassigned';
  note: string | null;
  assigned_at: string;
  unassigned_at: string | null;
};

export async function getActiveAssignmentByApplication(applicationId: string) {
  const admin = getSupabaseAdmin() as any;
  const { data } = await admin
    .from('consultant_practice_assignments')
    .select('*')
    .eq('application_id', applicationId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as AssignmentRecord | null) ?? null;
}

export async function upsertActiveAssignment(args: {
  applicationId: string;
  companyId: string;
  consultantProfileId: string;
  actorProfileId?: string | null;
  note?: string | null;
}) {
  const admin = getSupabaseAdmin() as any;
  const existing = await getActiveAssignmentByApplication(args.applicationId);
  if (existing && existing.consultant_profile_id === args.consultantProfileId) {
    return existing;
  }

  if (existing) {
    await admin
      .from('consultant_practice_assignments')
      .update({
        status: 'reassigned',
        unassigned_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  }

  const { data, error } = await admin
    .from('consultant_practice_assignments')
    .insert({
      application_id: args.applicationId,
      company_id: args.companyId,
      consultant_profile_id: args.consultantProfileId,
      assigned_by_profile_id: args.actorProfileId ?? null,
      note: args.note ?? null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AssignmentRecord;
}

export async function ensurePracticeThreadForApplication(args: {
  applicationId: string;
  companyId: string;
}) {
  const admin = getSupabaseAdmin() as any;
  const { data: existing } = await admin
    .from('consultant_practice_threads')
    .select('id')
    .eq('application_id', args.applicationId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await admin
    .from('consultant_practice_threads')
    .insert({
      application_id: args.applicationId,
      company_id: args.companyId,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function ensurePracticeThreadParticipants(args: {
  threadId: string;
  clientProfileId?: string | null;
  consultantProfileId?: string | null;
  opsProfileId?: string | null;
}) {
  const admin = getSupabaseAdmin() as any;
  const rows: Array<{ thread_id: string; profile_id: string; participant_role: 'client_admin' | 'consultant' | 'ops_admin' }> = [];
  if (args.clientProfileId) rows.push({ thread_id: args.threadId, profile_id: args.clientProfileId, participant_role: 'client_admin' });
  if (args.consultantProfileId) rows.push({ thread_id: args.threadId, profile_id: args.consultantProfileId, participant_role: 'consultant' });
  if (args.opsProfileId) rows.push({ thread_id: args.threadId, profile_id: args.opsProfileId, participant_role: 'ops_admin' });
  if (rows.length === 0) return;
  await admin.from('consultant_practice_thread_participants').upsert(rows, { onConflict: 'thread_id,profile_id' });
}

