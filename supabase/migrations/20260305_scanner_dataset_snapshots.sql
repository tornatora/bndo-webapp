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

create index if not exists idx_scanner_dataset_snapshots_active_fetched
  on public.scanner_dataset_snapshots (is_active, fetched_at desc);

create index if not exists idx_scanner_dataset_snapshots_version
  on public.scanner_dataset_snapshots (version_hash);

alter table public.scanner_dataset_snapshots enable row level security;

drop policy if exists "scanner snapshots ops read" on public.scanner_dataset_snapshots;
create policy "scanner snapshots ops read"
  on public.scanner_dataset_snapshots
  for select
  using (public.is_ops_user());

