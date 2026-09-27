create table if not exists public.capability_autonomy_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_id text not null,
  tier text not null default 'shadow' check (tier in ('disabled','shadow','consent','autorun')),
  live_runs integer not null default 0,
  verified_successes integer not null default 0,
  verify_failures integer not null default 0,
  rollback_failures integer not null default 0,
  security_incidents integer not null default 0,
  last_promoted_at timestamptz,
  last_demoted_at timestamptz,
  demote_reason text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, capability_id)
);

create table if not exists public.capability_autonomy_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_id text not null,
  run_id uuid references public.resolution_runs(id) on delete set null,
  execution_id uuid,
  agent_session_id uuid references public.agent_sessions(id) on delete set null,
  tier_at_time text not null check (tier_at_time in ('disabled','shadow','consent','autorun')),
  outcome text not null check (outcome in ('verified','verify_failed','rollback_failed','security_incident')),
  created_at timestamptz not null default now()
);

create table if not exists public.capability_autonomy_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_id text not null,
  from_tier text not null check (from_tier in ('disabled','shadow','consent','autorun')),
  to_tier text not null check (to_tier in ('disabled','shadow','consent','autorun')),
  kind text not null check (kind in ('promotion','demotion','admin_set')),
  reason text not null,
  actor text not null,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists capability_autonomy_outcomes_window_idx
  on public.capability_autonomy_outcomes(organization_id, capability_id, created_at desc);
create index if not exists capability_autonomy_transitions_lookup_idx
  on public.capability_autonomy_transitions(organization_id, capability_id, created_at desc);

alter table public.agent_sessions add column if not exists autorun_consent_granted_at timestamptz;
alter table public.agent_sessions add column if not exists autorun_consent_revoked_at timestamptz;
alter table public.agent_sessions add column if not exists autorun_consent_expires_at timestamptz;
alter table public.agent_sessions add column if not exists autorun_consent_capabilities text[] not null default '{}';

alter table public.agent_steps drop constraint if exists agent_steps_kind_check;
alter table public.agent_steps add constraint agent_steps_kind_check check (kind in (
  'user_message','thinking_summary','tool_started','tool_result','tool_rejected','final',
  'claim_stripped','escalated','halted','error','action_proposed','consent_required',
  'consent_decided','consent_declined','action_executing','verification_result',
  'rollback_result','confirm_required','user_feedback','resolved','security_incident',
  'action_rejected','session_consent_offered','session_consent_granted',
  'session_consent_revoked','action_autorun','action_shadowed','tier_demoted'
));

alter table public.capability_autonomy_stats enable row level security;
alter table public.capability_autonomy_outcomes enable row level security;
alter table public.capability_autonomy_transitions enable row level security;

drop policy if exists capability_autonomy_stats_staff_read on public.capability_autonomy_stats;
create policy capability_autonomy_stats_staff_read on public.capability_autonomy_stats
  for select to authenticated using (public.is_org_staff(organization_id));
drop policy if exists capability_autonomy_stats_service on public.capability_autonomy_stats;
create policy capability_autonomy_stats_service on public.capability_autonomy_stats
  for all to service_role using (true) with check (true);

drop policy if exists capability_autonomy_outcomes_staff_read on public.capability_autonomy_outcomes;
create policy capability_autonomy_outcomes_staff_read on public.capability_autonomy_outcomes
  for select to authenticated using (public.is_org_staff(organization_id));
drop policy if exists capability_autonomy_outcomes_service on public.capability_autonomy_outcomes;
create policy capability_autonomy_outcomes_service on public.capability_autonomy_outcomes
  for all to service_role using (true) with check (true);

drop policy if exists capability_autonomy_transitions_staff_read on public.capability_autonomy_transitions;
create policy capability_autonomy_transitions_staff_read on public.capability_autonomy_transitions
  for select to authenticated using (public.is_org_staff(organization_id));
drop policy if exists capability_autonomy_transitions_service on public.capability_autonomy_transitions;
create policy capability_autonomy_transitions_service on public.capability_autonomy_transitions
  for all to service_role using (true) with check (true);

revoke all on public.capability_autonomy_stats, public.capability_autonomy_outcomes,
  public.capability_autonomy_transitions from anon, authenticated;
grant select on public.capability_autonomy_stats, public.capability_autonomy_outcomes,
  public.capability_autonomy_transitions to authenticated;
grant all on public.capability_autonomy_stats, public.capability_autonomy_outcomes,
  public.capability_autonomy_transitions to service_role;

create or replace function public.capability_autonomy_outcomes_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'autonomy outcomes are append-only';
end $$;
drop trigger if exists capability_autonomy_outcomes_immutable on public.capability_autonomy_outcomes;
create trigger capability_autonomy_outcomes_immutable
before update or delete on public.capability_autonomy_outcomes
for each row execute function public.capability_autonomy_outcomes_immutable();

create or replace function public.capability_autonomy_transitions_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'autonomy transitions are append-only';
end $$;
drop trigger if exists capability_autonomy_transitions_immutable on public.capability_autonomy_transitions;
create trigger capability_autonomy_transitions_immutable
before update or delete on public.capability_autonomy_transitions
for each row execute function public.capability_autonomy_transitions_immutable();

-- Rollback (manual, only when reverting this migration):
-- drop table if exists public.capability_autonomy_transitions;
-- drop table if exists public.capability_autonomy_outcomes;
-- drop table if exists public.capability_autonomy_stats;
