-- PIA Practice Submissions
-- Table for storing form wizard data from the PIA flow
-- (Resto al Sud 2.0 + Autoimpiego Centro Nord)

-- Add missing columns to tenders (from earlier migration)
alter table public.tenders
  add column if not exists external_grant_id text,
  add column if not exists grant_slug text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Add bando_type to existing tender_applications
alter table public.tender_applications
  add column if not exists bando_type text
    check (bando_type is null or bando_type in ('resto-al-sud-2-0', 'autoimpiego-centro-nord'));

create table if not exists public.pia_submissions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tender_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bando_type text not null check (bando_type in ('resto-al-sud-2-0', 'autoimpiego-centro-nord')),
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'submitted')),

  -- Structured form fields (stored individually for queryability)
  contact_phone text,
  activity_confirmed jsonb default '{}'::jsonb,
  employment_status jsonb default '{}'::jsonb,
  criminal_precedents jsonb default '{}'::jsonb,
  public_aid jsonb default '{}'::jsonb,
  effective_owner jsonb default '{}'::jsonb,
  expense_plan jsonb default '{}'::jsonb,
  business_idea text,
  iban text,
  ordine_iscrizione jsonb default '{}'::jsonb,
  casellario_giudiziale jsonb default '{}'::jsonb,
  gdpr_consents jsonb default '{}'::jsonb,

  -- Complete snapshot for easy reading
  form_data jsonb not null default '{}'::jsonb,

  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_pia_submissions_application on public.pia_submissions(application_id);
create index if not exists idx_pia_submissions_user on public.pia_submissions(user_id);
create index if not exists idx_pia_submissions_bando on public.pia_submissions(bando_type);
create index if not exists idx_pia_submissions_status on public.pia_submissions(status);

-- Auto-update updated_at
create or replace function public.update_pia_submissions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_pia_submissions_updated_at
  before update on public.pia_submissions
  for each row
  execute function public.update_pia_submissions_updated_at();

-- Ensure the two PIA tender records exist
do $$
begin
  if not exists (select 1 from public.tenders where external_grant_id = 'resto-al-sud-2-0-pia') then
    insert into public.tenders (title, authority_name, deadline_at, summary, external_grant_id, grant_slug, metadata)
    values (
      'Resto al Sud 2.0',
      'Invitalia',
      '2026-12-31T23:59:59.000Z',
      'Contributi a fondo perduto per nuove imprese in Abruzzo, Molise, Campania, Puglia, Basilicata, Calabria, Sicilia, Sardegna.',
      'resto-al-sud-2-0-pia',
      'resto-al-sud-2-0',
      '{"pia": true, "bandoType": "resto-al-sud-2-0", "displayName": "Resto al Sud 2.0", "regions": ["Abruzzo", "Molise", "Campania", "Puglia", "Basilicata", "Calabria", "Sicilia", "Sardegna"]}'::jsonb
    );
  end if;

  if not exists (select 1 from public.tenders where external_grant_id = 'autoimpiego-centro-nord-pia') then
    insert into public.tenders (title, authority_name, deadline_at, summary, external_grant_id, grant_slug, metadata)
    values (
      'Autoimpiego Centro Nord',
      'Invitalia',
      '2026-12-31T23:59:59.000Z',
      'Contributi per nuove imprese e lavoro autonomo nelle regioni del Centro-Nord.',
      'autoimpiego-centro-nord-pia',
      'autoimpiego-centro-nord',
      '{"pia": true, "bandoType": "autoimpiego-centro-nord", "displayName": "Autoimpiego Centro Nord", "regions": ["Valle d''Aosta", "Piemonte", "Lombardia", "Trentino Alto Adige", "Friuli Venezia Giulia", "Veneto", "Liguria", "Emilia Romagna", "Toscana", "Marche", "Umbria", "Lazio"]}'::jsonb
    );
  end if;
end $$;

-- Enable RLS
alter table public.pia_submissions enable row level security;

-- Users can see their own submissions
create policy "Users can view own submissions"
  on public.pia_submissions for select
  using (auth.uid() = user_id);

-- Users can insert their own submissions
create policy "Users can insert own submissions"
  on public.pia_submissions for insert
  with check (auth.uid() = user_id);

-- Users can update their own submissions
create policy "Users can update own submissions"
  on public.pia_submissions for update
  using (auth.uid() = user_id);
