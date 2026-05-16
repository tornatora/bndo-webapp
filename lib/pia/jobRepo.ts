import type { PiaAutomationJobPhase, PiaAutomationJobProgress, PiaAutomationJobRow, PiaAutomationJobStatus } from './types';

function nowIso() {
  return new Date().toISOString();
}

export function withAppendedLog(
  progress: PiaAutomationJobProgress | null | undefined,
  entry: { level: 'info' | 'warn' | 'error'; msg: string }
) {
  const next: PiaAutomationJobProgress = { ...(progress ?? {}) };
  const logs = Array.isArray(next.logs) ? next.logs.slice(-79) : [];
  logs.push({ ts: nowIso(), level: entry.level, msg: entry.msg.slice(0, 400) });
  next.logs = logs;
  next.lastMessage = entry.msg.slice(0, 280);
  return next;
}

export async function getJobAdmin(supabaseAdmin: any, jobId: string): Promise<PiaAutomationJobRow | null> {
  const { data, error } = await supabaseAdmin.from('pia_automation_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PiaAutomationJobRow | null) ?? null;
}

export async function updateJobAdmin(
  supabaseAdmin: any,
  jobId: string,
  patch: Partial<{
    status: PiaAutomationJobStatus;
    phase: PiaAutomationJobPhase;
    cursor: number;
    progress: PiaAutomationJobProgress;
    error: string | null;
    browserbase_session_id: string | null;
  }>
) {
  const { error } = await supabaseAdmin.from('pia_automation_jobs').update(patch).eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function logJobAdmin(
  supabaseAdmin: any,
  job: PiaAutomationJobRow,
  entry: { level: 'info' | 'warn' | 'error'; msg: string },
  patch?: Partial<{ percent: number; status: PiaAutomationJobStatus; phase: PiaAutomationJobPhase; cursor: number }>
) {
  const progress = withAppendedLog(job.progress, entry);
  const nextPatch: any = { progress };
  if (patch?.percent !== undefined) progress.percent = patch.percent;
  if (patch?.status) nextPatch.status = patch.status;
  if (patch?.phase) nextPatch.phase = patch.phase;
  if (typeof patch?.cursor === 'number') nextPatch.cursor = patch.cursor;
  await updateJobAdmin(supabaseAdmin, job.id, nextPatch);
}
