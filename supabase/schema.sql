-- Supabase schema for BidPilot (gare outsourcing)

create extension if not exists pgcrypto;

-- -----------------------------------------------------
-- Core tables
-- -----------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_number text,
  industry text,
  annual_spend_target numeric(14, 2),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  email text not null unique,
  full_name text not null,
  username text not null unique,
  role text not null check (role in ('client_admin', 'consultant', 'ops_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company_name text not null,
  phone text,
  challenge text,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  region text,
  bando_type text,
  eligibility text not null check (eligibility in ('eligible', 'not_eligible')),
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------
-- Admin CRM fields (internal-only)
-- -----------------------------------------------------

create table if not exists public.company_crm (
  company_id uuid primary key references public.companies(id) on delete cascade,
  internal_status text,
  priority text check (priority in ('bassa', 'media', 'alta')),
  tags text[] not null default '{}'::text[],
  admin_notes text not null default '',
  admin_fields jsonb not null default '{}'::jsonb,
  next_action_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------
-- Legal consent evidence (internal)
-- -----------------------------------------------------
create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  context text not null check (context in ('quiz', 'after_payment_onboarding')),
  email text not null,
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  application_id uuid references public.tender_applications(id) on delete set null,
  checkout_session_id text,
  quiz_submission_id uuid references public.quiz_submissions(id) on delete set null,
  consents jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_legal_consents_email on public.legal_consents (email);
create index if not exists idx_legal_consents_company on public.legal_consents (company_id);
create unique index if not exists idx_legal_consents_context_quiz on public.legal_consents (context, quiz_submission_id);
create unique index if not exists idx_legal_consents_context_checkout on public.legal_consents (context, checkout_session_id);

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null check (status in ('active', 'inactive', 'cancelled')),
  stripe_customer_id text,
  stripe_payment_intent_id text,
  checkout_session_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_credentials (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  temp_password text not null,
  emailed_at timestamptz,
  email_provider_message_id text,
  email_delivery_error text,
  first_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table if exists public.onboarding_credentials
  add column if not exists emailed_at timestamptz;

alter table if exists public.onboarding_credentials
  add column if not exists email_provider_message_id text;

alter table if exists public.onboarding_credentials
  add column if not exists email_delivery_error text;

create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  authority_name text not null,
  title text not null,
  cpv_code text,
  procurement_value numeric(14, 2),
  deadline_at timestamptz not null,
  summary text not null,
  dossier_url text,
  supplier_portal_url text,
  created_at timestamptz not null default now()
);

alter table public.tenders
  add column if not exists external_grant_id text,
  add column if not exists grant_slug text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.tender_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  relevance_score numeric(4, 3) not null check (relevance_score >= 0 and relevance_score <= 1),
  status text not null check (status in ('new', 'in_review', 'participating', 'submitted')) default 'new',
  created_at timestamptz not null default now(),
  unique (company_id, tender_id)
);

create table if not exists public.tender_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  status text not null check (status in ('draft', 'submitted', 'reviewed')) default 'draft',
  supplier_registry_status text not null check (supplier_registry_status in ('pending', 'in_progress', 'completed')) default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tender_id)
);

create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tender_applications(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  file_size integer not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table public.application_documents
  add column if not exists requirement_key text;

create table if not exists public.consultant_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (company_id)
);

create table if not exists public.consultant_thread_participants (
  thread_id uuid not null references public.consultant_threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  participant_role text not null check (participant_role in ('client_admin', 'consultant', 'ops_admin')),
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

create table if not exists public.consultant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.consultant_threads(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.scanner_dataset_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  version_hash text not null,
  fetched_at timestamptz not null default now(),
  is_active boolean not null default false,
  doc_count integer not null default 0,
  docs_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scanner_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'degraded', 'failed')),
  source_runs_json jsonb not null default '[]'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  alerts_json jsonb not null default '[]'::jsonb,
  dataset_version text,
  sources_total integer not null default 0,
  sources_ok integer not null default 0,
  sources_failed integer not null default 0,
  created_at timestamptz not null default now()
);

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
  eligibility text not null check (eligibility in ('eligible', 'likely_eligible', 'not_eligible', 'needs_review')),
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

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('message', 'quiz_submission', 'system')),
  title text not null,
  body text not null,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_profiles_company on public.profiles(company_id);
create index if not exists idx_quiz_submissions_created_at on public.quiz_submissions(created_at desc);
create unique index if not exists idx_tenders_external_grant_id_unique
  on public.tenders(external_grant_id)
  where external_grant_id is not null;
create unique index if not exists idx_tenders_grant_slug_unique
  on public.tenders(grant_slug)
  where grant_slug is not null;
create index if not exists idx_tender_matches_company on public.tender_matches(company_id);
create index if not exists idx_tender_applications_company on public.tender_applications(company_id);
create index if not exists idx_application_documents_application_requirement
  on public.application_documents(application_id, requirement_key);
create index if not exists idx_consultant_messages_thread_created on public.consultant_messages(thread_id, created_at);
create index if not exists idx_consultant_participants_profile_thread
  on public.consultant_thread_participants(profile_id, thread_id);
create index if not exists idx_scanner_dataset_snapshots_active_fetched
  on public.scanner_dataset_snapshots (is_active, fetched_at desc);
create index if not exists idx_scanner_dataset_snapshots_version
  on public.scanner_dataset_snapshots (version_hash);
create index if not exists idx_scanner_ingestion_runs_finished
  on public.scanner_ingestion_runs (finished_at desc);
create index if not exists idx_scanner_ingestion_runs_status
  on public.scanner_ingestion_runs (status, finished_at desc);
create index if not exists idx_practice_quiz_templates_application
  on public.practice_quiz_templates(application_id);
create index if not exists idx_practice_quiz_templates_grant
  on public.practice_quiz_templates(grant_external_id, grant_slug);
create index if not exists idx_practice_quiz_questions_template
  on public.practice_quiz_questions(template_id, sort_order);
create index if not exists idx_practice_quiz_submissions_application_created
  on public.practice_quiz_submissions(application_id, created_at desc);
create index if not exists idx_practice_quiz_submissions_company
  on public.practice_quiz_submissions(company_id, created_at desc);
create index if not exists idx_practice_document_requirements_application
  on public.practice_document_requirements(application_id, created_at asc);
create index if not exists idx_admin_notifications_read_created
  on public.admin_notifications(read_at, created_at desc);
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

-- -----------------------------------------------------
-- Helper functions
-- -----------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tender_applications_updated_at on public.tender_applications;

create trigger trg_tender_applications_updated_at
before update on public.tender_applications
for each row
execute function public.handle_updated_at();

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

drop trigger if exists trg_notification_tasks_updated_at on public.notification_tasks;
create trigger trg_notification_tasks_updated_at
before update on public.notification_tasks
for each row
execute function public.handle_updated_at();

create or replace function public.is_company_member(target_company uuid)
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
      and p.company_id = target_company
  );
$$;

create or replace function public.is_ops_user()
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
      and p.role in ('ops_admin', 'consultant')
  );
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

-- -----------------------------------------------------
-- RLS
-- -----------------------------------------------------

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.quiz_submissions enable row level security;
alter table public.company_crm enable row level security;
alter table public.legal_consents enable row level security;
alter table public.service_orders enable row level security;
alter table public.onboarding_credentials enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_matches enable row level security;
alter table public.tender_applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.practice_quiz_templates enable row level security;
alter table public.practice_quiz_questions enable row level security;
alter table public.practice_quiz_submissions enable row level security;
alter table public.practice_document_requirements enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.notification_inbox enable row level security;
alter table public.notification_tasks enable row level security;
alter table public.consultant_threads enable row level security;
alter table public.consultant_thread_participants enable row level security;
alter table public.consultant_messages enable row level security;
alter table public.scanner_dataset_snapshots enable row level security;
alter table public.scanner_ingestion_runs enable row level security;

drop policy if exists "profiles_select_own_or_ops" on public.profiles;
create policy "profiles_select_own_or_ops"
on public.profiles
for select
using (id = auth.uid() or public.is_ops_user());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member"
on public.companies
for select
using (public.is_company_member(id) or public.is_ops_user());

drop policy if exists "company_crm_ops_only" on public.company_crm;
create policy "company_crm_ops_only"
on public.company_crm
for all
using (public.is_ops_user())
with check (public.is_ops_user());

drop policy if exists "legal_consents_select_ops" on public.legal_consents;
create policy "legal_consents_select_ops"
on public.legal_consents
for select
using (public.is_ops_user());

drop policy if exists "service_orders_select_member" on public.service_orders;
create policy "service_orders_select_member"
on public.service_orders
for select
using (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "tender_matches_select_member" on public.tender_matches;
create policy "tender_matches_select_member"
on public.tender_matches
for select
using (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "tender_matches_update_member" on public.tender_matches;
create policy "tender_matches_update_member"
on public.tender_matches
for update
using (public.is_company_member(company_id) or public.is_ops_user())
with check (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "tenders_select_if_matched" on public.tenders;
create policy "tenders_select_if_matched"
on public.tenders
for select
using (
  public.is_ops_user()
  or exists (
    select 1
    from public.tender_matches tm
    where tm.tender_id = tenders.id
      and public.is_company_member(tm.company_id)
  )
);

drop policy if exists "tender_applications_select_member" on public.tender_applications;
create policy "tender_applications_select_member"
on public.tender_applications
for select
using (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "tender_applications_insert_member" on public.tender_applications;
create policy "tender_applications_insert_member"
on public.tender_applications
for insert
with check (public.is_company_member(company_id));

drop policy if exists "tender_applications_update_member" on public.tender_applications;
create policy "tender_applications_update_member"
on public.tender_applications
for update
using (public.is_company_member(company_id) or public.is_ops_user())
with check (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "application_documents_select_member" on public.application_documents;
create policy "application_documents_select_member"
on public.application_documents
for select
using (
  exists (
    select 1
    from public.tender_applications ta
    where ta.id = application_documents.application_id
      and (public.is_company_member(ta.company_id) or public.is_ops_user())
  )
);

drop policy if exists "application_documents_insert_member" on public.application_documents;
create policy "application_documents_insert_member"
on public.application_documents
for insert
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.tender_applications ta
    where ta.id = application_documents.application_id
      and public.is_company_member(ta.company_id)
  )
);

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

drop policy if exists "consultant_threads_select_member" on public.consultant_threads;
create policy "consultant_threads_select_member"
on public.consultant_threads
for select
using (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "consultant_threads_insert_member" on public.consultant_threads;
create policy "consultant_threads_insert_member"
on public.consultant_threads
for insert
with check (public.is_company_member(company_id) or public.is_ops_user());

drop policy if exists "consultant_thread_participants_select_own_or_ops" on public.consultant_thread_participants;
create policy "consultant_thread_participants_select_own_or_ops"
on public.consultant_thread_participants
for select
using (profile_id = auth.uid() or public.is_ops_user());

drop policy if exists "consultant_thread_participants_insert_own" on public.consultant_thread_participants;
create policy "consultant_thread_participants_insert_own"
on public.consultant_thread_participants
for insert
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.consultant_threads ct
    where ct.id = consultant_thread_participants.thread_id
      and (public.is_company_member(ct.company_id) or public.is_ops_user())
  )
);

drop policy if exists "consultant_thread_participants_update_own" on public.consultant_thread_participants;
create policy "consultant_thread_participants_update_own"
on public.consultant_thread_participants
for update
using (profile_id = auth.uid() or public.is_ops_user())
with check (profile_id = auth.uid() or public.is_ops_user());

drop policy if exists "consultant_messages_select_member" on public.consultant_messages;
create policy "consultant_messages_select_member"
on public.consultant_messages
for select
using (
  exists (
    select 1
    from public.consultant_threads ct
    where ct.id = consultant_messages.thread_id
      and (public.is_company_member(ct.company_id) or public.is_ops_user())
  )
);

drop policy if exists "consultant_messages_insert_member" on public.consultant_messages;
create policy "consultant_messages_insert_member"
on public.consultant_messages
for insert
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.consultant_threads ct
    where ct.id = consultant_messages.thread_id
      and (public.is_company_member(ct.company_id) or public.is_ops_user())
  )
);

drop policy if exists "scanner snapshots ops read" on public.scanner_dataset_snapshots;
create policy "scanner snapshots ops read"
on public.scanner_dataset_snapshots
for select
using (public.is_ops_user());

drop policy if exists "scanner ingestion runs ops read" on public.scanner_ingestion_runs;
create policy "scanner ingestion runs ops read"
on public.scanner_ingestion_runs
for select
using (public.is_ops_user());

drop policy if exists "scanner ingestion runs ops insert" on public.scanner_ingestion_runs;
create policy "scanner ingestion runs ops insert"
on public.scanner_ingestion_runs
for insert
with check (public.is_ops_user());

-- No policies for leads/quiz_submissions/onboarding_credentials: access only through service role.

-- -----------------------------------------------------
-- Storage bucket
-- -----------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('application-documents', 'application-documents', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "storage_docs_select_member" on storage.objects;

create policy "storage_docs_select_member"
on storage.objects
for select
using (
  bucket_id = 'application-documents'
  and exists (
    select 1
    from public.application_documents ad
    join public.tender_applications ta on ta.id = ad.application_id
    where ad.storage_path = storage.objects.name
      and (public.is_company_member(ta.company_id) or public.is_ops_user())
  )
);

drop policy if exists "storage_docs_insert_member" on storage.objects;

create policy "storage_docs_insert_member"
on storage.objects
for insert
with check (
  bucket_id = 'application-documents'
  and (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and exists (
        select 1
        from public.tender_applications ta
        where ta.company_id::text = split_part(storage.objects.name, '/', 1)
          and ta.id::text = split_part(storage.objects.name, '/', 2)
          and public.is_company_member(ta.company_id)
      )
    )
  )
);
