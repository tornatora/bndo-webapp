import type { PiaAutomationJobPhase, PiaAutomationJobProgress, PiaAutomationJobRow, PiaAutomationJobStatus } from './types';

const JOB_BUCKET = 'application-documents';
const JOB_PREFIX = '_pia_jobs';

function nowIso() {
  return new Date().toISOString();
}

function toJobPath(jobId: string) {
  return `${JOB_PREFIX}/${jobId}.json`;
}

function assertJobId(jobId: string) {
  if (!jobId || !/^[a-f0-9-]{16,}$/i.test(jobId)) {
    throw new Error('jobId non valido');
  }
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

export async function createJob(
  supabaseAdmin: any,
  input: {
    applicationId: string;
    createdBy: string;
    browserbaseSessionId: string;
    phase?: PiaAutomationJobPhase;
    status?: PiaAutomationJobStatus;
    progress?: PiaAutomationJobProgress;
  }
) {
  const id = crypto.randomUUID();
  const ts = nowIso();
  const row: PiaAutomationJobRow = {
    id,
    application_id: input.applicationId,
    created_by: input.createdBy,
    browserbase_session_id: input.browserbaseSessionId,
    status: input.status ?? 'queued',
    phase: input.phase ?? 'bootstrap',
    cursor: 0,
    progress: input.progress ?? { percent: 0, lastMessage: 'Job creato.' },
    error: null,
    created_at: ts,
    updated_at: ts,
  };

  const { error } = await supabaseAdmin.storage
    .from(JOB_BUCKET)
    .upload(toJobPath(id), Buffer.from(JSON.stringify(row), 'utf8'), {
      contentType: 'application/json; charset=utf-8',
      upsert: true,
    });
  if (error) throw new Error(error.message);
  return row;
}

export async function getJob(supabaseAdmin: any, jobId: string): Promise<PiaAutomationJobRow | null> {
  assertJobId(jobId);
  const { data, error } = await supabaseAdmin.storage.from(JOB_BUCKET).download(toJobPath(jobId));
  if (error) {
    if ((error as any)?.statusCode === '404') return null;
    throw new Error(error.message);
  }
  const text = await data.text();
  const parsed = JSON.parse(text) as PiaAutomationJobRow;
  if (!parsed?.id) return null;
  return parsed;
}

export async function updateJob(
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
  const current = await getJob(supabaseAdmin, jobId);
  if (!current) throw new Error('Job non trovato');
  const next: PiaAutomationJobRow = {
    ...current,
    ...patch,
    updated_at: nowIso(),
  };
  const { error } = await supabaseAdmin.storage
    .from(JOB_BUCKET)
    .upload(toJobPath(jobId), Buffer.from(JSON.stringify(next), 'utf8'), {
      contentType: 'application/json; charset=utf-8',
      upsert: true,
    });
  if (error) throw new Error(error.message);
  return next;
}

export async function ensureJobAccessForUser(
  supabaseClient: any,
  job: PiaAutomationJobRow,
  userId: string
): Promise<boolean> {
  const { data: profile, error: pErr } = await supabaseClient
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .maybeSingle();
  if (pErr || !profile) return false;
  const role = String(profile.role || '').toLowerCase();
  if (role === 'ops_admin' || role === 'consultant') return true;
  if (!profile.company_id) return false;

  const { data: app } = await supabaseClient
    .from('tender_applications')
    .select('id')
    .eq('id', job.application_id)
    .eq('company_id', profile.company_id)
    .maybeSingle();
  return Boolean(app);
}
