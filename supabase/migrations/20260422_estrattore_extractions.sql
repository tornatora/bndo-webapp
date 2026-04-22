-- Migration: tabella estrazioni visure camerali per il modulo /estrattore

create table if not exists public.estrattore_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_filename text,
  extracted_data jsonb not null default '{}'::jsonb,
  custom_fields jsonb not null default '[]'::jsonb,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending',
  created_at timestamptz not null default now()
);

-- Indici utili
create index if not exists idx_estrattore_extractions_user_id on public.estrattore_extractions(user_id);
create index if not exists idx_estrattore_extractions_created_at on public.estrattore_extractions(created_at desc);

-- RLS abilitato di default; solo l'utente proprietario può leggere/scrivere i propri record
alter table public.estrattore_extractions enable row level security;

create policy if not exists estrattore_extractions_owner_select
  on public.estrattore_extractions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy if not exists estrattore_extractions_owner_insert
  on public.estrattore_extractions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy if not exists estrattore_extractions_owner_update
  on public.estrattore_extractions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists estrattore_extractions_owner_delete
  on public.estrattore_extractions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Commento per documentazione
comment on table public.estrattore_extractions is 'Estrazioni dati da visure camerali PDF (modulo /estrattore)';
