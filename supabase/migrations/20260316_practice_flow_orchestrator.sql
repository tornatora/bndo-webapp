-- Practice flow orchestrator: dynamic quiz templates, submissions, requirements.

alter table public.tenders
  add column if not exists external_grant_id text,
  add column if not exists grant_slug text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_tenders_external_grant_id_unique
  on public.tenders (external_grant_id)
  where external_grant_id is not null;

create unique index if not exists idx_tenders_grant_slug_unique
  on public.tenders (grant_slug)
  where grant_slug is not null;

alter table public.application_documents
  add column if not exists requirement_key text;

create index if not exists idx_application_documents_application_requirement
  on public.application_documents (application_id, requirement_key);

create table if not exists public.practice_quiz_templates (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tender_applications(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  grant_external_id text,
  grant_slug text,
  grant_title text not null,
  source_channel text not null check (source_channel in ('scanner', 'chat', 'direct', 'admin')),
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id)
);

create table if not exists public.practice_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.practice_quiz_templates(id) on delete cascade,
  sort_order integer not null default 0,
  question_key text not null,
  label text not null,
  description text,
  question_type text not null check (question_type in ('single_select', 'boolean', 'text', 'number')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default true,
  validation jsonb not null default '{}'::jsonb,
  rule jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (template_id, question_key)
);

create table if not exists public.practice_quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.practice_quiz_templates(id) on delete cascade,
  application_id uuid not null references public.tender_applications(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_channel text not null check (source_channel in ('scanner', 'chat', 'direct', 'admin')),
  eligibility text not null check (eligibility in ('eligible', 'not_eligible', 'needs_review')),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.practice_document_requirements (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tender_applications(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  requirement_key text not null,
  label text not null,
  description text,
  is_required boolean not null default true,
  status text not null default 'missing' check (status in ('missing', 'uploaded', 'waived')),
  source_channel text not null check (source_channel in ('scanner', 'chat', 'direct', 'admin')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, requirement_key)
);

create index if not exists idx_practice_quiz_templates_application on public.practice_quiz_templates(application_id);
create index if not exists idx_practice_quiz_templates_grant on public.practice_quiz_templates(grant_external_id, grant_slug);
create index if not exists idx_practice_quiz_questions_template on public.practice_quiz_questions(template_id, sort_order);
create index if not exists idx_practice_quiz_submissions_application_created on public.practice_quiz_submissions(application_id, created_at desc);
create index if not exists idx_practice_quiz_submissions_company on public.practice_quiz_submissions(company_id, created_at desc);
create index if not exists idx_practice_document_requirements_application on public.practice_document_requirements(application_id, created_at asc);

drop trigger if exists trg_practice_quiz_templates_updated_at on public.practice_quiz_templates;
create trigger trg_practice_quiz_templates_updated_at
before update on public.practice_quiz_templates
for each row
execute function public.handle_updated_at();

drop trigger if exists trg_practice_document_requirements_updated_at on public.practice_document_requirements;
create trigger trg_practice_document_requirements_updated_at
before update on public.practice_document_requirements
for each row
execute function public.handle_updated_at();

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('message', 'quiz_submission', 'system')),
  title text not null,
  body text not null,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_notifications_read_created
  on public.admin_notifications (read_at, created_at desc);

alter table public.admin_notifications enable row level security;
alter table public.practice_quiz_templates enable row level security;
alter table public.practice_quiz_questions enable row level security;
alter table public.practice_quiz_submissions enable row level security;
alter table public.practice_document_requirements enable row level security;

drop policy if exists "Enable read for ops users" on public.admin_notifications;
drop policy if exists "Service role can insert" on public.admin_notifications;

drop policy if exists "admin_notifications_select_ops" on public.admin_notifications;
create policy "admin_notifications_select_ops"
on public.admin_notifications
for select
using (public.is_ops_user());

drop policy if exists "admin_notifications_update_ops" on public.admin_notifications;
create policy "admin_notifications_update_ops"
on public.admin_notifications
for update
using (public.is_ops_user())
with check (public.is_ops_user());

drop policy if exists "admin_notifications_insert_service_or_ops" on public.admin_notifications;
create policy "admin_notifications_insert_service_or_ops"
on public.admin_notifications
for insert
with check (auth.role() = 'service_role' or public.is_ops_user());

drop policy if exists "practice_quiz_templates_select_member" on public.practice_quiz_templates;
create policy "practice_quiz_templates_select_member"
on public.practice_quiz_templates
for select
using (
  public.is_ops_user()
  or exists (
    select 1
    from public.tender_applications ta
    where ta.id = practice_quiz_templates.application_id
      and public.is_company_member(ta.company_id)
  )
);

drop policy if exists "practice_quiz_questions_select_member" on public.practice_quiz_questions;
create policy "practice_quiz_questions_select_member"
on public.practice_quiz_questions
for select
using (
  public.is_ops_user()
  or exists (
    select 1
    from public.practice_quiz_templates pqt
    join public.tender_applications ta on ta.id = pqt.application_id
    where pqt.id = practice_quiz_questions.template_id
      and public.is_company_member(ta.company_id)
  )
);

drop policy if exists "practice_quiz_submissions_select_member" on public.practice_quiz_submissions;
create policy "practice_quiz_submissions_select_member"
on public.practice_quiz_submissions
for select
using (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "practice_quiz_submissions_insert_member" on public.practice_quiz_submissions;
create policy "practice_quiz_submissions_insert_member"
on public.practice_quiz_submissions
for insert
with check (
  auth.role() = 'service_role'
  or (user_id = auth.uid() and public.is_company_member(company_id))
);

drop policy if exists "practice_document_requirements_select_member" on public.practice_document_requirements;
create policy "practice_document_requirements_select_member"
on public.practice_document_requirements
for select
using (
  public.is_ops_user()
  or exists (
    select 1
    from public.tender_applications ta
    where ta.id = practice_document_requirements.application_id
      and public.is_company_member(ta.company_id)
  )
);

drop policy if exists "practice_document_requirements_insert_service_or_ops" on public.practice_document_requirements;
create policy "practice_document_requirements_insert_service_or_ops"
on public.practice_document_requirements
for insert
with check (auth.role() = 'service_role' or public.is_ops_user());

drop policy if exists "practice_document_requirements_update_service_or_ops" on public.practice_document_requirements;
create policy "practice_document_requirements_update_service_or_ops"
on public.practice_document_requirements
for update
using (auth.role() = 'service_role' or public.is_ops_user())
with check (auth.role() = 'service_role' or public.is_ops_user());
