import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';

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
  const { data, error } = await admin
    .from('consultant_practice_assignments')
    .select('*')
    .eq('application_id', applicationId)
    .eq('status', 'active')
    .maybeSingle();
  if (error && !isMissingTable(error, 'consultant_practice_assignments')) {
    throw new Error(error.message);
  }
  if (error && isMissingTable(error, 'consultant_practice_assignments')) {
    return null;
  }
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
  const { data: existing, error: existingError } = await admin
    .from('consultant_practice_threads')
    .select('id')
    .eq('application_id', args.applicationId)
    .maybeSingle();
  if (existingError && !isMissingTable(existingError, 'consultant_practice_threads')) {
    throw new Error(existingError.message);
  }
  if (!existingError && existing?.id) return existing.id as string;

  if (!existingError) {
    const { data, error } = await admin
      .from('consultant_practice_threads')
      .insert({
        application_id: args.applicationId,
        company_id: args.companyId,
      })
      .select('id')
      .single();
    if (!error) return data.id as string;
    if (!isMissingTable(error, 'consultant_practice_threads')) throw new Error(error.message);
  }

  // Compat fallback for environments where practice-scoped thread tables are not yet deployed.
  const { data: legacyThread, error: legacyThreadError } = await admin
    .from('consultant_threads')
    .select('id')
    .eq('company_id', args.companyId)
    .maybeSingle();
  if (legacyThreadError) throw new Error(legacyThreadError.message);
  if (legacyThread?.id) return legacyThread.id as string;

  const { data: createdLegacyThread, error: createdLegacyThreadError } = await admin
    .from('consultant_threads')
    .insert({
      company_id: args.companyId
    })
    .select('id')
    .single();
  if (createdLegacyThreadError) throw new Error(createdLegacyThreadError.message);
  return createdLegacyThread.id as string;
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
  const practiceParticipantResult = await admin
    .from('consultant_practice_thread_participants')
    .upsert(rows, { onConflict: 'thread_id,profile_id' });
  if (!practiceParticipantResult.error) return;
  if (!isMissingTable(practiceParticipantResult.error, 'consultant_practice_thread_participants')) {
    throw new Error(practiceParticipantResult.error.message);
  }

  await admin.from('consultant_thread_participants').upsert(
    rows.map((row) => ({
      ...row,
      last_read_at: new Date(0).toISOString()
    })),
    { onConflict: 'thread_id,profile_id' }
  );
}
