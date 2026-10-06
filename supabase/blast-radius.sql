-- G1 blast-radius query indexes. This migration creates no tables.
create index if not exists capability_executions_capability_created_at_idx
  on public.capability_executions (capability_id, created_at);

create index if not exists capability_executions_organization_created_at_idx
  on public.capability_executions (organization_id, created_at);

create index if not exists device_jobs_action_created_at_execute_idx
  on public.device_jobs (action_id, created_at)
  where kind = 'action' and mode = 'execute';

create index if not exists verification_results_execution_id_idx
  on public.verification_results (execution_id);

create index if not exists rollback_runs_execution_id_idx
  on public.rollback_runs (execution_id);

-- Rollback (run only after reviewing dependent query plans):
-- drop index if exists public.capability_executions_capability_created_at_idx;
-- drop index if exists public.capability_executions_organization_created_at_idx;
-- drop index if exists public.device_jobs_action_created_at_execute_idx;
-- drop index if exists public.verification_results_execution_id_idx;
-- drop index if exists public.rollback_runs_execution_id_idx;
