create table if not exists public.practice_payments (
  id uuid primary key default gen_random_uuid(),
  quiz_submission_id uuid null references public.quiz_submissions(id) on delete set null,
  company_id uuid null references public.companies(id) on delete set null,
  user_id uuid null references public.profiles(id) on delete set null,
  application_id uuid null references public.tender_applications(id) on delete set null,
  practice_type text not null,
  grant_slug text not null,
  grant_title text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  priority_queue boolean not null default true,
  onboarding_status text not null default 'not_started' check (onboarding_status in ('not_started', 'in_progress', 'completed')),
  onboarding_completed_at timestamptz null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text null,
  stripe_customer_id text null,
  customer_email text not null,
  paid_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_practice_payments_company on public.practice_payments(company_id);
create index if not exists idx_practice_payments_application on public.practice_payments(application_id);
create index if not exists idx_practice_payments_quiz_submission on public.practice_payments(quiz_submission_id);
create index if not exists idx_practice_payments_customer_email on public.practice_payments(customer_email);
create index if not exists idx_practice_payments_status on public.practice_payments(status);
