import { ensurePracticeThreadForApplication, ensurePracticeThreadParticipants } from '@/lib/ops/assignments';
import { isMissingTable } from '@/lib/ops/dbErrorGuards';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ResolvePracticeAccessArgs = {
  applicationId: string;
  profileId: string;
  profileRole: string;
};

export type ResolvedConsultantPracticeContext =
  | {
      ok: true;
      applicationId: string;
      companyId: string;
      tenderId: string | null;
      threadId: string;
      consultantProfileId: string | null;
      clientProfileId: string | null;
      compatibilityMode: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function resolveConsultantPracticeContext(
  args: ResolvePracticeAccessArgs
): Promise<ResolvedConsultantPracticeContext> {
  const admin = getSupabaseAdmin() as any;

  const { data: application, error: applicationError } = await admin
    .from('tender_applications')
    .select('id, company_id, tender_id')
    .eq('id', args.applicationId)
    .maybeSingle();
  if (applicationError) throw new Error(applicationError.message);
  if (!application) {
    return { ok: false, status: 404, error: 'Pratica non trovata.' };
  }

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
  const threadId = await ensurePracticeThreadForApplication({
    applicationId: args.applicationId,
    companyId
  });

  const compatibilityMode = Boolean(assignmentError && isMissingTable(assignmentError, 'consultant_practice_assignments'));
  let effectiveConsultantProfileId: string | null =
    typeof assignment?.consultant_profile_id === 'string' ? assignment.consultant_profile_id : null;

  if (!effectiveConsultantProfileId) {
    const { data: consultantParticipants, error: participantError } = await admin
      .from('consultant_thread_participants')
      .select('profile_id, created_at')
      .eq('thread_id', threadId)
      .eq('participant_role', 'consultant')
      .order('created_at', { ascending: false })
      .limit(1);
    if (participantError) throw new Error(participantError.message);
    const selected = (consultantParticipants ?? [])[0] as { profile_id?: string } | undefined;
    if (selected?.profile_id) {
      effectiveConsultantProfileId = selected.profile_id;
    }
  }

  if (args.profileRole === 'consultant') {
    if (effectiveConsultantProfileId && effectiveConsultantProfileId !== args.profileId) {
      return { ok: false, status: 403, error: 'Pratica non assegnata al consulente corrente.' };
    }
    if (!effectiveConsultantProfileId) {
      const { data: directParticipant, error: directParticipantError } = await admin
        .from('consultant_thread_participants')
        .select('profile_id')
        .eq('thread_id', threadId)
        .eq('participant_role', 'consultant')
        .eq('profile_id', args.profileId)
        .maybeSingle();
      if (directParticipantError) throw new Error(directParticipantError.message);
      if (!directParticipant?.profile_id) {
        return { ok: false, status: 403, error: 'Pratica non assegnata al consulente corrente.' };
      }
      effectiveConsultantProfileId = args.profileId;
    }
  }

  const { data: clientProfile, error: clientProfileError } = await admin
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'client_admin')
    .limit(1)
    .maybeSingle();
  if (clientProfileError) throw new Error(clientProfileError.message);

  await ensurePracticeThreadParticipants({
    threadId,
    clientProfileId: clientProfile?.id ?? null,
    consultantProfileId: effectiveConsultantProfileId ?? (args.profileRole === 'consultant' ? args.profileId : null),
    opsProfileId: args.profileRole === 'ops_admin' ? args.profileId : null
  });

  return {
    ok: true,
    applicationId: args.applicationId,
    companyId,
    tenderId: typeof application.tender_id === 'string' ? application.tender_id : null,
    threadId,
    consultantProfileId: effectiveConsultantProfileId,
    clientProfileId: clientProfile?.id ?? null,
    compatibilityMode
  };
}
