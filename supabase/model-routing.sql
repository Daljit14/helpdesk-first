-- Run after requester-agent.sql and knowledge-governance.sql.
-- This additive migration is authored but not applied. To roll back, drop
-- public.agent_org_cost_today(uuid); added columns may remain safely.

alter table public.agent_sessions
  add column if not exists cost_micros bigint not null default 0;
alter table public.agent_sessions
  add column if not exists planner_turn_count integer not null default 0;
alter table public.agent_sessions
  drop constraint if exists agent_sessions_cost_micros_nonneg;
alter table public.agent_sessions
  add constraint agent_sessions_cost_micros_nonneg
  check (cost_micros >= 0 and planner_turn_count >= 0);

alter table public.ai_provider_calls
  add column if not exists cache_read_tokens integer;
alter table public.ai_provider_calls
  add column if not exists cache_write_tokens integer;
alter table public.ai_provider_calls
  add column if not exists cost_micros bigint;
alter table public.ai_provider_calls
  add column if not exists route text;
alter table public.ai_provider_calls
  drop constraint if exists ai_provider_calls_route_check;
alter table public.ai_provider_calls
  add constraint ai_provider_calls_route_check
  check (route is null or route in ('intake', 'agent_default', 'agent_planner'));

create index if not exists agent_sessions_org_started_idx
  on public.agent_sessions (organization_id, started_at);

create or replace function public.agent_org_cost_today(p_organization_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_micros), 0)::bigint
  from public.agent_sessions
  where organization_id = p_organization_id
    and started_at >= (
      date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    );
$$;

revoke all on function public.agent_org_cost_today(uuid)
  from public, anon, authenticated;
grant execute on function public.agent_org_cost_today(uuid) to service_role;
