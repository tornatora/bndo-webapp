-- PIA Automation Jobs
-- Tracks browser automation jobs for the Invitalia PIA portal.
-- Each job represents one automated compilation session.

create table if not exists public.pia_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tender_applications(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  browserbase_session_id text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_user', 'done', 'failed', 'stopped')),
  phase text not null default 'bootstrap'
    check (phase in (
      'spid_wait', 'bootstrap', 'form_fill', 'final_step_1',
      'format_download', 'waiting_signature', 'format_upload',
      'attachments', 'ready_to_submit'
    )),
  cursor integer not null default 0,
  progress jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_pia_automation_jobs_application
  on public.pia_automation_jobs(application_id);
create index if not exists idx_pia_automation_jobs_created_by
  on public.pia_automation_jobs(created_by);
create index if not exists idx_pia_automation_jobs_status
  on public.pia_automation_jobs(status);

-- Auto-update updated_at
create or replace function public.update_pia_automation_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pia_automation_jobs_updated_at
  on public.pia_automation_jobs;
create trigger trg_pia_automation_jobs_updated_at
  before update on public.pia_automation_jobs
  for each row
  execute function public.update_pia_automation_jobs_updated_at();

-- RLS
alter table public.pia_automation_jobs enable row level security;

-- Ops/admin can read all jobs
create policy "Ops can read all jobs"
  on public.pia_automation_jobs for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('ops_admin', 'consultant')
    )
  );

-- Users can read their own jobs
create policy "Users can read own jobs"
  on public.pia_automation_jobs for select
  using (
    exists (
      select 1 from public.tender_applications ta
      join public.companies c on c.id = ta.company_id
      join public.profiles p on p.company_id = c.id
      where ta.id = pia_automation_jobs.application_id
        and p.id = auth.uid()
    )
  );

-- Ops/admin can create jobs
create policy "Ops can create jobs"
  on public.pia_automation_jobs for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('ops_admin', 'consultant')
    )
  );

-- Ops/admin can update jobs
create policy "Ops can update jobs"
  on public.pia_automation_jobs for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('ops_admin', 'consultant')
    )
  );
