create table if not exists public.grant_detail_contents (
  grant_id text primary key,
  source_fingerprint text not null,
  generation_version text not null,
  completeness_score numeric(5, 2) not null default 0,
  content jsonb not null,
  generated_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now()
);

create index if not exists grant_detail_contents_generated_at_idx
  on public.grant_detail_contents (generated_at desc);

create index if not exists grant_detail_contents_source_fingerprint_idx
  on public.grant_detail_contents (source_fingerprint);

alter table public.grant_detail_contents enable row level security;
