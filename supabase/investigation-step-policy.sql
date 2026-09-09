alter table public.ticket_investigation_turns
  add column if not exists withheld_steps jsonb not null default '[]'::jsonb;

-- Rollback:
-- alter table public.ticket_investigation_turns drop column if exists withheld_steps;
