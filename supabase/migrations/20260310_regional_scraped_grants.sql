create table if not exists public.regional_scraped_grants (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  authority_name text not null,
  title text not null,
  region text not null,
  status text not null check (status in ('active', 'closed')),
  doc_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for quick lookups on active status
create index if not exists idx_regional_scraped_grants_status
  on public.regional_scraped_grants (status, created_at desc);

-- RLS Policies
alter table public.regional_scraped_grants enable row level security;

drop policy if exists "Ops users can read scraped grants" on public.regional_scraped_grants;
create policy "Ops users can read scraped grants"
  on public.regional_scraped_grants
  for select
  using (public.is_ops_user());

drop policy if exists "Ops users can insert scraped grants" on public.regional_scraped_grants;
create policy "Ops users can insert scraped grants"
  on public.regional_scraped_grants
  for insert
  with check (public.is_ops_user());

drop policy if exists "Ops users can update scraped grants" on public.regional_scraped_grants;
create policy "Ops users can update scraped grants"
  on public.regional_scraped_grants
  for update
  using (public.is_ops_user())
  with check (public.is_ops_user());
