-- Phase 5C.1 deterministic resolution orchestrator.
-- Additive and idempotent. Run after ticket-workflow.sql and wave-3-organizations.sql.

create extension if not exists pgcrypto;

create table if not exists public.resolution_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  status text not null default 'queued' check (status in (
    'queued', 'investigating', 'planning', 'policy_check',
    'awaiting_consent', 'awaiting_approval', 'executing', 'verifying',
    'verified', 'resolved', 'rolling_back', 'escalated', 'failed', 'paused'
  )),
  previous_status text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  budget_cents integer not null default 50 check (budget_cents >= 0),
  deadline_at timestamptz not null,
  initiated_by text not null check (length(initiated_by) between 1 and 200),
  planner_version text,
  model text,
  prompt_version text,
  policy_version text,
  escalation_reason text check (length(escalation_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists resolution_runs_one_active_per_ticket
  on public.resolution_runs(ticket_id)
  where status not in ('resolved', 'escalated', 'failed');
create index if not exists resolution_runs_organization_idx
  on public.resolution_runs(organization_id);
create index if not exists resolution_runs_due_idx
  on public.resolution_runs(status, created_at)
  where status not in ('resolved', 'escalated', 'failed', 'paused');

create table if not exists public.resolution_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  kind text not null check (kind in ('investigate', 'plan', 'policy', 'execute', 'verify', 'rollback')),
  position integer not null check (position >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'timed_out', 'skipped')),
  lease_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  unique (run_id, position)
);
create index if not exists resolution_steps_organization_idx
  on public.resolution_steps(organization_id);
create index if not exists resolution_steps_expired_lease_idx
  on public.resolution_steps(lease_until)
  where status = 'running';

create table if not exists public.resolution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kind text not null check (length(kind) <= 80),
  actor text not null check (length(actor) <= 200),
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists resolution_events_organization_idx
  on public.resolution_events(organization_id);
create index if not exists resolution_events_run_idx
  on public.resolution_events(run_id, created_at);

create table if not exists public.policy_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  step_id uuid references public.resolution_steps(id) on delete set null,
  capability_id text not null,
  capability_version integer not null,
  decision text not null check (decision in (
    'allow_automatic', 'require_user_consent', 'require_technician_approval',
    'specialist_only', 'deny'
  )),
  reasons text[] not null default '{}',
  input jsonb not null default '{}'::jsonb,
  policy_version text,
  created_at timestamptz not null default now()
);
create index if not exists policy_decisions_organization_idx
  on public.policy_decisions(organization_id);
create index if not exists policy_decisions_run_idx
  on public.policy_decisions(run_id);

create table if not exists public.capability_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  step_id uuid references public.resolution_steps(id) on delete set null,
  capability_id text not null,
  capability_version integer not null,
  idempotency_key text not null unique,
  parameters jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null check (status in ('succeeded', 'failed', 'timed_out')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  created_at timestamptz not null default now()
);
create index if not exists capability_executions_organization_idx
  on public.capability_executions(organization_id);
create index if not exists capability_executions_run_idx
  on public.capability_executions(run_id);

create table if not exists public.verification_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  execution_id uuid references public.capability_executions(id) on delete set null,
  method text not null,
  evidence jsonb not null default '{}'::jsonb,
  user_confirmed boolean not null default false,
  outcome text not null check (outcome in ('passed', 'failed', 'inconclusive')),
  verifier_version text,
  created_at timestamptz not null default now()
);
create index if not exists verification_results_organization_idx
  on public.verification_results(organization_id);
create index if not exists verification_results_run_idx
  on public.verification_results(run_id);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  step_id uuid not null references public.resolution_steps(id) on delete cascade,
  type text not null check (type in ('user_consent', 'technician_approval')),
  status text not null default 'requested'
    check (status in ('requested', 'granted', 'denied', 'expired')),
  requested_by text not null,
  decided_by text,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists approval_requests_one_requested_per_step
  on public.approval_requests(step_id)
  where status = 'requested';
create index if not exists approval_requests_organization_idx
  on public.approval_requests(organization_id);

create table if not exists public.rollback_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  execution_id uuid references public.capability_executions(id) on delete set null,
  method text not null,
  status text not null check (status in ('succeeded', 'failed', 'unsupported')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rollback_runs_organization_idx
  on public.rollback_runs(organization_id);

create table if not exists public.ai_kill_switches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('global', 'organization', 'capability')),
  scope_id text,
  enabled boolean not null default true,
  reason text,
  set_by text,
  set_at timestamptz not null default now(),
  check (
    (scope = 'global' and scope_id is null and organization_id is null)
    or (scope = 'organization' and scope_id is not null)
    or (scope = 'capability' and scope_id is not null and organization_id is null)
  )
);
create unique index if not exists ai_kill_switches_scope_key
  on public.ai_kill_switches(scope, coalesce(scope_id, ''));
create index if not exists ai_kill_switches_organization_idx
  on public.ai_kill_switches(organization_id);

create or replace function public.autonomy_rows_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'autonomy audit rows are immutable';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'resolution_events',
    'policy_decisions',
    'capability_executions',
    'verification_results',
    'rollback_runs'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      table_name || '_immutable_trigger', table_name
    );
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.autonomy_rows_immutable()',
      table_name || '_immutable_trigger', table_name
    );
  end loop;
end $$;

create or replace function public.autonomy_runs_guard()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated'
    and coalesce(current_setting('helpdesk.resolution_rpc', true), '') <> 'on' then
    raise exception 'autonomy runs are managed by the orchestrator';
  end if;
  return new;
end;
$$;

drop trigger if exists resolution_runs_guard_write on public.resolution_runs;
create trigger resolution_runs_guard_write
before insert or update or delete on public.resolution_runs
for each row execute function public.autonomy_runs_guard();

drop trigger if exists resolution_steps_guard_write on public.resolution_steps;
create trigger resolution_steps_guard_write
before insert or update or delete on public.resolution_steps
for each row execute function public.autonomy_runs_guard();

create or replace function public.resolution_runs_guard_transition()
returns trigger language plpgsql as $$
begin
  if old.status = 'executing' and new.status = 'resolved' then
    raise exception 'executing runs must be verified before resolved';
  end if;
  if new.status = 'resolved' and not exists (
    select 1
    from public.verification_results
    where run_id = new.id and outcome = 'passed'
  ) then
    raise exception 'resolved runs require passed verification';
  end if;
  if old.status in ('resolved', 'escalated')
    and new.status is distinct from old.status then
    raise exception 'terminal autonomy runs cannot transition';
  end if;
  if new.status = 'executing' and not exists (
    select 1
    from public.policy_decisions
    where run_id = new.id
      and decision in (
        'allow_automatic',
        'require_user_consent',
        'require_technician_approval'
      )
  ) then
    raise exception 'executing runs require an allowed policy decision';
  end if;
  if new.status = 'executing' and exists (
    select 1
    from public.policy_decisions decision
    where decision.run_id = new.id
      and decision.decision in ('require_user_consent', 'require_technician_approval')
      and not exists (
        select 1
        from public.approval_requests approval
        where approval.run_id = new.id
          and approval.step_id = decision.step_id
          and approval.status = 'granted'
      )
  ) then
    raise exception 'executing runs require granted approvals';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists resolution_runs_guard_transition on public.resolution_runs;
create trigger resolution_runs_guard_transition
before update on public.resolution_runs
for each row execute function public.resolution_runs_guard_transition();

alter table public.resolution_runs enable row level security;
alter table public.resolution_steps enable row level security;
alter table public.resolution_events enable row level security;
alter table public.policy_decisions enable row level security;
alter table public.capability_executions enable row level security;
alter table public.verification_results enable row level security;
alter table public.approval_requests enable row level security;
alter table public.rollback_runs enable row level security;
alter table public.ai_kill_switches enable row level security;

drop policy if exists "Staff read resolution runs" on public.resolution_runs;
create policy "Staff read resolution runs" on public.resolution_runs
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read resolution steps" on public.resolution_steps;
create policy "Staff read resolution steps" on public.resolution_steps
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read resolution events" on public.resolution_events;
create policy "Staff read resolution events" on public.resolution_events
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read policy decisions" on public.policy_decisions;
create policy "Staff read policy decisions" on public.policy_decisions
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read capability executions" on public.capability_executions;
create policy "Staff read capability executions" on public.capability_executions
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read verification results" on public.verification_results;
create policy "Staff read verification results" on public.verification_results
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read approval requests" on public.approval_requests;
create policy "Staff read approval requests" on public.approval_requests
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read rollback runs" on public.rollback_runs;
create policy "Staff read rollback runs" on public.rollback_runs
for select using (public.is_org_staff(organization_id));
drop policy if exists "Staff read organization kill switches" on public.ai_kill_switches;
create policy "Staff read organization kill switches" on public.ai_kill_switches
for select using (
  scope = 'organization'
  and scope_id is not null
  and public.is_org_staff(scope_id::uuid)
);
drop policy if exists "Authenticated read global capability kill switches"
  on public.ai_kill_switches;
create policy "Authenticated read global capability kill switches"
  on public.ai_kill_switches for select
  using (
    auth.uid() is not null
    and scope in ('global', 'capability')
  );

-- Rollback (destructive; review before running):
-- drop policy if exists "Authenticated read global capability kill switches" on public.ai_kill_switches;
-- drop policy if exists "Staff read organization kill switches" on public.ai_kill_switches;
-- drop policy if exists "Staff read rollback runs" on public.rollback_runs;
-- drop policy if exists "Staff read approval requests" on public.approval_requests;
-- drop policy if exists "Staff read verification results" on public.verification_results;
-- drop policy if exists "Staff read capability executions" on public.capability_executions;
-- drop policy if exists "Staff read policy decisions" on public.policy_decisions;
-- drop policy if exists "Staff read resolution events" on public.resolution_events;
-- drop policy if exists "Staff read resolution steps" on public.resolution_steps;
-- drop policy if exists "Staff read resolution runs" on public.resolution_runs;
-- drop trigger if exists resolution_runs_guard_transition on public.resolution_runs;
-- drop trigger if exists resolution_steps_guard_write on public.resolution_steps;
-- drop trigger if exists resolution_runs_guard_write on public.resolution_runs;
-- drop function if exists public.resolution_runs_guard_transition();
-- drop function if exists public.autonomy_runs_guard();
-- drop function if exists public.autonomy_rows_immutable();
-- drop table if exists public.ai_kill_switches;
-- drop table if exists public.rollback_runs;
-- drop table if exists public.approval_requests;
-- drop table if exists public.verification_results;
-- drop table if exists public.capability_executions;
-- drop table if exists public.policy_decisions;
-- drop table if exists public.resolution_events;
-- drop table if exists public.resolution_steps;
-- drop table if exists public.resolution_runs;
