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

create index if not exists idx_profiles_company on public.profiles(company_id);
create index if not exists idx_quiz_submissions_created_at on public.quiz_submissions(created_at desc);
create index if not exists idx_tender_matches_company on public.tender_matches(company_id);
create index if not exists idx_tender_applications_company on public.tender_applications(company_id);
create index if not exists idx_consultant_messages_thread_created on public.consultant_messages(thread_id, created_at);
create index if not exists idx_consultant_participants_profile_thread
  on public.consultant_thread_participants(profile_id, thread_id);

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

-- -----------------------------------------------------
-- RLS
-- -----------------------------------------------------

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.quiz_submissions enable row level security;
alter table public.service_orders enable row level security;
alter table public.onboarding_credentials enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_matches enable row level security;
alter table public.tender_applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.consultant_threads enable row level security;
alter table public.consultant_thread_participants enable row level security;
alter table public.consultant_messages enable row level security;

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
  and (auth.role() = 'authenticated' or auth.role() = 'service_role')
);
