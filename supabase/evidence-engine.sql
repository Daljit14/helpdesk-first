alter table public.ticket_investigations
  add column if not exists evidence jsonb,
  add column if not exists evidence_at timestamptz,
  add column if not exists asked_question_ids jsonb not null default '[]'::jsonb;

-- Rollback:
-- alter table public.ticket_investigations
--   drop column if exists evidence,
--   drop column if exists evidence_at,
--   drop column if exists asked_question_ids;
