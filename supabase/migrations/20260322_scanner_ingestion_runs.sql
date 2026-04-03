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

create index if not exists idx_scanner_ingestion_runs_finished
  on public.scanner_ingestion_runs (finished_at desc);

create index if not exists idx_scanner_ingestion_runs_status
  on public.scanner_ingestion_runs (status, finished_at desc);

alter table public.scanner_ingestion_runs enable row level security;

drop policy if exists "scanner_ingestion_runs_ops_read" on public.scanner_ingestion_runs;
create policy "scanner_ingestion_runs_ops_read"
  on public.scanner_ingestion_runs
  for select
  using (public.is_ops_user());

drop policy if exists "scanner_ingestion_runs_ops_insert" on public.scanner_ingestion_runs;
create policy "scanner_ingestion_runs_ops_insert"
  on public.scanner_ingestion_runs
  for insert
  with check (public.is_ops_user());

