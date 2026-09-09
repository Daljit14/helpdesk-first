alter table public.ticket_investigations
  add column if not exists escalation_package jsonb,
  add column if not exists escalation_package_at timestamptz;

-- Rollback:
-- alter table public.ticket_investigations
--   drop column if exists escalation_package,
--   drop column if exists escalation_package_at;
