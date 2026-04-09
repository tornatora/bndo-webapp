-- Enable likely_eligible as a persisted outcome for single-bando practice quiz submissions.

alter table public.practice_quiz_submissions
  drop constraint if exists practice_quiz_submissions_eligibility_check;

alter table public.practice_quiz_submissions
  add constraint practice_quiz_submissions_eligibility_check
  check (eligibility in ('eligible', 'likely_eligible', 'not_eligible', 'needs_review'));
