-- Wave 1/2 remediation. Run after the existing workflow and requester portal
-- migrations. This migration is additive and idempotent. Do not run automatically.

alter table public.tickets drop constraint if exists tickets_workflow_status_check;
alter table public.tickets add constraint tickets_workflow_status_check
  check (status in ('Open', 'New', 'AI Reviewing', 'AI Resolving', 'Needs Human',
    'In Progress', 'Waiting', 'Waiting for User', 'Pending Verification',
    'Reopened', 'Resolved', 'Closed')) not valid;

do $$
declare constraint_name text;
begin
  foreach constraint_name in array array['tickets_workflow_status_check'] loop
    begin
      execute format(
        'alter table public.tickets validate constraint %I',
        constraint_name
      );
    exception when others then
      raise notice 'Could not validate constraint %: %', constraint_name, sqlerrm;
    end;
  end loop;
end $$;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.ticket_system_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format(
      'alter table public.ticket_system_events drop constraint if exists %I',
      constraint_name
    );
  end loop;
end $$;

alter table public.ticket_system_events
  add constraint ticket_system_events_event_type_check
  check (event_type in (
    'ticket.created', 'ai.assigned', 'ai.solution_offered', 'ai.escalated',
    'employee.assigned', 'employee.claimed', 'comment.created',
    'internal_note.created', 'tool.used', 'status.changed',
    'verification.requested', 'verification.exception', 'ticket.resolved',
    'ticket.closed', 'ticket.reopened', 'ticket.rated', 'solution.rejected',
    'step.worked', 'step.failed', 'step.could_not_perform'
  ));

create table if not exists public.ticket_step_outcomes (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  guide_slug text not null check (length(guide_slug) <= 120),
  step_index integer not null check (step_index >= 0 and step_index < 100),
  outcome text not null check (outcome in ('worked', 'failed', 'could_not_perform')),
  created_at timestamptz not null default now(),
  unique (ticket_id, guide_slug, step_index)
);
create index if not exists ticket_step_outcomes_ticket_idx
  on public.ticket_step_outcomes(ticket_id);
alter table public.ticket_step_outcomes enable row level security;
drop policy if exists "Ticket owners read step outcomes" on public.ticket_step_outcomes;
create policy "Ticket owners read step outcomes"
  on public.ticket_step_outcomes for select
  using (user_id = auth.uid());
drop policy if exists "Organization members read step outcomes" on public.ticket_step_outcomes;
create policy "Organization members read step outcomes"
  on public.ticket_step_outcomes for select
  using (organization_id is not null and public.is_org_member(organization_id));

create or replace function public.record_step_outcome(
  ticket uuid,
  guide text,
  step integer,
  result text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_ticket public.tickets;
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);
  if result not in ('worked', 'failed', 'could_not_perform')
    or length(guide) < 1 or length(guide) > 120
    or step < 0 or step >= 100 then
    raise exception 'invalid step outcome';
  end if;
  select * into current_ticket
  from public.tickets
  where id = ticket and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;

  insert into public.ticket_step_outcomes(
    ticket_id, organization_id, user_id, guide_slug, step_index, outcome, created_at
  )
  values (
    current_ticket.id, current_ticket.organization_id, auth.uid(),
    guide, step, result, now()
  )
  on conflict (ticket_id, guide_slug, step_index)
  do update set outcome = excluded.outcome, created_at = excluded.created_at;

  if result in ('failed', 'could_not_perform')
    and lower(current_ticket.status) = 'ai resolving' then
    update public.tickets
    set ai_failed_attempts = ai_failed_attempts + 1,
        status = case
          when ai_failed_attempts + 1 >= 2 then 'Needs Human'
          else 'AI Resolving'
        end,
        handoff_reason = case
          when ai_failed_attempts + 1 >= 2 then 'repeated_failure'
          else handoff_reason
        end
    where id = ticket and user_id = auth.uid();
  end if;

  insert into public.ticket_system_events(
    ticket_id, organization_id, event_type, actor_type, actor_id, detail
  )
  values (
    current_ticket.id, current_ticket.organization_id,
    'step.' || result, 'user', auth.uid(),
    jsonb_build_object('guideSlug', guide, 'stepIndex', step, 'outcome', result)
  );
end;
$$;
revoke all on function public.record_step_outcome(uuid, text, integer, text)
  from public, anon;
grant execute on function public.record_step_outcome(uuid, text, integer, text)
  to authenticated;

create or replace function public.user_reopen_ticket(ticket uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_ticket public.tickets;
  reopen_window integer;
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);
  select * into current_ticket
  from public.tickets
  where id = ticket and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
  if lower(current_ticket.status) not in ('resolved', 'closed') then
    raise exception 'not available';
  end if;
  select coalesce(reopen_window_days, 14)
    into reopen_window
    from public.organization_policies
   where organization_id = current_ticket.organization_id;
  reopen_window := coalesce(reopen_window, 14);
  if coalesce(current_ticket.closed_at, current_ticket.resolved_at, current_ticket.updated_at)
    < now() - make_interval(days => reopen_window) then
    raise exception 'reopen window closed';
  end if;

  update public.tickets
  set status = 'Reopened',
      escalated = true,
      handoff_reason = 'reopened_by_user',
      escalation_reason = left(reason, 1000),
      verified_by_user = false,
      user_confirmed = false,
      user_confirmed_at = null,
      resolution_source = 'unresolved',
      resolver_type = case
        when assigned_agent_id is not null then 'employee'
        else 'unassigned'
      end,
      needs_human_at = now(),
      reopen_count = reopen_count + 1,
      closed_at = null,
      resolved_at = null
  where id = ticket and user_id = auth.uid();
end;
$$;
revoke all on function public.user_reopen_ticket(uuid, text) from public, anon;
grant execute on function public.user_reopen_ticket(uuid, text) to authenticated;

create table if not exists public.organization_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  allow_verification_exception boolean not null default false,
  reopen_window_days integer not null default 14 check (reopen_window_days between 1 and 90),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.organization_policies enable row level security;
drop policy if exists "Organization members read organization policies"
  on public.organization_policies;
create policy "Organization members read organization policies"
  on public.organization_policies for select
  using (public.is_org_member(organization_id));

alter table public.ticket_actions
  add column if not exists tool_version text,
  add column if not exists reason text check (length(reason) <= 1000),
  add column if not exists parameters jsonb not null default '{}'::jsonb,
  add column if not exists approval_type text not null default 'none'
    check (approval_type in ('none', 'user_consent', 'employee_approval')),
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists verification_result text
    check (verification_result in ('not_verified', 'passed', 'failed')),
  add column if not exists rollback_result text
    check (rollback_result in ('not_applicable', 'succeeded', 'failed'));

create or replace function public.admin_resolution_metrics(org uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with scoped as (
    select *
    from public.tickets
    where organization_id = org
  ),
  completed as (
    select *
    from scoped
    where lower(status) in ('resolved', 'closed')
  ),
  totals as (
    select
      count(*)::int as total_tickets,
      count(*) filter (
        where lower(status) in ('open', 'new', 'in progress', 'in_progress',
          'in-progress', 'waiting', 'ai reviewing', 'ai resolving',
          'needs human', 'waiting for user', 'pending verification', 'reopened')
      )::int as open_tickets,
      count(*) filter (where ai_attempted)::int as ai_attempted,
      count(*) filter (where resolution_source = 'ai')::int as ai_solved,
      count(*) filter (where resolution_source in ('agent', 'employee'))::int as agent_solved,
      count(*) filter (where resolution_source = 'self_service')::int as self_service_solved,
      count(*) filter (where escalated)::int as escalated,
      coalesce(
        avg(extract(epoch from (resolved_at - created_at)) / 60)
          filter (where lower(status) in ('resolved', 'closed') and resolved_at is not null),
        0
      ) as avg_resolution_minutes,
      coalesce(
        avg(extract(epoch from (resolved_at - created_at)) / 60)
          filter (where lower(status) in ('resolved', 'closed')
            and resolved_at is not null and resolution_source = 'ai'),
        0
      ) as avg_ai_resolution_minutes,
      coalesce(
        avg(extract(epoch from (resolved_at - created_at)) / 60)
          filter (where lower(status) in ('resolved', 'closed')
            and resolved_at is not null and resolution_source in ('agent', 'employee')),
        0
      ) as avg_agent_resolution_minutes
    from scoped
  ),
  days as (
    select generate_series(
      current_date - interval '13 days',
      current_date,
      interval '1 day'
    )::date as day
  ),
  daily as (
    select
      days.day,
      count(scoped.id) filter (where scoped.resolution_source = 'ai')::int as ai_solved,
      count(scoped.id) filter (where scoped.resolution_source in ('agent', 'employee'))::int as agent_solved,
      count(scoped.id) filter (where scoped.escalated)::int as escalated,
      count(scoped.id)::int as created
    from days
    left join scoped on scoped.created_at::date = days.day
    group by days.day
    order by days.day
  )
  select jsonb_build_object(
    'totalTickets', totals.total_tickets,
    'openTickets', totals.open_tickets,
    'aiAttempted', totals.ai_attempted,
    'aiSolved', totals.ai_solved,
    'agentSolved', totals.agent_solved,
    'selfServiceSolved', totals.self_service_solved,
    'escalated', totals.escalated,
    'aiResolutionRate', round(
      coalesce(totals.ai_solved * 100.0 / nullif(totals.ai_attempted, 0), 0)::numeric,
      1
    ),
    'avgResolutionMinutes', totals.avg_resolution_minutes,
    'avgAiResolutionMinutes', totals.avg_ai_resolution_minutes,
    'avgAgentResolutionMinutes', totals.avg_agent_resolution_minutes,
    'daily', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'day', to_char(daily.day, 'YYYY-MM-DD'),
          'aiSolved', daily.ai_solved,
          'agentSolved', daily.agent_solved,
          'escalated', daily.escalated,
          'created', daily.created
        ) order by daily.day)
        from daily
      ),
      '[]'::jsonb
    )
  )
  from totals;
$$;
revoke all on function public.admin_resolution_metrics(uuid) from public, anon, authenticated;
grant execute on function public.admin_resolution_metrics(uuid) to service_role;

-- Optional destructive rollback; run only with approval:
-- drop function if exists public.record_step_outcome(uuid, text, integer, text);
-- drop function if exists public.user_reopen_ticket(uuid, text);
-- drop table if exists public.ticket_step_outcomes;
-- drop table if exists public.organization_policies;
-- alter table public.ticket_actions drop column if exists tool_version;
-- alter table public.ticket_actions drop column if exists reason;
-- alter table public.ticket_actions drop column if exists parameters;
-- alter table public.ticket_actions drop column if exists approval_type;
-- alter table public.ticket_actions drop column if exists started_at;
-- alter table public.ticket_actions drop column if exists ended_at;
-- alter table public.ticket_actions drop column if exists verification_result;
-- alter table public.ticket_actions drop column if exists rollback_result;
-- alter table public.tickets drop constraint if exists tickets_workflow_status_check;
