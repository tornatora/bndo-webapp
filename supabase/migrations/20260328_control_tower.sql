do $$
begin
  if exists (
    select 1
    from pg_type t
    where t.typname = 'app_role'
  ) then
    execute 'alter type public.app_role add value if not exists ''consultant''';
    execute 'alter type public.app_role add value if not exists ''ops_admin''';
  end if;
exception
  when duplicate_object then
    null;
end
$$;

create or replace function public.is_ops_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'ops_admin'
  );
$$;

create or replace function public.is_assigned_consultant(target_application uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  assigned boolean := false;
begin
  if to_regclass('public.consultant_practice_assignments') is null then
    return false;
  end if;

  execute $query$
    select exists (
      select 1
      from public.consultant_practice_assignments cpa
      where cpa.application_id = $1
        and cpa.consultant_profile_id = auth.uid()
        and cpa.status = 'active'
    )
  $query$
  into assigned
  using target_application;

  return coalesce(assigned, false);
end;
$$;

create table if not exists public.consultant_practice_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tender_applications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  consultant_profile_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'reassigned', 'unassigned')),
  note text,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_consultant_practice_assignments_application_active
  on public.consultant_practice_assignments(application_id)
  where status = 'active';
create index if not exists idx_consultant_practice_assignments_consultant_status
  on public.consultant_practice_assignments(consultant_profile_id, status, assigned_at desc);
create index if not exists idx_consultant_practice_assignments_company
  on public.consultant_practice_assignments(company_id, status);

drop trigger if exists trg_consultant_practice_assignments_updated_at on public.consultant_practice_assignments;
create trigger trg_consultant_practice_assignments_updated_at
before update on public.consultant_practice_assignments
for each row
execute function public.handle_updated_at();

create table if not exists public.consultant_practice_threads (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.tender_applications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.consultant_practice_thread_participants (
  thread_id uuid not null references public.consultant_practice_threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  participant_role text not null check (participant_role in ('client_admin', 'consultant', 'ops_admin')),
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

create table if not exists public.consultant_practice_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.consultant_practice_threads(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_consultant_practice_messages_thread_created
  on public.consultant_practice_messages(thread_id, created_at desc);

create table if not exists public.practice_payment_ledger (
  id uuid primary key default gen_random_uuid(),
  practice_payment_id uuid references public.practice_payments(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  application_id uuid references public.tender_applications(id) on delete set null,
  consultant_profile_id uuid references public.profiles(id) on delete set null,
  entry_type text not null check (entry_type in ('client_payment', 'refund', 'consultant_payout', 'platform_fee', 'manual_adjustment')),
  direction text not null check (direction in ('in', 'out')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'posted' check (status in ('pending', 'posted', 'voided')),
  source text not null default 'system' check (source in ('stripe', 'admin', 'system')),
  reference text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_practice_payment_ledger_company_occurred
  on public.practice_payment_ledger(company_id, occurred_at desc);
create index if not exists idx_practice_payment_ledger_application_occurred
  on public.practice_payment_ledger(application_id, occurred_at desc);
create index if not exists idx_practice_payment_ledger_consultant_occurred
  on public.practice_payment_ledger(consultant_profile_id, occurred_at desc);
create index if not exists idx_practice_payment_ledger_entry_type
  on public.practice_payment_ledger(entry_type, status, occurred_at desc);

create table if not exists public.consultant_payouts (
  id uuid primary key default gen_random_uuid(),
  consultant_profile_id uuid not null references public.profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  consultant_share_cents integer not null check (consultant_share_cents >= 0),
  platform_share_cents integer not null check (platform_share_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_consultant_payouts_consultant_status_period
  on public.consultant_payouts(consultant_profile_id, status, period_end desc);

drop trigger if exists trg_consultant_payouts_updated_at on public.consultant_payouts;
create trigger trg_consultant_payouts_updated_at
before update on public.consultant_payouts
for each row
execute function public.handle_updated_at();

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  company_id uuid references public.companies(id) on delete set null,
  application_id uuid references public.tender_applications(id) on delete set null,
  session_id text,
  page_path text,
  channel text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_events_type_created
  on public.platform_events(event_type, created_at desc);
create index if not exists idx_platform_events_session_created
  on public.platform_events(session_id, created_at desc);
create index if not exists idx_platform_events_company_created
  on public.platform_events(company_id, created_at desc);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  target_type text,
  target_id text,
  company_id uuid references public.companies(id) on delete set null,
  application_id uuid references public.tender_applications(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_action_created
  on public.admin_audit_logs(action_type, created_at desc);
create index if not exists idx_admin_audit_logs_company_created
  on public.admin_audit_logs(company_id, created_at desc);

alter table if exists public.consultant_practice_assignments enable row level security;
alter table if exists public.consultant_practice_threads enable row level security;
alter table if exists public.consultant_practice_thread_participants enable row level security;
alter table if exists public.consultant_practice_messages enable row level security;
alter table if exists public.practice_payment_ledger enable row level security;
alter table if exists public.consultant_payouts enable row level security;
alter table if exists public.platform_events enable row level security;
alter table if exists public.admin_audit_logs enable row level security;

drop policy if exists "consultant practice assignments select" on public.consultant_practice_assignments;
create policy "consultant practice assignments select"
on public.consultant_practice_assignments
for select
using (public.is_ops_admin_user() or consultant_profile_id = auth.uid());

drop policy if exists "consultant practice assignments manage admin" on public.consultant_practice_assignments;
create policy "consultant practice assignments manage admin"
on public.consultant_practice_assignments
for all
using (public.is_ops_admin_user())
with check (public.is_ops_admin_user());

drop policy if exists "consultant practice threads select" on public.consultant_practice_threads;
create policy "consultant practice threads select"
on public.consultant_practice_threads
for select
using (
  public.is_ops_admin_user()
  or public.is_assigned_consultant(application_id)
  or exists (
    select 1
    from public.tender_applications ta
    where ta.id = consultant_practice_threads.application_id
      and public.is_company_member(ta.company_id)
  )
);

drop policy if exists "consultant practice threads insert" on public.consultant_practice_threads;
create policy "consultant practice threads insert"
on public.consultant_practice_threads
for insert
with check (
  public.is_ops_admin_user()
  or public.is_assigned_consultant(application_id)
  or exists (
    select 1
    from public.tender_applications ta
    where ta.id = consultant_practice_threads.application_id
      and public.is_company_member(ta.company_id)
  )
);

drop policy if exists "consultant practice participants select" on public.consultant_practice_thread_participants;
create policy "consultant practice participants select"
on public.consultant_practice_thread_participants
for select
using (
  public.is_ops_admin_user()
  or profile_id = auth.uid()
  or exists (
    select 1
    from public.consultant_practice_threads cpt
    where cpt.id = consultant_practice_thread_participants.thread_id
      and public.is_assigned_consultant(cpt.application_id)
  )
);

drop policy if exists "consultant practice participants insert" on public.consultant_practice_thread_participants;
create policy "consultant practice participants insert"
on public.consultant_practice_thread_participants
for insert
with check (
  public.is_ops_admin_user()
  or profile_id = auth.uid()
);

drop policy if exists "consultant practice messages select" on public.consultant_practice_messages;
create policy "consultant practice messages select"
on public.consultant_practice_messages
for select
using (
  public.is_ops_admin_user()
  or exists (
    select 1
    from public.consultant_practice_threads cpt
    where cpt.id = consultant_practice_messages.thread_id
      and (
        public.is_assigned_consultant(cpt.application_id)
        or exists (
          select 1
          from public.tender_applications ta
          where ta.id = cpt.application_id
            and public.is_company_member(ta.company_id)
        )
      )
  )
);

drop policy if exists "consultant practice messages insert" on public.consultant_practice_messages;
create policy "consultant practice messages insert"
on public.consultant_practice_messages
for insert
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.consultant_practice_threads cpt
    where cpt.id = consultant_practice_messages.thread_id
      and (
        public.is_ops_admin_user()
        or public.is_assigned_consultant(cpt.application_id)
        or exists (
          select 1
          from public.tender_applications ta
          where ta.id = cpt.application_id
            and public.is_company_member(ta.company_id)
        )
      )
  )
);

drop policy if exists "practice payment ledger select" on public.practice_payment_ledger;
create policy "practice payment ledger select"
on public.practice_payment_ledger
for select
using (public.is_ops_admin_user() or consultant_profile_id = auth.uid());

drop policy if exists "practice payment ledger manage admin" on public.practice_payment_ledger;
create policy "practice payment ledger manage admin"
on public.practice_payment_ledger
for all
using (public.is_ops_admin_user())
with check (public.is_ops_admin_user());

drop policy if exists "consultant payouts select" on public.consultant_payouts;
create policy "consultant payouts select"
on public.consultant_payouts
for select
using (public.is_ops_admin_user() or consultant_profile_id = auth.uid());

drop policy if exists "consultant payouts manage admin" on public.consultant_payouts;
create policy "consultant payouts manage admin"
on public.consultant_payouts
for all
using (public.is_ops_admin_user())
with check (public.is_ops_admin_user());

drop policy if exists "platform events select admin" on public.platform_events;
create policy "platform events select admin"
on public.platform_events
for select
using (public.is_ops_admin_user());

drop policy if exists "platform events insert service_or_admin" on public.platform_events;
create policy "platform events insert service_or_admin"
on public.platform_events
for insert
with check (auth.role() = 'service_role' or public.is_ops_admin_user());

drop policy if exists "admin audit logs select admin" on public.admin_audit_logs;
create policy "admin audit logs select admin"
on public.admin_audit_logs
for select
using (public.is_ops_admin_user());

drop policy if exists "admin audit logs insert service_or_admin" on public.admin_audit_logs;
create policy "admin audit logs insert service_or_admin"
on public.admin_audit_logs
for insert
with check (auth.role() = 'service_role' or public.is_ops_admin_user());
