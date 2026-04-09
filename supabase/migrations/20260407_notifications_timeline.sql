-- Unified notifications inbox + tasks (Admin/Consultant/Client)

create table if not exists public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('client_admin', 'consultant', 'ops_admin')),
  event_type text not null,
  event_group text not null check (event_group in ('lead_quiz', 'pratiche', 'documenti', 'pagamenti', 'chat', 'consulenti', 'sistema')),
  priority text not null default 'high' check (priority in ('high', 'medium')),
  title text not null,
  body text not null,
  entity_type text,
  entity_id text,
  company_id uuid references public.companies(id) on delete set null,
  application_id uuid references public.tender_applications(id) on delete set null,
  thread_id uuid references public.consultant_threads(id) on delete set null,
  action_path text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_tasks (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notification_inbox(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_to_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  title text not null,
  description text,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_inbox_recipient_created
  on public.notification_inbox(recipient_profile_id, created_at desc);
create index if not exists idx_notification_inbox_unread
  on public.notification_inbox(recipient_profile_id, read_at, created_at desc);
create index if not exists idx_notification_inbox_group_created
  on public.notification_inbox(event_group, created_at desc);
create index if not exists idx_notification_tasks_assigned_status
  on public.notification_tasks(assigned_to_profile_id, status, created_at desc);
create unique index if not exists idx_notification_inbox_dedupe
  on public.notification_inbox(recipient_profile_id, dedupe_key)
  where dedupe_key is not null;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin_user()
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
      and p.role = 'ops_admin'
  );
$$;

drop trigger if exists trg_notification_tasks_updated_at on public.notification_tasks;
create trigger trg_notification_tasks_updated_at
before update on public.notification_tasks
for each row
execute function public.handle_updated_at();

alter table if exists public.notification_inbox enable row level security;
alter table if exists public.notification_tasks enable row level security;

drop policy if exists "notification_inbox_select_recipient_or_ops" on public.notification_inbox;
create policy "notification_inbox_select_recipient_or_ops"
on public.notification_inbox
for select
using (recipient_profile_id = auth.uid() or public.is_admin_user());

drop policy if exists "notification_inbox_insert_service_or_ops" on public.notification_inbox;
create policy "notification_inbox_insert_service_or_ops"
on public.notification_inbox
for insert
with check (auth.role() = 'service_role' or public.is_admin_user());

drop policy if exists "notification_inbox_update_recipient_or_ops" on public.notification_inbox;
create policy "notification_inbox_update_recipient_or_ops"
on public.notification_inbox
for update
using (recipient_profile_id = auth.uid() or public.is_admin_user())
with check (recipient_profile_id = auth.uid() or public.is_admin_user());

drop policy if exists "notification_tasks_select_member_or_ops" on public.notification_tasks;
create policy "notification_tasks_select_member_or_ops"
on public.notification_tasks
for select
using (
  assigned_to_profile_id = auth.uid()
  or created_by_profile_id = auth.uid()
  or public.is_admin_user()
);

drop policy if exists "notification_tasks_insert_member_or_ops" on public.notification_tasks;
create policy "notification_tasks_insert_member_or_ops"
on public.notification_tasks
for insert
with check (
  auth.role() = 'service_role'
  or created_by_profile_id = auth.uid()
  or public.is_admin_user()
);

drop policy if exists "notification_tasks_update_member_or_ops" on public.notification_tasks;
create policy "notification_tasks_update_member_or_ops"
on public.notification_tasks
for update
using (
  assigned_to_profile_id = auth.uid()
  or created_by_profile_id = auth.uid()
  or public.is_admin_user()
)
with check (
  assigned_to_profile_id = auth.uid()
  or created_by_profile_id = auth.uid()
  or public.is_admin_user()
);
